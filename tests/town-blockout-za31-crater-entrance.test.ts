import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, InstancedMesh, Matrix4, Mesh, NearestFilter, Raycaster, Vector3 } from 'three';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { mountZa29GuardPost } from '../tools/voxel-tavern/town-blockout/town-za29-guard-scenes';

test('ZA-31 notices dress the occupied fence flanks and leave the surveyed ingress and ZA-29 clear', () => {
  const terrain = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => terrain.groundHeightAt(0, n));
  const crater = mountMeteorCraterSurface(road.anchor);
  const guard = mountZa29GuardPost(road.group, 'crater', road.heightAt);
  const entrance = road.group.getObjectByName('za31-crater-entrance');
  assert.ok(entrance, 'the default west road owns the entrance dressing');
  assert.equal(road.group.children.filter(child => child.name === entrance.name).length, 1);
  const radius = .27;
  guard.setDuty({ guardPresent: true, showNightSigns: false });
  road.group.updateMatrixWorld(true);
  try {
    const fence = entrance.getObjectByName('za31-crater-fence-timbers');
    assert.ok(fence instanceof InstancedMesh);
    assert.equal(fence.count, 10);
    assert.equal(fence.material.map.image.width, 16);
    assert.equal(fence.material.map.magFilter, NearestFilter);
    assert.equal(fence.material.map.minFilter, NearestFilter);
    const transform = new Matrix4();
    fence.geometry.computeBoundingBox();
    const timberBounds = Array.from({ length: fence.count }, (_, i) => {
      fence.getMatrixAt(i, transform);
      return fence.geometry.boundingBox!.clone().applyMatrix4(transform);
    });
    const actor = guard.group.getObjectByName('石九斤')!;
    const stage = guard.group.getObjectByName('za29-crater-staging')!;
    const actorBounds = new Box3().setFromObject(actor);
    const stageBounds = new Box3().setFromObject(stage);
    for (const box of timberBounds) {
      for (const east of [box.min.x, box.max.x]) {
        for (const north of [-box.max.z, -box.min.z]) {
          assert.ok(road.fenceBlocks(east, north, box.max.y, .005), 'use existing fence collision');
        }
      }
      assert.equal(box.intersectsBox(actorBounds), false);
      assert.equal(box.intersectsBox(stageBounds), false);
    }

    const corridor = [
      ...Array.from({ length: 40 }, (_, i) => ({ east: road.lip.east + (40 - i) / 4, north: road.lip.north })),
      ...Array.from({ length: 25 }, (_, i) => crater.trailPoint(i / 4000)),
      ...guard.anchors.footprints,
    ];
    for (const { east, north } of corridor) {
      const height = road.heightAt(east, north);
      assert.ok(height !== undefined);
      assert.equal(road.fenceBlocks(east, north, height, radius), false);
      for (const box of timberBounds) {
        const nearEast = Math.max(box.min.x, Math.min(box.max.x, east));
        const nearNorth = Math.max(-box.max.z, Math.min(-box.min.z, north));
        assert.ok(Math.hypot(nearEast - east, nearNorth - north) > radius);
      }
    }

    const eye = new Vector3(road.lip.east + 4, road.lip.height + 1.65, -road.lip.north);
    for (const [name, title] of [['warning', '坑沿松动'], ['closure-notice', '封矿告示']]) {
      const sign = entrance.getObjectByName(`za31-crater-${name}`);
      assert.ok(sign instanceof Mesh);
      assert.equal(sign.userData.text[0], title);
      const towards = sign.getWorldPosition(new Vector3()).sub(eye);
      const [firstHit] = new Raycaster(eye, towards.clone().normalize(), 0, towards.length() + .02)
        .intersectObject(road.group, true);
      assert.equal(firstHit?.object, sign, `${title} must face the normal approach`);
    }
  } finally {
    guard.dispose();
  }
});
