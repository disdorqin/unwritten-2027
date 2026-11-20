import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundMineEncounter } from '../../src/presence/underground-mine-encounter.js';
import { createUndergroundSurvival } from '../../src/presence/underground-survival.js';
import { createUndergroundVitals } from '../../src/presence/underground-vitals.js';

type Options = Parameters<typeof createUndergroundMineEncounter>[0];
type Accepted = NonNullable<ReturnType<Options['readAcceptedEncounter']>>;
const playerId = 'actor';
const room = 'test-mine-room';
const point = { layer: 'test-mine', east: .6, north: 0, height: -90 };
const spawn = { room, at: { east: 0, north: 0 } };

function fixture(spawns: Options['spawns'], readVitals?: Options['readVitals']) {
  let accepted: Accepted = { section: 'mine', player: { room, at: point, action: 'quiet' } };
  let failWrites = false;
  let successfulWrites = 0;
  const survival = createUndergroundSurvival({
    maxHealth: 100,
    reconnectFromZeroHealth: 20,
    fires: [],
    defaultWakePoint: { ...point, layer: 'test-town', height: 0 },
    readBoundBed: () => undefined,
    readEntryMode: () => 'survival',
    readAcceptedFoot: id => ({ playerId: id, point, standingStill: true }),
    areTeammates: () => false,
    canReach: () => false,
    now: () => 0,
    readTripOre: () => [],
    chooseHalf: () => [],
    save() {
      if (failWrites) throw new Error('authority write failed');
      successfulWrites++;
      return undefined;
    },
  });
  assert.equal(survival.syncDepthMode(playerId), true);
  const encounter = createUndergroundMineEncounter({
    spawns,
    host: {
      hasSpawnSite: (_section, atRoom) => atRoom === room,
      moveAllowed: () => true,
      seesPlayer: () => true,
      hearsMining: () => true,
      insideCampfire: () => false,
    },
    survival,
    maxHealth: 100,
    damageByBand: { light: 7, medium: 13 },
    readAcceptedEncounter: () => accepted,
    readVitals,
  });
  return {
    encounter,
    survival,
    advance: (tick: number) => encounter.advance({ playerId, tick, sequence: tick + 1 }),
    setAccepted: (frame: Accepted) => { accepted = frame; },
    failWrites: (fail: boolean) => { failWrites = fail; },
    successfulWrites: () => successfulWrites,
  };
}

test('defeating the final assigned creature permits gate passage in that same accepted frame', () => {
  const f = fixture([
    { ...spawn, id: 'clump', species: 'snow-clump', habitat: 'shallow-snow' },
    { ...spawn, id: 'snake', species: 'rock-snake', habitat: 'waterline' },
  ]);
  const player = { room, at: point, action: 'quiet' } as const;
  f.setAccepted({ section: 'mine', player, contact: { target: 'clump', tool: 'snowball' } });
  assert.deepEqual(f.advance(0), {
    hit: 'defeated', damage: 0, damageBand: undefined, sectionCleared: false, mayPassClearedGate: false,
  });
  assert.equal(f.encounter.isSectionCleared('mine'), false);

  f.setAccepted({ section: 'mine', player, contact: { target: 'snake', tool: 'pickaxe' } });
  const lastHit = f.advance(1);
  assert.deepEqual(lastHit, {
    hit: 'defeated', damage: 0, damageBand: undefined, sectionCleared: true, mayPassClearedGate: true,
  });
  assert.equal(f.encounter.isSectionCleared('mine'), true);
  assert.equal(f.encounter.isSectionCleared('crystal-cave'), false);
  assert.deepEqual(f.advance(1), lastHit);
});

test('a failed survival write retries the same encounter tick without advancing or charging damage twice', () => {
  const f = fixture([{ ...spawn, id: 'skeleton', species: 'skeleton-miner', habitat: 'workface' }]);
  f.setAccepted({ section: 'mine', player: { room, at: point, action: 'mine' } });
  f.advance(0);
  f.setAccepted({ section: 'mine', player: { room, at: point, action: 'quiet' } });
  for (let tick = 1; tick <= 3; tick++) assert.equal(f.advance(tick).damage, 0);
  const writesBeforeHit = f.successfulWrites();

  f.failWrites(true);
  assert.throws(() => f.advance(4), /authority write failed/);
  assert.equal(f.encounter.snapshot()[0].phase, 'windup');
  assert.equal(f.survival.status(playerId).health, 100);
  assert.throws(() => f.advance(5), /pending encounter frame/);
  f.failWrites(false);

  const result = f.advance(4);
  assert.equal(result.damage, 13);
  assert.equal(result.damageBand, 'medium');
  assert.equal(f.encounter.snapshot()[0].phase, 'recover');
  assert.equal(f.survival.status(playerId).health, 87);
  assert.deepEqual(f.advance(4), result);
  assert.equal(f.survival.status(playerId).health, 87);
  assert.equal(f.successfulWrites(), writesBeforeHit + 1);
});

test('only accepted ambient light resolves the darkness modifier on real creature damage', () => {
  let lampLit = false;
  const vitals = createUndergroundVitals({
    now: () => 0,
    readPlayer: id => id === playerId ? { at: point } : undefined,
    readLights: () => lampLit ? [{ id: 'lamp', kind: 'mine-lamp', at: point }] : [],
    reaches: () => true,
    climates: { [point.layer]: { ambient: .4, degreesPerSecond: .1 } },
    initialTemperature: .8, coldBelow: .5, warmDegreesPerSecond: .2,
    coldWalkScale: .8, coldStrikeScale: .75, darknessDamageScale: 1.5,
    torchRadius: 5, noiseLifetimeMs: 1000, noiseRadius: { walk: 1, run: 4, mining: 6, combat: 8 },
  });
  for (const lit of [false, true]) {
    lampLit = lit;
    const f = fixture([{ ...spawn, id: 'skeleton', species: 'skeleton-miner', habitat: 'workface' }], vitals.sample);
    f.setAccepted({ section: 'mine', player: { room, at: point, action: 'mine' } });
    for (let tick = 0; tick < 4; tick++) assert.equal(f.advance(tick).damage, 0);
    const expected = lit ? 13 : 19.5;
    assert.equal(f.advance(4).damage, expected);
    assert.equal(f.survival.status(playerId).health, 100 - expected);
  }
});
