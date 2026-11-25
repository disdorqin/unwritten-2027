import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import {
  mountZa32StreetProps, za32StreetPropClusters, ZA32_PROP_COLLIDERS,
} from '../tools/voxel-tavern/town-blockout/town-za32-street-props.ts';

test('ZA-32 second-wave props mount fully and sit on cleared ground', () => {
  const grid = createTerrainGrid();
  const parent = new Group();
  const mounted = mountZa32StreetProps(parent, (east, north) => grid.heightAt(east, north));
  const total = za32StreetPropClusters.reduce((sum, c) => sum + c.points.length, 0);
  assert.equal(mounted.placed.length, total);
  assert.equal(mounted.colliders.length, total);
  assert.equal(mounted.group.children.length, total);
  for (const cluster of za32StreetPropClusters) {
    for (const point of cluster.points) {
      const radius = ZA32_PROP_COLLIDERS[point.kind];
      assert.equal(extensionStreetClearance(point.east, point.north, radius), false,
        `${cluster.id} ${point.kind} at ${point.east},${point.north} hits street clearance`);
      assert.equal(isWater(point.east, point.north), false);
      assert.notEqual(grid.surfaces[Math.round(point.north) * grid.gridWidth + Math.round(point.east)], 4,
        `${cluster.id} ${point.kind} sits on a type-4 surface`);
    }
  }
  mounted.dispose();
  assert.equal(parent.children.length, 0);
});
