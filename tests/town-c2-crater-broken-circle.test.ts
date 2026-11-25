import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NearestFilter, Raycaster, RepeatWrapping, Vector3, type Group, type Mesh, type MeshLambertMaterial } from 'three';
import { createMeteorCrater, meteorCraterFixturePlan, meteorCraterRimRadius } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterStoryDressing } from '../tools/voxel-tavern/town-blockout/town-za36-crater-story-dressing';
import {
  applyCraterBrokenCircleToWalkMesh, buildTownC2CraterBrokenCircle,
  craterBrokenCircleFeatures, craterBrokenCircleSpec, craterCollapseWidthAtRadius,
  createCraterBrokenCircleHeightField,
} from '../tools/voxel-tavern/town-blockout/town-c2-crater-broken-circle';

const grid = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north));
const oldStory = buildZa36CraterStoryDressing(road);
const oldWorkRing = oldStory.placements.filter(piece => piece.cluster.startsWith('old-work-'));
const built = buildTownC2CraterBrokenCircle(road, { oldWorkPlacements: oldWorkRing });
const field = createCraterBrokenCircleHeightField(road.anchor);
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const collapses = built.features.filter(feature => feature.kind === 'collapse');
const gullies = built.features.filter(feature => feature.kind === 'gully');
const localBearing = (east: number, north: number) =>
  (Math.atan2(east - road.anchor.east, north - road.anchor.north) - road.anchor.yaw + Math.PI * 4) % (Math.PI * 2);
const mounted = road.brokenCircle;

function namedMesh(group: Group, name: string) {
  const mesh = group.getObjectByName(name) as Mesh | undefined;
  assert.ok(mesh?.isMesh, `${name} is absent`);
  return mesh;
}
function rayHeight(mesh: Mesh, east: number, north: number) {
  mesh.updateWorldMatrix(true, false);
  const hit = new Raycaster(
    new Vector3(east, road.anchor.rimHeight + 100, -north),
    new Vector3(0, -1, 0),
  ).intersectObject(mesh, false)[0];
  assert.ok(hit, `no surface below ${east},${north}`);
  return hit.point.y;
}
const baselineFixture = createMeteorCrater(meteorCraterFixturePlan, {
  centralMound: road.centralMound.model,
});
const baselineHeightAt = (east: number, north: number) => {
  const local = field.toLocal(east, north);
  const offset = baselineFixture.heightOffsetAt(local.east, local.north);
  return offset === undefined ? undefined : road.anchor.rimHeight + offset;
};
function walkVertexSample(kind: 'collapse' | 'gully') {
  const positions = namedMesh(road.group, 'meteor-crater-walk-mesh').geometry.getAttribute('position');
  let best: { east: number; north: number; offset: number } | undefined;
  for (let index = 0; index < positions.count; index++) {
    const local = { east: positions.getX(index), north: -positions.getZ(index) };
    if (field.sampleAt(local.east, local.north).kind !== kind) continue;
    const world = field.toWorld(local);
    const offset = mounted.heightOffsetAt(world.east, world.north);
    if (offset === 0 || (best && offset >= best.offset)) continue;
    best = { ...world, offset };
  }
  assert.ok(best, `no cut ${kind} vertex in the original walk mesh`);
  return best;
}

