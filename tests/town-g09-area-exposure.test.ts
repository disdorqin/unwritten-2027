import assert from 'node:assert/strict';
import { test } from 'node:test';
import { townOutdoorWeatherAt } from '../src/presence/town-outdoor-weather';
import {
  townWeatherAreaExposure, townWeatherExposureFor, townAreaWindWalkingScale,
} from '../src/shared/town-weather-exposure';
import { townWeatherAreaAt } from '../tools/voxel-tavern/town-blockout/town-weather-exposure';

test('G-09 each town building and outdoor zone applies one approved exposure table', () => {
  const cases = [
    [223, 180, 'plaza', .4],
    [226, 223, 'clocktower', .5],
    [159, 230, 'tavern', .4],
    [264, 210, 'post-office', .4],
    [190, 227, 'town-hall', .4],
    [337, 277, 'memorial', .4],
    [91, 271, 'residential', .5],
    [344, 66, 'mirror-lake', .8],
    [484, 65, 'ice-palace', .7],
    [420, 320, 'open-ground', 1],
  ] as const;
  for (const [east, north, category, expected] of cases) {
    const detected = townWeatherAreaAt(east, north);
    assert.equal(detected, category, category + ' point');
    assert.equal(townWeatherExposureFor(detected), expected);
  }
  assert.equal(townWeatherExposureFor(townWeatherAreaAt(226, 223, { clocktowerLookout: true })), 1);
  assert.equal(townWeatherExposureFor(townWeatherAreaAt(600, 300, { area: 'meteor-rim' })), .9);
  assert.equal(townWeatherExposureFor(townWeatherAreaAt(420, 320, { inPineCamp: true })), .6);
  assert.equal(townWeatherExposureFor(townWeatherAreaAt(420, 320, { residentialStreet: true })), .5);
});

test('G-09 exposure table is shared and wind/headwind blending preserves each area magnitude', () => {
  const now = Date.UTC(2026, 0, 1) + 35 * 60_000;
  const wind = { ...townOutdoorWeatherAt(now, Date.UTC(2026, 0, 1)), windEast: 1, windNorth: 0 };
  assert.equal(Object.isFrozen(townWeatherAreaExposure), true);
  assert.equal(townWeatherAreaExposure.plaza, .4);
  assert.equal(townAreaWindWalkingScale(wind, 'plaza', -1, 0), .94);
  assert.equal(townAreaWindWalkingScale(wind, 'mirror-lake', -1, 0), .88);
  assert.equal(townAreaWindWalkingScale(wind, 'open-ground', -1, 0), .85);
  assert.equal(townAreaWindWalkingScale(wind, 'plaza', 1, 0), 1.02);
  assert.equal(townAreaWindWalkingScale(wind, 'plaza', 0, 1), 1);
  assert.equal(townAreaWindWalkingScale(wind, 'plaza', 0, 0), 1);
});
