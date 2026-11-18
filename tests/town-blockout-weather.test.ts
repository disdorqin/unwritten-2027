import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTownSnowCover } from '../tools/voxel-tavern/town-blockout/town-snow-cover.ts';
import { createTownWeatherCover, townSnowWeatherAt, townSnowWeatherForFrame, townWeatherEpoch } from '../tools/voxel-tavern/town-blockout/town-weather.ts';

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
  const samples = tiers.map(tier => createTownWeatherCover().update(20, townSnowWeatherAt(0, tier)));
  assert.ok(samples[0] < samples[1] && samples[1] < samples[2]);
  const cover = createTownWeatherCover();
  assert.equal(cover.update(180, townSnowWeatherAt(0, 'heavy')), 1);
  const melting = cover.update(1, townSnowWeatherAt(0, 'light'));
  assert.ok(melting < 1 && melting > .98);
  assert.equal(cover.update(200, townSnowWeatherAt(0, 'light')), .18);
});

test('heavy visual snow leaves the normal day empty and preserves formal night gameplay rates', () => {
  const ground = { gridWidth: 101, gridDepth: 101, surfaces: new Uint8Array(101 * 101), heightAt: () => 12 };
  const physical = createTownSnowCover(ground);
  const visual = createTownWeatherCover();
  const heavy = townSnowWeatherAt(0, 'heavy');
  assert.equal(visual.update(180, heavy), 1);
  physical.update(180, false);
  assert.equal(physical.amount(), 0);
  assert.equal(physical.depthAt(20, 20, 12), 0);
  assert.equal(physical.movementScale(20, 20, 12), 1);
  assert.equal(physical.depth().servings, 3);
  assert.equal(physical.canGather(20, 20, 12), true);

  physical.setIntensity(4);
  physical.update(55, true);
  assert.equal(physical.depthAt(20, 20, 12), 1);
  assert.equal(physical.movementScale(20, 20, 12), .62);
  assert.equal(physical.depth().servings, 5);
  visual.update(200, townSnowWeatherAt(0, 'light'));
  assert.equal(physical.amount(), 1);
  physical.update(0, false);
  assert.equal(physical.depthAt(20, 20, 12), 0);
  assert.equal(physical.movementScale(20, 20, 12), 1);
});

test('formal night visual intensity follows the existing continuous ceremony curve', () => {
  for (const snowIntensity of [1, 1.75, 2.45, 3.2, 4]) {
    const result = townSnowWeatherForFrame({ now: townWeatherEpoch, phase: 'countdown', snowIntensity });
    assert.equal(result.intensity, snowIntensity);
  }
});