test('批95卡19 exports exactly three collapse fans and five radial gullies', t => {
  assert.deepEqual(collapses.map(feature => feature.bearingDeg), [40, 95, 150]);
  assert.deepEqual(gullies.map(feature => feature.bearingDeg), [65, 125, 200, 255, 320]);
  assert.equal(built.features.length, 8);
  assert.equal(built.group.name, 'town-c2-crater-broken-circle');
  assert.ok(built.group.getObjectByName('town-c2-broken-circle-collapse-voxels'));
  assert.ok(built.group.getObjectByName('town-c2-broken-circle-gully-voxels'));
  assert.ok(built.group.getObjectByName('town-c2-haul-compacted-trace-west'));
  assert.ok(built.group.getObjectByName('town-c2-haul-compacted-trace-east'));
  const skinTriangles = ['collapse', 'gully'].reduce((sum, kind) => {
    const geometry = namedMesh(built.group, `town-c2-broken-circle-${kind}-voxels`).geometry;
    return sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  }, 0);
  assert.equal(skinTriangles, 2382, 'skin refinement must preserve the approved triangle budget');
  assert.deepEqual(new Set(built.placements.filter(piece => piece.kind === 'collapse-voxel')
    .map(piece => piece.featureId)), new Set(collapses.map(feature => feature.id)));
  assert.deepEqual(new Set(built.placements.filter(piece => piece.kind === 'gully-voxel')
    .map(piece => piece.featureId)), new Set(gullies.map(feature => feature.id)));
  assert.equal(new Set(built.placements.filter(piece => piece.kind === 'haul-track')
    .map(piece => piece.featureId)).size, 1);
  t.diagnostic(`${skinTriangles} collapse/gully skin triangles across 2 material batches`);
});

test('voxel skins and haul traces retain four batches while gaining pixel UVs and worn vertex colors', () => {
  const names = [
    'town-c2-broken-circle-collapse-voxels', 'town-c2-broken-circle-gully-voxels',
    'town-c2-haul-compacted-trace-west', 'town-c2-haul-compacted-trace-east',
  ];
  assert.equal(built.group.children.length, 4, 'visual refinement must not add geometry batches');
  for (const name of names) {
    const mesh = namedMesh(built.group, name);
    const material = mesh.material as MeshLambertMaterial;
    const positions = mesh.geometry.getAttribute('position');
    const uvs = mesh.geometry.getAttribute('uv');
    const colors = mesh.geometry.getAttribute('color');
    assert.ok(uvs && colors, `${name} needs mapped pixel grain and instance-like cell variation`);
    assert.equal(uvs.count, positions.count);
    assert.equal(colors.count, positions.count);
    assert.equal(material.vertexColors, true);
    assert.equal(material.dithering, true);
    assert.equal(material.map?.minFilter, NearestFilter);
    assert.equal(material.map?.magFilter, NearestFilter);
    assert.equal(material.map?.wrapS, RepeatWrapping);
    assert.equal(material.map?.wrapT, RepeatWrapping);
    let minUv = Infinity, maxUv = -Infinity, minColor = Infinity, maxColor = -Infinity;
    const colorSteps = new Set<number>();
    for (let index = 0; index < positions.count; index++) {
      for (const value of [uvs.getX(index), uvs.getY(index)]) {
        assert.ok(Number.isFinite(value));
        minUv = Math.min(minUv, value);
        maxUv = Math.max(maxUv, value);
      }
      for (const value of [colors.getX(index), colors.getY(index), colors.getZ(index)]) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1.1);
        minColor = Math.min(minColor, value);
        maxColor = Math.max(maxColor, value);
        colorSteps.add(Math.round(value * 1000));
      }
    }
    assert.ok(maxUv - minUv > 1, `${name} must repeat its texture across the surface`);
    assert.ok(maxColor - minColor > .12 && colorSteps.size > 8,
      `${name} needs visible worn-edge and per-cell shade steps`);
    const pixels = material.map!.image.data as Uint8Array;
    const texelColors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) {
      texelColors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    }
    assert.ok(texelColors.size >= 4, `${name} needs grain, seam, pit and chip texels`);
  }
  for (const side of ['west', 'east']) {
    const geometry = namedMesh(built.group, `town-c2-haul-compacted-trace-${side}`).geometry;
    assert.equal(geometry.index!.count / 3, 360, 'transport trace triangle budget changed');
  }
});

