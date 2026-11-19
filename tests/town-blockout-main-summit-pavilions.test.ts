import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Raycaster, Vector3, type Group, type InstancedMesh, type Mesh } from 'three';
import {
  cloudPavilionDimensions, createCloudPavilion,
} from '../tools/voxel-tavern/town-blockout/main-summit-pavilions.ts';
import { createMainSummitBlock, mainSummitLayout, mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import { cloudPavilionSites, createPlacedCloudPavilion } from '../tools/voxel-tavern/town-blockout/main-summit-pavilion-site.ts';

const bodyRadius = .27;
const tolerance = .01;

function meshParts(group: Group) {
  let parts = 0;
  group.traverse(object => {
    const batch = object as InstancedMesh;
    if (batch.isInstancedMesh) parts += batch.count;
    else if ((object as Mesh).isMesh) parts++;
  });
  return parts;
}

function rayBetween(group: Group, start: Vector3, end: Vector3) {
  const direction = end.clone().sub(start);
  return new Raycaster(start, direction.clone().normalize(), .0001, direction.length())
    .intersectObject(group, true);
}

test('the two cloud pavilions have distinct post and roof structure within their declared decks', () => {
  const lower = createCloudPavilion('lower-cloud');
  const upper = createCloudPavilion('upper-cloud');
  assert.ok(lower.isGroup && upper.isGroup && lower !== upper);
  assert.deepEqual([lower.userData.postCount, lower.userData.roofTiers], [4, 1]);
  assert.deepEqual([upper.userData.postCount, upper.userData.roofTiers], [6, 2]);
  assert.ok(meshParts(upper) > meshParts(lower) && meshParts(lower) > 0);

  const lowerBounds = new Box3().setFromObject(lower).getSize(new Vector3());
  const upperBounds = new Box3().setFromObject(upper).getSize(new Vector3());
  assert.ok(upperBounds.x > lowerBounds.x && upperBounds.z > lowerBounds.z);
  assert.ok(cloudPavilionDimensions['upper-cloud'].width > cloudPavilionDimensions['lower-cloud'].width);
  assert.ok(cloudPavilionDimensions['upper-cloud'].depth > cloudPavilionDimensions['lower-cloud'].depth);
});

test('the registered walk approaches and cloud outlooks are clear in the actual pavilion meshes', t => {
  const terrain = createMainSummitBlock(mainSummitLayout, mainSummitSpec.frontRidgeArrivalBand[0], 100);
  t.after(() => terrain.dispose());
  assert.deepEqual(cloudPavilionSites.map(site => site.id).sort(), ['lower-cloud', 'upper-cloud']);
  for (const site of cloudPavilionSites) {
    const { id, east, north, height, viewEast, viewNorth, approachEast, approachNorth } = site;
    assert.ok([east, north, height, viewEast, viewNorth, approachEast, approachNorth].every(Number.isFinite));
    assert.ok(height >= 380 && height <= 560, `${id} is inside the registered cloud belt`);
    assert.ok(Math.abs(Math.hypot(viewEast, viewNorth) - 1) < tolerance, `${id} has a unit outlook direction`);

    const { width, depth, eyeY } = cloudPavilionDimensions[id];
    const model = createPlacedCloudPavilion(site, terrain.heightAt);
    model.updateMatrixWorld(true);
    const world = (x: number, y: number, z: number) => model.localToWorld(new Vector3(x, y, z));
    const view = world(0, 0, 1).sub(world(0, 0, 0));
    assert.ok(Math.hypot(view.x - viewEast, view.z + viewNorth) < tolerance);
    const approach = new Vector3(approachEast, height, -approachNorth);
    const localApproach = model.worldToLocal(approach.clone());
    assert.ok(localApproach.z < -depth / 2 && Math.abs(localApproach.x) < tolerance,
      `${id} reaches the open back of the pavilion from the registered trail edge`);

    const bridge = model.getObjectByName('trail-approach') as Mesh | undefined;
    assert.ok(bridge?.isMesh, `${id} has an approach board`);
    bridge.geometry.computeBoundingBox();
    const board: Box3 = bridge.geometry.boundingBox!;
    assert.ok(bridge.position.z + board.min.z <= localApproach.z, `${id} board reaches the trail edge`);
    assert.ok(Math.abs(bridge.position.z + board.max.z + depth / 2) < tolerance,
      `${id} board reaches the back of the deck`);
    for (const x of [board.min.x * .8, 0, board.max.x * .8]) {
      const across = (x - board.min.x) / (board.max.x - board.min.x);
      const [left, right] = site.approachEdgeHeights;
      const roadHeight = left + (right - left) * across;
      for (const along of [.01, .99]) {
        const z: number = bridge.position.z + board.min.z + (board.max.z - board.min.z) * along;
        const hit: ReturnType<typeof rayBetween>[number] | undefined =
          rayBetween(model, world(x, .3, z), world(x, -.25, z))[0];
        const expected = roadHeight + (height - roadHeight) * along;
        assert.ok(hit?.object === bridge && Math.abs(hit.point.y - expected) < tolerance,
          `${id} board joins the registered trail crossfall to the level deck`);
      }
    }

    const piers = model.children.filter(object => object.name === 'pavilion-pier') as Mesh[];
    assert.equal(piers.length, 4, `${id} has four ground supports`);
    for (const pier of piers) {
      pier.geometry.computeBoundingBox();
      const { min, max } = pier.geometry.boundingBox!;
      assert.ok(Math.abs(pier.localToWorld(new Vector3(0, max.y, 0)).y - height) < tolerance);
      for (const x of [min.x, max.x]) for (const z of [min.z, max.z]) {
        const foot = pier.localToWorld(new Vector3(x, min.y, z));
        const ground = terrain.heightAt(foot.x, -foot.z);
        assert.ok(ground !== undefined && foot.y <= ground + tolerance && ground <= height + tolerance,
          `${id} stone pier reaches the actual summit terrain`);
      }
    }

    // Probe the deck within the footprint on both sides of the central plank seam.
    for (const x of [-width / 4, -bodyRadius / 2, bodyRadius / 2, width / 4]) {
      for (const section of [-1, 1]) {
        const z = section * depth / 3;
        const support = rayBetween(model, world(x, .45, z), world(x, -.25, z))[0];
        assert.ok(support && Math.abs(support.point.y - height) < tolerance, `${id} deck supports ${x},${z}`);
      }
    }

    for (const side of [-1, 1]) {
      const z = -.9;
      const rail = rayBetween(model, world(0, .97, z), world(side * (width / 2 + .1), .97, z))[0];
      assert.ok(rail && rail.distance > width / 4 && rail.distance <= width / 2 + .1,
        `${id} has a side rail at its ${side < 0 ? 'left' : 'right'} edge`);
    }

    for (const x of [-bodyRadius, 0, bodyRadius]) {
      for (const y of [.3, eyeY]) {
        const trailEdge = world(localApproach.x + x, y, localApproach.z);
        const lookout = world(x, y, depth / 4);
        assert.equal(rayBetween(model, trailEdge, lookout).length, 0, `${id} clears the entrance at ${x},${y}`);
        assert.equal(rayBetween(model, lookout, trailEdge).length, 0, `${id} clears the return at ${x},${y}`);
      }
    }

    const eye = world(0, eyeY, depth / 4);
    for (const x of [-width / 4, 0, width / 4]) {
      assert.equal(rayBetween(model, eye, world(x, eyeY, depth * 2)).length, 0, `${id} clears the outlook ${x}`);
    }
    t.diagnostic(`${id}: E${east.toFixed(3)}/N${north.toFixed(3)}/Y${height.toFixed(3)}, deck ${width}×${depth} m`);
  }
});
