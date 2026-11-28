import assert from 'node:assert/strict';
import test from 'node:test';
import { AmbientLight, Color, DirectionalLight, Fog, Scene } from 'three';
import { townDayMs, townDaylightMs } from '../src/shared/town-night-window.ts';
import {
  townNightWeatherAt, townNightWeatherDefaultDawnEpoch, townNightWeatherPhaseName,
} from '../src/shared/town-night-weather-cycle.ts';
import { createTownNightWeatherSky } from '../tools/voxel-tavern/town-blockout/town-night-weather-sky.ts';

const dawn = Date.UTC(2026, 0, 1);
const phaseAt = (phase: number) => dawn + phase * townDayMs;

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function colorDistance(a: number, b: number): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
}

test('same authoritative clock yields identical sky samples on every client', () => {
  for (const phase of [0, .03, .14, .3, .47, .53, .578, .6, .66, .78, .9, .96, .999]) {
    const now = phaseAt(phase);
    assert.deepEqual(townNightWeatherAt(now, dawn), townNightWeatherAt(now, dawn));
  }
});

test('ten minute cycle is continuous at every 250ms step, including the wrap', () => {
  const step = 250;
  let previous = townNightWeatherAt(dawn, dawn);
  for (let at = dawn + step; at <= dawn + townDayMs; at += step) {
    const sample = townNightWeatherAt(at, dawn);
    for (const key of ['skyColor', 'fogColor', 'cloudColor', 'ambientColor', 'sunColor'] as const) {
      assert.ok(colorDistance(previous[key], sample[key]) <= 3,
        `${key} jumped by ${colorDistance(previous[key], sample[key])} at ${(at - dawn) / townDayMs}`);
    }
    for (const key of [
      'ambientIntensity', 'sunIntensity', 'exposure', 'lampLevel', 'starLevel',
      'fogNearScale', 'fogFarScale',
    ] as const) {
      assert.ok(Math.abs(previous[key] - sample[key]) <= .02,
        `${key} jumped by ${Math.abs(previous[key] - sample[key])} at ${(at - dawn) / townDayMs}`);
    }
    assert.ok(Math.abs(previous.sunElevationDeg - sample.sunElevationDeg) <= 1,
      `elevation jumped at ${(at - dawn) / townDayMs}`);
    const dot = previous.sunDirection.reduce((sum, value, index) => sum + value * sample.sunDirection[index], 0);
    assert.ok(dot > .9999, `direction jumped at ${(at - dawn) / townDayMs} (dot ${dot})`);
    previous = sample;
  }
  const first = townNightWeatherAt(dawn, dawn);
  const wrapped = townNightWeatherAt(dawn + townDayMs, dawn);
  const { now: _firstNow, dayIndex: _firstDay, ...firstSky } = first;
  const { now: _wrappedNow, dayIndex: _wrappedDay, ...wrappedSky } = wrapped;
  assert.deepEqual(firstSky, wrappedSky);
});

test('night side follows the authoritative six minute daylight window', () => {
  for (let at = dawn; at < dawn + 2 * townDayMs; at += 5_000) {
    const sample = townNightWeatherAt(at, dawn);
    const authoritativeNight = (at - dawn) % townDayMs >= townDaylightMs;
    assert.equal(sample.daylight, !authoritativeNight);
    assert.equal(sample.phaseName === 'day' || sample.phaseName === 'sunrise' || sample.phaseName === 'dusk',
      !authoritativeNight);
  }
  assert.equal(townNightWeatherAt(phaseAt(.5999), dawn).daylight, true);
  assert.equal(townNightWeatherAt(phaseAt(.6), dawn).daylight, false);
  assert.equal(townNightWeatherAt(phaseAt(.6), dawn).phaseName, 'nightfall');
});

test('phase names cover sunrise, day, dusk, nightfall and deep night', () => {
  assert.equal(townNightWeatherPhaseName(0), 'sunrise');
  assert.equal(townNightWeatherPhaseName(.0599), 'sunrise');
  assert.equal(townNightWeatherPhaseName(.06), 'day');
  assert.equal(townNightWeatherPhaseName(.4799), 'day');
  assert.equal(townNightWeatherPhaseName(.48), 'dusk');
  assert.equal(townNightWeatherPhaseName(.5999), 'dusk');
  assert.equal(townNightWeatherPhaseName(.6), 'nightfall');
  assert.equal(townNightWeatherPhaseName(.6999), 'nightfall');
  assert.equal(townNightWeatherPhaseName(.7), 'deep-night');
});

