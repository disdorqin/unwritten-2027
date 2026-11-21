import assert from 'node:assert/strict';
import { test } from 'node:test';
import { townOutdoorWeatherAt } from '../src/presence/town-outdoor-weather';
import { createTownG09SceneAdapter } from '../tools/voxel-tavern/town-blockout/town-g09-scene-adapter';

const dawn = Date.UTC(2026, 0, 1);
const minute = 60_000;

test('G-09 mount adapter requires a genuine server snapshot and one dawn origin; it never invents weather offline', () => {
  let state: ReturnType<typeof townOutdoorWeatherAt> | undefined;
  let anchor: number | undefined;
  let now = dawn + 25 * minute + .714;
  const calls: string[] = [];
  const snapshots: Array<{ cover: number; spillDepth: number }> = [];
  const host = {
    weather: () => state,
    dawnEpoch: () => anchor,
    serverNow: () => now,
    exposure: () => .4,
    particles: {
      setOutdoorWind(e: number, n: number, strength: number, exposure: number) {
        calls.push(['wind', e, n, strength, exposure].join(':'));
      },
      setIntensity(value: number) { calls.push('particle:' + value); },
    },
    snowField: {
      setIntensity(value: number) { calls.push('terrain:' + value); },
      setWeather(weather: { targetCover: number }) { calls.push('weather:' + weather.targetCover); },
      restoreWeatherSnapshot(snapshot: { cover: number; spillDepth: number }) {
        snapshots.push(snapshot);
        return true;
      },
    },
  };
  const scene = createTownG09SceneAdapter(host);
  assert.equal(scene.sample(), undefined);
  state = townOutdoorWeatherAt(Math.floor(now), dawn);
  assert.equal(scene.sample(), undefined, 'no trusted dawn anchor -> no local weather');
  anchor = dawn;
  assert.equal(scene.sample()?.tier, 'light');
  assert.equal(snapshots.length, 1);
  assert.ok(calls.some(entry => entry.startsWith('weather:0.18')));
  now += 200.3;
  assert.equal(scene.sample()?.tier, 'light');
  assert.equal(snapshots.length, 1, 'frame updates do not rebuild whole terrain');
  now += 14_000.8;
  assert.equal(scene.sample()?.tier, 'light');
  assert.equal(snapshots.length, 2, 'resuming a throttled tab reconciles the snow layer');
  assert.equal(calls.filter(entry => entry.startsWith('wind:')).length, 3);
});

test('G-09 mount adapter carries changing whiteout visuals, northward wind and full cross-client snow refresh', () => {
  let now = dawn + 35 * minute + .5;
  let state = townOutdoorWeatherAt(Math.floor(now), dawn);
  let currentExposure = .4;
  const recorded: { cover: number; spillDepth: number }[] = [];
  const directions: Array<[number, number, number, number]> = [];
  const scene = createTownG09SceneAdapter({
    weather: () => state,
    dawnEpoch: () => dawn,
    serverNow: () => now,
    exposure: () => currentExposure,
    particles: {
      setOutdoorWind: (east, north, strength, exposure) => directions.push([east, north, strength, exposure ?? 1]),
      setIntensity() {},
    },
    snowField: {
      setWeather() {},
      setIntensity() {},
      restoreWeatherSnapshot(snapshot) { recorded.push(snapshot); return true; },
    },
  });
  assert.equal(scene.sample()?.tier, 'medium');
  assert.equal(recorded[0]?.cover, .64);
  assert.equal(directions[0]?.[2], .5);
  now = dawn + 45 * minute + .6;
  state = townOutdoorWeatherAt(Math.floor(now), dawn);
  const whiteout = scene.sample();
  assert.equal(whiteout?.tier, 'heavy');
  assert.equal(whiteout?.fogFar, 30, 'plaza shelter is 30m in whiteout');
  assert.equal(recorded.at(-1)?.cover, 1);
  assert.ok(Math.abs(recorded.at(-1)!.spillDepth - .45) < 1e-6);
  currentExposure = 1;
  assert.equal(scene.sample()?.fogFar, 12, 'open snowfield is 12m without adding geometry');
  assert.equal(recorded.length, 2, 'moving between areas only tweaks fog/uniform, no full terrain rebuild');
  now = dawn + 51 * minute + .7;
  state = townOutdoorWeatherAt(Math.floor(now), dawn);
  assert.equal(scene.sample()?.tier, 'medium');
  assert.ok(recorded.at(-1)!.spillDepth > 0 && recorded.at(-1)!.spillDepth < .45);
  assert.equal(directions.at(-1)?.[3], 1);
});

test('G-09 mount adapter disconnect and reconnect with the same phase still refreshes the shared snow depth', () => {
  let state: ReturnType<typeof townOutdoorWeatherAt> | undefined;
  let now = dawn + 45 * minute;
  const cached: number[] = [];
  const scene = createTownG09SceneAdapter({
    weather: () => state,
    dawnEpoch: () => state ? dawn : undefined,
    serverNow: () => now,
    exposure: () => 1,
    particles: { setOutdoorWind() {}, setIntensity() {} },
    snowField: { setWeather() {}, setIntensity() {},
      restoreWeatherSnapshot(snapshot) { cached.push(snapshot.cover); return true; } },
  });
  state = townOutdoorWeatherAt(now, dawn);
  scene.sample();
  assert.equal(cached.length, 1);
  state = undefined;
  assert.equal(scene.sample(), undefined);
  state = townOutdoorWeatherAt(now, dawn);
  scene.sample();
  assert.deepEqual(cached, [1, 1]);
});
