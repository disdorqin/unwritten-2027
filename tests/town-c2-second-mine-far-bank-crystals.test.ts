import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  BoxGeometry, Color, FrontSide, Group, InstancedMesh, Light, Material, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, StaticDrawUsage, DataTexture,
} from 'three';
import {
  build, dispose, setNight, stats,
  type FarBankCrystalsScene,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-far-bank-crystals.js';
import { c2SecondMineBoxAllowed } from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';

const scenes: FarBankCrystalsScene[] = [];
after(() => {
  for (const scene of scenes) dispose(scene);
});

function fixture(parent = new Group()) {
  const scene = build(parent);
  scenes.push(scene);
  return { scene, parent };
}

function instanced(scene: FarBankCrystalsScene) {
  return scene.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
}

function material(scene: FarBankCrystalsScene, family: string) {
  const mesh = scene.group.getObjectByName(`c2-second-mine-far-bank-crystals:${family}`);
  assert.ok(mesh instanceof InstancedMesh, family);
  assert.ok(mesh.material instanceof Material, family);
  assert.ok(mesh.material instanceof MeshLambertMaterial, family);
  assert.equal(mesh.material.side, FrontSide, family);
  assert.equal(mesh.material.flatShading, true, family);
  assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage, family);
  return mesh.material;
}

function worldAxisBox(mesh: InstancedMesh, index: number) {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  const e = matrix.elements;
  assert.ok(e.every(Number.isFinite));
  // BoxGeometry spans [-.5,.5]; summing absolute basis columns gives its AABB.
  return {
    x: e[12]!, y: e[13]!, n: -e[14]!,
    w: Math.abs(e[0]!) + Math.abs(e[4]!) + Math.abs(e[8]!),
    h: Math.abs(e[1]!) + Math.abs(e[5]!) + Math.abs(e[9]!),
    d: Math.abs(e[2]!) + Math.abs(e[6]!) + Math.abs(e[10]!),
  };
}

test('C2 -140 far bank adds a denser outer/high-tier instanced crystal landscape', () => {
  const parent = new Group();
  const { scene } = fixture(parent);
  const snapshot = stats(scene);
  assert.equal(parent.children.length, 1);
  assert.equal(scene.group.parent, parent);
  assert.equal(scene.group.position.length(), 0);
  assert.equal(scene.group.rotation.x + scene.group.rotation.y + scene.group.rotation.z, 0);
  assert.equal(snapshot.layer, -140);
  assert.equal(snapshot.band, 'far-bank-outer-strips');
  assert.equal(snapshot.clusterCount, 36);
  assert.equal(snapshot.groundClusterCount, 20);
  assert.equal(snapshot.elevatedClusterCount, 16);
  assert.equal(snapshot.columnCount, 12);
  assert.ok(snapshot.crystalCount > 196, 'more crystals than the existing 28×7 cluster layout');
  assert.equal(snapshot.veinCount, 12);
  assert.equal(snapshot.metalDropCount, 20);
  assert.equal(snapshot.rubbleCount, 72);
  assert.ok(snapshot.pieceCount >= 600);
  assert.deepEqual(snapshot.materialFamilies, ['basalt', 'rubble', 'crystal', 'ore-vein', 'frozen-metal']);
  assert.equal(snapshot.instanceMeshes, 5);
  assert.equal(snapshot.drawCalls, 5);
  assert.equal(snapshot.triangles, snapshot.pieceCount * 12);
  assert.equal(snapshot.lightCount, 0);
  assert.equal(snapshot.colliders, 0);
  assert.equal(snapshot.oreSites, 0);
  assert.equal(snapshot.floorChanges, 0);

  const meshes = instanced(scene);
  assert.equal(meshes.length, 5);
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count, 0), snapshot.pieceCount);
  for (const mesh of meshes) {
    assert.ok(mesh.geometry instanceof BoxGeometry);
    assert.ok(mesh.count > 0);
    assert.ok(mesh.instanceColor);
    assert.equal(mesh.instanceMatrix.usage, StaticDrawUsage);
    assert.ok(mesh.material instanceof Material);
    assert.ok(mesh.material instanceof MeshLambertMaterial);
    assert.equal(mesh.material.side, FrontSide);
    const map = mesh.material.map;
    assert.ok(map instanceof DataTexture);
    assert.equal(map.image.width, 16);
    assert.equal(map.image.height, 16);
    assert.equal(map.minFilter, NearestFilter);
    assert.equal(map.magFilter, NearestFilter);
    assert.equal(map.generateMipmaps, false);
  }
  let lights = 0;
  scene.group.traverse(object => { if (object instanceof Light) lights++; });
  assert.equal(lights, 0, 'cyan ore emission must not introduce lamps');
});