test(' bearings and widths use the live crater centre and clockwise anchor transform', () => {
  assert.equal(road.anchor.east, -120);
  assert.equal(road.anchor.north, 185);
  assert.ok(Math.abs(road.anchor.yaw) > .01, 'exercise a non-identity world transform');
  for (const feature of built.features) {
    const angle = feature.bearingDeg * Math.PI / 180;
    const local = { east: 43 * Math.sin(angle), north: 43 * Math.cos(angle) };
    const world = field.toWorld(local);
    const measured = localBearing(world.east, world.north) * 180 / Math.PI;
    assert.ok(Math.abs(measured - feature.bearingDeg) < 1e-8, `${feature.id}: ${measured}`);
    const roundTrip = field.toLocal(world.east, world.north);
    assert.ok(Math.hypot(roundTrip.east - local.east, roundTrip.north - local.north) < 1e-8);
    if (feature.kind === 'collapse') {
      assert.equal(craterCollapseWidthAtRadius(feature, feature.outerRadius), 20);
      assert.equal(craterCollapseWidthAtRadius(feature, meteorCraterRimRadius), 20);
      let bestRatio = 0, bestSupport = 0, bestExpected = 0;
      for (let radius = 26; radius <= feature.outerRadius; radius += 1) {
        let nearEdge = Infinity, farEdge = -Infinity;
        const expectedWidth = craterCollapseWidthAtRadius(feature, radius);
        for (let lateral = -10; lateral <= 10; lateral += .1) {
          const east = radius * Math.sin(angle) + lateral * Math.cos(angle);
          const north = radius * Math.cos(angle) - lateral * Math.sin(angle);
          // The protected spiral may cut a gap through a cross-section; use
          // the clearest radius rather than mistaking that gap for fan width.
          if (!field.inHaulCorridor({ east, north }) &&
            Math.abs(field.localHeightOffsetAt(east, north)) > 1e-8) {
            nearEdge = Math.min(nearEdge, lateral);
            farEdge = Math.max(farEdge, lateral);
          }
        }
        if (nearEdge === Infinity) continue;
        const support = farEdge - nearEdge;
        const ratio = support / expectedWidth;
        assert.ok(support <= expectedWidth + .001, `${feature.id} exceeds its radial width`);
        if (ratio > bestRatio) { bestRatio = ratio; bestSupport = support; bestExpected = expectedWidth; }
      }
      assert.ok(bestRatio > .6,
        `${feature.id} voxel support ${bestSupport}, expected ${bestExpected}`);
    }
  }
});

test('gully depth never exceeds 1.2 m and remains a shallow continuous cut', () => {
  for (const feature of gullies) {
    const angle = feature.bearingDeg * Math.PI / 180;
    let deepest = 0;
    for (let radius = 21; radius < meteorCraterRimRadius; radius += .5) {
      for (let lateral = -1.3; lateral <= 1.3; lateral += .1) {
        const east = radius * Math.sin(angle) + lateral * Math.cos(angle);
        const north = radius * Math.cos(angle) - lateral * Math.sin(angle);
        const depth = -field.localHeightOffsetAt(east, north);
        assert.ok(depth >= -.000001 && depth <= craterBrokenCircleSpec.gullyMaxDepth + 1e-8,
          `${feature.id} depth ${depth}`);
        deepest = Math.max(deepest, depth);
      }
    }
    assert.ok(deepest > .75, `${feature.id} must read as a gully, deepest=${deepest}`);
  }
});

