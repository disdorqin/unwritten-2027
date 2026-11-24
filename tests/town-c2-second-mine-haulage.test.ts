import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Group, InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, type EventDispatcher,
} from 'three';
import {
  buildTownC2SecondMineHaulage,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-haulage.js';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';
import {
  secondMineAnchors,
} from '../src/shared/underground-second-mine-layout.js';
import {
  secondMineDrySites,
} from '../src/shared/underground-second-mine-dry-wings.js';

function pointBoxDistance(east: number, north: number, box: C2SecondMineBox) {
  const dx = Math.max(box.x - box.w / 2 - east, 0, east - box.x - box.w / 2);
  const dn = Math.max(box.n - box.d / 2 - north, 0, north - box.n - box.d / 2);
  return Math.hypot(dx, dn);
}

function resources(group: Group) {
  const found = new Set<EventDispatcher>();
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof InstancedMesh) found.add(object);
    found.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      found.add(material);
      const map = (material as MeshStandardMaterial).map;
      if (map) found.add(map);
    }
  });
  return found;
}

test('C2 haulage builds two read-only canonical carts, two buffers and detailed entry sidings', () => {
  const scene = buildTownC2SecondMineHaulage();
  try {
    assert.equal(scene.group.position.length(), 0);
    assert.equal(scene.group.rotation.y, 0);
    assert.equal(scene.group.userData.readOnly, true);
    assert.equal(scene.stats.coordinateFrame, 'east-up-north');
    assert.equal(scene.stats.sidingCount, 2);
    assert.equal(scene.stats.cartCount, 2);
    assert.equal(scene.stats.stopperCount, 2);
    assert.ok(scene.stats.sleeperCount >= 11);
    assert.ok(scene.stats.railPieceCount >= 22);
    assert.ok(scene.stats.debrisPieceCount >= 40);
    assert.ok(scene.stats.detailPieceCount >= 100);
    assert.equal(scene.stats.guardedEntityCount, scene.visualBoxes.length);
    assert.equal(scene.stats.interactive, false);
    assert.equal('setWheelTravel' in scene, false);
    assert.equal('push' in scene, false);
    const cartEnvelopes = scene.visualBoxes.filter(item => item.family === 'static-cart-envelope');
    assert.equal(cartEnvelopes.length, 2);
    assert.ok(cartEnvelopes.every(item => Math.abs(item.box.x) >= 4.6));
    assert.ok(scene.stats.bounds.minHeight >= 0);
    assert.ok(scene.stats.triangles > 1500);
  } finally {
    scene.dispose();
  }
});

test('all siding, debris and whole-cart AABBs pass the guard without reducing protected clearance', () => {
  const scene = buildTownC2SecondMineHaulage();
  try {
    for (const { name, box } of scene.visualBoxes) {
      assert.equal(c2SecondMineBoxAllowed(box), true, name);
    }
    let minimum = Infinity;
    for (let north = 2; north <= 112; north += .25) {
      for (const { box } of scene.visualBoxes) {
        minimum = Math.min(minimum, pointBoxDistance(0, north, box));
      }
    }
    assert.ok(minimum >= .72 - 1e-9, `entry route clearance ${minimum}`);
    for (const centre of [secondMineAnchors.supportCamp, secondMineAnchors.riverCamp,
      secondMineDrySites.workfaceWest, secondMineDrySites.workfaceEast]) {
      for (const { box } of scene.visualBoxes) {
        assert.ok(pointBoxDistance(centre.east, centre.north, box) >= 1.5 - 1e-9,
          `reserved ${centre.east}/${centre.north}`);
      }
    }
  } finally {
    scene.dispose();
  }
});

test('haulage and reused carts expose at least three 16px Nearest material families', () => {
  const scene = buildTownC2SecondMineHaulage();
  try {
    const materials = new Set<MeshStandardMaterial>();
    let meshes = 0;
    scene.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      meshes++;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof MeshStandardMaterial) materials.add(material);
      }
    });
    assert.ok(meshes >= 10);
    assert.ok(materials.size >= 3);
    assert.equal(scene.stats.materialObjects, materials.size);
    assert.equal(scene.stats.materialFamilies, 8);
    assert.equal(scene.stats.materialFamilyNames.length, scene.stats.materialFamilies);
    assert.equal(scene.stats.textureSize, 16);
    for (const material of materials) {
      const map = material.map;
      assert.ok(map);
      assert.equal(map.image.width, 16);
      assert.equal(map.image.height, 16);
      assert.equal(map.minFilter, NearestFilter);
      assert.equal(map.magFilter, NearestFilter);
      assert.equal(map.generateMipmaps, false);
    }
    const instanced = scene.group.getObjectsByProperty('isInstancedMesh', true);
    assert.ok(instanced.length >= 10);
    assert.ok(instanced.every(object => object instanceof InstancedMesh));
  } finally {
    scene.dispose();
  }
});

test('dispose releases carts and siding resources exactly once without touching host children', t => {
  const owner = new Group();
  const sentinel = new Group();
  sentinel.name = 'host-child';
  owner.add(sentinel);
  const scene = buildTownC2SecondMineHaulage(owner);
  assert.equal(scene.group.parent, owner);
  const owned = resources(scene.group);
  const disposed = new Map<EventDispatcher, number>();
  for (const resource of owned) {
    (resource as unknown as { addEventListener(type: 'dispose', listener: () => void): void })
      .addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  }
  scene.dispose();
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.deepEqual(owner.children, [sentinel]);
  for (const resource of owned) {
    const named = resource as EventDispatcher & { name?: string; uuid?: string };
    assert.equal(disposed.get(resource), 1,
      `${resource.constructor.name}/${named.name ?? named.uuid ?? 'unnamed'}`);
  }
  t.diagnostic(`${scene.stats.detailPieceCount} detail pieces, two static carts, ` +
    `${scene.stats.materialFamilies} material families`);
});
