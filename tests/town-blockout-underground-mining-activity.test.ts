import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  UndergroundMiningCore, UndergroundMiningReceipt, UndergroundMiningTargetView,
} from '../src/shared/underground-mining';
import { mountUndergroundMiningActivity } from '../tools/voxel-tavern/town-blockout/underground-mining-activity';

const point = { layer: 'mine', east: 80, north: 120, height: -90 };
const ore: UndergroundMiningTargetView = {
  id: 'ore-a', kind: 'ore', at: point, surface: 'rock', mineral: 'ordinary-ore', strikes: 3, hits: 0, open: false,
};
const core: UndergroundMiningCore = {
  id: 'core-a', at: point, mineral: 'ordinary-ore', amount: 3,
};

function harness() {
  let aimed: string | undefined = ore.id;
  let held = false;
  const requests: { action: string; targetId: string }[] = [];
  const effects: UndergroundMiningReceipt[] = [];
  const drawn = new Map<string, UndergroundMiningTargetView>();
  const drops = new Map<string, UndergroundMiningCore>();
  const activity = mountUndergroundMiningActivity({
    aimedTarget: () => aimed,
    heldPickaxe: () => held,
    request: intent => requests.push(intent),
    showTarget: target => { drawn.set(target.id, target); },
    hideTarget: id => { drawn.delete(id); },
    showCore: drop => { drops.set(drop.id, drop); },
    hideCore: id => { drops.delete(id); },
    onStrike: receipt => effects.push(receipt),
  });
  return {
    activity, requests, effects, drawn, drops,
    aim(id?: string) { aimed = id; },
    equipPickaxe() { held = true; },
  };
}

test('the existing primary and E actions project only accepted ore and pickup receipts', () => {
  const { activity, requests, effects, drawn, drops, aim, equipPickaxe } = harness();
  activity.setLayer('mine');
  activity.sync({ targets: [ore], cores: [] });
  assert.equal(activity.primaryInput(), false);
  equipPickaxe();
  aim('unregistered');
  assert.equal(activity.primaryInput(), false);
  aim(ore.id);
  assert.equal(activity.primaryInput(), true);
  assert.equal(drawn.get(ore.id)?.hits, 0);
  assert.deepEqual(requests, [{ action: 'strike', targetId: ore.id }]);

  const firstHit = { action: 'strike', target: { ...ore, hits: 1 }, sound: { at: point, surface: 'rock' } } as const;
  assert.equal(activity.receive(firstHit), true);
  assert.equal(activity.receive(structuredClone(firstHit)), false);
  assert.equal(drawn.get(ore.id)?.hits, 1);
  assert.equal(drops.size, 0);
  assert.equal(effects.length, 1);

  const opened = { ...firstHit, target: { ...ore, hits: 3, open: true, regrowAt: 1300 }, core } as const;
  assert.equal(activity.receive(opened), true);
  assert.equal(activity.primaryInput(), false);
  assert.equal(activity.pickup(core.id), true);
  assert.deepEqual(requests.at(-1), { action: 'pickup', targetId: core.id });
  assert.equal(drops.has(core.id), true);
  assert.equal(activity.receive({ action: 'pickup', core }), true);
  assert.equal(activity.pickup(core.id), false);
  assert.equal(activity.receive(structuredClone(opened)), false);
  assert.equal(drops.size, 0);
  assert.equal(effects.length, 2);
});

test('the active layer owns all visuals and reconnect and regrowth snapshots stay silent', () => {
  const { activity, effects, drawn, drops, aim, equipPickaxe } = harness();
  const ice = { ...ore, id: 'ice-a', at: { ...point, layer: 'cave', height: -140 }, mineral: 'blue-crystal' } as const;
  const opened = { ...ore, hits: 3, open: true, regrowAt: 1450 };
  activity.setLayer('mine');
  activity.sync({ targets: [opened, ice], cores: [core] }, 'mine');
  assert.deepEqual([...drawn.keys()], [ore.id]);
  assert.equal(drops.size, 1);
  assert.equal(effects.length, 0);
  equipPickaxe();
  assert.equal(activity.primaryInput(), false);

  activity.sync({ targets: [ore], cores: [] }, 'mine');
  assert.equal(activity.primaryInput(), true);
  assert.equal(effects.length, 0);
  activity.setLayer('cave');
  assert.equal(drawn.size, 0);
  assert.equal(drops.size, 0);
  activity.sync({ targets: [ice], cores: [] }, 'cave');
  activity.sync({ targets: [ore], cores: [core] }, 'mine');
  assert.equal(drawn.has(ice.id), true);
  assert.equal(activity.receive({ action: 'strike', target: { ...ore, hits: 1 }, sound: { at: point, surface: 'rock' } }), false);
  assert.equal(activity.receive({ action: 'pickup', core }), false);
  assert.equal(effects.length, 0);
  aim(ice.id);
  assert.equal(activity.primaryInput(), true);
  activity.dispose();
  activity.dispose();
  assert.equal(activity.primaryInput(), false);
  assert.equal(drawn.size, 0);
});
