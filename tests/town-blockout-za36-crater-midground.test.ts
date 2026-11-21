import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstancedMesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterMidground } from '../tools/voxel-tavern/town-blockout/town-za36-crater-midground';
import { buildZa36CraterEjecta } from '../tools/voxel-tavern/town-blockout/town-za36-crater-ejecta';
import { buildZa36CraterStoryDressing } from '../tools/voxel-tavern/town-blockout/town-za36-crater-story-dressing';
import { mountZa31CraterCamp } from '../tools/voxel-tavern/town-blockout/town-za31-crater-camp';
import { buildZa31CraterRim } from '../tools/voxel-tavern/town-blockout/town-za31-crater-rim';
import { createMeteorCrater, meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater';

test('ZA-36 places three full dead-forest clusters and both lava-column walls off the approved trail', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const camp = mountZa31CraterCamp(road);
  const rim = buildZa31CraterRim(road, camp.placements);
  const story = buildZa36CraterStoryDressing(road);
  const ejecta = buildZa36CraterEjecta(road);
  const reserved = [
    ...rim.placements, ...camp.placements,
    ...story.placements.map(site => ({ east: site.east, north: site.north, radius: .58 })),
    ...ejecta.placements.map(site => ({ east: site.east, north: site.north, radius: site.footprint })),
  ];
  const { placements, group } = buildZa36CraterMidground(road, reserved);
  const trees = placements.filter(site => site.kind === 'dead-pine');
  const fallen = placements.filter(site => site.kind === 'fallen-pine');
  const columns = placements.filter(site => site.kind === 'lava-column');
  assert.equal(trees.length, 36);
  assert.equal(fallen.length, 8);
  assert.equal(columns.length, 14);
  assert.equal(new Set(trees.map(site => site.cluster)).size, 3);
  assert.ok(trees.filter(site => site.height >= 15.5).length >= 3, 'three signature skyline trees');
  assert.deepEqual([...new Set(columns.map(site => site.cluster))].sort(), [
    'impact-melt-wall-1', 'impact-melt-wall-2',
  ]);
  assert.ok(columns.every(site => site.height >= 3 && site.height <= 7));
  assert.equal(group.children.length, 5, 'no hundreds of separate tree/branch meshes');
  const meshes = group.children as InstancedMesh[];
  for (const mesh of meshes) {
    assert.equal(mesh.isInstancedMesh, true);
    assert.ok(mesh.count > 0 && mesh.boundingSphere?.radius);
  }
  const fixture = createMeteorCrater(meteorCraterFixturePlan);
  const c = Math.cos(road.anchor.yaw), s = Math.sin(road.anchor.yaw);
  const route = Array.from({ length: 1501 }, (_, i) => {
    const q = fixture.mainTrailPoint(i / 1500);
    return { east: road.anchor.east + q.east * c + q.north * s,
      north: road.anchor.north + q.north * c - q.east * s };
  });
  for (const item of placements) {
    assert.equal(item.ground, road.heightAt(item.east, item.north));
    assert.ok(item.east >= -234 && item.east <= -8 && item.north >= 9 && item.north <= 525);
    assert.ok(route.every(point => Math.hypot(point.east - item.east,
      point.north - item.north) >= item.radius + 3.22), item.cluster);
    assert.ok(reserved.every(site => Math.hypot(item.east-site.east, item.north-site.north) >=
      item.radius + site.radius * .8), 'cross-stage overlap: ' + item.cluster);
  }
  assert.ok(road.group.getObjectByName('za36-crater-midground'), 'mount belongs to the default west domain');
});
