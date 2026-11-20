import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundMineLift } from '../../src/presence/underground-mine-lift.js';

type Options = Parameters<typeof createUndergroundMineLift>[0];
type Foot = NonNullable<ReturnType<Options['readAcceptedFoot']>>;
type Stop = NonNullable<ReturnType<Options['readDockedStop']>>;

function at(playerId: string, stop: Stop): Foot {
  return { playerId, domainId: stop, east: 0, north: 0, height: stop === 'mine' ? -90 : -35 };
}

function setup() {
  let time = 10;
  let dock: Stop | undefined = 'crater-floor';
  let gate = 'locked';
  const feet = new Map([['a', at('a', 'crater-floor')], ['b', at('b', 'crater-floor')], ['c', at('c', 'crater-floor')]]);
  const requests: [string, 'down' | 'up'][] = [];
  const options: Options = {
    travelMs: 25_000,
    riderCapacity: 2,
    now: () => time,
    readDockedStop: () => dock,
    readAcceptedFoot: playerId => feet.get(playerId),
    isAtBoardingPlatform: (stop, foot) => foot.domainId === stop && foot.east === 0,
    requestCageRide(playerId, direction) {
      requests.push([playerId, direction]);
      return { kind: gate, direction };
    },
  };
  return {
    options, lift: createUndergroundMineLift(options), feet, requests,
    gate(value: string) { gate = value; },
    dock(value: Stop | undefined) { dock = value; },
    time(value: number) { time = value; },
  };
}

test('boarding requires a host-accepted identity and platform, a docked cabin, and the U-1 gate', () => {
  const h = setup();
  assert.equal(h.lift.board('a', 'down'), false);
  h.gate('first-fall-required');
  assert.equal(h.lift.board('a', 'down'), false);
  h.gate('denied');
  assert.equal(h.lift.board('a', 'down'), false);
  h.gate('ride-cage');
  assert.equal(h.lift.board('a', 'up'), false);
  h.feet.set('a', at('b', 'crater-floor'));
  assert.equal(h.lift.board('a', 'down'), false);
  h.feet.set('a', { ...at('a', 'crater-floor'), east: Infinity });
  assert.equal(h.lift.board('a', 'down'), false);
  h.feet.set('a', at('a', 'mine'));
  assert.equal(h.lift.board('a', 'down'), false);
  h.feet.set('a', at('a', 'crater-floor'));
  h.dock(undefined);
  assert.equal(h.lift.board('a', 'down'), false);
  h.dock('crater-floor');
  assert.equal(h.lift.board('a', 'down'), true);
  assert.deepEqual(h.requests, [['a', 'down'], ['a', 'down'], ['a', 'down'], ['a', 'down']]);
});

test('one cabin takes two riders both ways and never arrives from elapsed time or a stale trip id alone', () => {
  const h = setup();
  h.gate('ride-cage');
  assert.equal(h.lift.board('a', 'down'), true);
  assert.equal(h.lift.board('a', 'down'), true);
  assert.equal(h.lift.board('b', 'down'), true);
  assert.equal(h.lift.board('c', 'down'), false);
  assert.equal(h.lift.depart('c'), undefined);
  const down = h.lift.depart('a');
  assert.ok(down);
  assert.deepEqual(down, { id: 1, origin: 'crater-floor', destination: 'mine', direction: 'down', departedAt: 10, travelMs: 25_000, riders: ['a', 'b'] });
  assert.equal(h.lift.depart('b'), undefined);
  assert.equal(h.lift.leave('a'), false);
  assert.equal(h.lift.board('c', 'down'), false);

  h.dock('mine');
  h.time(25_009);
  assert.equal(h.lift.confirmArrival(down.id), false);
  h.time(25_010);
  h.dock(undefined);
  assert.equal(h.lift.confirmArrival(down.id), false);
  h.dock('mine');
  assert.equal(h.lift.confirmArrival(down.id), true);
  assert.deepEqual(h.lift.state(), { stop: 'mine', riders: [] });

  h.feet.set('a', at('a', 'mine'));
  h.feet.set('b', at('b', 'mine'));
  assert.equal(h.lift.board('a', 'up'), true);
  assert.equal(h.lift.board('b', 'up'), true);
  const up = h.lift.depart('b');
  assert.ok(up);
  assert.equal(up.destination, 'crater-floor');
  assert.deepEqual(up.riders, ['a', 'b']);
  h.time(50_010);
  h.dock('crater-floor');
  assert.equal(h.lift.confirmArrival(down.id), false);
  assert.equal(h.lift.confirmArrival(up.id), true);
  assert.deepEqual(h.lift.state(), { stop: 'crater-floor', riders: [] });
});

