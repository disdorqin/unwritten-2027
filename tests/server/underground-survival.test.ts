import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundSurvival,
  type UndergroundSurvivalMode,
  type UndergroundSurvivalOptions,
  type UndergroundSurvivalOreChange,
  type UndergroundSurvivalPoint,
  type UndergroundSurvivalSnapshot,
} from '../../src/presence/underground-survival.js';

const plaza = { layer: 'test-town', east: 1, north: 1, height: 2 };
const bed = { ...plaza, east: 8 };
const fire = { layer: 'test-mine', east: 4, north: 4, height: -90 };
const deep = { layer: 'test-city', east: 5, north: 5, height: -165 };
const deathPoint = { ...fire, east: 7 };
type Foot = NonNullable<ReturnType<UndergroundSurvivalOptions['readAcceptedFoot']>>;
type Ore = ReturnType<UndergroundSurvivalOptions['readTripOre']>;

function fixture(overrides: Partial<UndergroundSurvivalOptions> = {}) {
  const feet = new Map<string, Foot>();
  const modes = new Map<string, UndergroundSurvivalMode>();
  const beds = new Map<string, UndergroundSurvivalPoint>();
  const carriedThisTrip = new Map<string, Ore>();
  const changes: UndergroundSurvivalOreChange[] = [];
  let now = 0;
  let saved: UndergroundSurvivalSnapshot | undefined;
  let failWrites = false;
  const options: UndergroundSurvivalOptions = {
    maxHealth: 100,
    reconnectFromZeroHealth: 20,
    defaultWakePoint: plaza,
    fires: [
      { id: 'mine-fire', point: fire, healPerSecond: 15, recovery: true },
      { id: 'city-cold-fire', point: deep, healPerSecond: 8, recovery: true },
    ],
    readBoundBed: id => beds.get(id),
    readEntryMode: id => modes.get(id) ?? 'peace',
    readAcceptedFoot: id => feet.get(id),
    areTeammates: (id, target) => id === 'friend' && target === 'miner',
    canReach: (from, to) => Math.hypot(from.east - to.east, from.north - to.north, from.height - to.height) <= 1,
    now: () => now,
    readTripOre: id => carriedThisTrip.get(id) ?? [],
    chooseHalf: ore => ore.flatMap(({ id, count }) => count >= 2 ? [{ id, count: Math.floor(count / 2) }] : []),
    save(snapshot, change) {
      if (failWrites) throw new Error('transaction failed');
      saved = snapshot;
      if (change) changes.push(change);
      if (change?.kind === 'finish-trip') carriedThisTrip.delete(change.playerId);
      return undefined;
    },
    ...overrides,
  };
  const world = createUndergroundSurvival(options);
  function foot(id: string, point = fire, rest: Partial<Foot> = {}) {
    feet.set(id, { playerId: id, point, standingStill: false, ...rest });
  }
  function enter(id = 'miner', point = deathPoint) {
    foot(id, point);
    modes.set(id, 'survival');
    assert.equal(world.syncDepthMode(id), true);
  }
  return { world, options, foot, enter, modes, beds, carriedThisTrip, changes,
    setTime: (value: number) => { now = value; },
    failWrites: (value: boolean) => { failWrites = value; },
    saved: () => saved };
}

