import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Vector3, type InstancedMesh, type LineSegments } from 'three';
import { createUndergroundOreVein } from '../tools/voxel-tavern/town-blockout/underground-ore-vein';
import type { UndergroundMiningTargetView } from '../src/shared/underground-mining';

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