test('south haul notch keeps the existing descent geometry and adds side traces only', () => {
  for (let index = 0; index <= 400; index++) {
    const point = fixture.mainTrailPoint(index / 400);
    assert.equal(field.localHeightOffsetAt(point.east, point.north), 0);
    const world = field.toWorld(point);
    assert.equal(built.heightOffsetAt(world.east, world.north), 0);
    assert.equal(built.heightAt(world.east, world.north), road.heightAt(world.east, world.north));
  }
  const lip = field.toLocal(road.lip.east, road.lip.north);
  assert.ok(field.inHaulCorridor(lip));
  assert.equal(built.heightAt(road.lip.east, road.lip.north), road.heightAt(road.lip.east, road.lip.north));
  for (const piece of built.placements) {
    const local = field.toLocal(piece.east, piece.north);
    if (piece.kind === 'haul-track') assert.ok(field.inHaulCorridor(local));
    else assert.ok(!field.inHaulCorridor(local), 'no cut/fill voxel is placed in the haul corridor');
  }
  for (const side of ['west', 'east']) {
    const trace = namedMesh(built.group, `town-c2-haul-compacted-trace-${side}`);
    const positions = trace.geometry.getAttribute('position');
    trace.updateWorldMatrix(true, false);
    for (let index = 0; index < positions.count; index += 2) {
      const point = trace.localToWorld(new Vector3(
        (positions.getX(index) + positions.getX(index + 1)) / 2,
        positions.getY(index),
        (positions.getZ(index) + positions.getZ(index + 1)) / 2,
      ));
      const local = field.toLocal(point.x, -point.z);
      assert.ok(field.inHaulCorridor(local), `${side} trace left the existing haul route`);
      assert.ok(Math.abs(point.y - road.heightAt(point.x, -point.z)! - .035) < .002,
        `${side} trace changed the transport-road height`);
    }
  }
  assert.deepEqual(built.colliders, [], 'surface relief and compacted traces introduce no air wall');
});

test('new placements and collider channel keep at least 10 m from the read-only old-work ring', () => {
  assert.equal(oldWorkRing.length, 24);
  assert.ok(built.placements.length > 100, 'material cells remain after reservations');
  for (const piece of built.placements) {
    for (const old of oldWorkRing) {
      const distance = Math.hypot(piece.east - old.east, piece.north - old.north);
      assert.ok(distance >= craterBrokenCircleSpec.oldWorkClearance + piece.footprint - 1e-8,
        `${piece.id} is ${distance.toFixed(2)}m from ${old.cluster}`);
    }
  }
  for (const old of oldWorkRing) {
    assert.equal(built.heightOffsetAt(old.east, old.north), 0,
      'the read-only old-work reservation also suppresses terrain relief');
  }
  assert.equal(built.heightAt(road.anchor.east, road.anchor.north), road.heightAt(road.anchor.east, road.anchor.north));
});

test('the original walk triangles are cut at collapse and gully world vertices with fresh normals and bounds', () => {
  const walk = namedMesh(road.group, 'meteor-crater-walk-mesh');
  assert.ok(walk.geometry.getAttribute('normal'));
  assert.ok(walk.geometry.boundingBox);
  assert.ok(walk.geometry.boundingSphere);
  const neutralMount = mountMeteorCraterSurface(road.anchor);
  const neutralWalk = namedMesh(neutralMount.group, 'meteor-crater-walk-mesh');
  for (const kind of ['collapse', 'gully'] as const) {
    const point = walkVertexSample(kind);
    const expected = road.heightAt(point.east, point.north);
    const neutralLocal = field.toLocal(point.east, point.north);
    const neutralOffset = fixture.heightOffsetAt(neutralLocal.east, neutralLocal.north);
    assert.ok(expected !== undefined && neutralOffset !== undefined);
    const neutralExpected = road.anchor.rimHeight + neutralOffset;
    assert.ok(point.offset <= (kind === 'collapse' ? -3 : -1));
    assert.ok(Math.abs(rayHeight(walk, point.east, point.north) - expected) < .002,
      `${kind} rendered height differs from road.heightAt`);
    assert.ok(Math.abs(rayHeight(neutralWalk, point.east, point.north) - neutralExpected) < .002,
      `${kind} changed the neutral meteor crater`);
    assert.ok(Math.abs(expected - neutralExpected - point.offset) < .002,
      `${kind} does not apply exactly one final offset`);
  }
});

