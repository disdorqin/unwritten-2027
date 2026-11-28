import assert from 'node:assert/strict';
import test from 'node:test';
import { townOutdoorWeatherFieldAt } from '../tools/voxel-tavern/town-blockout/town-weather-field-outdoor.ts';
import type { TownOutdoorWeatherState } from '../src/shared/town-outdoor-weather.ts';

const state = (weather: TownOutdoorWeatherState['weather']): TownOutdoorWeatherState => ({
  weather,
  startedAt: Date.UTC(2026, 0, 1),
  nextChangeAt: Date.UTC(2026, 0, 1) + 100 * 60_000,
  windEast: 0,
  windNorth: -1,
  windStrength: weather === 'whiteout' ? 1 : weather === 'wind' ? .5 : 0,
});

const town = { east: 206, north: 182, elevation: 30 };
const alpine = { east: 300, north: 560, elevation: 420 };
const summit = { east: 350, north: 676, elevation: 800 };

test('adapter keeps the Presence weather as the only authority', () => {
  for (const weather of ['clear-snow', 'wind', 'whiteout'] as const) {
    const before = JSON.stringify(state(weather));
    const value = townOutdoorWeatherFieldAt(state(weather), town);
    assert.equal(JSON.stringify(state(weather)), before, 'state was mutated');
    assert.ok(Number.isFinite(value.intensity));
    assert.ok(value.intensity > 0);
  }
});

test('town stays milder than the exposed mountain in every authoritative weather', () => {
  for (const weather of ['clear-snow', 'wind', 'whiteout'] as const) {
    const local = townOutdoorWeatherFieldAt(state(weather), town);
    const high = townOutdoorWeatherFieldAt(state(weather), alpine);
    assert.ok(local.severity < high.severity, `${weather} severity`);
    assert.ok(local.intensity < high.intensity, `${weather} snow`);
    assert.ok(local.targetCover < high.targetCover, `${weather} cover`);
  }
});

test('whiteout keeps the approved 12 m mountain visibility and a wide town range', () => {
  const whiteout = state('whiteout');
  const local = townOutdoorWeatherFieldAt(whiteout, town);
  const high = townOutdoorWeatherFieldAt(whiteout, summit);
  assert.ok(local.visibilityMeters > 55, `town ${local.visibilityMeters}`);
  assert.ok(high.visibilityMeters <= 12, `summit ${high.visibilityMeters}`);
  assert.equal(high.skyColor, '#d8e2e9');
  assert.ok(high.fogFar > high.visibilityMeters);
});

test('wind follows the authoritative vector instead of a second random source', () => {
  const east = { ...state('wind'), windEast: 1, windNorth: 0, windStrength: .5 };
  const value = townOutdoorWeatherFieldAt(east, alpine);
  assert.ok(value.windEast > .9, `east ${value.windEast}`);
  assert.ok(Math.abs(value.windNorth) < .3, `north ${value.windNorth}`);
  assert.ok(Math.abs(Math.hypot(value.windEast, value.windNorth) - 1) < 1e-9);
});

test('night fog limits and fire pools still feed the local field', () => {
  const clear = state('clear-snow');
  const limited = townOutdoorWeatherFieldAt(clear, town, { nightFogFar: 500 });
  const open = townOutdoorWeatherFieldAt(clear, town);
  assert.ok(limited.fogFar < open.fogFar);
  const firelit = townOutdoorWeatherFieldAt(state('whiteout'), town, { litFireDistance: 0 });
  assert.ok(firelit.fogNear > 0);
});
