import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import {
  createNorthRidge350Block, createNorthRidge350NorthernExtension, isNorthRidgeNorthWall, northRidgeCableAnchors, northRidgeFrame,
  northRidgeProfileHeight, sampleNorthRidgeOverTerrain, sampleNorthRidge350,
} from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain.ts';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain.ts';

test('North Ridge terraces honour the three new terrain and station datums', () => {
  assert.deepEqual(northRidgeFrame, { width: 640, depth: 800 });
  assert.equal(northRidgeProfileHeight(320, 270), 18);
  assert.equal(sampleNorthRidge350(320, 650), 350);
  const [, midStation, summitStation] = northRidgeCableAnchors;
  assert.equal(sampleNorthRidge350(...midStation), 140);
  assert.equal(sampleNorthRidge350(...summitStation), 347);
  for (let east = 425; east <= 455; east++) {
    for (let north = 508; north <= 532; north++) {
      assert.equal(sampleNorthRidge350(east, north), 140);
    }
  }
  for (let east = 288; east <= 352; east++) {
    for (let north = 618; north <= 682; north++) {
      const height = sampleNorthRidge350(east, north);
      assert.ok(height >= 347 && height <= 350);
    }
  }
});

test('the reserved north face retains its climbing grade and the south stays on the old terrain', () => {
  const { heightAt } = createTerrainGrid();
  for (let north = 0; north <= 270; north++) {
    for (let east = 0; east <= northRidgeFrame.width; east++) {
      assert.equal(sampleNorthRidgeOverTerrain(heightAt, east, north), heightAt(east, north));
    }
  }
  for (let north = 690; north <= 770; north++) {
    for (let east = 290; east <= 350; east++) {
      assert.ok(isNorthRidgeNorthWall(east, north));
      const dx = (sampleNorthRidge350(east + .01, north) - sampleNorthRidge350(east - .01, north)) / .02;
      const dn = (sampleNorthRidge350(east, north + .01) - sampleNorthRidge350(east, north - .01)) / .02;
      const slope = Math.atan(Math.hypot(dx, dn)) * 180 / Math.PI;
      assert.ok(slope >= 55, `north face E${east}/N${north}, slope ${slope}`);
    }
  }
});

test('the North Ridge geometry builds and disposes independently', () => {
  const scene = new Scene();
  const block = createNorthRidge350Block(() => 18);
  scene.add(block.mesh);
  assert.equal(scene.children.length, 1);
  assert.equal(block.mesh.geometry.boundingBox?.max.x, 640);
  assert.equal(-block.mesh.geometry.boundingBox!.min.z, 800);
  assert.equal(block.mesh.geometry.boundingBox?.max.y, 350);
  let geometryDisposed = 0;
  let materialDisposed = 0;
  block.mesh.geometry.addEventListener('dispose', () => geometryDisposed++);
  block.mesh.material.addEventListener('dispose', () => materialDisposed++);
  block.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
});

test('the northern block reuses the entire legacy edge and owns only new terrain', t => {
  const grid = createTerrainGrid();
  const extension = createNorthRidge350NorthernExtension(grid.heightAt, worldBounds.depth);
  try {
    const position = extension.mesh.geometry.getAttribute('position');
    const { min, max } = extension.mesh.geometry.boundingBox!;
    assert.equal(-max.z, worldBounds.depth);
    assert.equal(-min.z, northRidgeFrame.depth);
    assert.equal(max.y, 350);
    for (let north = 0; north <= worldBounds.depth; north++) {
      for (let east = 0; east <= worldBounds.width; east++) {
        assert.equal(extension.heightAt(east, north), grid.heightAt(east, north));
      }
    }
    for (let i = 0; i < position.count && -position.getZ(i) === worldBounds.depth; i++) {
      assert.equal(position.getY(i), Math.fround(grid.heightAt(position.getX(i), worldBounds.depth)));
    }
    const summit = extension.heightAt(320, 650);
    assert.equal(summit, 350);
    t.diagnostic(JSON.stringify({ legacySamples: grid.elevation.length, edgeNorth: -max.z, endNorth: -min.z,
      vertices: position.count, triangles: extension.mesh.geometry.index!.count / 3, summit }));
  } finally {
    extension.dispose();
  }
});
