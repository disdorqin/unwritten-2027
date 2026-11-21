import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstancedMesh, MeshStandardMaterial } from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterStoryDressing } from '../tools/voxel-tavern/town-blockout/town-za36-crater-story-dressing';
import { surveyZa31CraterWinch } from '../tools/voxel-tavern/town-blockout/town-za31-crater-winch';

test('ZA-36 adds clustered crater traces off the real spiral, preserves shaft and stone approach', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const built = buildZa36CraterStoryDressing(road);
  const { placements, group } = built;
  assert.equal(group.name, 'za36-crater-story-dressing');
  assert.ok(placements.length >= 210, 'add meaningful details without removing ZA-31 pieces');
  assert.equal(group.children.length, 12, 'batch the additional content, do not create hundreds of draws');
  for (const mesh of group.children as InstancedMesh[]) {
    assert.ok(mesh.isInstancedMesh && mesh.count > 0);
    assert.ok(mesh.boundingSphere && mesh.boundingSphere.radius > 0);
    const mat = mesh.material as MeshStandardMaterial;
    if (mat.map) {
      const image = mat.map.image as { width: number; height: number };
      assert.equal(image.width, 16);
      assert.equal(image.height, 16);
    }
  }
  assert.ok(new Set(placements.map(p => p.kind)).size >= 5, 'black stone, timber, rust, snow char, ice');
  for (const [band, min, groups] of [
    ['rim', 55, 14], ['trail', 125, 27], ['floor', 20, 11],
  ] as const) {
    const subset = placements.filter(p => p.band === band);
    assert.ok(subset.length >= min, band + ' items ' + subset.length);
    assert.ok(new Set(subset.map(p => p.cluster)).size >= groups, band + ' clusters');
  }
  const fixture = createMeteorCrater(meteorCraterFixturePlan);
  const c = Math.cos(road.anchor.yaw), s = Math.sin(road.anchor.yaw);
  const route = Array.from({ length: 1201 }, (_, i) => {
    const p = fixture.mainTrailPoint(i / 1200);
    return { east: road.anchor.east + p.east * c + p.north * s,
      north: road.anchor.north + p.north * c - p.east * s };
  });
  // Quantitative proximity coverage along the entire signed-off spiral.
  // This is a conservative flat-distance proxy, not a claim of GPU visibility.
  const trailPieces = placements.filter(piece => piece.band === 'trail');
  let routeLength = 0;
  let maxNearestCluster = 0;
  for (const [index, position] of route.entries()) {
    if (index > 0) {
      const last = route[index - 1]!;
      routeLength += Math.hypot(position.east - last.east, position.north - last.north);
    }
    const nearest = Math.min(...trailPieces.map(piece =>
      Math.hypot(piece.east - position.east, piece.north - position.north)));
    maxNearestCluster = Math.max(maxNearestCluster, nearest);
  }
  assert.ok(routeLength > 820 && routeLength < 832, `spiral length ${routeLength}`);
  assert.ok(maxNearestCluster < 21, `largest bare trail gap ${maxNearestCluster}m`);
  assert.equal(new Set(trailPieces.map(piece => piece.cluster)).size, 28);
  const survey = surveyZa31CraterWinch(road);
  assert.ok(survey, 'existing winch needs to remain the unique interactable machine');
  for (const piece of placements) {
    assert.equal(piece.height, road.heightAt(piece.east, piece.north), piece.cluster);
    assert.ok(Math.hypot(piece.east - road.anchor.east, piece.north - road.anchor.north) >= 8);
    assert.ok(Math.hypot(piece.east - road.lip.east, piece.north - road.lip.north) >= 9.8);
    assert.ok(route.every(point => Math.hypot(point.east - piece.east, point.north - piece.north) > 2.95),
      piece.cluster + ' encroaches on the walk');
    assert.ok(Math.hypot(piece.east - survey.snakeStoneReservation.east,
      piece.north - survey.snakeStoneReservation.north) > survey.snakeStoneReservation.radius + .54);
    assert.ok(Math.hypot(piece.east - survey.useFoot.east, piece.north - survey.useFoot.north) > 1.44);
  }
  assert.ok(road.group.getObjectByName('za36-crater-story-dressing'), 'mounted in the default west-domain owner');
});
