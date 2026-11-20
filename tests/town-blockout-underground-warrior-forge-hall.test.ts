import assert from 'node:assert/strict';
import test from 'node:test';
import type { Mesh, MeshStandardMaterial } from 'three';
import { createWarriorForgeHall } from '../tools/voxel-tavern/town-blockout/underground-warrior-forge-hall.ts';

test('the rear main street and forge share a level door approach and three reachable interaction feet', () => {
  const hall = createWarriorForgeHall();
  try {
    assert.deepEqual(hall.entry, { east: 142, north: 4.9, height: -165 });
    const aisle = { east: 142, north: 8.8 };
    for (const [from, to] of [[hall.entry, aisle], ...Object.values(hall.stand).map(to => [aisle, to])] as const) {
      for (let i = 0; i <= 60; i++) {
        const east = from.east + (to.east - from.east) * i / 60;
        const north = from.north + (to.north - from.north) * i / 60;
        assert.equal(hall.floorHeightAt(east, north), -165);
        assert.equal(hall.canStand(east, north), true, `blocked at ${east}/${north}`);
      }
    }
    assert.equal(hall.canStand(145, 4.9), false);
    assert.equal(hall.canStand(140, 10), false);
    assert.equal(hall.canStand(144, 12.13), false);
    assert.equal(hall.floorHeightAt(142, 15), undefined);
    assert.ok(hall.group.getObjectByName('forge-mouth'));
    assert.ok(hall.colliders.length > 10);
  } finally {
    hall.dispose();
  }
});

test('the physical gauge shows supplied heat and bands only while a valid snapshot is present', () => {
  const hall = createWarriorForgeHall();
  try {
    const gauge = hall.group.getObjectByName('forge-heat-gauge');
    assert.ok(gauge);
    assert.equal(gauge.visible, false);
    const readPiece = (name: string) => {
      const mesh = gauge.getObjectByName(`forge-heat-${name}`);
      assert.ok(mesh && 'isMesh' in mesh && mesh.isMesh === true);
      const { material } = mesh as Mesh;
      assert.ok(!Array.isArray(material) && material.type === 'MeshStandardMaterial');
      return { mesh, material: material as MeshStandardMaterial };
    };
    const { mesh: cold, material: coldMaterial } = readPiece('cold');
    const { mesh: working, material: workingMaterial } = readPiece('working');
    const { mesh: hot, material: hotMaterial } = readPiece('hot');
    const { mesh: pointer, material: pointerMaterial } = readPiece('indicator');
    const mouth = hall.group.getObjectByName('forge-mouth');
    const bounds = { min: .2, max: .7 };
    hall.updateHeat({ ...bounds, level: .1 });
    assert.equal(gauge.visible, true);
    assert.ok(Math.abs(cold.scale.x / working.scale.x - .4) < 1e-12);
    assert.ok(pointer.position.x < working.position.x);
    assert.ok(pointerMaterial.emissive.equals(coldMaterial.color));

    hall.updateHeat({ ...bounds, level: .45 });
    assert.ok(Math.abs(pointer.position.x - working.position.x) < 1e-12);
    assert.ok(pointerMaterial.emissive.equals(workingMaterial.color));

    hall.updateHeat({ ...bounds, level: 1.5 });
    assert.ok(Math.abs(pointer.position.x - hot.position.x - hot.scale.x / 2) < 1e-12);
    assert.ok(pointerMaterial.emissive.equals(hotMaterial.color));

    hall.updateHeat({ ...bounds, level: NaN });
    assert.equal(gauge.visible, false);
    hall.updateHeat({ min: 0, max: 1, level: .5 });
    assert.equal(cold.visible, false);
    assert.equal(hot.visible, false);
    hall.updateHeat(undefined);
    assert.equal(gauge.visible, false);
    assert.equal(mouth?.visible, true);
  } finally {
    hall.dispose();
  }
});
