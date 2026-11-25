import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrontRidgeCloudBand, cloudBandCoreHeightAt } from '../tools/voxel-tavern/town-blockout/front-ridge-cloud-band';
import { createFrontRidgeSwitchbackRoad } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';

test('cloud band: ring coverage, gaps, high clusters, weather + night hooks', () => {
  const band = createFrontRidgeCloudBand();
  assert.ok(band.puffCount >= 90, `puff field too sparse: ${band.puffCount}`);
  assert.equal(band.clusterCount, 2);
  assert.ok(band.clusterPuffCount >= 10 && band.clusterPuffCount <= 18);

  // Core undulates (never a flat slab): full-ring swing > 20 m.
  let lo = 1e9, hi = -1e9;
  for (let t = -Math.PI; t < Math.PI; t += 0.05) {
    const h = cloudBandCoreHeightAt(t);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  assert.ok(hi - lo > 20, `core too flat: ${hi - lo}`);
  assert.ok(lo >= 200 && hi <= 245, `core leaves the 170-260 band: ${lo}..${hi}`);

  // Density: strong on the south face at core height, zero in the
  // cloud-fall mouth (north face, theta ~ +0.61) and off-mountain.
  const C = { east: 320, north: 650, rE: 330, rN: 380 };
  const posOf = (d: number, th: number) => ({
    east: C.east + d * C.rE * Math.cos(th), north: C.north + d * C.rN * Math.sin(th),
  });
  const dOfH = (h: number) => 1 - Math.pow(Math.max(0, (h - 18) / 332), 1 / 1.6);
  const south = posOf(dOfH(cloudBandCoreHeightAt(-0.75)), -0.75);
  assert.ok(band.densityAt(south.east, south.north, cloudBandCoreHeightAt(-0.75)) > 0.6,
    'south face core density too low');
  const mouth = posOf(dOfH(cloudBandCoreHeightAt(0.61)), 0.61);
  assert.ok(band.densityAt(mouth.east, mouth.north, cloudBandCoreHeightAt(0.61)) < 0.05,
    'cloud-fall mouth must be open');
  assert.equal(band.densityAt(100, 100, 220), 0); // off the mountain body

  // ZB-20 wiring: the band consumes only TownOutdoorWeatherState.
  const clearState = { weather: 'clear-snow', startedAt: 0, nextChangeAt: 600_000, windEast: 1, windNorth: 0, windStrength: 0 } as const;
  const whiteoutState = { weather: 'whiteout', startedAt: 0, nextChangeAt: 600_000, windEast: 1, windNorth: 0, windStrength: 1 } as const;
  band.applyOutdoorWeather(clearState);
  const probeHeight = cloudBandCoreHeightAt(-0.75) + 10; // skirt band: mid-range field, unsaturated
  const clearDensity = band.densityAt(south.east, south.north, probeHeight);
  assert.ok(clearDensity > 0.09 && clearDensity < 0.19,
    `clear-snow amount must thin the field (got ${clearDensity})`);
  band.applyOutdoorWeather(whiteoutState);
  const whiteoutDensity = band.densityAt(south.east, south.north, probeHeight);
  assert.ok(whiteoutDensity > 0.27 && whiteoutDensity < 0.43 && whiteoutDensity > clearDensity * 1.7,
    `whiteout visibility must thicken the field (got ${whiteoutDensity} vs ${clearDensity})`);
  band.applyOutdoorWeather({ ...clearState, weather: 'wind', windStrength: 0.5 });
  band.setNight(true);
  band.update(1.5);
  band.setNight(false);
  band.update(0.5);
  band.dispose();
});

test('cloud band: the switchback crossing is one 30-60 m in-cloud segment', () => {
  const band = createFrontRidgeCloudBand();
  const road = createFrontRidgeSwitchbackRoad();
  let inRun = 0, runStart = -1, longest = 0, totalIn = 0, segments = 0;
  let prevCum = 0;
  for (const p of road.centreline) {
    const step = p.cum - prevCum;
    prevCum = p.cum;
    const dense = band.densityAt(p.east, p.north, p.height + 1.7) > 0.6;
    if (dense) {
      if (runStart < 0) { runStart = p.cum; segments++; }
      inRun += step; totalIn += step;
      longest = Math.max(longest, inRun);
    } else { inRun = 0; runStart = -1; }
  }
  assert.equal(segments, 1, `expected exactly one dense crossing, got ${segments}`);
  assert.ok(longest >= 30 && longest <= 60, `in-cloud segment ${longest.toFixed(1)} m outside 30-60`);
  assert.ok(totalIn <= 75, `total dense length ${totalIn.toFixed(1)} m too long`);
  band.dispose();
  road.dispose();
});
