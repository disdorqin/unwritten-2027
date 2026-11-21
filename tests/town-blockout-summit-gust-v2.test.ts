import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TownOutdoorWeatherState } from '../src/shared/town-outdoor-weather';
import {
  summitGustAmplitude, summitGustFactorAt, summitJumpAssist,
} from '../tools/voxel-tavern/town-blockout/town-summit-gust';

const state = (weather: TownOutdoorWeatherState['weather'], windStrength = 0.5,
  windEast = 1, windNorth = 0): TownOutdoorWeatherState =>
  ({ weather, startedAt: 0, nextChangeAt: 600_000, windEast, windNorth, windStrength });

test('gust factor is an absolute-clock sine lobe per weather period', () => {
  const wind = state('wind');
  assert.equal(summitGustFactorAt(wind, 0), 0);
  const peak = summitGustFactorAt(wind, 27_500);
  assert.ok(Math.abs(peak - 0.8) < 1e-9, `mid-period peak = kind amplitude at strength .5, got ${peak}`);
  assert.ok(summitGustFactorAt(state('whiteout', 1), 20_000) > 0.99, 'full-strength whiteout peaks at the cap');
  assert.equal(summitGustFactorAt(wind, 55_000), summitGustFactorAt(wind, 0), 'period wraps on the shared clock');
  assert.ok(summitGustFactorAt(state('whiteout'), 20_000) > summitGustFactorAt(state('clear-snow'), 35_000) * 0.5);
});

test('amplitude follows authority strength and the optional measured m/s', () => {
  assert.ok(summitGustAmplitude(state('wind', 1)) > summitGustAmplitude(state('wind', 0)));
  const nominal = summitGustAmplitude(state('wind', 0.5));
  assert.ok(Math.abs(summitGustAmplitude(state('wind', 0.5), 6) - nominal) < 1e-9, 'nominal 6 m/s is neutral');
  assert.ok(summitGustAmplitude(state('wind', 0.5), 12) > nominal, 'double wind reads stronger, capped');
  assert.equal(summitGustAmplitude(state('wind', 0.5), Number.NaN), nominal, 'dirty m/s falls back to normalized');
});

test('jump assist rewards a tailwind and floors a headwind, never negative', () => {
  const east = state('whiteout', 1, 1, 0);
  const atPeak = 20_000;
  const tail = summitJumpAssist(east, atPeak, 1, 0);
  const head = summitJumpAssist(east, atPeak, -1, 0);
  assert.equal(tail.tailwind, 1);
  assert.equal(head.tailwind, 0);
  assert.ok(tail.verticalBoost > head.verticalBoost && head.verticalBoost > 0);
  assert.ok(tail.verticalBoost <= 1.8 + 1e-9);
  assert.equal(summitJumpAssist(east, atPeak, 0, 0).verticalBoost, summitJumpAssist(east, atPeak, 1, 0).verticalBoost * (0.3 + 0.7 * 0.5) / 1, 'no heading = neutral alignment');
});
