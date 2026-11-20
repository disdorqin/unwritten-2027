import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFlightBoosterVisual,
  createSnowWingVisual,
  flightEquipmentMounts,
} from '../tools/voxel-tavern/town-blockout/flight-equipment-visuals.ts';

type Asset = ReturnType<typeof createSnowWingVisual>;
type Group = Asset['group'];
type Vector = Group['position'];
type Batch = Group & {
  isInstancedMesh: true;
  count: number;
  geometry: {
    getIndex(): { count: number } | null;
    addEventListener(type: 'dispose', listener: () => void): void;
  };
  material: object;
  getMatrixAt(index: number, matrix: Group['matrix']): void;
};

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .000001,
  `Expected ${expected}, measured ${actual}`);

function assetBatch(group: Group) {
  const batch = group.getObjectByName(group.name + '-voxels') as Batch | undefined;
  assert.ok(batch?.isInstancedMesh);
  return batch;
}

function checkEnvelope(group: Group, declaredBounds: Asset['bounds'], expected: readonly [number, number, number]) {
  const measured = declaredBounds.clone().setFromObject(group);
  const size = measured.getSize(group.position.clone());
  size.toArray().forEach((dimension, index) => near(dimension, expected[index]));
  assert.ok(measured.equals(declaredBounds));
  near(measured.min.x, -measured.max.x);
}

function containsVoxel(batch: Batch, point: Vector) {
  const transform = batch.matrix.clone();
  const local = point.clone();
  for (let index = 0; index < batch.count; index++) {
    batch.getMatrixAt(index, transform);
    local.copy(point).applyMatrix4(transform.invert());
    if (Math.max(Math.abs(local.x), Math.abs(local.y), Math.abs(local.z)) <= .5) return true;
  }
  return false;
}

test('the snow wing has a symmetric tapered cloth silhouette and separate pilot grips', t => {
  const wing = createSnowWingVisual();
  t.after(wing.dispose);
  const batch = assetBatch(wing.group);
  checkEnvelope(wing.group, wing.bounds, [3.8, .5835, 1.454]);
  assert.equal(batch.count, 119);
  assert.equal(batch.geometry.getIndex()?.count, 36);
  for (const x of [-1.89, 1.89]) {
    assert.equal(containsVoxel(batch, wing.group.position.clone().set(x, .123, -.30)), true);
    assert.equal(containsVoxel(batch, wing.group.position.clone().set(x, .123, .43)), false);
  }
  const { leftHand, rightHand, boosterBay } = wing.mounts;
  assert.equal(leftHand.position[0], -rightHand.position[0]);
  for (const [name, mount] of Object.entries({ leftHand, rightHand, boosterBay })) {
    const marker = wing.group.getObjectByName('mount:' + name);
    assert.deepEqual(marker?.position.toArray(), mount.position);
    const beamProbe = wing.group.position.clone().fromArray(mount.position);
    beamProbe.y += .001;
    assert.ok(containsVoxel(batch, beamProbe));
  }
  t.diagnostic(`snow wing: ${batch.count} instanced voxels / ${batch.count * 12} triangles`);
});

test('the wingtip trim is recessed from the cloth side faces', t => {
  const wing = createSnowWingVisual();
  t.after(wing.dispose);
  const batch = assetBatch(wing.group);
  const probe = wing.group.position.clone();
  for (const side of [-1, 1]) {
    assert.ok(containsVoxel(batch, probe.set(side * 1.899, .123, -.30)));
    // Probe the leading edge, trailing edge and raised tip trim outside the cloth volume.
    for (const [y, z] of [[.139, .067], [.113, -.775], [.160, -.060]]) {
      assert.ok(containsVoxel(batch, probe.set(side * 1.895, y, z)));
      assert.equal(containsVoxel(batch, probe.set(side * 1.899, y, z)), false);
    }
  }
});

test('the independent booster has two rear apertures and a top socket at the actual fitting face', t => {
  const booster = createFlightBoosterVisual();
  t.after(booster.dispose);
  const batch = assetBatch(booster.group);
  checkEnvelope(booster.group, booster.bounds, [.863, .410, 1.050]);
  assert.equal(batch.count, 42);
  assert.equal(batch.geometry.getIndex()?.count, 36);
  const { leftExhaust, rightExhaust, wingSocket } = booster.mounts;
  near(wingSocket.position[1], booster.bounds.max.y);
  near(leftExhaust.position[2], booster.bounds.min.z);
  near(rightExhaust.position[2], booster.bounds.min.z);
  for (const exhaust of [leftExhaust, rightExhaust]) {
    assert.deepEqual(exhaust.forward, [0, 0, -1]);
    const aperture = booster.group.position.clone().fromArray(exhaust.position);
    assert.equal(containsVoxel(batch, aperture), false);
    aperture.z += .025;
    assert.equal(containsVoxel(batch, aperture), true);
  }
  t.diagnostic(`flight booster: ${batch.count} instanced voxels / ${batch.count * 12} triangles`);
});

test('the registered sockets meet after a real parent transform and leave the exhaust aft of the wing', t => {
  const wing = createSnowWingVisual();
  const booster = createFlightBoosterVisual();
  t.after(wing.dispose);
  t.after(booster.dispose);
  const carrier = wing.group.clone(false);
  carrier.position.set(20, 800, -15);
  carrier.rotation.set(.11, .70, .20);
  carrier.add(wing.group, booster.group);
  booster.group.position.fromArray(wing.mounts.boosterBay.position)
    .sub(wing.group.position.clone().fromArray(booster.mounts.wingSocket.position));
  booster.group.position.toArray().forEach((value, index) => near(value, [0, -.48, -.30][index]));
  carrier.updateMatrixWorld(true);
  const socket = booster.group.getObjectByName('mount:wingSocket')!.getWorldPosition(wing.group.position.clone());
  const cradle = wing.group.getObjectByName('mount:boosterBay')!.getWorldPosition(wing.group.position.clone());
  near(socket.distanceTo(cradle), 0);
  assert.deepEqual(flightEquipmentMounts.snowWing.boosterBay.forward, flightEquipmentMounts.booster.wingSocket.forward);
  const boosterRear = booster.group.position.z + booster.mounts.leftExhaust.position[2];
  assert.ok(boosterRear < wing.bounds.min.z - .10);
});

test('multiple instances own their GPU resources and release only their own group', () => {
  const first = createFlightBoosterVisual();
  const second = createFlightBoosterVisual();
  const carrier = first.group.clone(false);
  carrier.add(first.group, second.group);
  const firstBatch = assetBatch(first.group);
  const secondBatch = assetBatch(second.group);
  assert.notEqual(firstBatch.geometry, secondBatch.geometry);
  assert.notEqual(firstBatch.material, secondBatch.material);
  let geometryDisposals = 0;
  firstBatch.geometry.addEventListener('dispose', () => { geometryDisposals++; });
  first.dispose();
  first.dispose();
  assert.equal(geometryDisposals, 1);
  assert.deepEqual(carrier.children, [second.group]);
  assert.equal(secondBatch.count, 42);
  second.dispose();
  assert.equal(carrier.children.length, 0);
});
