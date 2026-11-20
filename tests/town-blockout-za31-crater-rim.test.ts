import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NearestFilter, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa31CraterRim } from '../tools/voxel-tavern/town-blockout/town-za31-crater-rim';

test('crater dressing uses the live west surface and leaves the road, shaft, and camp clear', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north));
  const surveyedSurface = mountMeteorCraterSurface(road.anchor);
  const trail = Array.from({ length: 1801 }, (_, i) => surveyedSurface.trailPoint(i / 1800));
  const { east, north } = road.anchor;
  const lipBearing = Math.atan2(road.lip.east - east, road.lip.north - north);
  const lamp = trail[540];
  const lampBearing = Math.atan2(lamp.east - east, lamp.north - north);
  const reserved = [{ east: lamp.east + 3.2 * Math.sin(lampBearing), north: lamp.north + 3.2 * Math.cos(lampBearing), radius: .8 }];
  const displaced = buildZa31CraterRim(road).placements.find(piece => piece.band === 'lower');
  assert.ok(displaced);
  reserved.push({ east: displaced.east, north: displaced.north, radius: .8 });
  const { group, placements } = buildZa31CraterRim(road, reserved);

  assert.equal(group.name, 'za31-crater-rim-clusters');
  assert.ok(placements.length >= 270);
  assert.ok(new Set(placements.map(piece => piece.cluster)).size >= 18);
  const fragmentsByDepth = ['rim', 'upper', 'middle', 'lower', 'floor'].map(band =>
    placements.filter(piece => piece.kind === 'rubble' && piece.band === band).length);
  for (let i = 1; i < fragmentsByDepth.length; i++) assert.ok(fragmentsByDepth[i] > fragmentsByDepth[i - 1]);
  for (const kind of ['pine', 'fallen-pine', 'snow']) assert.ok(placements.some(piece => piece.kind === kind));
  const floor = trail.at(-1)!;
  for (const piece of placements) {
    assert.equal(piece.height, road.heightAt(piece.east, piece.north));
    assert.ok(Math.hypot(piece.east - east, piece.north - north) >= 8 + piece.radius);
    assert.ok(Math.hypot(piece.east - road.lip.east, piece.north - road.lip.north) >= 10 + piece.radius);
    assert.ok(reserved.every(footprint => Math.hypot(piece.east - footprint.east, piece.north - footprint.north) >=
      footprint.radius + piece.radius));
    assert.ok(trail.every(point => Math.hypot(piece.east - point.east, piece.north - point.north) >= 2.73 + piece.radius));
    if (piece.band === 'floor') {
      const bearing = Math.atan2(piece.east - east, piece.north - north) - lipBearing;
      assert.ok(Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing))) >= .75);
      const dx = floor.east - east, dn = floor.north - north;
      const progress = Math.min(1, Math.max(0, ((piece.east - east) * dx + (piece.north - north) * dn) / (dx * dx + dn * dn)));
      assert.ok(Math.hypot(piece.east - east - progress * dx, piece.north - north - progress * dn) >= 2.8 + piece.radius);
    }
  }
  assert.equal(group.children.length, 6);
  let triangles = 0;
  for (const child of group.children) {
    const batch = child as InstancedMesh;
    assert.ok(batch.isInstancedMesh && batch.boundingSphere && Number.isFinite(batch.boundingSphere.radius));
    const material = batch.material as MeshStandardMaterial;
    assert.ok(material.isMeshStandardMaterial);
    if (material.map) {
      const { image } = material.map;
      assert.ok(image && typeof image === 'object' && 'width' in image && 'height' in image);
      assert.equal(image.width, 16);
      assert.equal(image.height, 16);
      assert.equal(material.map.minFilter, NearestFilter);
      assert.equal(material.map.magFilter, NearestFilter);
    }
    triangles += (batch.geometry.index?.count ?? batch.geometry.attributes.position.count) / 3 * batch.count;
  }
  assert.ok(triangles < 13_000, `${triangles} instanced triangles`);
});
