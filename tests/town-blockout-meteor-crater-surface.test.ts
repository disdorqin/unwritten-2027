import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3 } from 'three';
import { meteorCraterDepth, meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';

test('B-01 mounts its reviewed crater and closure in a measured, rotated surface frame', () => {
  assert.throws(() => mountMeteorCraterSurface({ east: -110, north: 160, rimHeight: NaN, yaw: 0 }), RangeError);
  // Survey fixture only. The point is not the live town anchor.
  const anchor = { east: -110, north: 160, rimHeight: 14, yaw: -.41 };
  const mounted = mountMeteorCraterSurface(anchor);
  let previous = mounted.trailPoint(0);
  const rim = previous;
  assert.ok(Math.abs(rim.height - anchor.rimHeight) < .025);
  const bearing = meteorCraterFixturePlan.mainTrail.startBearing + anchor.yaw;
  assert.ok(Math.abs(Math.atan2(rim.east - anchor.east, rim.north - anchor.north) - bearing) < 1e-12);
  mounted.group.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  for (let i = 1; i <= 1500; i++) {
    const foot = mounted.trailPoint(i / 1500);
    const distance = Math.hypot(foot.east - previous.east, foot.north - previous.north);
    assert.ok(Math.abs((foot.height - previous.height) / distance) <= meteorCraterFixturePlan.mainTrail.maxGrade);
    assert.ok(foot.height <= previous.height + .001);
    if (i % 100 === 0) {
      ray.ray.origin.set(foot.east, anchor.rimHeight + .5, -foot.north);
      const [visible] = ray.intersectObject(mounted.group);
      assert.ok(visible && Math.abs(visible.point.y - foot.height) < .001, 'walk support and visible ground agree');
    }
    previous = foot;
  }
  assert.ok(Math.abs(previous.height - (anchor.rimHeight - meteorCraterDepth)) < .025);
  assert.equal(mounted.heightAt(anchor.east, anchor.north), anchor.rimHeight - meteorCraterDepth);
  ray.ray.origin.set(anchor.east, anchor.rimHeight + .5, -anchor.north);
  assert.equal(ray.intersectObject(mounted.group)[0]?.object.name, 'meteor-crater-sealed-well');
  assert.equal(mounted.heightAt(anchor.east + 90, anchor.north), undefined);
});

test('ZA-22 west entrance physically joins the existing E0 edge and the B-01 crater lip', () => {
  const town = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, (north) => town.groundHeightAt(0, north));
  assert.ok(Math.abs(road.lip.east - (-120 + Math.sqrt(55 ** 2 - 26 ** 2))) < 1e-10);
  assert.ok(Math.abs(road.lip.north - 159) < 1e-10);
  road.group.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  for (const north of [1, 102.25, 159, 185, 402.75, 539]) {
    assert.equal(road.heightAt(0, north), town.groundHeightAt(0, north));
  }
  let last = town.heightAt(1, road.lip.north);
  for (let e = 1; e >= road.lip.east; e -= .12) {
    const height = e > 0 ? town.heightAt(e, road.lip.north) : road.heightAt(e, road.lip.north);
    assert.ok(height !== undefined && Math.abs(height - last) <= .025);
    last = height;
    if (e < 0 && Math.round(e / .12) % 17 === 0) {
      ray.ray.origin.set(e, last + 1, -road.lip.north);
      assert.ok(Math.abs(ray.intersectObject(road.group)[0].point.y - last) < .001);
    }
  }
  assert.ok(Math.abs(last - road.lip.height) < .025);
  assert.equal(road.heightAt(-241, road.lip.north), undefined);
  const fenceEast = road.lip.east + 1;
  for (const direction of [-1, 1]) {
    const fenceNorth = road.lip.north + direction * 3.25;
    assert.ok(road.group.children.some(child => child.position.x === fenceEast && child.position.z === -fenceNorth));
    assert.equal(road.fenceBlocks(fenceEast, fenceNorth, road.lip.height, .27), true);
  }
  for (let i = -20; i <= 20; i++) {
    const east = road.lip.east + i * .1;
    const height = road.heightAt(east, road.lip.north);
    assert.ok(height !== undefined, 'the open centre has continuous foot support in either direction');
    assert.equal(road.fenceBlocks(east, road.lip.north, height, .27), false);
  }
});
