import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, InstancedMesh, Mesh, PointLight, Raycaster, Vector3, type Object3D } from 'three';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import { mountZa29GuardPost } from '../tools/voxel-tavern/town-blockout/town-za29-guard-scenes';

type Foot = readonly [east: number, north: number];
const radius = .27;

function roundTrip(points: readonly Foot[]) {
  const route = [...points, ...points.slice(0, -1).reverse()];
  return route.slice(1).flatMap(([endEast, endNorth], i) => {
    const [east, north] = route[i]!;
    const count = Math.ceil(Math.hypot(endEast - east, endNorth - north) / .12);
    return Array.from({ length: count }, (_, k) => [
      east + (endEast - east) * (k + 1) / count,
      north + (endNorth - north) * (k + 1) / count,
    ] as const);
  });
}

function verifyPosts(parent: Object3D, post: ReturnType<typeof mountZa29GuardPost>, kind: 'mountain' | 'crater', name: string) {
  const named = (suffix: string) => post.group.getObjectByName(`za29-${kind}-${suffix}`)!;
  const actor = post.group.getObjectByName(name) as InstancedMesh;
  const staging = named('staging') as InstancedMesh;
  const ember = named('ember') as InstancedMesh;
  const scuffs = named('empty-post-scuffs') as Mesh;
  const trail = named('soul-footprints') as Mesh;
  assert.ok(actor.isInstancedMesh && actor.count > 22);
  assert.ok(staging.isInstancedMesh && staging.visible && staging.count >= 8);
  const light = ember.children[0] as PointLight;
  assert.ok(light.isPointLight);
  assert.ok(scuffs.isMesh && trail.isMesh && trail.geometry.attributes.position.count === post.anchors.footprints.length * 24);
  assert.equal(post.group.parent, parent);

  function visibility() { return [actor.visible, ember.visible, scuffs.visible, trail.visible]; }
  assert.deepEqual(visibility(), [false, false, false, false]);
  post.setDuty({ guardPresent: true, showNightSigns: false });
  assert.deepEqual(visibility(), [true, true, false, false]);
  post.setDuty({ guardPresent: false, showNightSigns: true });
  assert.deepEqual(visibility(), [false, false, true, true]);
  post.setDuty({ guardPresent: true, showNightSigns: false });
  assert.deepEqual(visibility(), [true, true, false, false]);

  parent.updateMatrixWorld(true);
  const solid = new Box3().setFromObject(actor).union(new Box3().setFromObject(staging));
  assert.equal(actor.getWorldPosition(new Vector3()).x, post.anchors.guard.east);
  assert.equal(actor.getWorldPosition(new Vector3()).y, post.anchors.guard.height);
  assert.equal(actor.getWorldPosition(new Vector3()).z, -post.anchors.guard.north);
  assert.ok(Math.abs(light.getWorldPosition(new Vector3()).y - post.anchors.emptyPost.height - .54) < .001);
  return solid;
}

function assertClear(solid: Box3, east: number, north: number) {
  const e = Math.max(solid.min.x, Math.min(solid.max.x, east));
  const z = Math.max(solid.min.z, Math.min(solid.max.z, -north));
  assert.ok(Math.hypot(east - e, -north - z) > radius, `props overlap the walk at E${east}/N${north}`);
}

test('ZA-29 石九斤 is off the official crater route, with visible sole marks down the surveyed B-01 trail', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const path = mountMeteorCraterSurface(road.anchor);
  const post = mountZa29GuardPost(road.group, 'crater', road.heightAt);
  try {
    const solid = verifyPosts(road.group, post, 'crater', '石九斤');
    assert.equal(post.anchors.guard.height, road.lip.height);
    assert.ok(post.anchors.guard.north > post.anchors.approach.north);
    const belowRim = Array.from({ length: 8 }, (_, i) => path.trailPoint(i / 1000));
    const route: Foot[] = [[-55, 159], [-68.4, 159], ...belowRim.map(({ east, north }) => [east, north] as const)];
    let previousHeight = road.lip.height;
    for (const [east, north] of roundTrip(route)) {
      const y = road.heightAt(east, north);
      assert.ok(y !== undefined && Math.abs(y - previousHeight) < .06, `unwalkable B-01 trail E${east}/N${north}`);
      assert.equal(road.fenceBlocks(east, north, y, radius), false);
      assertClear(solid, east, north);
      previousHeight = y;
    }

    road.group.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    const trace = post.group.getObjectByName('za29-crater-soul-footprints')!;
    for (const { east, north, height } of post.anchors.footprints) {
      assert.equal(road.fenceBlocks(east, north, height, radius), false);
      ray.ray.origin.set(east, height + .5, -north);
      const [mark] = ray.intersectObject(trace);
      const visibleGround = ray.intersectObjects(road.group.children.filter(child => child !== post.group))[0];
      assert.ok(mark && visibleGround && mark.point.y > visibleGround.point.y &&
        Math.abs(visibleGround.point.y - height) < .002, `sole must sit on visible ground at E${east}/N${north}`);
    }
    assert.ok(post.anchors.footprints.at(-1)!.height < road.lip.height - .18);
  } finally {
    post.dispose();
  }
  assert.equal(post.group.parent, null);
});

