import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitCloudLayer, mainSummitCloudSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cloud-layer';

const bounds = { west: -1100, east: 1100, south: -10, north: 1790 };
const shoulders = [{ east: -550, north: 900, height: 560 }, { east: 590, north: 1080, height: 610 }] as const;
const terrain = {
  bounds, summit: { east: 50, north: 1000 }, shoulders,
  heightAt(east: number, north: number) {
    if (east < bounds.west || east > bounds.east || north < bounds.south || north > bounds.north) return;
    const shoulder = shoulders.find(point => Math.hypot(east - point.east, north - point.north) < 240);
    if (!shoulder) return 150;
    const inland = (east - shoulder.east) * -Math.sign(shoulder.east);
    return shoulder.height + inland * (inland > 0 ? .5 : .4) - .3 * Math.abs(north - shoulder.north);
  },
};

test('P-8 vertical transect fades within 380–560 m and the three eyes drift', t => {
  const cloud = createMainSummitCloudLayer(terrain);
  t.after(() => cloud.dispose());
  const state = cloud.update(0, { east: 6, north: 1 }, 1);
  assert.equal(state.eyes.length, 3);
  assert.ok(state.banks > 0);
  for (const [index, eye] of state.eyes.entries()) {
    assert.ok(eye.diameter >= 80 && eye.diameter <= 150);
    assert.ok(cloud.sample(eye.east, eye.north, 474).band);
    assert.equal(cloud.sample(eye.east, eye.north, 474).density, 0);
    assert.notDeepEqual(eye, cloud.update(30_000, { east: 6, north: 1 }, 1).eyes[index]);
    cloud.update(0, { east: 6, north: 1 }, 1);
  }
  const measure = (height: number) => cloud.sample(-900, 400, height);
  for (const outside of [350, 379.99, 560.01, 800]) {
    assert.deepEqual(measure(outside), { band: false, density: 0, visibility: undefined });
  }
  assert.equal(measure(380).density, 0);
  assert.equal(measure(560).density, 0);
  assert.ok(measure(400).density > 0 && measure(400).density < 1);
  assert.deepEqual(measure(474), { band: true, density: 1, visibility: mainSummitCloudSpec.minimumVisibility });
  assert.ok(measure(548).density > 0 && measure(548).density < 1);
  assert.ok(cloud.sample(shoulders[1].east, shoulders[1].north, 474).density === 0);
});

test('P-8 emits leeward streamers only above threshold and clips the uphill tail on wind reversal', t => {
  const cloud = createMainSummitCloudLayer(terrain);
  t.after(() => cloud.dispose());
  assert.equal(cloud.update(0, { east: 4.99, north: 0 }).lobes, 0);
  assert.equal(cloud.update(0, { east: 8, north: 0 }, 0).lobes, 0);
  const eastWind = cloud.update(10_000, { east: 8, north: 0 });
  const westWind = cloud.update(10_000, { east: -8, north: 0 });
  assert.deepEqual(eastWind.flags.map(flag => flag.mount), shoulders);
  assert.ok(eastWind.flags[0]!.lobes.length < eastWind.flags[1]!.lobes.length);
  assert.ok(westWind.flags[0]!.lobes.length > westWind.flags[1]!.lobes.length);
  for (const [state, sign] of [[eastWind, 1], [westWind, -1]] as const) for (const flag of state.flags) {
    assert.ok(flag.lobes.length > 0);
    for (const lobe of flag.lobes) {
      assert.ok((lobe.east - flag.mount.east) * sign > 0);
      assert.ok(lobe.clearance >= mainSummitCloudSpec.streamerTerrainClearance - 1e-9);
      assert.ok(lobe.height - flag.mount.height <= mainSummitCloudSpec.streamerMaxLift);
    }
  }
  assert.deepEqual(cloud.update(10_000, { east: 8, north: 0 }), eastWind);
  cloud.dispose();
  assert.equal(cloud.group.children.length, 0);
  assert.throws(() => cloud.update(0, { east: 0, north: 0 }), /disposed/);
});

test('P-8 rejects an unsupported shoulder mount', () => {
  assert.throws(() => createMainSummitCloudLayer({ ...terrain, heightAt: () => 100 }), RangeError);
});