test('health visibility follows confirmed entry mode and only underground combat or abyss can hurt', () => {
  const { world, foot, modes, changes } = fixture();
  foot('miner', deathPoint);
  assert.equal(world.syncDepthMode('miner'), false);
  assert.equal(world.status('miner').health, undefined);
  assert.equal(world.damage('miner', { sequence: 1, kind: 'monster', amount: 19 }), false);
  modes.set('miner', 'survival');
  foot('miner', deathPoint, { playerId: 'other' });
  assert.equal(world.syncDepthMode('miner'), false);
  foot('miner', deathPoint);
  assert.equal(world.syncDepthMode('miner'), true);
  assert.equal(world.damage('miner', { sequence: 1, kind: 'ordinary-fall', amount: 100 }), false);
  assert.equal(world.damage('miner', { sequence: 1, kind: 'first-fall', amount: 100 }), false);
  assert.equal(world.damage('miner', { sequence: 1, kind: 'monster', amount: 100 }), false);
  assert.equal(world.damage('miner', { sequence: 1, kind: 'monster', amount: 30 }), true);
  assert.equal(world.damage('miner', { sequence: 1, kind: 'abyss', amount: 30 }), false);
  assert.equal(world.status('miner').health, 70);
  modes.set('miner', 'peace');
  foot('miner', plaza);
  assert.equal(world.syncDepthMode('miner'), true);
  assert.equal(world.status('miner').health, undefined);
  assert.deepEqual(changes, [{ kind: 'finish-trip', playerId: 'miner', remove: [] }]);
  modes.set('miner', 'survival');
  foot('miner', fire);
  assert.equal(world.syncDepthMode('miner'), true);
  assert.equal(world.status('miner').health, 100);
});

test('monster hits have a per-player 500ms window and blocked contacts cannot replay at expiry', () => {
  const { world, enter, setTime } = fixture();
  enter();
  enter('friend');
  const hit = { kind: 'monster', amount: 16 } as const;
  setTime(1000);
  assert.equal(world.damage('miner', { ...hit, sequence: 1 }), true);
  assert.equal(world.damage('miner', { ...hit, sequence: 2 }), false);
  setTime(900);
  assert.equal(world.damage('miner', { ...hit, sequence: 3 }), false);
  setTime(1499);
  assert.equal(world.damage('friend', { ...hit, sequence: 1 }), true);
  assert.equal(world.damage('miner', { kind: 'abyss', sequence: 4, amount: 5 }), true);
  assert.equal(world.damage('miner', { ...hit, sequence: 5 }), false);
  assert.equal(world.status('miner').health, 79);
  setTime(1500);
  assert.equal(world.damage('miner', { ...hit, sequence: 5 }), false);
  assert.equal(world.damage('miner', { ...hit, sequence: 6 }), true);
  assert.equal(world.status('miner').health, 63);
});

test('a failed save neither starts monster immunity nor consumes a blocked hit', () => {
  const { world, enter, setTime, failWrites } = fixture();
  enter();
  const hit = { kind: 'monster', amount: 16 } as const;
  const before = world.snapshot();
  setTime(NaN);
  assert.throws(() => world.damage('miner', { ...hit, sequence: 1 }), /Invalid authority time/);
  assert.deepEqual(world.snapshot(), before);
  setTime(1000);
  failWrites(true);
  assert.throws(() => world.damage('miner', { ...hit, sequence: 1 }), /transaction failed/);
  assert.deepEqual(world.snapshot(), before);
  failWrites(false);
  setTime(1001);
  assert.equal(world.damage('miner', { ...hit, sequence: 1 }), true);
  const hurt = world.snapshot();
  setTime(1500);
  failWrites(true);
  assert.throws(() => world.damage('miner', { ...hit, sequence: 2 }), /transaction failed/);
  assert.deepEqual(world.snapshot(), hurt);
  failWrites(false);
  assert.equal(world.damage('miner', { ...hit, sequence: 2 }), false);
  setTime(1501);
  assert.equal(world.damage('miner', { ...hit, sequence: 2 }), false);
  assert.equal(world.damage('miner', { ...hit, sequence: 3 }), true);
});

test('reviving within a lethal monster hit window preserves the original immunity deadline', () => {
  const { world, enter, setTime } = fixture();
  enter();
  enter('friend', deathPoint);
  const hit = { kind: 'monster', amount: 16 } as const;
  assert.equal(world.damage('miner', { kind: 'abyss', sequence: 1, amount: 90 }), true);
  assert.equal(world.damage('miner', { ...hit, sequence: 2 }), true);
  assert.equal(world.status('miner').down?.deadline, 10_000);
  setTime(100);
  assert.equal(world.revive('friend', 'miner', 2), true);
  assert.equal(world.status('miner').health, 50);
  assert.equal(world.damage('miner', { ...hit, sequence: 3 }), false);
  setTime(500);
  assert.equal(world.damage('miner', { ...hit, sequence: 4 }), true);
  assert.equal(world.status('miner').health, 34);
});

