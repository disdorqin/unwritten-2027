import assert from 'node:assert/strict';
import test from 'node:test';
import { TOWN_BOUNDS } from '../src/presence/protocol.ts';
import {
  townWeatherCrater, townWeatherFieldAt, townWeatherMapDepth, townWeatherMapWidth,
  townWeatherTerrainSeverity, type TownWeatherFieldBase,
} from '../src/shared/town-weather-field.ts';

const light: TownWeatherFieldBase = {
  intensity: 1, fogNear: 360, fogFar: 1300, pilingRate: .25, targetCover: .18, visibilityMeters: null,
};
const whiteout: TownWeatherFieldBase = {
  intensity: 4, fogNear: 0, fogFar: 12, pilingRate: 1.25, targetCover: 1, visibilityMeters: 12,
};
const town = { east: 206, north: 182, elevation: 30 };
const foothill = { east: 300, north: 430, elevation: 150 };
const alpine = { east: 300, north: 560, elevation: 420 };
const summit = { east: 350, north: 676, elevation: 800 };
const crater = { east: townWeatherCrater.east, north: townWeatherCrater.north, elevation: 130 };
const edge = { east: 4, north: 400, elevation: 30 };

const sample = (base: TownWeatherFieldBase, position: typeof town, windStrength = 0) => townWeatherFieldAt({
  base, position, windEast: 0, windNorth: -1, windStrength,
});

test('field constants stay in sync with the town map bounds', () => {
  assert.equal(townWeatherMapWidth, TOWN_BOUNDS.width);
  assert.equal(townWeatherMapDepth, TOWN_BOUNDS.depth);
});

test('field is deterministic for identical inputs', () => {
  for (const base of [light, whiteout]) {
    assert.deepEqual(sample(base, town), sample(base, town));
    assert.deepEqual(sample(base, summit), sample(base, summit));
  }
});

test('snow severity rises from town floor to foothill to alpine', () => {
  const values = [town, foothill, alpine].map(position => sample(light, position));
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i].severity > values[i - 1].severity,
      `severity ${i}: ${values[i].severity} > ${values[i - 1].severity}`);
    assert.ok(values[i].intensity > values[i - 1].intensity,
      `snow ${i}: ${values[i].intensity} > ${values[i - 1].intensity}`);
  }
  assert.equal(values[0].region, 'town');
  assert.equal(values[1].region, 'foothill');
  assert.equal(values[2].region, 'alpine');
  const peak = sample(light, summit);
  assert.equal(peak.region, 'summit');
  assert.ok(peak.severity > .8, `summit severity ${peak.severity}`);
});

test('crater and map edge are harsher than the sheltered town', () => {
  const townSeverity = sample(whiteout, town).severity;
  for (const position of [crater, edge]) {
    const value = sample(whiteout, position);
    assert.ok(value.severity > .8, `${value.region} severity ${value.severity}`);
    assert.ok(value.severity > townSeverity + .5);
    assert.ok(value.visibilityMeters <= 13, `${value.region} visibility ${value.visibilityMeters}`);
  }
  assert.equal(sample(whiteout, crater).region, 'crater');
  assert.equal(sample(whiteout, edge).region, 'map-edge');
});

test('whiteout visibility is wide in town and compressed on the exposed terrain', () => {
  const townValue = sample(whiteout, town);
  assert.ok(townValue.visibilityMeters > 55, `town ${townValue.visibilityMeters}`);
  for (const position of [alpine, summit, crater, edge]) {
    const value = sample(whiteout, position);
    assert.ok(value.visibilityMeters <= 12, `${value.region} ${value.visibilityMeters}`);
    assert.ok(value.fogFar > value.visibilityMeters);
    assert.ok(value.fogNear < value.fogFar);
  }
  assert.ok(townValue.visibilityMeters > sample(whiteout, foothill).visibilityMeters);
  assert.ok(sample(whiteout, foothill).visibilityMeters > sample(whiteout, alpine).visibilityMeters);
});

test('the field is spatially continuous with no per-position random jumps', () => {
  const step = 1;
  for (const y of [30, 150, 400, 600]) {
    let previous = townWeatherTerrainSeverity({ east: 0, north: y, elevation: 200 });
    for (let x = 1; x <= townWeatherMapWidth; x += step) {
      const current = townWeatherTerrainSeverity({ east: x, north: y, elevation: 200 });
      assert.ok(Math.abs(current - previous) < .03, `severity jump at ${x},${y}: ${current - previous}`);
      previous = current;
    }
  }
  const a = sample(light, { east: 300, north: 400, elevation: 260 });
  const b = sample(light, { east: 301, north: 400, elevation: 260 });
  assert.ok(Math.abs(a.severity - b.severity) < .01);
  assert.ok(Math.abs(a.visibilityMeters - b.visibilityMeters) < 20);
});

test('wind is stronger on exposed terrain and keeps a unit direction', () => {
  const calmTown = sample(light, town, 0);
  const calmAlpine = sample(light, alpine, 0);
  assert.ok(calmAlpine.windStrength > calmTown.windStrength);
  assert.ok(calmAlpine.windStrength > .3);

  const gale = sample(whiteout, alpine, 1);
  assert.ok(gale.windStrength >= .95);
  assert.ok(Math.abs(Math.hypot(gale.windEast, gale.windNorth) - 1) < 1e-9);
  assert.ok(gale.windNorth < 0, 'base north wind is preserved');
});

test('snow cover targets stay bounded and rise with exposure', () => {
  const townCover = sample(light, town).targetCover;
  const alpineCover = sample(light, alpine).targetCover;
  assert.ok(alpineCover > townCover);
  for (const value of [town, alpine, crater, edge].map(position => sample(whiteout, position))) {
    assert.ok(value.targetCover >= 0 && value.targetCover <= 1);
    assert.ok(value.pilingRate > 0);
  }
});

test('NaN and out-of-map positions stay finite and clamped', () => {
  const broken = townWeatherFieldAt({
    base: whiteout,
    position: { east: Number.NaN, north: Infinity, elevation: Number.NaN },
    windEast: Number.NaN, windNorth: undefined, windStrength: Number.NaN,
  });
  for (const key of ['severity', 'intensity', 'fogNear', 'fogFar', 'visibilityMeters',
    'windEast', 'windNorth', 'windStrength', 'targetCover', 'pilingRate'] as const) {
    assert.ok(Number.isFinite(broken[key]), `${key} = ${broken[key]}`);
  }
  assert.ok(broken.severity >= 0 && broken.severity <= 1);
  assert.ok(broken.windStrength >= 0 && broken.windStrength <= 1);
});

test('a missing edge distance falls back to the town bounds', () => {
  const implicit = townWeatherTerrainSeverity({ east: 5, north: 400, elevation: 30 });
  const explicit = townWeatherTerrainSeverity({ east: 5, north: 400, elevation: 30, edgeDistance: 5 });
  assert.ok(Math.abs(implicit - explicit) < 1e-12);
});
