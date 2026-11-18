import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTownSnowCover } from '../tools/voxel-tavern/town-blockout/town-snow-cover.ts';
import { townSnowWeatherAt, townWeatherEpoch } from '../tools/voxel-tavern/town-blockout/town-weather.ts';

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
  const makeCover = () => createTownSnowCover({
    gridWidth: 1, gridDepth: 1, surfaces: new Uint8Array(1), heightAt: () => 12,
  });
  const tiers = ['light', 'medium', 'heavy'] as const;
  const samples = tiers.map(tier => {
    const cover = makeCover();
    cover.updateWeather(20, townSnowWeatherAt(0, tier));
    return cover.amount();
  });
  assert.ok(samples[0] < samples[1] && samples[1] < samples[2]);
  const cover = makeCover();
  cover.updateWeather(180, townSnowWeatherAt(0, 'heavy'));
  assert.equal(cover.amount(), 1);
  cover.updateWeather(1, townSnowWeatherAt(0, 'light'));
  assert.ok(cover.amount() < 1 && cover.amount() > .98);
  cover.updateWeather(200, townSnowWeatherAt(0, 'light'));
  assert.equal(cover.amount(), .18);
});
