import assert from 'node:assert/strict';
import test from 'node:test';
import type { InstancedMesh } from 'three';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { createMirrorLakeHost } from '../tools/voxel-tavern/town-blockout/mirror-lake-host';
import { mirrorFishingOccupancyRadius, mirrorFishingSites } from '../tools/voxel-tavern/town-blockout/mirror-lake-site';
import { isMirrorLakeIce } from '../src/shared/mirror-lake';

const gradient = { addColorStop() {} };
const surfaceContext = { createRadialGradient: () => gradient, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {} };
function drawFixture<T>(run: () => T) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ getContext: () => surfaceContext }),
  } });
  try { return run(); }
  finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

test('Mirror Lake restores original elevation and surface buffers and selects only measured ice', () => {
  const grid = createTerrainGrid();
  const originalElevation = grid.elevation.slice(), originalSurfaces = grid.surfaces.slice();
  const host = createMirrorLakeHost(grid);
  assert.equal(host.setMounted(false), false);
  assert.equal(drawFixture(() => host.setMounted(true)), true);
  assert.equal(host.exposedSurfaceAt(50, 185), 10);
  assert.equal(host.skatingAt(50, 185, 10), true);
  assert.equal(host.skatingAt(73.65, 185, 10), false);
  assert.equal(host.skatingAt(47.5, 203.1, 11.2), false);
  assert.deepEqual(host.tigerStoneFootpoint, { east: 47.5, north: 203.1, height: 11.2 });
  assert.equal(host.collisionGroups.length, 2);
  let checked = 0;
  for (const site of mirrorFishingSites) {
    for (let degree = 0; degree < 360; degree++) {
      const angle = degree * Math.PI / 180;
      const e = site.x + Math.cos(angle) * mirrorFishingOccupancyRadius;
      const n = site.n + Math.sin(angle) * mirrorFishingOccupancyRadius;
      assert.ok(host.iceAt(e, n) && isMirrorLakeIce(e, n), site.id);
      assert.equal(host.exposedSurfaceAt(e, n), 10);
      checked++;
    }
  }
  assert.equal(checked, 2160);
  for (let n = 25; n <= 110; n++) {
    const start = n * grid.gridWidth + 285, end = start + 115;
    assert.deepEqual(grid.elevation.subarray(start, end), originalElevation.subarray(start, end));
    assert.deepEqual(grid.surfaces.subarray(start, end), originalSurfaces.subarray(start, end));
  }
  assert.equal(host.setMounted(false), true);
  assert.deepEqual(grid.elevation, originalElevation);
  assert.deepEqual(grid.surfaces, originalSurfaces);
  assert.equal(host.group.children.length, 0);
  assert.equal(host.collisionGroups.length, 0);
  assert.equal(host.tigerStoneFootpoint, undefined);
  assert.equal(host.supportAt(26.5, 177.1, 100), -Infinity);
  assert.equal(host.setMounted(true), true);
  host.dispose();
  assert.deepEqual(grid.elevation, originalElevation);
  assert.equal(host.group.children.length, 0);
  assert.equal(host.setMounted(true), false);
});

test('palace-confirmed ice and glow do not use a local season or run when withdrawn', () => {
  const grid = createTerrainGrid();
  const original = grid.heightAt(50, 185);
  const host = createMirrorLakeHost(grid);
  assert.equal(host.setConfirmedConditions(undefined), false);
  assert.equal(host.iceAt(50, 185), false);
  drawFixture(() => host.setConfirmedConditions({ frozen: true, showUnderIceGlow: false }));
  const glow = host.group.getObjectByName('Mirror Lake under-ice glow') as InstancedMesh | undefined;
  assert.ok(glow?.isInstancedMesh);
  assert.equal(glow.visible, false);
  assert.equal(glow.count, 14);
  assert.equal(host.setConfirmedConditions({ frozen: true, showUnderIceGlow: true }), false);
  assert.equal(glow.visible, true);
  assert.equal(host.setConfirmedConditions({ frozen: false, showUnderIceGlow: true }), true);
  assert.equal(glow.visible, false);
  assert.equal(host.iceAt(50, 185), false);
  assert.equal(grid.heightAt(50, 185), original);
  host.dispose();
});
