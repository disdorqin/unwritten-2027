import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Color, FrontSide, Group, InstancedMesh, Mesh, MeshLambertMaterial, NearestFilter,
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

function textureTones(texture: NonNullable<MeshLambertMaterial['map']>) {
  const data = (texture.image as { data: Uint8Array }).data;
  return Array.from({ length: texture.image.width * texture.image.height }, (_, index) => {
    const offset = index * 4;
    return `${data[offset]}/${data[offset + 1]}/${data[offset + 2]}`;
  });
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

test('timbering wear adds five-step pixel grain and deterministic instance colour without new batches', () => {
  const scene = buildTownC2SecondMineTimbering();
  try {
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    const textures = new Set<string>();
    for (const mesh of meshes) {
      assert.ok(mesh.instanceColor);
      assert.equal(mesh.instanceColor.count, mesh.count);
      assert.equal(mesh.instanceColor.usage, StaticDrawUsage);
      const colors = new Set<string>();
      const color = new Color();
      let minimum = Infinity, maximum = -Infinity;
      for (let index = 0; index < mesh.count; index++) {
        color.fromBufferAttribute(mesh.instanceColor, index);
        colors.add([color.r, color.g, color.b].map(value => value.toFixed(3)).join('/'));
        minimum = Math.min(minimum, color.r, color.g, color.b);
        maximum = Math.max(maximum, color.r, color.g, color.b);
      }
      assert.ok(colors.size >= 8, `${mesh.name} must vary piece to piece`);
      assert.ok(minimum >= .65 && maximum <= 1.2, `${mesh.name} tint range`);
      const material = mesh.material as MeshLambertMaterial;
      assert.ok(new Set(textureTones(material.map!)).size >= 5);
      textures.add(Array.from(material.map!.image.data as Uint8Array).join(','));
    }
    assert.equal(textures.size, 3, 'wood, iron and rust retain distinct worn pixel maps');
    assert.equal(scene.stats.drawCalls, 3);
    assert.equal(scene.stats.triangles, scene.stats.pieceCount * 12);
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
