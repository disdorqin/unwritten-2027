import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZa36CableRepair } from '../tools/voxel-tavern/town-blockout/town-za36-cable-repair';
import { cableWakeEvent, createCableRepairHost } from '../tools/voxel-tavern/town-blockout/town-cable-repair-host';

const anchors = {
  brake: { east: 0, north: 0 }, cableWheel: { east: 10, north: 0 },
  weightTower: { east: 20, north: 0 }, weightFrame: { east: 11, north: 1 },
};
const ids = (actions: { id: string }[]) => actions.map(action => action.id);

test('wake mapping: sled and rolled snowballs wake, hand snowballs never do', () => {
  assert.deepEqual(cableWakeEvent('sled'), { kind: 'wake', impact: 'sled' });
  assert.deepEqual(cableWakeEvent('big-snowball'), { kind: 'wake', impact: 'snowball' });
  assert.equal(cableWakeEvent('snowball'), undefined);
});

test('the host walks the whole repair by offered actions only', () => {
  const machine = createZa36CableRepair(1);
  const host = createCableRepairHost(1, anchors);
  const act = (player: { east: number; north: number }, id: string) => {
    const action = host.actions(machine.snapshot(), player).find(candidate => candidate.id === id);
    assert.ok(action, `expected ${id} to be offered`);
    machine.apply(action!.event);
    host.sync(machine.snapshot());
  };
  assert.deepEqual(host.actions(machine.snapshot(), anchors.brake), [], 'dormant: nothing to repair yet');
  machine.apply(cableWakeEvent('big-snowball')!);
  for (let i = 0; i < 9; i++) act(anchors.brake, 'strike-rust');
  assert.deepEqual(ids(host.actions(machine.snapshot(), anchors.brake)), ['pull-brake'], 'brake unlocks exactly at 9 strikes');
  act(anchors.brake, 'pull-brake');
  act(anchors.cableWheel, 'pry-cable');
  for (let i = 0; i < 3; i++) act(anchors.cableWheel, 'tighten-cable');
  for (let round = 0; round < 4; round++) {
    act(anchors.weightTower, 'take-weight');
    assert.deepEqual(ids(host.actions(machine.snapshot(), anchors.weightTower)), [], 'hands full at the tower');
    act(anchors.weightFrame, 'hang-weight');
  }
  assert.equal(machine.snapshot().stage, 'full-line');
  assert.deepEqual(host.actions(machine.snapshot(), anchors.brake), [], 'open line offers no repairs');
});

test('only the authoritative carrying player receives a hang action',()=>{
 const m=createZa36CableRepair(1),a=createCableRepairHost(1,anchors),b=createCableRepairHost(1,anchors);
 m.apply({kind:'wake',impact:'sled'});m.apply({kind:'take-weight',index:0});
 const own={...m.snapshot(),carriedBySelf:true},other={...m.snapshot(),carriedBySelf:false};
 a.sync(own);b.sync(other);
 assert.ok(ids(a.actions(own,anchors.weightFrame)).includes('hang-weight'));
 assert.deepEqual(b.actions(other,anchors.weightFrame),[]);
 assert.deepEqual(b.actions(other,anchors.weightTower),[]);
 assert.equal(b.carrying(),null);
 m.returnCarriedWeight();b.sync(m.snapshot());assert.ok(ids(b.actions(m.snapshot(),anchors.weightTower)).includes('take-weight'));
});
test('actions are reach-bound and line-bound', () => {
  const machine = createZa36CableRepair(2);
  const host = createCableRepairHost(2, anchors);
  machine.apply({ kind: 'wake', impact: 'sled' });
  assert.deepEqual(host.actions(machine.snapshot(), { east: 100, north: 100 }), []);
  const other = createCableRepairHost(1, anchors);
  assert.deepEqual(other.actions(machine.snapshot(), anchors.brake), [], 'line 1 host ignores line 2 state');
});