test('C2 -140 far bank keeps cyan self-emission subordinate and metal non-emissive', () => {
  const { scene } = fixture();
  for (const family of ['basalt', 'rubble', 'crystal', 'ore-vein', 'frozen-metal']) {
    assert.equal(material(scene, family).emissiveIntensity, 0, `${family} starts in daylight`);
  }
  assert.equal(material(scene, 'crystal').emissive.getHex(), 0x4b9fa8);
  assert.equal(material(scene, 'ore-vein').emissive.getHex(), 0x4b9fa8);
  assert.equal(material(scene, 'frozen-metal').emissive.getHex(), 0x000000);

  assert.equal(setNight(scene, false).night, false);
  const night = setNight(scene, true);
  setNight(scene, true);
  assert.equal(night.night, true);
  assert.equal(material(scene, 'crystal').emissiveIntensity, .34);
  assert.equal(material(scene, 'ore-vein').emissiveIntensity, .20);
  assert.equal(material(scene, 'basalt').emissiveIntensity, 0);
  assert.equal(material(scene, 'rubble').emissiveIntensity, 0);
  assert.equal(material(scene, 'frozen-metal').emissiveIntensity, 0);
  assert.equal(night.emissiveIntensity, .34);
  assert.ok(night.emissiveIntensity <= .35, 'self-glow is not a light source');

  for (const mesh of instanced(scene)) {
    if (mesh.userData.family === 'crystal' || mesh.userData.family === 'ore-vein') continue;
    const color = new Color();
    for (let index = 0; index < mesh.count; index++) {
      mesh.getColorAt(index, color);
      assert.ok(!(color.g > color.r * 1.12 && color.b > color.r * 1.12),
        `${mesh.userData.family} must not use cyan as decoration`);
    }
  }
  assert.equal(scene.setNight(false).emissiveIntensity, 0);
  assert.equal(scene.setNight(false).emissiveIntensity, 0);
  assert.equal(material(scene, 'crystal').emissiveIntensity, 0);
  assert.equal(material(scene, 'ore-vein').emissiveIntensity, 0);
});

test('C2 -140 far bank keeps every oriented entity in the contract and avoids all 28 old clusters', () => {
  const { scene } = fixture();
  const meshes = instanced(scene);
  for (const mesh of meshes) for (let index = 0; index < mesh.count; index++) {
    const box = worldAxisBox(mesh, index);
    assert.ok(box.x >= 42 || box.x <= -42, `${mesh.name} leaves the outer strips`);
    assert.ok(box.x <= 46 || box.x >= -46, `${mesh.name} leaves the outer strips`);
    assert.ok(box.n - box.d / 2 >= 149 - 1e-7 && box.n + box.d / 2 <= 179 + 1e-7,
      `${mesh.name} leaves N149–179`);
    assert.ok(c2SecondMineBoxAllowed(box), `${mesh.name}#${index} violates the C2 contract`);
    assert.ok(Math.abs(box.x) - box.w / 2 > 5, 'ferry centreline remains empty');
    assert.ok(box.x + box.w / 2 < 48 || box.x - box.w / 2 > 55, 'dry bypass remains empty');
  }

  const snapshot = stats(scene);
  assert.equal(snapshot.clusterSites.length, 36);
  for (const site of snapshot.clusterSites) {
    assert.ok(site.east >= 42 || site.east <= -42);
    assert.ok(site.east <= 46 || site.east >= -46);
    assert.ok(site.north >= 149 && site.north <= 179);
    if (site.tier === 'elevated') assert.ok(site.baseY >= 4.15);
  }
  for (const side of [-1, 1]) for (let index = 0; index < 14; index++) {
    const old = {
      east: side * (11 + (index % 5) * 7.3),
      north: 151 + Math.floor(index / 5) * 11.6,
    };
    assert.ok(!snapshot.clusterSites.some(site => Math.hypot(site.east - old.east,
      site.north - old.north) < 2), `new cluster repeats the old group at ${old.east}/${old.north}`);
  }
  assert.equal(snapshot.colliders, 0);
  assert.equal(snapshot.oreSites, 0);
  assert.equal(snapshot.floorChanges, 0);
});

test('C2 -140 far bank dispose is idempotent and releases only owned GPU resources', () => {
  const parent = new Group();
  const { scene } = fixture(parent);
  const sentinelGeometry = new BoxGeometry(2, 2, 2);
  const sentinelMaterial = new MeshBasicMaterial();
  const sentinel = new Mesh(sentinelGeometry, sentinelMaterial);
  parent.add(sentinel);

  let geometryDisposals = 0;
  let materialDisposals = 0;
  let textureDisposals = 0;
  let sentinelDisposals = 0;
  (scene.group.children[0] as InstancedMesh).geometry.addEventListener('dispose', () => { geometryDisposals++; });
  for (const mesh of instanced(scene)) {
    const ownedMaterial = mesh.material as MeshLambertMaterial;
    ownedMaterial.addEventListener('dispose', () => { materialDisposals++; });
    ownedMaterial.map!.addEventListener('dispose', () => { textureDisposals++; });
  }
  sentinelGeometry.addEventListener('dispose', () => { sentinelDisposals++; });

  dispose(scene);
  dispose(scene);
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(scene.group.children.length, 0);
  assert.deepEqual(parent.children, [sentinel]);
  assert.equal(geometryDisposals, 1, 'the shared cube is disposed once');
  assert.equal(materialDisposals, 5);
  assert.equal(textureDisposals, 5);
  assert.equal(sentinelDisposals, 0, 'host resources survive');
  const snapshot = stats(scene);
  assert.equal(snapshot.disposed, true);
  assert.equal(snapshot.pieceCount, 0);
  assert.equal(snapshot.drawCalls, 0);
  assert.equal(snapshot.clusterSites.length, 0);
  assert.equal(setNight(scene, true).emissiveIntensity, 0);
  sentinelGeometry.dispose();
  sentinelMaterial.dispose();
});
