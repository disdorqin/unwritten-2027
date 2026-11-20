import assert from 'node:assert/strict';
import test from 'node:test';
import { createMineBestiaryEncounter, mineBestiary, type MineCreature, type MineEncounterFrame, type MineEncounterHost } from '../src/shared/mine-bestiary.js';

const room = 'survey-fixture';
const host: MineEncounterHost = {
  hasSpawnSite: (_section, mineRoom) => mineRoom === room,
  moveAllowed: () => true,
  seesPlayer: () => true,
  hearsMining: () => true,
  insideCampfire: () => false,
};
type Survival = Extract<MineEncounterFrame, { mode: 'survival' }>;

function setup(species: MineCreature, overrides: Partial<MineEncounterHost> = {}, count = 1, origin = { east: 0, north: 0 }) {
  const { section, site } = mineBestiary[species];
  const encounter = createMineBestiaryEncounter(Array.from({ length: count }, (_, index) => ({
    id: String(index), species, habitat: site, room, at: { ...origin, east: origin.east + index * 0.03 },
  })), { ...host, ...overrides });
  let tick = 0;
  function advance(player: Partial<Survival['player']> = {}, contact?: Survival['contact'], snowballLanding?: Survival['snowballLanding']) {
    return encounter.advance({ tick: tick++, mode: 'survival', section, contact, snowballLanding,
      player: { at: { east: origin.east + .6, north: origin.north }, room, action: 'quiet', health: 100, maxHealth: 100, ...player } });
  }
  return { encounter, advance, first: () => encounter.snapshot()[0]! };
}

test('U-14 selects only the five first- and second-segment creatures and locks the official counters', () => {
  assert.deepEqual(Object.keys(mineBestiary), ['snow-clump', 'skeleton-miner', 'zombie-miner', 'rock-snake', 'crystal-bat']);
  const counters = Object.values(mineBestiary).map(({ counters, hits }) => [counters, hits]);
  assert.deepEqual(counters, [[['snowball'], 1], [['pickaxe'], 2], [['pickaxe'], 3], [['snowball', 'pickaxe'], 1], [['snowball'], 1]]);
  assert.ok(Object.isFrozen(mineBestiary) && Object.values(mineBestiary).every(rule =>
    Object.isFrozen(rule) && Object.isFrozen(rule.counters)));
  for (const species of Object.keys(mineBestiary) as MineCreature[]) {
    const { counters, hits } = mineBestiary[species];
    const { advance, first } = setup(species);
    const wrongTool = counters[0] === 'snowball' ? 'pickaxe' : 'snowball';
    if (counters.length === 1) assert.equal(advance({}, { target: '0', tool: wrongTool }).hit, 'wrong-tool');
    assert.equal(first().remainingHits, hits);
    for (let hit = 1; hit <= hits; hit++) {
      assert.equal(advance({}, { target: '0', tool: counters[0] }).hit, hit === hits ? 'defeated' : 'damaged');
    }
    assert.equal(first().phase, 'defeated');
    assert.equal(advance({}, { target: '0', tool: counters[0] }).hit, 'ignored');
  }
  assert.equal(setup('rock-snake').advance({}, { target: '0', tool: 'pickaxe' }).hit, 'defeated');
});

test('snow clump notices visible snow gathering, rolls and rebuilds once it hits or meets a wall', () => {
  const { advance, first } = setup('snow-clump');
  advance({ action: 'mine' });
  advance({ action: 'run' });
  assert.equal(first().phase, 'rest');
  advance({ action: 'scoop-snow' });
  assert.equal(first().phase, 'windup');
  assert.equal(advance().damage, 0);
  assert.equal(advance().damage, 8);
  assert.equal(first().phase, 'rebuild');
  for (let step = 0; step < 30; step++) assert.equal(advance().damage, 0);
  assert.equal(first().phase, 'rest');
  const blocked = setup('snow-clump', { moveAllowed: () => false });
  blocked.advance({ action: 'scoop-snow', at: { east: 3, north: 0 } });
  assert.equal(blocked.first().phase, 'rebuild');
  assert.deepEqual(blocked.first().at, { east: 0, north: 0 });
});

