import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildMainSummitSnowMesh } from '../tools/voxel-tavern/town-blockout/main-summit-snow-mesh';

test('local tread refinement renders both cuts and fills at the walk surface', () => {
  const original = new BufferGeometry();
  original.setAttribute('position', new Float32BufferAttribute([
    -4, 3, 0, 4, 3, 0, -4, 3, -8, 4, 3, -8,
  ], 3));
  original.setIndex([0, 1, 2, 2, 1, 3]);
  const { geometry, refinedTriangles, treadVertices } = buildMainSummitSnowMesh(original, {
    points: [{ east: 0, north: 0, height: 2 }, { east: 0, north: 8, height: 4 }],
    sampleSurface: (east, north) => Math.abs(east) <= 1.5 ? 2 + north / 4 : undefined,
  });
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  function heightAt(east: number, north: number) {
    ray.ray.origin.set(east, 10, -north);
    return ray.intersectObject(mesh)[0]?.point.y;
  }
  assert.equal(refinedTriangles, 2);
  assert.ok(treadVertices > 2);
  assert.equal(heightAt(0, 2), 2.5);
  assert.equal(heightAt(0, 6), 3.5);
  assert.equal(heightAt(3, 6), 3);
  assert.deepEqual(Array.from(original.getAttribute('position').array), [
    -4, 3, 0, 4, 3, 0, -4, 3, -8, 4, 3, -8,
  ]);
  material.dispose();
  geometry.dispose();
  original.dispose();
});
