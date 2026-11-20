import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Points, Scene, ShaderMaterial, Vector2 } from 'three';
import { createSnowfall } from '../tools/voxel-tavern/town-blockout/snowfall';
import { createFrostTracker, scatterTownSnowballAim, type OutdoorFrostExposure } from '../tools/voxel-tavern/town-blockout/town-frost';
import { createTownTemperatureHud } from '../tools/voxel-tavern/town-blockout/town-temperature';
import { townSnowWeatherForOutdoorState } from '../tools/voxel-tavern/town-blockout/town-weather';
import { townAreaWindWalkingScale, townWeatherAreaAt, townWeatherExposureFor } from '../tools/voxel-tavern/town-blockout/town-weather-exposure';
import type { TownOutdoorWeatherState } from '../src/shared/town-outdoor-weather';

const clearExposure: OutdoorFrostExposure = { weather: 'clear-snow', exposed: true, night: false, wet: false, stillOnIce: false };
const whiteout: TownOutdoorWeatherState = {
  weather: 'whiteout', startedAt: 100, nextChangeAt: 100_000, windEast: 0, windNorth: 1, windStrength: 1,
};

test('ground cold uses exclusive thresholds and preserves the old frost setting and warmth controls', () => {
  const frost = createFrostTracker();
  frost.setOutdoorExposure(clearExposure);
  assert.ok(frost.update(269) < 1);
  assert.equal(frost.walkingScale(), 1);
  assert.equal(frost.update(1), 1);
  assert.equal(frost.walkingScale(false), .92);
  assert.equal(frost.throwScatterScale(), 1.25);
  assert.equal(frost.update(270), 2);
  assert.equal(frost.walkingScale(), .82);
  assert.equal(frost.throwScatterScale(), 1.6);
  assert.ok(frost.update(269) < 3);
  assert.equal(frost.walkingScale(), .82);
  assert.equal(frost.update(20), 3);
  assert.equal(frost.walkingScale(), .75);
  frost.drinkHot();
  assert.equal(frost.personal(), 2);
  assert.equal(frost.update(1), 1.9);
  frost.setWarmth('hot-drink', false);
  frost.setExposure(0, 0, false, false);
  assert.equal(frost.walkingScale(false), 1);
  assert.equal(frost.throwScatterScale(), 1);
});

test('region multiplies cold, continuous ice delay only counts past ten seconds, and cap is applied to the total', () => {
  const ice = createFrostTracker();
  ice.setOutdoorExposure({ ...clearExposure, stillOnIce: true });
  assert.equal(ice.update(9), 9 / 270);
  assert.equal(ice.update(5), 16 / 270);
  ice.setOutdoorExposure(clearExposure);
  ice.update(2);
  const before = ice.exposure();
  ice.setOutdoorExposure({ ...clearExposure, stillOnIce: true });
  assert.equal(ice.update(10), before + 10 / 270);

  const exposed = createFrostTracker();
  exposed.setOutdoorExposure({ ...clearExposure, weather: 'whiteout', night: true, wet: true, stillOnIce: true });
  assert.equal(exposed.update(90), 1);
  const sheltered = createFrostTracker();
  sheltered.setOutdoorExposure({ ...clearExposure, weather: 'whiteout', area: 'plaza', night: true, wet: true });
  assert.ok(Math.abs(sheltered.update(90) - .8) < 1e-9);
  sheltered.setWarmth('interior', true);
  assert.ok(Math.abs(sheltered.update(8)) < 1e-9);
});

test('cold snowball scatter expands a uniform aim disc by frost level and respects the pitch limits', () => {
  const yaw = 1.2, pitch = -.3;
  for (const scale of [1, 1.25, 1.6]) {
    const samples = [.25, .125].values();
    const aim = scatterTownSnowballAim(yaw, pitch, scale, () => samples.next().value!);
    const offset = Math.hypot(aim.yaw - yaw, aim.pitch - pitch);
    assert.ok(Math.abs(offset - scale * Math.PI / 180) < 1e-12);
    assert.ok(aim.yaw > yaw && aim.pitch > pitch);
  }

  const upper = [.81, .25].values();
  const lower = [.81, .75].values();
  assert.equal(scatterTownSnowballAim(yaw, 1.41, 1.6, () => upper.next().value!).pitch, 1.42);
  assert.equal(scatterTownSnowballAim(yaw, -1.41, 1.6, () => lower.next().value!).pitch, -1.42);
  assert.deepEqual(scatterTownSnowballAim(yaw, pitch, 1.6, () => 0), { yaw, pitch });
});