test('departure revalidates boarded players and releases stale seats', () => {
  const h = setup();
  h.gate('ride-cage');
  assert.equal(h.lift.board('a', 'down'), true);
  assert.equal(h.lift.board('b', 'down'), true);
  h.feet.delete('a');
  assert.equal(h.lift.depart('a'), undefined);
  assert.equal(h.lift.board('c', 'down'), true);
  assert.equal(h.lift.leave('c'), true);
  assert.deepEqual(h.lift.depart('b')?.riders, ['b']);
});

test('a fresh lift waits for the physical dock and can recover at the mine', () => {
  const h = setup();
  h.gate('ride-cage');
  h.dock(undefined);
  h.feet.set('a', at('a', 'mine'));
  const restored = createUndergroundMineLift(h.options);
  assert.deepEqual(restored.state(), { stop: undefined, riders: [] });
  assert.equal(restored.board('a', 'up'), false);
  assert.deepEqual(h.requests, []);

  h.dock('mine');
  assert.deepEqual(restored.state(), { stop: 'mine', riders: [] });
  assert.equal(restored.board('a', 'up'), true);
  h.dock('crater-floor');
  assert.equal(restored.depart('a'), undefined);
  assert.equal(restored.board('b', 'down'), false);
  h.dock('mine');
  const trip = restored.depart('a');
  assert.equal(trip?.origin, 'mine');
  assert.equal(trip?.destination, 'crater-floor');
});

test('a lone first-fall survivor can call the empty cage and then ride back from a confirmed dock', () => {
  const h = setup();
  h.feet.set('a', at('a', 'mine'));
  h.gate('first-fall-required');
  assert.equal(h.lift.callEmptyCage('a', 'mine'), undefined);
  h.gate('ride-cage');
  assert.equal(h.lift.callEmptyCage('b', 'mine'), undefined);
  assert.equal(h.lift.board('b', 'down'), true);
  assert.equal(h.lift.callEmptyCage('a', 'mine'), undefined);
  assert.equal(h.lift.leave('b'), true);
  const empty = h.lift.callEmptyCage('a', 'mine');
  assert.ok(empty);
  assert.deepEqual(empty.riders, []);
  assert.equal(empty.origin, 'crater-floor');
  assert.equal(empty.destination, 'mine');
  assert.equal(h.lift.board('a', 'up'), false);
  assert.equal(h.lift.callEmptyCage('a', 'mine'), undefined);

  h.dock('mine');
  h.time(25_009);
  assert.equal(h.lift.confirmArrival(empty.id), false);
  h.time(25_010);
  assert.equal(h.lift.confirmArrival(empty.id), true);
  assert.equal(h.lift.callEmptyCage('a', 'mine'), undefined);
  assert.equal(h.lift.board('a', 'up'), true);
  const returning = h.lift.depart('a');
  assert.ok(returning);
  assert.deepEqual(returning.riders, ['a']);
  assert.equal(returning.destination, 'crater-floor');
  h.dock('crater-floor');
  h.time(50_010);
  assert.equal(h.lift.confirmArrival(returning.id), true);
  assert.equal(h.lift.board('b', 'down'), true);
});

test('travel duration and capacity require explicit design-compatible inputs', () => {
  const { options } = setup();
  assert.doesNotThrow(() => createUndergroundMineLift({ ...options, travelMs: 20_000 }));
  assert.doesNotThrow(() => createUndergroundMineLift({ ...options, travelMs: 30_000 }));
  for (const travelMs of [19_999, 30_001, NaN]) {
    assert.throws(() => createUndergroundMineLift({ ...options, travelMs }), RangeError);
  }
  for (const riderCapacity of [0, 1.5, Infinity]) {
    assert.throws(() => createUndergroundMineLift({ ...options, riderCapacity }), RangeError);
  }
});
