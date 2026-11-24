import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeteorCrater, meteorCraterFixturePlan, meteorCraterRimRadius } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterStoryDressing } from '../tools/voxel-tavern/town-blockout/town-za36-crater-story-dressing';
import {
  buildTownC2CraterBrokenCircle, craterBrokenCircleFeatures, craterBrokenCircleSpec,
  craterCollapseWidthAtRadius, createCraterBrokenCircleHeightField,
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

test('批95卡19 exports exactly three collapse fans and five radial gullies', () => {
  assert.deepEqual(collapses.map(feature => feature.bearingDeg), [40, 95, 150]);
  assert.deepEqual(gullies.map(feature => feature.bearingDeg), [65, 125, 200, 255, 320]);
  assert.equal(built.features.length, 8);
  assert.equal(built.group.name, 'town-c2-crater-broken-circle');
  assert.ok(built.group.getObjectByName('town-c2-broken-circle-collapse-voxels'));
  assert.ok(built.group.getObjectByName('town-c2-broken-circle-gully-voxels'));
  assert.ok(built.group.getObjectByName('town-c2-haul-compacted-trace-west'));
  assert.ok(built.group.getObjectByName('town-c2-haul-compacted-trace-east'));
  assert.deepEqual(new Set(built.placements.filter(piece => piece.kind === 'collapse-voxel')
    .map(piece => piece.featureId)), new Set(collapses.map(feature => feature.id)));
  assert.deepEqual(new Set(built.placements.filter(piece => piece.kind === 'gully-voxel')
    .map(piece => piece.featureId)), new Set(gullies.map(feature => feature.id)));
  assert.equal(new Set(built.placements.filter(piece => piece.kind === 'haul-track')
    .map(piece => piece.featureId)).size, 1);
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