test('approved areas share one wind direction and produce distinct visibility distances', () => {
  for (const [area, exposure] of [
    ['plaza', .4], ['town-hall', .4], ['clocktower', .5], ['tavern', .4], ['memorial', .4],
    ['bus-station', .6], ['post-office', .4], ['shared-home', .5], ['inn', .5], ['mirror-lake', .8],
    ['ice-palace', .7], ['pine-forest', .6], ['meteor-rim', .9], ['lower-cable-station', .7],
    ['front-mountain', 1], ['summit', 1], ['residential', .5], ['clocktower-lookout', 1],
    ['mountain-pass', 1], ['meteor-bottom', .5],
  ] as const) assert.equal(townWeatherExposureFor(area), exposure, area);

  assert.equal(townWeatherAreaAt(223, 180), 'plaza');
  assert.equal(townWeatherAreaAt(226, 223), 'clocktower');
  assert.equal(townWeatherAreaAt(226, 223, { clocktowerLookout: true }), 'clocktower-lookout');
  assert.equal(townWeatherAreaAt(344, 66), 'mirror-lake');
  assert.equal(townWeatherAreaAt(484, 65), 'ice-palace');
  assert.equal(townWeatherAreaAt(600, 450, { area: 'meteor-bottom' }), 'meteor-bottom');
  assert.equal(townWeatherAreaAt(418, 225, { inPineCamp: true }), 'pine-forest');
  assert.equal(townWeatherAreaAt(135, 267, { residentialStreet: true }), 'residential');
  assert.equal(townAreaWindWalkingScale(whiteout, 'open-ground', 0, -1), .6);
  assert.equal(townAreaWindWalkingScale(whiteout, 'open-ground', 0, 1), 1.1);
  assert.equal(townAreaWindWalkingScale(whiteout, 'plaza', 0, -1), .84);
  assert.equal(townAreaWindWalkingScale(whiteout, 'plaza', 1, 0), 1);
  assert.equal(townAreaWindWalkingScale(whiteout, 'plaza', 0, 0), 1);

  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'plaza').fogFar, 30);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'residential').fogFar, 24);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'mirror-lake').fogFar, 15);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'open-ground').fogFar, 12);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'plaza', 14).fogFar, 14);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'plaza', 14, 8).fogNear, 0);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'plaza', 14, 5).fogNear, 8);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'open-ground', 7, 5).fogNear, 8);
  assert.equal(townSnowWeatherForOutdoorState('clear-snow', 'plaza').intensity, 1);
  assert.equal(townSnowWeatherForOutdoorState('wind', 'plaza').intensity, 2.45);
  assert.equal(townSnowWeatherForOutdoorState('whiteout', 'plaza').intensity, 4);
});

test('weather moves one mobile-budget particle system without redrawing or resetting wind displacement', () => {
  const scene = new Scene();
  const snow = createSnowfall(scene, 'low');
  const camera = new PerspectiveCamera();
  const flakes = scene.children[0] as Points;
  const uniforms = (flakes.material as ShaderMaterial).uniforms;
  const wind = uniforms.windVelocity.value as Vector2;
  const drift = uniforms.windOffset.value as Vector2;
  assert.equal(flakes.geometry.drawRange.count, 632);
  snow.setIntensity(4);
  assert.equal(flakes.geometry.drawRange.count, 1264);
  snow.setWind(0, 1, 1);
  assert.deepEqual(wind.toArray(), [0, -12]);
  snow.update(camera, .5, true);
  assert.deepEqual(drift.toArray(), [0, -6]);
  snow.setWind(1, 0, .4);
  assert.deepEqual(drift.toArray(), [0, -6]);
  snow.update(camera, .25, true);
  assert.ok(Math.abs(drift.x - 1.2) < 1e-9);
  assert.equal(drift.y, -6);
  assert.equal(scene.children.length, 1);
});

test('temperature HUD remains legible and throttles its warning for continuous bottom exposure', () => {
  class Node {
    className = '';
    children: Node[] = [];
    hidden = false;
    value = -1;
    classList = { toggle() {} };
    ownerDocument = { createElement: () => new Node() };
    setAttribute() {}
    append(...children: Node[]) { this.children.push(...children); }
  }
  const parent = new Node();
  const warnings: string[] = [];
  const hud = createTownTemperatureHud(parent as unknown as HTMLElement, message => warnings.push(message));
  const [root] = parent.children;
  const [label, warning] = root.children;
  const [, , bar] = label.children;
  assert.equal(root.hidden, true);
  hud.update(0, 0);
  assert.equal(root.hidden, false);
  assert.equal(bar.value, 100);
  hud.update(2.999, 1);
  assert.equal(bar.value, 1);
  hud.update(3, 2);
  assert.equal(bar.value, 0);
  assert.equal(warning.hidden, false);
  hud.update(3, 10_001);
  assert.equal(warnings.length, 1);
  hud.update(3, 10_002);
  assert.equal(warnings.length, 2);
  hud.update(2, 20_002);
  assert.equal(warning.hidden, true);
  hud.update(undefined, 30_000);
  assert.equal(root.hidden, true);
  assert.equal(warnings.length, 2);
});
