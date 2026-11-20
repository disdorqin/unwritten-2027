import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { BufferAttribute, BufferGeometry, Group as ThreeGroup, Mesh } from 'three';
import { addTerrainMeshes } from '../tools/voxel-tavern/town-blockout/terrain-mesh';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';

const requireFromViewer = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url));
const { Frustum, Group, Matrix4, PerspectiveCamera } = requireFromViewer('three');

test('walking draws upload only their local slices of the unchanged aerial terrain buffers', () => {
  const grid = createTerrainGrid();
  const scene = new Group();
  const prepare = addTerrainMeshes(scene, grid);
  const camera = new PerspectiveCamera(58, 1000 / 650, .1, 1400);
  camera.position.set(543.6, 11.8934618 + 1.65, -412);
  camera.lookAt(camera.position.x - 1, camera.position.y, camera.position.z);
  camera.updateMatrixWorld(true);

  prepare(543.6, 412, false, false);
  scene.updateMatrixWorld(true);
  const detail = scene.getObjectByName('Walkable terrain') as ThreeGroup;
  const visibleFrustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const visible = detail.children.filter(mesh => visibleFrustum.intersectsObject(mesh));
  const visibleAttributes = new Set(visible.flatMap(mesh =>
    Object.values((mesh as Mesh<BufferGeometry>).geometry.attributes)));
  const walkingUpload = [...visibleAttributes].reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0);
  const total = (grid.gridWidth - 1) * (grid.gridDepth - 1) * 6;
  const aggregateUpload = total * 37;
  assert.ok(detail.visible && visible.length > 0 && visible.length < detail.children.length);
  assert.equal(visibleAttributes.size, visible.length * 4);
  assert.ok(walkingUpload > 0 && walkingUpload < aggregateUpload);

  prepare(543.6, 412, true, false, .55, camera);
  const aerial = scene.getObjectByName('Walkable terrain visible tiles') as Mesh<BufferGeometry>;
  assert.ok(!detail.visible && aerial.visible && aerial.geometry.drawRange.count > 0);
  assert.equal(aerial.geometry.getAttribute('position').count, total);
  let first = 0;
  for (const child of detail.children as Mesh<BufferGeometry>[]) {
    const { geometry } = child;
    const { count } = geometry.drawRange;
    assert.equal(geometry.drawRange.start, 0);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const backing = aerial.geometry.getAttribute(name) as BufferAttribute;
      assert.equal(attribute.count, count);
      assert.equal(attribute.normalized, backing.normalized);
      assert.equal(attribute.array.buffer, backing.array.buffer);
      assert.equal(attribute.array.byteOffset, backing.array.byteOffset +
        first * backing.itemSize * backing.array.BYTES_PER_ELEMENT);
    }
    first += count;
  }
  assert.ok(first <= total);
  assert.equal(aerial.geometry.getAttribute('snowRetention').normalized, true);
  console.log(`A6 camera fixture: ${visible.length} visible chunks, ${walkingUpload} walking attribute bytes vs ${aggregateUpload} aggregate bytes`);
});
