import assert from 'node:assert/strict';
import { test } from 'node:test';
import { townOutdoorWeatherAt } from '../src/presence/town-outdoor-weather.ts';
import {
  createTownCableWindClock, townCableWindCycleMs, townCableWindDawnEpoch,
} from '../src/shared/town-cable-wind.ts';

const minute = 60_000;
const epoch = townCableWindDawnEpoch;
const weatherAt = (at: number) => townOutdoorWeatherAt(at, epoch);

test('G-09 cable weather clock has the approved 60/30/10 cycle, no phase teleport, and zero work per frame', () => {
  let calls = 0;
  const clock = createTownCableWindClock(at => { calls++; return weatherAt(at); });
  const afterSetup = calls;
  assert.equal(clock.cycleDistanceMs, 81 * minute);
  assert.ok(afterSetup > 0 && afterSetup < 20);
  assert.equal(clock.scaledNow(epoch + 30 * minute), epoch + 30 * minute);
  assert.equal(clock.scaledNow(epoch + 40 * minute), epoch + 37 * minute);
  assert.equal(clock.scaledNow(epoch + 45 * minute), epoch + 37 * minute);
  assert.equal(clock.scaledNow(epoch + 50 * minute), epoch + 37 * minute);
  assert.equal(clock.scaledNow(epoch + 60 * minute), epoch + 44 * minute);
  assert.equal(clock.scaledNow(epoch + townCableWindCycleMs), epoch + 81 * minute);
  assert.equal(clock.scaledNow(epoch + townCableWindCycleMs + 45 * minute), epoch + (81 + 37) * minute);
  for (let now = epoch; now < epoch + townCableWindCycleMs * 8; now += 1_000) {
    assert.ok(clock.scaledNow(now + 1000) >= clock.scaledNow(now));
  }
  assert.equal(calls, afterSetup, 'per-frame geometry clock never re-queries the schedule');
});

test('G-09 whiteout halts cabins and boarding; an existing rider stays aboard until the same shared clock arrives', () => {
  const first = createTownCableWindClock(weatherAt);
  const second = createTownCableWindClock(weatherAt);
  const delayedArrival = first.scaledNow(epoch + 39 * minute) + 4 * minute;
  const stoppedAt = first.scaledNow(epoch + 40 * minute);
  assert.equal(first.statusAt(epoch + 30 * minute).rate, .7);
  assert.equal(first.statusAt(epoch + 45 * minute).rate, 0);
  assert.equal(first.statusAt(epoch + 45 * minute).canBoard, false);
  assert.match(first.statusAt(epoch + 45 * minute).label, /缆车暂歇/);
  assert.equal(first.scaledNow(epoch + 49 * minute), stoppedAt);
  assert.equal(first.arrived(epoch + 45 * minute, delayedArrival), false);
  assert.equal(first.arrived(epoch + 54 * minute, delayedArrival), false);
  assert.equal(first.arrived(epoch + 55 * minute, delayedArrival), true);
  assert.equal(first.scaledNow(epoch + 55 * minute), second.scaledNow(epoch + 55 * minute));
  assert.equal(first.statusAt(epoch + 50 * minute).canBoard, true);
});

test('G-09 weather status has clear-wind-whiteout player prompts without showing server internals', () => {
  const clock = createTownCableWindClock(weatherAt);
  assert.deepEqual([0, 31, 45, 51, 75, 96].map(m => clock.statusAt(epoch + m * minute).weather), [
    'clear-snow', 'wind', 'whiteout', 'wind', 'clear-snow', 'wind',
  ]);
  assert.deepEqual([0, 31, 45].map(m => clock.statusAt(epoch + m * minute).canBoard), [true, true, false]);
  assert.match(clock.statusAt(epoch).label, /正常/);
  assert.match(clock.statusAt(epoch + 31 * minute).label, /风大减速/);
  assert.ok(clock.statusAt(epoch + 45 * minute).nextChangeAt > epoch + 45 * minute);
  assert.equal(clock.arrived(epoch + 45 * minute, Number.NaN), false);
  assert.equal(clock.arrived(-1, epoch), false);
});

test('G-09 rejects invalid or divergent phase tables rather than secretly resynchronizing a car', () => {
  const clock = createTownCableWindClock(weatherAt);
  assert.equal(clock.scaledNow(Number.NaN), epoch);
  assert.throws(() => clock.statusAt(Infinity), RangeError);
  assert.throws(() => createTownCableWindClock(weatherAt, -1), RangeError);
  assert.throws(() => createTownCableWindClock(() => ({
    weather: 'wind', startedAt: epoch, nextChangeAt: epoch,
  })), RangeError);
  assert.throws(() => createTownCableWindClock(at => ({
    ...weatherAt(at), weather: at >= epoch + townCableWindCycleMs ? 'wind' : 'clear-snow',
  })), RangeError);
});
