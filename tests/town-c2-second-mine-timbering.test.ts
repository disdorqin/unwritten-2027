import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FrontSide, Group, InstancedMesh, Mesh, MeshLambertMaterial, NearestFilter,
  StaticDrawUsage, type EventDispatcher,
} from 'three';
import {
  buildTownC2SecondMineTimbering,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-timbering.js';
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
    found.add(object);
    found.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      found.add(material);
      const map = (material as MeshLambertMaterial).map;
      if (map) found.add(map);
    }
  });
  return found;
}

test('C2 timbering builds sixteen complete edge frames with voxel courses and iron fastenings', () => {
  const scene = buildTownC2SecondMineTimbering();
  try {
    assert.equal(scene.group.position.length(), 0);
    assert.equal(scene.group.rotation.y, 0);
    assert.equal(scene.stats.coordinateFrame, 'east-up-north');
    assert.equal(scene.stats.supportCount, 16);
    assert.equal(scene.stats.postCount, 32);
    assert.equal(scene.stats.postBlockCount, 256);
    assert.equal(scene.stats.beamCount, 25);
    assert.equal(scene.stats.braceCount, 64);
    assert.equal(scene.stats.shoeCount, 32);
    assert.equal(scene.stats.capCount, 32);
    assert.equal(scene.stats.nailCount, 192);
    assert.ok(scene.stats.pieceCount >= 600 && scene.stats.pieceCount <= 680);
    assert.equal(scene.stats.pieceCount, scene.visualBoxes.length);
    assert.equal(scene.stats.guardedEntityCount, scene.visualBoxes.length);
    assert.equal(scene.stats.drawCalls, 3);
    assert.equal(scene.stats.triangles, scene.stats.pieceCount * 12);
    assert.equal(scene.stats.interactive, false);
    assert.ok(scene.stats.bounds.minHeight >= 0);
    assert.ok(scene.stats.bounds.maxHeight < 4.5);
  } finally {
    scene.dispose();
  }
});

test('every timbering AABB passes the shared guard and leaves route, doors and reserved centres clear', () => {
  const scene = buildTownC2SecondMineTimbering();
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
    assert.ok(minimum >= .72 - 1e-9, `main route clearance ${minimum}`);
    for (const door of [{ x: -4, n0: 38, n1: 56 }, { x: 4, n0: 68, n1: 90 }]) {
      for (let north = door.n0; north <= door.n1; north += .25) {
        for (const { box } of scene.visualBoxes) {
          assert.ok(pointBoxDistance(door.x, north, box) >= .72 - 1e-9,
            `door ${door.x}/${north}`);
        }
      }
    }
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

test('timber, iron and rust use distinct 16px Nearest pixel materials', () => {
  const scene = buildTownC2SecondMineTimbering();
  try {
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.length, 3);
    assert.equal(scene.stats.materialFamilies, 3);
    assert.deepEqual(scene.stats.materialFamilyNames, ['timber', 'iron', 'rust']);
    for (const mesh of meshes) {
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      assert.equal(mesh.material.side, FrontSide);
      assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
      const map = mesh.material.map;
      assert.ok(map);
      assert.equal(map.image.width, 16);
      assert.equal(map.image.height, 16);
      assert.equal(map.minFilter, NearestFilter);
      assert.equal(map.magFilter, NearestFilter);
      assert.equal(map.generateMipmaps, false);
    }
  } finally {
    scene.dispose();
  }
});

test('dispose is idempotent and releases only timbering resources', t => {
  const owner = new Group();
  const sentinel = new Group();
  sentinel.name = 'host-child';
  owner.add(sentinel);
  const scene = buildTownC2SecondMineTimbering(owner);
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
  for (const resource of owned) assert.equal(disposed.get(resource), 1);
  t.diagnostic(`${scene.stats.pieceCount} guarded pieces, ${scene.stats.triangles} triangles`);
});
