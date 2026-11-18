import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceremonyStateAt } from '../tools/voxel-tavern/town-blockout/town-ceremony.ts';
import { createFrostTracker } from '../tools/voxel-tavern/town-blockout/town-frost.ts';
import {
  advanceWeatherCover, townSnowWeatherAt, townSnowWeatherForFrame, townWeatherEpoch,
} from '../tools/voxel-tavern/town-blockout/town-weather.ts';

test('shared weather stays consistent, rotates several times and eases the visual change', () => {
  const step = 1_000;
  const start = townWeatherEpoch + 83 * 60_000;
  const events: number[] = [];
  let prior = townSnowWeatherAt(start);
  let softSamples = 0;
  for (let offset = step; offset <= 30 * 60_000; offset += step) {
    const now = start + offset;
    const next = townSnowWeatherAt(now);
    assert.deepEqual(next, townSnowWeatherAt(now));
    assert.ok(Math.abs(next.intensity - prior.intensity) < .24);
    assert.ok(Math.abs(next.fogNear - prior.fogNear) < 20);
    if (next.tier !== prior.tier) events.push(offset);
    if (next.progress > 0 && next.progress < 1) softSamples++;
    prior = next;
  }
  assert.ok(events.length >= 3);
  assert.ok(softSamples >= 20 * (events.length - 1));
  assert.equal(townSnowWeatherAt(start, 'heavy').intensity, 4);
  assert.equal(townSnowWeatherAt(start, 'heavy').progress, 0);
});

test('stronger weather piles up faster and a lighter tier recedes gradually', () => {
  const tiers = ['light', 'medium', 'heavy'] as const;
  const samples = tiers.map(tier => advanceWeatherCover(0, 20, townSnowWeatherAt(0, tier)));
  assert.ok(samples[0] < samples[1] && samples[1] < samples[2]);
  const heavy = advanceWeatherCover(0, 180, townSnowWeatherAt(0, 'heavy'));
  assert.equal(heavy, 1);
  const light = townSnowWeatherAt(0, 'light');
  const easing = advanceWeatherCover(heavy, 1, light);
  assert.ok(easing < 1 && easing > .98);
  assert.equal(advanceWeatherCover(easing, 200, light), .18);
});

test('the shared ordinary clock drives weather while the annual show keeps each exact intensity', () => {
  const ordinary = ceremonyStateAt(Date.UTC(2026, 10, 18, 12), 480);
  assert.deepEqual(townSnowWeatherForFrame(ordinary), townSnowWeatherAt(ordinary.now));
  const rehearsal = Date.UTC(2026, 11, 31, 11, 55);
  let previousNear = Infinity;
  for (let offset = 0; offset <= 4 * 60 * 60_000 + 5 * 60_000; offset += 15_000) {
    const state = ceremonyStateAt(rehearsal + offset, 480);
    const weather = townSnowWeatherForFrame(state);
    assert.equal(weather.intensity, state.snowIntensity);
    assert.ok(weather.fogNear <= previousNear);
    previousNear = weather.fogNear;
  }
  const midnight = Date.UTC(2026, 11, 31, 16);
  assert.equal(townSnowWeatherForFrame(ceremonyStateAt(midnight, 480)).intensity, 4);
  const easing = ceremonyStateAt(midnight + 5 * 60_000, 480);
  assert.equal(easing.snowIntensity, 3);
  assert.equal(townSnowWeatherForFrame(easing).intensity, 3);
});

test('the active frost tracker reads the same strength and accumulated depth as outdoor weather', () => {
  const hit = (tier: 'light' | 'medium' | 'heavy', exposed = true) => {
    const weather = townSnowWeatherAt(townWeatherEpoch, tier);
    const cover = advanceWeatherCover(0, 120, weather);
    const tracker = createFrostTracker();
    tracker.setExposure(weather.intensity, cover, exposed ? 'dark-snow' : 'none', false);
    tracker.update(30);
    return tracker.exposure();
  };
  assert.equal(hit('light'), 0);
  assert.ok(hit('medium') > 0);
  assert.ok(hit('heavy') > hit('medium'));
  assert.equal(hit('heavy', false), 0);
});