test('skeleton follows distinct mining sounds with fixed speed and stays outside the accepted campfire annulus', () => {
  const target = { east: 4, north: 0 };
  const { advance, first } = setup('skeleton-miner', { insideCampfire: (_room, p) => p.east > 3.7 });
  advance({ at: { east: 3, north: 0 }, action: 'walk' });
  assert.equal(first().phase, 'rest');
  // The first sound projects one metre of patrol target. Player remains outside this test's ring.
  for (let step = 0; step < 9; step++) advance({ at: { east: 3, north: 0 }, action: step === 0 ? 'mine' : 'quiet' });
  assert.equal(first().at.east, 1);
  advance({ at: { east: 1.2, north: 0 }, action: 'mine' });
  assert.equal(first().at.east, 1);
  assert.equal(first().phase, 'windup');
  for (let step = 0; step < 15; step++) assert.equal(advance({ at: target, action: 'mine' }).damage, 0);
  assert.ok(first().at.east <= 1);

  const footsteps = setup('skeleton-miner', { hearsMining: () => false });
  footsteps.advance({ at: target, action: 'mine' });
  assert.equal(footsteps.first().phase, 'rest');
  const patrol = setup('skeleton-miner');
  patrol.advance({ at: target, action: 'mine' });
  const firstStep = patrol.first().at.east;
  patrol.advance({ at: target, action: 'mine' });
  assert.ok(Math.abs(firstStep - .17) < 1e-8 && Math.abs(patrol.first().at.east - .34) < 1e-8);
});

test('a skeleton loses a dark quiet miner at the last heard point and follows only a new mining sound', () => {
  const target = { east: 4, north: 0 };
  const { advance, first } = setup('skeleton-miner', { seesPlayer: () => false });
  advance({ at: target, action: 'mine' });
  for (let step = 0; step < 6; step++) assert.equal(advance({ at: target, action: 'quiet' }).damage, 0);
  assert.equal(first().phase, 'retreat');
  assert.equal(first().at.east, 1);
  advance({ at: target, action: 'run' });
  assert.equal(first().phase, 'retreat');
  assert.ok(Math.abs(first().at.east - .83) < 1e-8);

  advance({ at: target, action: 'mine' });
  assert.equal(first().phase, 'chase');
  assert.ok(Math.abs(first().at.east - 1) < 1e-8);
  for (let step = 0; step < 24; step++) assert.equal(advance({ at: target, action: 'quiet' }).damage, 0);
  assert.deepEqual(first().at, { east: 0, north: 0 });
  assert.equal(first().phase, 'rest');
});

test('zombie cues a medium attack after a longer warning, but walking away or reaching the camp fire prevents it', () => {
  const { advance, first } = setup('zombie-miner');
  advance({ action: 'walk' });
  assert.equal(first().phase, 'rest');
  advance({ action: 'run' });
  assert.equal(first().phase, 'windup');
  for (let step = 0; step < 7; step++) assert.equal(advance().damage, 0);
  assert.equal(advance().damage, 16);
  assert.equal(first().phase, 'recover');

  // Candidate U-2 survey uses local X/Z camp anchor (2.5,40). The production host supplies radius and permissions.
  const fire = setup('zombie-miner', { insideCampfire: (_room, p) => Math.hypot(p.east - 2.5, p.north - 40) < 2 }, 1, { east: 5, north: 40 });
  for (let step = 0; step < 30; step++) {
    assert.equal(fire.advance({ at: { east: 2.5, north: 40 }, action: 'run' }).damage, 0);
  }
  assert.deepEqual(fire.first().at, { east: 5, north: 40 });
  const escaping = setup('zombie-miner');
  escaping.advance({ at: { east: 7, north: 0 }, action: 'run' });
  for (let step = 0; step < 24; step++) assert.equal(escaping.advance({ at: { east: 7, north: 0 }, action: 'walk' }).damage, 0);
  assert.equal(escaping.first().phase, 'retreat');
});

test('a rock snake peeks at walking, ignores crouching, bites after running vibration and retreats', () => {
  const { advance, first } = setup('rock-snake');
  advance({ action: 'crouch' });
  assert.equal(first().phase, 'rest');
  advance({ action: 'walk' });
  assert.equal(first().phase, 'peek');
  assert.deepEqual(first().at, { east: 0, north: 0 });
  advance({ action: 'run' });
  assert.equal(first().phase, 'windup');
  assert.equal(advance().damage, 0);
  assert.equal(advance().damage, 8);
  for (let step = 0; step < 8; step++) assert.equal(advance().damage, 0);
  assert.equal(first().phase, 'rest');
});

