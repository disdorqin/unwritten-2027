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
  const newDressing = crater.group.getObjectByName('za36-crater-story-dressing');
  assert.ok(newDressing);
  let dressingDraws = 0, dressingTriangles = 0;
  newDressing.traverse(node => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    dressingDraws++;
    dressingTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  const mouthWorks = crater.group.getObjectByName('crater-mouth-works');
  assert.ok(mouthWorks, 'crater-mouth works (mainline 1) mounted');
  let mouthDraws = 0, mouthTriangles = 0, mouthLights = 0;
  mouthWorks.traverse(node => {
    if ((node as Light).isLight) mouthLights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    mouthDraws++;
    mouthTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  const outerWorks = crater.group.getObjectByName('crater-outer-works');
  assert.ok(outerWorks, 'crater-outer works (mainline 2) mounted');
  let outerDraws = 0, outerTriangles = 0, outerLights = 0;
  outerWorks.traverse(node => {
    if ((node as Light).isLight) outerLights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    outerDraws++;
    outerTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  assert.equal(draws - dressingDraws - mouthDraws - outerDraws, 46, 'old crater terrain and decor still save 48 ground draw batches');
  assert.equal(triangles - dressingTriangles - mouthTriangles - outerTriangles, 283027, 'baseline terrain, old decor and well polygons unchanged');
  assert.ok(dressingDraws <= 15, 'added story details must stay batched');
  assert.ok(dressingTriangles < 9000, 'keep 200+ extra pieces under a small triangle budget');
  assert.ok(mouthDraws <= 40, 'crater-mouth works stay inside the approved mainline-1 draw budget');
  assert.ok(mouthTriangles <= 60000, 'crater-mouth works stay inside the approved mainline-1 triangle budget');
  assert.equal(mouthLights, 3, 'crater-mouth works add exactly three real light pools');
  assert.ok(outerDraws <= 30, 'crater-outer works stay inside the approved mainline-2 draw budget');
  assert.ok(outerTriangles <= 110000, 'crater-outer works stay inside the approved mainline-2 triangle budget');
  assert.equal(outerLights, 1, 'crater-outer works add exactly one real light pool (the north tower)');
  assert.equal(lights, 7, 'retains all three warm light pools plus the crater-mouth and tower pools');
  for (let n = 10; n < worldBounds.depth - 1; n += 7.5) {
    const oldTownEdge = terrain.groundHeightAt(0, n);
    assert.ok(Math.abs(crater.heightAt(0, n)! - oldTownEdge) < .001, `seam at ${n}`);
    assert.ok(Number.isFinite(crater.heightAt(-200, n)));
  }
});
