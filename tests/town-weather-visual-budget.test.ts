import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTownWeatherVisualDriver,
  townWeatherParticleLoad,
  townWeatherParticleScale,
  type SnowfallHandle,
  type TownWeatherVisualSample,
} from '../tools/voxel-tavern/town-blockout/town-weather-visual-budget';

const calm: TownWeatherVisualSample = {
  intensity: .69, visibilityMeters: 1339, windEast: 1, windNorth: 0, windStrength: .04,
};
const townWhiteout: TownWeatherVisualSample = {
  intensity: 2.78, visibilityMeters: 77.9, windEast: .6, windNorth: -.8, windStrength: .56,
};
const summitWhiteout: TownWeatherVisualSample = {
  intensity: 6.12, visibilityMeters: 11, windEast: .6, windNorth: -.8, windStrength: 1,
};

test('particle load stays calm for clear weather and saturates in a summit whiteout', () => {
  assert.equal(townWeatherParticleLoad(calm), 0);
  assert.ok(townWeatherParticleLoad(townWhiteout) > .3 && townWeatherParticleLoad(townWhiteout) < .45);
  assert.equal(townWeatherParticleLoad(summitWhiteout), 1);
  assert.equal(townWeatherParticleLoad({ intensity: NaN, visibilityMeters: NaN }), 0);
});

test('particle scale respects the quality tier and only trims the heaviest weather', () => {
  assert.equal(townWeatherParticleScale(calm, 1), 1);
  assert.equal(townWeatherParticleScale(calm, .5), .5);
  assert.equal(townWeatherParticleScale(calm, 1.25), 1.25);
  const summitFine = townWeatherParticleScale(summitWhiteout, 1.25);
  assert.ok(summitFine > .93 && summitFine < .96);
  assert.equal(townWeatherParticleScale(summitWhiteout, .01), .4, 'never drops below the floor');
});

test('visual driver writes intensity, a smooth density and throttled wind', () => {
  const calls = { intensity: [] as number[], density: [] as number[], wind: [] as Array<[number, number, number, number]> };
  const snowfall: SnowfallHandle = {
    setIntensity(value) { calls.intensity.push(value); },
    setDensityScale(value) { calls.density.push(value); },
    setOutdoorWind(east, north, strength, exposure = 1) { calls.wind.push([east, north, strength, exposure]); },
  };
  const driver = createTownWeatherVisualDriver(snowfall);
  let previousDensity = 1;
  for (let frame = 0; frame < 120; frame += 1) {
    driver.update(summitWhiteout, 1 / 60, frame * (1000 / 60), .8);
    const current = driver.current();
    assert.ok(current.density <= previousDensity + 1e-9, 'density eases downward instead of popping');
    previousDensity = current.density;
  }
  assert.equal(calls.intensity.length, 1, 'setIntensity is de-duplicated while the value is unchanged');
  assert.ok(calls.density.length < 60, 'draw range changes are quantized');
  assert.ok(calls.wind.length <= 22, `wind is pushed at about 10 Hz, not every frame (${calls.wind.length})`);
  assert.ok(calls.wind.every(([, , strength]) => strength >= 0 && strength <= 1));
  assert.ok(driver.current().density > .74 && driver.current().density < .77);
  assert.equal(calls.wind.at(-1)?.[3], .8, 'exposure is forwarded to the emitter');
});

test('wind keeps a unit direction and a second identical frame does not re-push it', () => {
  const wind: Array<[number, number, number]> = [];
  const snowfall: SnowfallHandle = {
    setIntensity() {}, setDensityScale() {},
    setOutdoorWind(east, north, strength) { wind.push([east, north, strength]); },
  };
  const driver = createTownWeatherVisualDriver(snowfall);
  driver.update(townWhiteout, 1 / 60, 0, 1);
  const first = wind.at(-1)!;
  assert.ok(Math.abs(Math.hypot(first[0], first[1]) - 1) < 1e-6);
  driver.update(townWhiteout, 1 / 60, 30, 1);
  assert.equal(wind.length, 1, 'inside the 10 Hz window no second push happens');
  driver.update(townWhiteout, 1 / 60, 120, 1);
  assert.equal(wind.length, 2);
});

test('two clients fed the same field sample produce the same visual targets', () => {
  const make = () => {
    const calls: Array<[number, number, number]> = [];
    const snowfall: SnowfallHandle = {
      setIntensity() {}, setDensityScale() {},
      setOutdoorWind(east, north, strength) { calls.push([east, north, strength]); },
    };
    return { driver: createTownWeatherVisualDriver(snowfall), calls };
  };
  const a = make();
  const b = make();
  for (let frame = 0; frame < 30; frame += 1) {
    a.driver.update(townWhiteout, 1 / 60, frame * 16.67, 1);
    b.driver.update(townWhiteout, 1 / 60, frame * 16.67, 1);
  }
  assert.deepEqual(a.driver.current(), b.driver.current());
  assert.deepEqual(a.calls, b.calls);
});

test('NaN input is ignored and reset restores the initial budget', () => {
  const calls: number[] = [];
  const snowfall: SnowfallHandle = {
    setIntensity(value) { calls.push(value); },
    setDensityScale() {},
    setOutdoorWind() {},
  };
  const driver = createTownWeatherVisualDriver(snowfall);
  driver.update({ intensity: NaN, visibilityMeters: NaN, windEast: NaN, windNorth: NaN, windStrength: NaN }, 1 / 60, 0, 1);
  assert.equal(calls.length, 0);
  driver.update(summitWhiteout, 1 / 60, 100, 1);
  assert.ok(driver.current().density < 1);
  driver.reset();
  assert.equal(driver.current().density, 1);
});
