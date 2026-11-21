import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Light, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

// Geometric invariants rather than instanceof: the town-blockout package uses
// its own Three.js version and does not share constructors with the root tests.
test('ZA-36 batches sixty surveyed ground tiles into twelve visible-size groups without removing geometry', () => {
  const terrain = createTerrainGrid();
  const crater = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
  const ground = crater.group.children.filter((child): child is Mesh =>
    child.name === 'meteor-crater-west-ground' && (child as Mesh).isMesh);
  assert.equal(ground.length, 12);
  assert.equal(new Set(ground.map(mesh => mesh.userData.groundBatch)).size, 12);
  for (const mesh of ground) {
    assert.ok(mesh.isMesh && mesh.geometry.index && mesh.geometry.boundingSphere);
    assert.ok(mesh.geometry.boundingSphere.radius > 0);
    assert.ok(mesh.geometry.boundingSphere.radius < 150, 'large full-map mesh would disable spatial culling');
    assert.ok(mesh.geometry.index.count > 0);
  }
  let draws = 0, triangles = 0, lights = 0;
  crater.group.traverse(node => {
    if ((node as Light).isLight) lights++;
    if ((node as Mesh).isMesh) {
      const mesh = node as Mesh & { count?: number };
      draws++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
    }
  });
  assert.equal(draws, 46, 'expected 48 less draw batches than ungrouped 94');
  assert.equal(triangles, 283027, 'preserve baseline terrain, decor and well polygons');
  assert.equal(lights, 3, 'retains all three warm light pools');
  for (let n = 10; n < worldBounds.depth - 1; n += 7.5) {
    const oldTownEdge = terrain.groundHeightAt(0, n);
    assert.ok(Math.abs(crater.heightAt(0, n)! - oldTownEdge) < .001, `seam at ${n}`);
    assert.ok(Number.isFinite(crater.heightAt(-200, n)));
  }
});