test('reconnect restores the saved monster deadline and an ordinary surface exit clears it', () => {
  const f = fixture();
  const { world, options, foot, enter, setTime, modes } = f;
  enter();
  const hit = { kind: 'monster', amount: 16 } as const;
  assert.equal(world.damage('miner', { ...hit, sequence: 1 }), true);
  const loaded = createUndergroundSurvival({ ...options, initial: f.saved() });
  const spawn = loaded.reconnect('miner')!;
  foot('miner', fire);
  assert.equal(loaded.confirmSpawn('miner', spawn.ticket), true);
  setTime(499);
  assert.equal(loaded.damage('miner', { ...hit, sequence: 2 }), false);
  modes.set('miner', 'peace');
  foot('miner', plaza);
  assert.equal(loaded.syncDepthMode('miner'), true);
  modes.set('miner', 'survival');
  foot('miner', fire);
  assert.equal(loaded.syncDepthMode('miner'), true);
  assert.equal(loaded.damage('miner', { ...hit, sequence: 3 }), true);
});

test('only registered nearby fires heal a stationary accepted foot at the supplied rate', () => {
  const { world, enter, foot, failWrites } = fixture();
  enter();
  world.damage('miner', { sequence: 1, kind: 'monster', amount: 30 });
  for (const [point, fireId, standingStill] of [
    [fire, 'unregistered', true], [fire, 'mine-fire', false],
    [deathPoint, 'mine-fire', true], [deep, 'city-cold-fire', true],
  ] as const) {
    foot('miner', point, { fireId, standingStill });
    assert.equal(world.healAtFire('miner', 2, 500), false);
  }
  foot('miner', fire, { fireId: 'mine-fire', standingStill: true });
  failWrites(true);
  assert.throws(() => world.healAtFire('miner', 2, 500), /transaction failed/);
  assert.equal(world.status('miner').health, 70);
  failWrites(false);
  assert.equal(world.healAtFire('miner', 2, 500), true);
  assert.equal(world.healAtFire('miner', 2, 500), false);
  assert.equal(world.status('miner').health, 77.5);
  assert.equal(world.healAtFire('miner', 3, 3_000), true);
  assert.equal(world.status('miner').health, 100);
});

test('a nearby teammate can revive only the current downing, strictly before ten seconds', () => {
  const { world, enter, foot, setTime, changes } = fixture();
  enter();
  enter('friend', fire);
  enter('stranger');
  assert.equal(world.damage('miner', { sequence: 1, kind: 'abyss', amount: 100 }), true);
  assert.equal(world.status('miner').down?.deadline, 10_000);
  assert.equal(world.revive('friend', 'miner', 1), false);
  assert.equal(world.revive('stranger', 'miner', 1), false);
  foot('friend', deathPoint);
  setTime(9_999);
  assert.equal(world.revive('friend', 'miner', 999), false);
  assert.equal(world.revive('friend', 'miner', 1), true);
  assert.equal(world.revive('friend', 'miner', 1), false);
  assert.equal(world.wakeIfExpired('miner', 1), false);
  assert.equal(world.status('miner').health, 50);
  assert.deepEqual(changes, []);
  world.damage('miner', { sequence: 2, kind: 'monster', amount: 50 });
  setTime(19_999);
  assert.equal(world.revive('friend', 'miner', 2), false);
  assert.equal(world.wakeIfExpired('miner', 2), true);
  assert.deepEqual(world.status('miner').spawn?.point, plaza);
});