test('day and night endpoints retain the approved town palette and light budget', () => {
  const day = townNightWeatherAt(phaseAt(.47), dawn);
  assert.equal(day.skyColor, 0xadc2dd);
  assert.equal(day.ambientColor, 0xe4edff);
  assert.equal(day.sunColor, 0xffe6c5);
  assert.equal(day.lampLevel, 0);
  assert.equal(day.fogFarScale, 1);

  const night = townNightWeatherAt(phaseAt(.78), dawn);
  assert.equal(night.skyColor, 0x1b2947);
  assert.equal(night.lampLevel, 1);
  assert.equal(night.starLevel, 1);
  assert.equal(night.fogFarScale, .66);
  assert.ok(night.exposure < day.exposure);
});

test('lamp level fades through dusk instead of switching at the boundary', () => {
  const levels = [.3, .48, .53, .578, .6, .66, .78].map(phase => townNightWeatherAt(phaseAt(phase), dawn).lampLevel);
  assert.equal(levels[0], 0);
  assert.ok(levels[1] > 0, 'lamps start warming during dusk');
  assert.ok(levels[2] > levels[1]);
  assert.ok(levels[3] > levels[2]);
  assert.ok(levels[4] > levels[3]);
  assert.ok(levels[5] > levels[4]);
  assert.equal(levels[6], 1);
});

test('sun direction stays a unit vector above the horizon, even at deep night', () => {
  for (let phase = 0; phase < 1; phase += .01) {
    const sample = townNightWeatherAt(phaseAt(phase), dawn);
    const [x, y, z] = sample.sunDirection;
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
    assert.ok(y > 0, `sun light below horizon at ${phase}`);
  }
});

test('invalid clocks fall back to the default anchor without NaN', () => {
  for (const [now, epoch] of [[NaN, dawn], [dawn, NaN], [Infinity, dawn], [dawn, -1]] as const) {
    const sample = townNightWeatherAt(now, epoch);
    for (const value of [sample.skyColor, sample.sunIntensity, sample.lampLevel, sample.sunDirection[1]]) {
      assert.ok(Number.isFinite(value));
    }
  }
  assert.equal(townNightWeatherAt(NaN, dawn).dawnEpoch, dawn);
});

test('rig applies background, fog, lights and sun direction from the same sample', () => {
  const scene = new Scene();
  scene.background = new Color('#000000');
  const ambient = new AmbientLight('#ffffff', 1);
  const sun = new DirectionalLight('#ffffff', 1);
  scene.add(ambient, sun);
  const fog = new Fog('#ffffff', 100, 900);
  scene.fog = fog;
  const rig = createTownNightWeatherSky({ scene, ambient, sun, fog });
  assert.equal(rig.current(), undefined);

  const dayFrame = rig.update(phaseAt(.3), dawn);
  assert.equal(dayFrame.nightSide, false);
  assert.equal((scene.background as { getHex(): number }).getHex(), dayFrame.sample.skyColor);
  assert.equal(fog.color.getHex(), dayFrame.sample.fogColor);
  assert.equal(ambient.color.getHex(), dayFrame.sample.ambientColor);
  assert.equal(sun.color.getHex(), dayFrame.sample.sunColor);
  assert.ok(Math.abs(ambient.intensity - dayFrame.sample.ambientIntensity * dayFrame.sample.exposure) < 1e-9);
  assert.ok(sun.position.length() > 0 && sun.position.y > 0);

  const nightFrame = rig.update(phaseAt(.78), dawn);
  assert.equal(nightFrame.nightSide, true);
  assert.equal(nightFrame.lampLevel, 1);
  assert.ok(nightFrame.sample.exposure < .98);

  const dimmed = rig.update(phaseAt(.3), dawn, { dim: .5 });
  assert.ok(Math.abs(ambient.intensity - dimmed.sample.ambientIntensity * dimmed.sample.exposure * .5) < 1e-9);
  assert.equal(rig.current(), dimmed);
});

test('rig tolerates a scene without fog and leaves unrelated state alone', () => {
  const scene = new Scene();
  const ambient = new AmbientLight('#ffffff', 1);
  const sun = new DirectionalLight('#ffffff', 1);
  const rig = createTownNightWeatherSky({ scene, ambient, sun });
  const frame = rig.update(phaseAt(.9), dawn);
  assert.equal(frame.nightSide, true);
  assert.ok(scene.background);
  assert.ok(Number.isFinite(sun.position.x));
});
