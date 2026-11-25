import assert from 'node:assert/strict';
import { test } from 'node:test';
import { townOutdoorWeatherAt } from '../src/presence/town-outdoor-weather';
import { townOutdoorWeatherCycleMs } from '../src/shared/town-outdoor-weather';
import { townG09SnowCoverAt, townG09SnowSnapshotAt } from '../tools/voxel-tavern/town-blockout/town-g09-snow-cover';
import { createTownSnowField } from '../tools/voxel-tavern/town-blockout/town-snow-field';
import { townSnowWeatherForOutdoorState } from '../tools/voxel-tavern/town-blockout/town-weather';

const dawn = Date.UTC(2026, 0, 1);
const minute = 60_000;
const at = (minutes: number) => dawn + minutes * minute;
const snowAt = (minuteNumber: number) => townG09SnowSnapshotAt(at(minuteNumber), dawn);

test('G-09 snow-cover history is an absolute clock, with full storm and gradual post-storm melt', () => {
  assert.equal(snowAt(0).cover, .64);
  assert.equal(snowAt(30).cover, .18);
  assert.equal(snowAt(31).cover, .64);
  assert.equal(snowAt(41).cover, 1);
  assert.ok(Math.abs(snowAt(41).spillDepth - .45) < 1e-6);
  assert.ok(Math.abs(snowAt(50).spillDepth - .45) < 1e-6);
  assert.ok(snowAt(51).spillDepth > 0 && snowAt(51).spillDepth < .45, 'spill does not vanish instantly after the storm');
  assert.equal(snowAt(53).spillDepth, 0);
  assert.equal(snowAt(61.5).cover, .18);
  assert.equal(snowAt(100).cover, .64);
  assert.deepEqual(snowAt(141), snowAt(41));
  assert.equal(townG09SnowCoverAt(at(41), dawn), 1);
  assert.equal(townG09SnowCoverAt(at(141), dawn), 1);
  assert.equal(townOutdoorWeatherCycleMs, 100 * minute);
});

test('G-09 late join and returning devices reconstruct the same cover even across many schedule cycles', () => {
  const samples = [0, 5_000, 5 * minute, 29.5 * minute, 32 * minute, 42 * minute,
    50 * minute, 51 * minute, 60 * minute, 75 * minute, 99 * minute];
  for (const delta of samples) {
    const first = townG09SnowSnapshotAt(dawn + delta, dawn);
    const late = townG09SnowSnapshotAt(dawn + 90 * townOutdoorWeatherCycleMs + delta, dawn);
    assert.ok(Math.abs(first.cover - late.cover) < 1e-9, 'same phase must have same cover');
    assert.ok(Math.abs(first.spillDepth - late.spillDepth) < 1e-9, 'same phase must have same spill');
    assert.ok(first.cover >= .18 && first.cover <= 1);
    assert.ok(first.spillDepth >= 0 && first.spillDepth <= .45);
  }
  assert.deepEqual(townG09SnowSnapshotAt(dawn - 1, dawn), { cover: .18, spillDepth: 0 });
  for (const value of [Number.NaN, -1, Infinity, 1.5]) {
    assert.throws(() => townG09SnowSnapshotAt(value, dawn), RangeError);
  }
});

test('G-09 wind-only and whiteout visual profiles share the signed server wind without new random weather', () => {
  const clear = townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(5), dawn));
  const wind = townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(35), dawn));
  const snow = townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(45), dawn));
  assert.deepEqual([clear.tier, wind.tier, snow.tier], ['light', 'medium', 'heavy']);
  assert.ok(clear.pilingRate < wind.pilingRate && wind.pilingRate < snow.pilingRate);
  assert.deepEqual([clear.targetCover, wind.targetCover, snow.targetCover], [.18, .64, 1]);
  assert.equal(snow.fogFar, 12);
  assert.equal(townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(45), dawn), .4).fogFar, 30);
  assert.equal(townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(45), dawn), .8).fogFar, 15);
  assert.equal(townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(45), dawn), 1, Infinity, 0).fogNear, 8);
  assert.equal(townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(45), dawn), 1, 10).fogFar, 10);
  assert.equal(clear.skyColor, undefined);
});

test('G-09 snowfield restores depth and residual spill without resetting a player’s excavations or trails', () => {
  const grid = { gridWidth: 3, gridDepth: 3,
    surfaces: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
    heightAt: () => 12,
  };
  const first = createTownSnowField(grid);
  const late = createTownSnowField(grid);
  const stormState = townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(45), dawn));
  for (const field of [first, late]) {
    field.setWeather(stormState);
    field.setIntensity(stormState.intensity);
    assert.equal(field.restoreWeatherSnapshot(snowAt(45)), true);
    field.update(.25, true);
  }
  assert.equal(first.amount(), 1);
  assert.equal(first.cellAmountAt(0, 0), 1);
  assert.ok(Math.abs(first.cellAmountAt(1, 1) - .45) < 1e-6);
  assert.equal(late.cellAmountAt(1, 1), first.cellAmountAt(1, 1));
  assert.equal(first.depth().servings, 5);
  first.digAt(0, 0, .2);
  first.addTrack(0, 0, 1, 0, .9);
  const dug = first.dugDepthAt(0, 0);
  const tracks = first.trackCount();
  const following = snowAt(51);
  first.setWeather(townSnowWeatherForOutdoorState(townOutdoorWeatherAt(at(51), dawn)));
  assert.equal(first.restoreWeatherSnapshot(following), true);
  assert.equal(first.dugDepthAt(0, 0), dug);
  assert.equal(first.trackCount(), tracks);
  assert.ok(Math.abs(first.cellAmountAt(1, 1) - following.spillDepth) < 1e-7);
  const prior = first.amount();
  assert.equal(first.restoreWeatherSnapshot({ cover: NaN, spillDepth: .2 }), false);
  assert.equal(first.restoreWeatherSnapshot({ cover: .4, spillDepth: .8 }), false);
  assert.equal(first.amount(), prior);
});