test('timed-out death wakes at a bound bed and atomically removes only half of current trip ore', () => {
  const f = fixture();
  const { world, enter, foot, beds, modes, carriedThisTrip, changes, setTime, failWrites } = f;
  enter();
  enter('friend');
  beds.set('miner', bed);
  carriedThisTrip.set('miner', [{ id: 'new-a', count: 4 }, { id: 'new-b', count: 2 }]);
  world.damage('miner', { sequence: 1, kind: 'abyss', amount: 100 });
  assert.equal(world.wakeIfExpired('miner', 1), false);
  setTime(10_000);
  failWrites(true);
  assert.throws(() => world.wakeIfExpired('miner', 1), /transaction failed/);
  assert.equal(world.status('miner').down?.sequence, 1);
  assert.equal(world.snapshot().drops.length, 0);
  assert.equal(carriedThisTrip.get('miner')?.length, 2);
  failWrites(false);
  assert.equal(world.wakeIfExpired('miner', 1), true);
  assert.equal(world.wakeIfExpired('miner', 1), false);
  const spawn = world.status('miner').spawn!;
  assert.deepEqual(spawn.point, bed);
  const [drop] = world.snapshot().drops;
  assert.deepEqual(drop.point, deathPoint);
  assert.deepEqual(drop.ore, [{ id: 'new-a', count: 2 }, { id: 'new-b', count: 1 }]);
  assert.deepEqual(changes, [{ kind: 'finish-trip', playerId: 'miner', remove: drop.ore }]);
  assert.equal(world.pickUp('friend', drop.id), false);
  assert.equal(world.confirmSpawn('miner', spawn.ticket), false);
  foot('miner', bed);
  modes.set('miner', 'peace');
  assert.equal(world.confirmSpawn('miner', spawn.ticket + 1), false);
  assert.equal(world.confirmSpawn('miner', spawn.ticket), true);
  enter('miner', fire);
  assert.equal(world.pickUp('miner', drop.id), false);
  foot('miner', deathPoint);
  failWrites(true);
  assert.throws(() => world.pickUp('miner', drop.id), /transaction failed/);
  assert.equal(world.snapshot().drops.length, 1);
  failWrites(false);
  assert.equal(world.pickUp('miner', drop.id), true);
  assert.equal(world.pickUp('miner', drop.id), false);
  assert.deepEqual(changes[1], { kind: 'recover-drop', playerId: 'miner', credit: drop.ore });
  assert.equal(carriedThisTrip.has('miner'), false);
});

test('disconnect and reload return to the registered fire of the current layer without settling death', () => {
  const f = fixture();
  const { world, options, foot, enter, setTime, changes, carriedThisTrip } = f;
  enter('miner', deep);
  carriedThisTrip.set('miner', [{ id: 'new', count: 4 }]);
  world.damage('miner', { sequence: 1, kind: 'abyss', amount: 100 });
  assert.equal(world.disconnect('miner'), true);
  assert.equal(world.disconnect('miner'), false);
  setTime(12_000);
  assert.equal(world.wakeIfExpired('miner', 1), false);
  const loaded = createUndergroundSurvival({ ...options, initial: f.saved() });
  const spawn = loaded.reconnect('miner')!;
  assert.equal(spawn.kind, 'reconnect-fire');
  assert.deepEqual(spawn.point, deep);
  assert.deepEqual(loaded.reconnect('miner'), spawn);
  assert.equal(loaded.status('miner').health, 20);
  assert.deepEqual(loaded.snapshot().drops, []);
  assert.deepEqual(changes, []);
  assert.deepEqual(carriedThisTrip.get('miner'), [{ id: 'new', count: 4 }]);
  foot('miner', deep);
  assert.equal(loaded.confirmSpawn('miner', spawn.ticket), true);
  assert.equal(loaded.confirmSpawn('miner', spawn.ticket), false);
  const restartedAgain = createUndergroundSurvival({ ...options, initial: f.saved() });
  assert.equal(restartedAgain.reconnect('miner')?.ticket, spawn.ticket + 1);
});

