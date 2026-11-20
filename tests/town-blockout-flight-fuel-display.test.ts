import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flightFuelCanFullPowerMs,
  flightFuelDisplayReading,
} from '../tools/voxel-tavern/town-blockout/flight-fuel-display';

test('the full, half and empty readings follow the C-14 fuel scale', () => {
  const full = flightFuelCanFullPowerMs;
  assert.equal(full, 600_000);
  assert.deepEqual(flightFuelDisplayReading({ remainingFullPowerMs: full, throttle: 'full' }),
    { ratio: 1, rate: 1, notice: '', time: '10:00' });
  assert.deepEqual(flightFuelDisplayReading({ remainingFullPowerMs: full / 2, throttle: 'cruise' }),
    { ratio: 0.5, rate: 0.5, notice: '', time: '05:00' });
  assert.deepEqual(flightFuelDisplayReading({ remainingFullPowerMs: 0, throttle: 'full' }),
    { ratio: 0, rate: 0, notice: '已耗尽', time: '00:00' });
});

test('the last ten percent gets a quiet status, and fractional fuel stays visible', () => {
  assert.equal(flightFuelDisplayReading({ remainingFullPowerMs: 60_001, throttle: 'off' }).notice, '');
  assert.deepEqual(flightFuelDisplayReading({ remainingFullPowerMs: 60_000, throttle: 'off' }),
    { ratio: 0.1, rate: 0, notice: '余量低', time: '01:00' });
  assert.equal(flightFuelDisplayReading({ remainingFullPowerMs: 0.5, throttle: 'cruise' }).time, '00:01');
});

test('a larger authoritative tank keeps its actual full-power time', () => {
  const tank = 1_200_000;
  const snapshot = { remainingFullPowerMs: 900_000, throttle: 'off' } as const;
  assert.deepEqual(flightFuelDisplayReading(snapshot, tank),
    { ratio: 0.75, rate: 0, notice: '', time: '15:00' });
  assert.equal(flightFuelDisplayReading(snapshot).time, '15:00');
  assert.throws(() => flightFuelDisplayReading(snapshot, 0), RangeError);
  assert.throws(() => flightFuelDisplayReading({ ...snapshot, remainingFullPowerMs: NaN }), RangeError);
});
