import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight } from 'three';
import { createUndergroundMainlineTrack } from '../src/shared/underground-mainline-track.js';
import type { U19MineCartSnapshot } from '../src/presence/underground-mainline-cart.js';
import { mountUndergroundMainlineScene, undergroundMainlineWords } from
  '../tools/voxel-tavern/town-blockout/underground-mainline-scene.js';

const route = createUndergroundMainlineTrack({
  domainId: 'mine', waypoints: [0, 24, 48, 72, 96, 120]
    .map(m => ({ east: -100, north: 200 - m, height: -90 })),
  turnoutMetres: 94, faults: { sleepers: 18, gauge: 48, 'turnout-rust': 83 },
  clearanceRadius: .82, gaugeMetres: 1,
  acceptsTrackStep: () => true, acceptsWorkFoot: () => true,
});
const fresh: U19MineCartSnapshot = {
  revision: 1, lastAtMs: 100, mode: 'repairing', chainage: 0, speed: 0,
  brakeHeld: false, turnout: 'unset', cargo: { oreId: '', pieces: 0 },
  faults: { sleepers: 0, gauge: 0, 'turnout-rust': 0 },
};
type Viewer = ReturnType<Parameters<typeof mountUndergroundMainlineScene>[0]['readViewer']>;
function setup() {
  const parent = new Group();
  let accepted = true;
  let visible = true;
  let snapshot: U19MineCartSnapshot | undefined = { ...fresh };
  let viewer: Viewer;
  let budget = 3;
  const intents: unknown[] = [];
  const noises: unknown[] = [];
  const options: Parameters<typeof mountUndergroundMainlineScene>[0] = {
    parent, route, supportsRoute: () => accepted,
    readSnapshot: () => snapshot,
    readLightBudget: () => budget, readViewer: () => viewer,
    canSee: () => visible, dispatch: intent => intents.push(intent),
    onNoise: (kind, at) => noises.push({ kind, at }),
  };
  return {
    parent, options, intents, noises,
    setAccepted(value: boolean) { accepted = value; },
    setVisible(value: boolean) { visible = value; },
    setSnapshot(value?: U19MineCartSnapshot) { snapshot = value; },
    setBudget(value: number) { budget = value; },
    setViewer(value: Viewer) { viewer = value; },
  };
}
test('U-19 round 1/2 refuses unsupported official 120m route instead of mounting a U-7 phantom track', () => {
  const f = setup();
  assert.deepEqual(mountUndergroundMainlineScene({ ...f.options, route: undefined }),
    { kind: 'unregistered' });
  f.setAccepted(false);
  assert.deepEqual(mountUndergroundMainlineScene(f.options), { kind: 'unsupported-route' });
  assert.equal(f.parent.children.length, 0);
  f.setAccepted(true);
  const mounted = mountUndergroundMainlineScene(f.options);
  assert.equal(mounted.kind, 'ready');
  if (mounted.kind !== 'ready') assert.fail();
  assert.equal(mounted.route.length, 120);
  assert.ok(mounted.sleepers >= 140, 'full length, not two short hand-pushed steps');
  assert.ok(mounted.batches >= 10);
  assert.equal(f.parent.children.length, 1);
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-19 round 3 uses dense bundled rust, wood, rock and ballast with real two-end work stations and six lamps', () => {
  const f = setup();
  const mounted = mountUndergroundMainlineScene(f.options);
  if (mounted.kind !== 'ready') assert.fail();
  const root = mounted.group;
  for (const family of ['double-iron-running-rails', 'rail-sleeper', 'ballast-stones',
    'station-wood-planks', 'station-board-signs', 'station-winch-iron',
    'rail-repair-workdeck', 'turnout-adjustable-rusty-blades']) {
    const object = root.getObjectByName('u19/' + family);
    assert.ok(object && 'isInstancedMesh' in object && object.isInstancedMesh === true, family);
  }
  const rail = root.getObjectByName('u19/double-iron-running-rails');
  assert.ok(rail && 'count' in rail && typeof rail.count === 'number');
  assert.ok(rail.count >= 250);
  const lamps: PointLight[] = [];
  root.traverse(object => {
    if ('isPointLight' in object && object.isPointLight === true) lamps.push(object as PointLight);
  });
  assert.equal(lamps.length, 6);
  assert.equal(lamps.filter(light => light.visible).length, 3);
  f.setBudget(0);
  mounted.sync();
  assert.equal(lamps.filter(light => light.visible).length, 0);
  f.setBudget(10);
  mounted.sync();
  assert.equal(lamps.filter(light => light.visible).length, 6);
  assert.ok(mounted.words.switch.includes('停车下车'));
  assert.ok(mounted.words.camp.includes('营地'));
  assert.ok(mounted.words.gate.includes('矿门'));
  assert.ok(mounted.words.car.includes('第六班'));
  mounted.dispose();
});

