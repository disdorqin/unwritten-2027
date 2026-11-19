import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNorthRidgeCableClock } from '../tools/voxel-tavern/town-blockout/north-ridge-cable-clock.ts';

test('front ridge main cable shares one schedule and stops for exactly ten seconds in both directions', t => {
  // Design reference spans only; surveyed route geometry has not been approved.
  const epoch = 100_000;
  const clock = createNorthRidgeCableClock(239, 277, epoch);
  const at = (offset: number) => clock.cabinsAt(epoch + offset);

  assert.equal(clock.oneWayMs, 113_200);
  assert.equal(clock.cycleMs, 226_400);
  assert.deepEqual(at(0), [
    { direction: 'up', distanceMetres: 0, station: 'base' },
    { direction: 'down', distanceMetres: 516, station: 'summit' },
  ]);
  assert.deepEqual(at(clock.oneWayMs), [...at(0)].reverse());
  assert.deepEqual(at(clock.cycleMs), at(0));
  assert.deepEqual(at(-1_000), at(clock.cycleMs - 1_000));
  assert.equal(at(1_000)[0].distanceMetres, 5);
  assert.equal(at(1_000)[1].distanceMetres, 511);

  for (const [idx, arrival] of [[0, 47_800], [1, 55_400]] as const) {
    assert.equal(at(arrival - 1)[idx].station, null);
    assert.equal(at(arrival)[idx].station, 'middle');
    assert.equal(at(arrival + 10_000)[idx].distanceMetres, 239);
    assert.equal(at(arrival + 10_001)[idx].station, null);
  }

  for (let offset = 0; offset < clock.cycleMs; offset += 100) {
    const [first, other] = at(offset);
    assert.notEqual(first.direction, other.direction);
    assert.ok(first.distanceMetres >= 0 && first.distanceMetres <= 516);
    assert.ok(other.distanceMetres >= 0 && other.distanceMetres <= 516);
    assert.deepEqual(at(offset + clock.cycleMs), [first, other]);
  }

  t.diagnostic(`reference spans: one-way ${clock.oneWayMs} ms, cycle ${clock.cycleMs} ms, first middle arrivals 47800/55400 ms`);
});

test('invalid spans and time inputs are rejected', () => {
  for (const lower of [0, -1, Infinity]) assert.throws(() => createNorthRidgeCableClock(lower, 277, 0), RangeError);
  assert.throws(() => createNorthRidgeCableClock(239, NaN, 0), RangeError);
  assert.throws(() => createNorthRidgeCableClock(239, 277, Infinity), RangeError);
  assert.throws(() => createNorthRidgeCableClock(239, 277, 0).cabinsAt(NaN), RangeError);
});
