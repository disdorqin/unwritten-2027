import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundMineEncounter } from '../../src/presence/underground-mine-encounter.js';
import { createUndergroundMineGate } from '../../src/presence/underground-mine-gate.js';
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

test('the mine gate needs the accepted winch foot and a cleared section, then stays open for the run', () => {
  const { encounter, setAccepted, advance } = fixture([
    { ...spawn, id: 'clump', species: 'snow-clump', habitat: 'shallow-snow' },
  ]);
  const winch = { domainId: point.layer, east: 0, north: 0, height: -91, horizontalReach: 1.1, verticalReach: .2 };
  let foot = { ...winch, playerId };
  let time = 100;
  const revealMs = 400;
  const gate = createUndergroundMineGate({
    encounter, winch, revealMs, now: () => time,
    readAcceptedFoot: id => id === playerId ? foot : undefined,
  });
  assert.equal(gate.state(), 'closed');
  assert.equal(gate.openFromMine(playerId), 'uncleared');

  setAccepted({ section: 'mine', player: { room, at: point, action: 'quiet' },
    contact: { target: 'clump', tool: 'snowball' } });
  assert.equal(advance(0).sectionCleared, true);
  assert.equal(gate.openFromMine('other'), 'unreachable');
  foot = { ...foot, domainId: 'test-crystal-cave' };
  assert.equal(gate.openFromMine(playerId), 'unreachable');
  foot = { ...foot, domainId: point.layer, east: 1.2 };
  assert.equal(gate.openFromMine(playerId), 'unreachable');
  foot = { ...foot, east: 0 };

  time = Infinity;
  assert.equal(gate.openFromMine(playerId), 'clock-unavailable');
  assert.equal(gate.state(), 'closed');
  time = 100;
  assert.equal(gate.openFromMine(playerId), 'ajar');
  time = 499;
  assert.equal(gate.openFromMine(playerId), 'ajar');
  time = 500;
  foot = { ...foot, domainId: 'test-crystal-cave' };
  assert.equal(gate.state(), 'open');
  time = 0;
  assert.equal(gate.state(), 'open');
});

test('gate traversal uses the fully open leaf and a registered, supported landing in either direction', () => {
  const winch = { domainId: 'mine', east: 0, north: 0, height: -91, horizontalReach: 1.1, verticalReach: .2 };
  const crystal = { domainId: 'crystal-cave', east: 7, north: 5, height: -140, yaw: Math.PI };
  const mine = { domainId: 'mine', east: 0, north: 2, height: -91, yaw: 0 };
  let time = 100;
  let supported = true;
  let foot = { ...winch, playerId };
  const options = {
    winch,
    revealMs: 400,
    now: () => time,
    encounter: { isSectionCleared: () => true },
    readAcceptedFoot: () => foot,
  };
  const passage = {
    mine, crystal,
    isAtThreshold: (side: string, from: { north: number }) => from.north === (side === 'mine' ? 1 : 4),
    supportsLanding: () => supported,
  };
  const gate = createUndergroundMineGate({ ...options, passage });
  const unregistered = createUndergroundMineGate(options);
  assert.throws(() => createUndergroundMineGate({ ...options, passage: { ...passage, crystal: { ...crystal, yaw: NaN } } }),
    /registered mine and crystal domains/);
  assert.throws(() => createUndergroundMineGate({ ...options, passage: { ...passage, crystal: mine } }),
    /registered mine and crystal domains/);

  assert.equal(gate.openFromMine(playerId), 'ajar');
  assert.equal(unregistered.openFromMine(playerId), 'ajar');
  foot = { ...foot, north: 1 };
  assert.equal(gate.resolveTraversal(playerId), undefined);
  time = 500;
  assert.equal(unregistered.resolveTraversal(playerId), undefined);
  assert.equal(gate.resolveTraversal('spectator'), undefined);
  assert.equal(gate.resolveTraversal(playerId)?.landing.domainId, crystal.domainId);
  assert.deepEqual(gate.resolveTraversal(playerId), { playerId, fromDomainId: 'mine', landing: crystal });
  const proposal = gate.resolveTraversal(playerId);
  assert.ok(proposal);
  proposal.landing.east = 99;
  assert.equal(gate.resolveTraversal(playerId)?.landing.east, 7);

  supported = false;
  assert.equal(gate.resolveTraversal(playerId), undefined);
  supported = true;
  foot = { ...foot, ...crystal };
  assert.equal(gate.resolveTraversal(playerId), undefined);
  foot = { ...foot, north: 4 };
  assert.deepEqual(gate.resolveTraversal(playerId), { playerId, fromDomainId: 'crystal-cave', landing: mine });
  foot = { ...foot, domainId: 'other-floor' };
  assert.equal(gate.resolveTraversal(playerId), undefined);
});

test('the registered crystal return switch opens the same gate without reclearing the mine', () => {
  const winch = { domainId: 'mine', east: 0, north: 0, height: -91, horizontalReach: 1.1, verticalReach: .2 };
  const crystalSwitch = { ...winch, domainId: 'crystal-cave', height: -140 };
  let foot = { ...crystalSwitch, playerId };
  let time = 100;
  let clearChecks = 0;
  const options = {
    winch,
    now: () => time,
    revealMs: 400,
    encounter: { isSectionCleared() { clearChecks++; return false; } },
    readAcceptedFoot: () => foot,
  };
  assert.equal(createUndergroundMineGate(options).openFromCrystal(playerId), 'unreachable');
  assert.throws(() => createUndergroundMineGate({ ...options, crystalSwitch: winch }), /distinct/);
  const gate = createUndergroundMineGate({ ...options, crystalSwitch });

  foot = { ...winch, playerId };
  assert.equal(gate.openFromCrystal(playerId), 'unreachable');
  assert.equal(gate.openFromMine(playerId), 'uncleared');
  assert.equal(clearChecks, 1);
  foot = { ...crystalSwitch, height: -139.7, playerId };
  assert.equal(gate.openFromCrystal(playerId), 'unreachable');
  foot = { ...crystalSwitch, east: 1.2, playerId };
  assert.equal(gate.openFromCrystal(playerId), 'unreachable');
  foot = { ...crystalSwitch, playerId };
  assert.equal(gate.openFromCrystal('other'), 'unreachable');
  assert.equal(gate.state(), 'closed');

  time = NaN;
  assert.equal(gate.openFromCrystal(playerId), 'clock-unavailable');
  assert.equal(gate.state(), 'closed');
  time = 100;
  assert.equal(gate.openFromCrystal(playerId), 'ajar');
  time = 499;
  assert.equal(gate.openFromCrystal(playerId), 'ajar');
  foot = { ...winch, playerId };
  assert.equal(gate.openFromMine(playerId), 'ajar');
  time = 500;
  assert.equal(gate.openFromMine(playerId), 'open');
  foot = { ...crystalSwitch, playerId };
  assert.equal(gate.openFromCrystal(playerId), 'open');
  assert.equal(clearChecks, 1);
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