test('the registered fire zone excludes every creature spawn', () => {
  for (const species of Object.keys(mineBestiary) as MineCreature[]) {
    assert.throws(() => setup(species, { insideCampfire: () => true }), /accepted underground spawn site/);
  }
});

test('crossing into a fire zone during a rock snake windup prevents the bite', () => {
  const inFire = (activeRoom: string, point: { east: number }) => activeRoom === room && point.east >= .7;
  const { advance, first } = setup('rock-snake', { insideCampfire: inFire });
  const inRangeInsideFire = { east: .8, north: 0 };
  advance({ action: 'run' });
  assert.equal(first().phase, 'windup');
  assert.equal(advance({ at: inRangeInsideFire }).damage, 0);
  assert.equal(advance({ at: inRangeInsideFire }).damage, 0);
  assert.equal(first().phase, 'recover');
});

test('a rock snake investigates the local ground landing without pursuing or biting the thrower', () => {
  const { advance, first } = setup('rock-snake');
  const localLanding = { room, at: { east: 0, north: 2 } };
  const thrower = { action: 'throw-snowball', at: { east: .6, north: 0 } } as const;
  advance(thrower);
  advance(thrower, undefined, { ...localLanding, room: 'other-mine-room' });
  advance(thrower, undefined, { room, at: { east: 0, north: 6.01 } });
  assert.equal(first().phase, 'rest');
  assert.deepEqual(first().at, { east: 0, north: 0 });

  assert.equal(advance(thrower, undefined, localLanding).damage, 0);
  assert.equal(first().phase, 'peek');
  assert.deepEqual(first().at, { east: 0, north: .36 });
  for (let step = 0; step < 5; step++) assert.equal(advance(thrower).damage, 0);
  assert.deepEqual(first().at, localLanding.at);
  for (let step = 0; step < 10; step++) assert.equal(advance().damage, 0);
  assert.equal(first().phase, 'rest');
  assert.deepEqual(first().at, { east: 0, north: 0 });

  const occludedPath = setup('rock-snake', { moveAllowed: () => false });
  occludedPath.advance({ ...thrower, room: 'other-mine-room' }, undefined, localLanding);
  assert.equal(occludedPath.first().phase, 'peek');
  assert.deepEqual(occludedPath.first().at, { east: 0, north: 0 });
});

test('crystal bats circle before diving, limit concurrent dives to two and stop attacking outside the room', () => {
  const { advance, first, encounter } = setup('crystal-bat', {}, 8);
  advance({ action: 'crouch' });
  assert.equal(first().phase, 'rest');
  advance({ action: 'direct-lamp' });
  assert.equal(first().phase, 'orbit');
  let hit = false;
  for (let step = 0; step < 80; step++) {
    const result = advance();
    if (step < 28) assert.equal(result.damage, 0);
    const dives = encounter.snapshot().filter(({ phase }) => phase === 'chase' || phase === 'windup');
    assert.ok(dives.length <= 2);
    assert.ok(result.damage === 0 || result.damage === 8);
    hit ||= result.damage > 0;
  }
  assert.equal(hit, true);
  for (let step = 0; step < 40; step++) assert.equal(advance({ room: 'exit-via-next-room' }).damage, 0);
  assert.ok(encounter.snapshot().every(({ phase }) => phase === 'rest'));
});

test('same-tick damage is capped to one hit and neither encounters nor contacts affect the peaceful surface', () => {
  const { advance, encounter } = setup('skeleton-miner', {}, 2);
  advance({ action: 'mine' });
  for (let step = 0; step < 3; step++) assert.equal(advance().damage, 0);
  assert.deepEqual(advance(), { damage: 16, damageBand: 'medium', hit: 'ignored' });
  const before = encounter.snapshot();
  assert.deepEqual(encounter.advance({ tick: 5, mode: 'peaceful' }), { damage: 0, damageBand: undefined, hit: 'ignored' });
  assert.deepEqual(encounter.snapshot(), before);
  assert.throws(() => encounter.advance({ tick: 5, mode: 'peaceful' }), /new/);
  assert.throws(() => createMineBestiaryEncounter([{ id: 'bad', species: 'rock-snake', habitat: 'workface', room,
    at: { east: 0, north: 0 } }], host), /accepted underground spawn site/);
  assert.throws(() => setup('snow-clump', {}, 6), /room creature cap/);
});
