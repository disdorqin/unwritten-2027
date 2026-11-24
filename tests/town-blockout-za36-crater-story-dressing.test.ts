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
  assert.equal(group.children.length, 17, 'batch the additional content, do not create hundreds of draws');
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
    const anchorRadius = Math.hypot(piece.east - road.anchor.east, piece.north - road.anchor.north);
    if (piece.cluster === 'shaft-ring') {
      // C3 shaft ring: the one deliberate exception to the r>=8 facility
      // exclusion — flat traces hugging the collar, bearings off the
      // walk-up; the two collar lamps stand a step further out.
      if (piece.kind === 'lamp') {
        assert.ok(anchorRadius >= 5 && anchorRadius <= 5.4, 'collar lamp radius ' + anchorRadius);
      } else {
        assert.ok(anchorRadius >= 2.3 && anchorRadius <= 3.4, 'shaft ring radius ' + anchorRadius);
      }
    } else {
      assert.ok(anchorRadius >= 8);
    }
    assert.ok(Math.hypot(piece.east - road.lip.east, piece.north - road.lip.north) >= 9.8);
    assert.ok(route.every(point => Math.hypot(point.east - piece.east, point.north - piece.north) > 2.95),
      piece.cluster + ' encroaches on the walk');
    assert.ok(Math.hypot(piece.east - survey.snakeStoneReservation.east,
      piece.north - survey.snakeStoneReservation.north) > survey.snakeStoneReservation.radius + .54);
    assert.ok(Math.hypot(piece.east - survey.useFoot.east, piece.north - survey.useFoot.north) > 1.44);
  }
  assert.ok(road.group.getObjectByName('za36-crater-story-dressing'), 'mounted in the default west-domain owner');
});

test('C3 interior density: terrace work faces and the floor ring lift the account', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const { placements } = buildZa36CraterStoryDressing(road);
  const terrace = placements.filter(p => p.band === 'terrace');
  const floor = placements.filter(p => p.band === 'floor');
  // Density account against the certified area table (plan areas):
  // terraces 6,597.3 m2 carry trail+terrace pieces; floor 1,256.6 m2.
  const terraceAll = placements.filter(p => p.band === 'trail' || p.band === 'terrace');
  assert.ok(terraceAll.length / 6597.3 * 100 >= 4.8,
    'terrace density ' + (terraceAll.length / 6597.3 * 100).toFixed(2) + '/100m2');
  assert.ok(floor.length / 1256.6 * 100 >= 5.5,
    'floor density ' + (floor.length / 1256.6 * 100).toFixed(2) + '/100m2');
  assert.ok(terrace.filter(p => p.kind === 'prop').length >= 24, 'shoring props stand');
  assert.ok(terrace.filter(p => p.kind === 'marker').length >= 12, 'survey markers stand');
  assert.ok(new Set(terrace.map(p => p.cluster)).size >= 15, 'workface + frost clusters');
  assert.ok(new Set(floor.map(p => p.cluster)).size >= 18, 'floor clusters incl. ring');
  // The floor ring covers the annulus the old-work ring left bare.
  const ring = floor.filter(p => p.cluster.startsWith('floor-ring'));
  assert.ok(ring.length >= 30);
  for (const piece of ring) {
    const radius = Math.hypot(piece.east - road.anchor.east, piece.north - road.anchor.north);
    assert.ok(radius > 14 && radius < 20.5, 'ring piece at r=' + radius.toFixed(1));
  }
});

test('C3 shaft ring: flat work traces hug the collar outside the walk-up sector', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const { placements } = buildZa36CraterStoryDressing(road);
  const ring = placements.filter(p => p.cluster === 'shaft-ring');
  assert.ok(ring.length >= 5, 'shaft ring landed ' + ring.length);
  const survey = surveyZa31CraterWinch(road);
  assert.ok(survey);
  for (const piece of ring) {
    assert.ok(Math.hypot(piece.east - survey.useFoot.east, piece.north - survey.useFoot.north) >= 2,
      'clear of the winch use foot');
    assert.ok(Math.hypot(piece.east - survey.plinth.east, piece.north - survey.plinth.north) >= 1.8,
      'clear of the plinth');
    assert.ok(piece.kind === 'timber' || piece.kind === 'rust' || piece.kind === 'lamp', 'workface kinds only');
  }
});

test('C3 bands: plate ribbons run per depth third and the warm chain rings the floor', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const { group, placements } = buildZa36CraterStoryDressing(road);
  for (const level of [1, 2, 3]) {
    const band = placements.filter(p => p.cluster === 'band-L' + level);
    assert.ok(band.length >= 40, 'band-L' + level + ' plates ' + band.length);
    assert.ok(band.every(p => p.kind === 'plate'), 'bands are plate skins');
  }
  const plateBatch = group.getObjectByName('za36-dressing-terrace:plate');
  assert.ok(plateBatch && (plateBatch as InstancedMesh).instanceColor,
    'band plates carry per-instance family tints');
  const lamps = placements.filter(p => p.kind === 'lamp');
  assert.ok(lamps.length >= 8, 'warm chain lamps ' + lamps.length);
  assert.ok(lamps.filter(p => p.cluster === 'lamp-chain').length >= 6,
    'floor ring lamps landed');
});