test('odd trip quantities follow the inventory allocation only when it chooses an actual half', () => {
  let chosen: Ore = [{ id: 'prior-trip', count: 2 }];
  const { world, enter, carriedThisTrip, setTime, changes } = fixture({ chooseHalf: () => chosen });
  enter();
  carriedThisTrip.set('miner', [{ id: 'new', count: 5 }]);
  world.damage('miner', { sequence: 1, kind: 'abyss', amount: 100 });
  setTime(10_000);
  assert.throws(() => world.wakeIfExpired('miner', 1), /half of the eligible/);
  chosen = [{ id: 'new', count: 4 }];
  assert.throws(() => world.wakeIfExpired('miner', 1), /half of the eligible/);
  assert.deepEqual(world.snapshot().drops, []);
  assert.deepEqual(changes, []);
  chosen = [{ id: 'new', count: 3 }];
  assert.equal(world.wakeIfExpired('miner', 1), true);
  assert.deepEqual(world.snapshot().drops[0].ore, chosen);
});

test('death validates half of each current-trip ore stack with the inventory rounding', () => {
  let chosen: Ore = [{ id: 'stardust', count: 3 }];
  const { world, enter, carriedThisTrip, setTime, changes } = fixture({ chooseHalf: () => chosen });
  enter();
  carriedThisTrip.set('miner', [{ id: 'stardust', count: 3 }, { id: 'ordinary', count: 3 }, { id: 'crystal', count: 1 }]);
  world.damage('miner', { sequence: 1, kind: 'abyss', amount: 100 });
  setTime(10_000);
  assert.throws(() => world.wakeIfExpired('miner', 1), /half of the eligible trip ore per stack/);
  chosen = [{ id: 'stardust', count: 1 }, { id: 'ordinary', count: 1 }, { id: 'prior-trip', count: 1 }];
  assert.throws(() => world.wakeIfExpired('miner', 1), /half of the eligible trip ore per stack/);
  assert.deepEqual(world.snapshot().drops, []);
  assert.deepEqual(changes, []);

  chosen = [{ id: 'stardust', count: 1 }, { id: 'ordinary', count: 1 }];
  assert.equal(world.wakeIfExpired('miner', 1), true);
  assert.deepEqual(world.snapshot().drops[0].ore, chosen);
  assert.deepEqual(changes, [{ kind: 'finish-trip', playerId: 'miner', remove: chosen }]);
});

test('a later death creates a distinct owner bag and both survive a fresh authority', () => {
  const f = fixture();
  const { world, enter, modes, foot, carriedThisTrip, setTime, options, changes } = f;
  enter();
  carriedThisTrip.set('miner', [{ id: 'first-trip', count: 4 }]);
  world.damage('miner', { sequence: 1, kind: 'abyss', amount: 100 });
  setTime(10_000);
  assert.equal(world.wakeIfExpired('miner', 1), true);
  foot('miner', plaza);
  modes.set('miner', 'peace');
  assert.equal(world.confirmSpawn('miner', world.status('miner').spawn!.ticket), true);
  enter('miner', deep);
  carriedThisTrip.set('miner', [{ id: 'second-trip', count: 6 }]);
  world.damage('miner', { sequence: 2, kind: 'abyss', amount: 100 });
  setTime(20_000);
  assert.equal(world.wakeIfExpired('miner', 2), true);
  const bags = world.snapshot().drops;
  assert.equal(bags.length, 2);
  assert.notEqual(bags[0].id, bags[1].id);
  assert.deepEqual(bags.map(bag => [bag.point, bag.ore]), [
    [deathPoint, [{ id: 'first-trip', count: 2 }]], [deep, [{ id: 'second-trip', count: 3 }]],
  ]);
  const loaded = createUndergroundSurvival({ ...options, initial: f.saved() });
  assert.deepEqual(loaded.reconnect('miner'), world.status('miner').spawn);
  assert.deepEqual(loaded.snapshot().drops, bags);
  assert.equal(changes.length, 2);
});