test('ZA-29 赵满仓 is visible before the jamb and clears the real cloud approach and return', () => {
  const epoch = Date.UTC(2026, 0, 1);
  const { legMs } = createZa22NorthRidgeLine(26);
  const terminal = { east: 336, north: 640, height: 347 };
  let now = epoch + 500;
  const cloud = createZa22CloudRoute({
    now: () => now, enterOrExit() {}, view() {},
  });
  cloud.action(za22StationApproach)!.run();
  cloud.update(za22StationApproach);
  now = epoch + Math.ceil(legMs);
  cloud.update(za22StationApproach);
  assert.ok(cloud.active() && !cloud.riding());
  const post = mountZa29GuardPost(cloud.scene, 'mountain', (e, n) => cloud.surfaceAt(e, n, 0));
  try {
    const solid = verifyPosts(cloud.scene, post, 'mountain', '赵满仓');
    assert.equal(post.anchors.guard.height, 347);
    for (const point of [post.anchors.guard, post.anchors.emptyPost, ...post.anchors.footprints]) {
      assert.equal(cloud.blocked(point.east, point.north, point.height, radius, 1.8), false,
        `point inside existing mountain geometry at E${point.east}/N${point.north}`);
    }
    for (let e = solid.min.x; e <= solid.max.x + .1; e += .1) {
      for (let z = solid.min.z; z <= solid.max.z + .1; z += .1) {
        const east = Math.min(solid.max.x, e);
        const north = -Math.min(solid.max.z, z);
        assert.equal(cloud.surfaceAt(east, north, 0), 347);
        assert.equal(cloud.blocked(east, north, 347, .02, 1.95), false);
      }
    }

    const aimedAt = new Vector3(post.anchors.guard.east, 348.66, -post.anchors.guard.north);
    for (const [east, north] of [[312, 663.25], [308, 663.25], [304, 663.25], [300, 663.25], [300, 665.9]]) {
      cloud.updateView({ east, north, height: 347 });
      const meshes: Mesh[] = [];
      cloud.scene.traverseVisible(object => {
      const mesh = object as Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
      const eye = new Vector3(east, 348.62, -north);
      const direction = aimedAt.clone().sub(eye);
      const ray = new Raycaster(eye, direction.clone().normalize(), 0, direction.length() + .25);
      assert.equal(ray.intersectObjects(meshes, false)[0]?.object.name, '赵满仓',
        `guard must be visible before the gate from E${east}/N${north}`);
    }

    const route = [[336, 640], [336, 663.25], [300, 663.25], [300, 676], [300, 696], [300, 683], [307.25, 683]] as const;
    let [previousEast, previousNorth]: Foot = route[0];
    let previousHeight = 347;
    for (const [east, north] of roundTrip(route)) {
      const y = cloud.surfaceAt(east, north, radius);
      assert.ok(y !== undefined && Math.abs(y - previousHeight) < .03);
      assert.equal(cloud.blocked(east, north, y, radius, 1.8), false);
      assert.equal(cloud.acceptsStep(previousEast, previousNorth, east, north, radius), true);
      assertClear(solid, east, north);
      [previousEast, previousNorth, previousHeight] = [east, north, y];
    }
  } finally {
    post.dispose();
    cloud.action(terminal)!.run();
    cloud.update(terminal);
    now = epoch + Math.ceil(2 * legMs);
    cloud.update(terminal);
  }
  assert.equal(post.group.parent, null);
  assert.equal(cloud.active(), false);
});
