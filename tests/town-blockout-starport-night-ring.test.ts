import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrontSide, Group, Mesh, MeshStandardMaterial, RingGeometry } from 'three';
import { mountStarportNightRing } from '../tools/voxel-tavern/town-blockout/starport-night-ring';
import { createTownChronicleDoorRing } from '../tools/voxel-tavern/town-blockout/town-chronicle-door-ring';

const door = { east: 320, north: 675, height: 347 };

test('the starport mark retains the approved front-facing chronicle ring on the solid door plane', () => {
  const scene = new Group();
  const doorLayer = new Group();
  scene.add(doorLayer);
  const display = mountStarportNightRing(scene, door);
  const ring = scene.getObjectByName('town-chronicle-ring');
  assert.ok(ring instanceof Mesh && ring.geometry instanceof RingGeometry && ring.material instanceof MeshStandardMaterial);
  const original = createTownChronicleDoorRing(.55, .65);
  assert.deepEqual(ring.geometry.parameters, original.geometry.parameters);
  assert.equal(ring.material.color.getHex(), original.material.color.getHex());
  assert.equal(ring.material.roughness, original.material.roughness);
  assert.equal(ring.material.side, FrontSide);
  assert.deepEqual(ring.position.toArray(), [320, 348.31, -674.9]);
  assert.deepEqual(scene.children, [doorLayer, ring]);
  assert.equal(display.snapshot().lit, false);
  display.dispose();
  original.geometry.dispose();
  original.material.dispose();
});

test('only the authoritative overlap flag illuminates the same ring, then it returns to engraved gray-green', () => {
  const scene = new Group();
  const display = mountStarportNightRing(scene, door);
  const ring = scene.getObjectByName('town-chronicle-ring');
  assert.ok(ring instanceof Mesh && ring.material instanceof MeshStandardMaterial);
  const baseColor = ring.material.color.getHex();
  const geometry = ring.geometry;
  for (const [layersOverlap, expected] of [[false, false], [true, true], [true, true], [false, false]] as const) {
    display.apply({ layersOverlap });
    assert.equal(display.snapshot().lit, expected);
    assert.equal(ring.material.emissive.getHex() !== 0, expected);
    assert.equal(ring.material.color.getHex(), baseColor);
    assert.equal(ring.geometry, geometry);
    assert.equal(scene.children.length, 1);
  }
  display.dispose();
});

test('disposing the presentation is idempotent and leaves existing door geometry untouched', () => {
  const scene = new Group();
  const doorLayer = new Group();
  scene.add(doorLayer);
  const display = mountStarportNightRing(scene, door);
  const ring = scene.getObjectByName('town-chronicle-ring');
  assert.ok(ring instanceof Mesh && ring.material instanceof MeshStandardMaterial);
  let geometryReleases = 0;
  let materialReleases = 0;
  ring.geometry.addEventListener('dispose', () => geometryReleases++);
  ring.material.addEventListener('dispose', () => materialReleases++);
  display.apply({ layersOverlap: true });
  display.dispose();
  display.dispose();
  display.apply({ layersOverlap: true });
  assert.deepEqual(scene.children, [doorLayer]);
  assert.equal(display.snapshot().lit, false);
  assert.deepEqual([geometryReleases, materialReleases], [1, 1]);
});