test('voxel skins sit just above the cut surface without lifting the height authority', () => {
  for (const kind of ['collapse', 'gully'] as const) {
    const skin = namedMesh(mounted.group, `town-c2-broken-circle-${kind}-voxels`);
    const material = skin.material as unknown as {
      polygonOffset: boolean; polygonOffsetFactor: number; polygonOffsetUnits: number;
    };
    assert.equal(material.polygonOffset, true);
    assert.ok(material.polygonOffsetFactor < 0 && material.polygonOffsetUnits < 0);
    const placement = mounted.placements.find(piece =>
      piece.kind === `${kind}-voxel` && mounted.heightOffsetAt(piece.east, piece.north) < -.5);
    assert.ok(placement, `no ${kind} skin sample`);
    const authority = road.heightAt(placement.east, placement.north);
    assert.ok(authority !== undefined);
    assert.ok(Math.abs(placement.height - authority) < 1e-8,
      'placement metadata must not contain the visual-only lift');
    assert.ok(Math.abs(rayHeight(skin, placement.east, placement.north) -
      authority - craterBrokenCircleSpec.voxelSkinLift) < .002,
      `${kind} skin is not one small lift above the authoritative surface`);
  }
});

test('the final old-work filter protects both heightAt and the cut mesh while neutral geometry stays untouched', () => {
  const walk = namedMesh(road.group, 'meteor-crater-walk-mesh');
  const baselineMount = mountMeteorCraterSurface(road.anchor, {
    centralMound: road.centralMound.model,
  });
  const baselineWalk = namedMesh(baselineMount.group, 'meteor-crater-walk-mesh');
  for (const old of oldWorkRing) {
    const expected = baselineHeightAt(old.east, old.north);
    const actual = road.heightAt(old.east, old.north);
    assert.ok(expected !== undefined && actual !== undefined);
    assert.equal(mounted.heightOffsetAt(old.east, old.north), 0);
    assert.ok(Math.abs(actual - expected) < 1e-8);
    assert.ok(Math.abs(rayHeight(walk, old.east, old.north) -
      rayHeight(baselineWalk, old.east, old.north)) < .002,
      `${old.cluster} changed height on the rendered walk mesh`);
  }

  // Exercise a reservation overlapping a fan, not only neutral floor pieces.
  const protectedPoint = walkVertexSample('collapse');
  assert.ok(field.heightOffsetAt(protectedPoint.east, protectedPoint.north) < -3);
  const reserved = buildTownC2CraterBrokenCircle(
    { anchor: road.anchor, heightAt: baselineHeightAt },
    { oldWorkPlacements: [protectedPoint] },
  );
  assert.equal(reserved.heightOffsetAt(protectedPoint.east, protectedPoint.north), 0);
  assert.equal(reserved.heightAt(protectedPoint.east, protectedPoint.north),
    baselineHeightAt(protectedPoint.east, protectedPoint.north));
  for (const piece of reserved.placements) {
    assert.ok(Math.hypot(piece.east - protectedPoint.east, piece.north - protectedPoint.north) >=
      craterBrokenCircleSpec.oldWorkClearance + piece.footprint - 1e-8);
  }

  const originalPositions = new Float32Array(baselineWalk.geometry.getAttribute('position').array);
  baselineWalk.geometry.computeBoundingBox();
  const originalBounds = baselineWalk.geometry.boundingBox!.clone();
  const isolated = baselineWalk.clone();
  isolated.geometry = baselineWalk.geometry.clone();
  baselineMount.group.add(isolated);
  applyCraterBrokenCircleToWalkMesh(isolated, road.anchor, reserved.heightOffsetAt);
  assert.deepEqual(new Float32Array(baselineWalk.geometry.getAttribute('position').array), originalPositions,
    'cutting one walk mesh must not mutate a neutral crater mesh');
  assert.ok(isolated.geometry.boundingBox &&
    (isolated.geometry.boundingBox.min.y < originalBounds.min.y - .01 ||
      isolated.geometry.boundingBox.max.y > originalBounds.max.y + .01),
    'the deformed mesh bounds were not recomputed');
  assert.ok(Math.abs(rayHeight(isolated, protectedPoint.east, protectedPoint.north) -
    baselineHeightAt(protectedPoint.east, protectedPoint.north)!) < .002,
    'the reserved world vertex moved despite the final old-work filter');
});
