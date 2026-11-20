import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, InstancedMesh, MeshLambertMaterial, Vector3, type LineSegments } from 'three';
import { createUndergroundOreCoreMaterial, createUndergroundOreVein } from '../tools/voxel-tavern/town-blockout/underground-ore-vein';
import type { UndergroundMiningTargetView } from '../src/shared/underground-mining';

test('ore veins and loose cores use the accepted mineral instead of the generic rock palette', () => {
  const palettes = [
    ['ordinary-ore', '80614b', '9a805c', '000000', 'IcosahedronGeometry'],
    ['stardust', 'a97849', 'a97849', '8a481f', 'CylinderGeometry'],
    ['blue-crystal', '758da8', '758da8', '203756', 'CylinderGeometry'],
    ['ordinary-ice-crystal', 'd5e4e1', 'd5e4e1', '334946', 'CylinderGeometry'],
    ['amethyst-cluster', '9979ad', '9979ad', '422651', 'CylinderGeometry'],
    ['moonstone', 'e0dcce', 'e0dcce', '000000', 'IcosahedronGeometry'],
  ] as const;

  for (const [mineral, veinColor, coreColor, glow, shape] of palettes) {
    const target: UndergroundMiningTargetView = {
      id: mineral, kind: 'ore', mineral, at: { layer: 'test-mine', east: 2, north: 3, height: -90 },
      surface: 'rock', strikes: 3, hits: 0, open: false,
    };
    const vein = createUndergroundOreVein({ id: target.id, face: new Vector3(2, -90, -3),
      normal: new Vector3(0, 0, 1), ore: target });
    const core = createUndergroundOreCoreMaterial(mineral);
    try {
      const cluster = vein.group.getObjectByName('ore-cluster');
      assert.ok(cluster instanceof InstancedMesh && cluster.material instanceof MeshLambertMaterial);
      assert.equal(cluster.geometry.type, shape);
      assert.equal(cluster.material.color.getHexString(), veinColor);
      assert.equal(cluster.material.emissive.getHexString(), glow);
      assert.equal(core.color.getHexString(), coreColor);
      assert.equal(core.emissive.getHexString(), glow);
    } finally {
      vein.dispose();
      core.dispose();
    }
  }
});

test('an embedded vein gains cracks, leaves a scar, and regrows on the same registered wall', () => {
  const face = new Vector3(24, -90, -37);
  const normal = new Vector3(1, 0, 0);
  const vein = createUndergroundOreVein({ id: 'mine-wall-ore', face, normal, ore: 'stardust' });
  const parent = new Group();
  parent.add(vein.group);
  assert.ok(vein.group.position.equals(face));
  assert.ok(new Vector3(0, 0, 1).applyQuaternion(vein.group.quaternion).distanceTo(normal) < 1e-6);
  const [cluster, fracture, scar] = vein.group.children;
  assert.equal((cluster as InstancedMesh).count, 5);
  assert.equal(fracture.visible, false);
  const target: UndergroundMiningTargetView = {
    id: 'mine-wall-ore', kind: 'ore', at: { layer: 'mine', east: 24, north: 37, height: -90 },
    surface: 'crystal', strikes: 3, hits: 0, open: false,
  };
  assert.equal(vein.sync({ ...target, id: 'another-wall', hits: 3, open: true }), false);
  assert.equal(cluster.visible, true);
  assert.equal(vein.sync({ ...target, hits: 1 }), true);
  assert.equal(fracture.visible, true);
  const geometry = (fracture as LineSegments).geometry;
  assert.equal(geometry.drawRange.count, 10);
  vein.sync({ ...target, hits: 2 });
  assert.equal(geometry.drawRange.count, 20);
  vein.sync({ ...target, hits: 3, open: true });
  assert.deepEqual([cluster.visible, fracture.visible, scar.visible], [false, false, true]);
  vein.sync(target);
  assert.deepEqual([cluster.visible, fracture.visible, scar.visible], [true, false, false]);
  vein.dispose();
  vein.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(vein.sync(target), false);
});