test('U-19 round 4 repair E selects exact approved bay and current repair verb; off-domain players cannot act', () => {
  const f = setup();
  const mounted = mountUndergroundMainlineScene(f.options);
  if (mounted.kind !== 'ready') assert.fail();
  const at = route.work.sleepers.position;
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: at });
  assert.equal(mounted.prompt('repair')?.fault, 'sleepers');
  assert.equal(mounted.press('repair'), true);
  assert.deepEqual(f.intents[0], {
    playerId: 'miner', revision: 1, role: 'repair', fault: 'sleepers',
    verb: 'carry-sleeper', held: false,
  });
  f.setSnapshot({ ...fresh, revision: 2, faults: { ...fresh.faults, sleepers: 2 } });
  assert.equal(mounted.prompt('repair')?.verb, 'carry-sleeper');
  f.setSnapshot({ ...fresh, revision: 3, faults: { ...fresh.faults, sleepers: 3 } });
  assert.equal(mounted.prompt('repair'), undefined);
  f.setViewer({ playerId: 'miner', domainId: 'town', foot: at });
  assert.equal(mounted.press('repair'), false);
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: at });
  f.setVisible(false);
  assert.equal(mounted.prompt('repair'), undefined);
  mounted.dispose();
});

test('U-19 boarding, hand brake, switch and cargo prompts must be independently selectable', () => {
  const f = setup();
  const mounted = mountUndergroundMainlineScene(f.options);
  if (mounted.kind !== 'ready') assert.fail();
  const repaired = { sleepers: 3, gauge: 3, 'turnout-rust': 4 };
  f.setSnapshot({ ...fresh, revision: 5, mode: 'stopped', faults: repaired });
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: route.work.camp.position });
  assert.equal(mounted.prompt('board')?.role, 'board');
  assert.equal(mounted.prompt('load')?.role, 'load');
  assert.equal(mounted.prompt('unload')?.role, 'unload');
  assert.equal(mounted.press('unload'), true);
  assert.deepEqual(f.intents[0], { playerId: 'miner', revision: 5, role: 'unload',
    fault: undefined, verb: undefined, held: false });
  f.setSnapshot({ ...fresh, revision: 6, mode: 'stopped', faults: repaired, riderId: 'miner' });
  assert.equal(mounted.prompt('go')?.role, 'go');
  assert.equal(mounted.prompt('leave')?.role, 'leave');
  f.setSnapshot({ ...fresh, revision: 7, mode: 'rolling',
    faults: repaired, riderId: 'miner', chainage: 1, speed: 2 });
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: route.sample(1).position });
  assert.equal(mounted.prompt('brake')?.role, 'brake');
  assert.equal(mounted.press('brake', true), true);
  f.setSnapshot({ ...fresh, revision: 8, mode: 'stopped', faults: repaired,
    chainage: route.turnoutMetres });
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: route.work.turnout.position });
  assert.equal(mounted.prompt('turnout')?.role, 'turnout');
  assert.equal(mounted.press('turnout'), true);
  f.setSnapshot({ ...fresh, revision: 9, mode: 'stopped', faults: repaired,
    chainage: route.turnoutMetres, turnout: 'branch', riderId: 'miner' });
  assert.equal(mounted.prompt('go'), undefined,
    'the unregistered scenic branch is not presented as a ride');
  f.setSnapshot({ ...fresh, revision: 10, mode: 'stopped', faults: repaired,
    chainage: route.turnoutMetres, turnout: 'gate', riderId: 'miner' });
  assert.equal(mounted.prompt('go')?.role, 'go');
  mounted.dispose();
});

test('U-19 derail is visible as a stopped cart and rerail prompt, without auto-hiding the occupant', () => {
  const f = setup();
  const mounted = mountUndergroundMainlineScene(f.options);
  if (mounted.kind !== 'ready') assert.fail();
  const state: U19MineCartSnapshot = {
    ...fresh, revision: 18, mode: 'derailed', chainage: route.turnoutMetres,
    riderId: 'miner', speed: 0,
  };
  f.setSnapshot(state);
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: route.work.turnout.position });
  mounted.sync();
  assert.equal(mounted.cart.visible, true);
  assert.equal(mounted.prompt('rerail'), undefined, 'must choose to leave before rerailing');
  f.setSnapshot({ ...state, revision: 19, riderId: undefined });
  assert.equal(mounted.prompt('rerail')?.role, 'rerail');
  assert.equal(mounted.press('rerail'), true);
  assert.ok(f.noises.some(cue => (cue as { kind: string }).kind === 'derail'));
  f.setSnapshot(undefined);
  assert.equal(mounted.sync(), false);
  assert.equal(mounted.cart.visible, false);
  mounted.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-19 winch only appears on the certified camp station; unsupported requests remain silent', () => {
  const f = setup();
  const mounted = mountUndergroundMainlineScene(f.options);
  if (mounted.kind !== 'ready') assert.fail();
  f.setSnapshot({ ...fresh, revision: 7, mode: 'recalling', chainage: route.length });
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: route.work.camp.position });
  assert.equal(mounted.prompt('winch')?.role, 'winch');
  assert.equal(mounted.press('winch', true), true);
  f.setViewer({ playerId: 'miner', domainId: 'mine', foot: route.work.gate.position });
  assert.equal(mounted.prompt('winch'), undefined);
  mounted.dispose();
});
