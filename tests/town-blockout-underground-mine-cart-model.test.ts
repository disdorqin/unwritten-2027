import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Group, type InstancedMesh, Matrix4, type Mesh, Raycaster, Vector3 } from 'three';
import { createUndergroundMineCartModel } from '../tools/voxel-tavern/town-blockout/underground-mine-cart-model';

test('the mine cart shows a genuinely empty bin, rail-aligned wheels, and a rear push handle', t => {
  const cart = createUndergroundMineCartModel();
  t.after(cart.dispose);
  const box = new Box3().setFromObject(cart.group);
  assert.ok(box.max.x - box.min.x <= 1.12);
  assert.ok(box.max.z - box.min.z > 1.30 && box.max.z - box.min.z < 1.45);
  assert.ok(Math.abs(box.min.y) < 1e-7);
  assert.ok(box.max.z > .78 && box.max.y < .8 && cart.group.children.length <= 7);

  const wheel = cart.group.getObjectByName('mine-cart-four-rail-wheels') as InstancedMesh | undefined;
  assert.ok(wheel?.isInstancedMesh);
  assert.equal(wheel.count, 4);
  const matrix = new Matrix4();
  for (let i = 0; i < wheel.count; i++) {
    wheel.getMatrixAt(i, matrix);
    assert.equal(matrix.elements[12], i % 2 ? .50 : -.50);
    assert.ok(Math.abs(matrix.elements[13]! - .155) < 1e-7);
  }
  const sample = new Raycaster(new Vector3(0, 1.5, 0), new Vector3(0, -1, 0))
    .intersectObject(cart.group, true)[0];
  assert.equal(sample?.object.name, 'mine-cart-open-bin');
  assert.ok(Math.abs(sample!.point.y - .36) < 1e-7);
});

test('wheel travel rolls around the rail axle and cached invalid input leaves the model unchanged', t => {
  const cart = createUndergroundMineCartModel();
  t.after(cart.dispose);
  const wheel = cart.group.getObjectByName('mine-cart-four-rail-wheels') as InstancedMesh | undefined;
  assert.ok(wheel?.isInstancedMesh);
  const matrix = new Matrix4();
  cart.setWheelTravel(Math.PI * .155 / 2);
  wheel.getMatrixAt(0, matrix);
  const forward = new Vector3(0, 1, 0).transformDirection(matrix);
  assert.ok(forward.distanceTo(new Vector3(0, 0, -1)) < 1e-6);
  const frozen = matrix.clone();
  cart.setWheelTravel(NaN);
  wheel.getMatrixAt(0, matrix);
  assert.ok(matrix.equals(frozen));
});

test('disposing the cart removes its scene subtree and releases owned geometry once', () => {
  const cart = createUndergroundMineCartModel();
  const scene = new Group();
  scene.add(cart.group);
  const bin = cart.group.getObjectByName('mine-cart-open-bin') as Mesh | undefined;
  assert.ok(bin?.isMesh);
  let disposeCount = 0;
  bin.geometry.addEventListener('dispose', () => disposeCount++);
  cart.dispose();
  cart.dispose();
  assert.equal(disposeCount, 1);
  assert.equal(scene.children.length, 0);
  assert.equal(cart.group.children.length, 0);
});
