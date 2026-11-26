import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter,
} from 'three';
import {
  c2R30DomesticBoxAllowed, c2R30DomesticFixtureSite, c2R30DomesticPalette,
  c2R30DomesticPlan, mountTownC2R30Domestic,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-warrior-domestic.js';

test('C2 R02 domestic traces place the three canon household stories', () => {
  const pieces = c2R30DomesticPlan();
  assert.ok(pieces.length > 60);
  assert.equal(Object.isFrozen(pieces), true);
  const roles = new Set(pieces.map(piece => piece.role));
  for (const role of ['table', 'dish', 'chopstick', 'shoe', 'loom', 'cloth', 'seat', 'hearth']) {
    assert.ok(roles.has(role as never), `missing role ${role}`);
  }
  // Exactly one pair of chopsticks; one small shoe plus its dust print; a half-woven bolt.
  assert.equal(pieces.filter(piece => piece.role === 'chopstick').length, 2);
  assert.ok(pieces.filter(piece => piece.role === 'shoe').length >= 3);
  assert.ok(pieces.filter(piece => piece.role === 'cloth' && piece.home === 'unfinished-loom').length > 20);
  for (const home of ['meal', 'child-shoe', 'unfinished-loom']) {
    assert.ok(pieces.some(piece => piece.home === home), `missing home ${home}`);
  }
});

test('C2 R02 each trace stays inside its own accessible home and off the entrance apron', () => {
  for (const piece of c2R30DomesticPlan()) {
    assert.equal(c2R30DomesticBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.y >= 0 && piece.y + piece.h <= 3.3);
    if (piece.solid) assert.ok(Math.abs(piece.n) >= 10.5, `${piece.id} blocks entrance apron`);
  }
  const sample = c2R30DomesticPlan()[0]!;
  assert.equal(c2R30DomesticBoxAllowed({ ...sample, e: 200 }), false, 'outside home rejected');
  assert.equal(c2R30DomesticBoxAllowed({ ...sample, y: 3.2, h: 1 }), false, 'above ceiling rejected');
});

test('C2 R02 domestic prefab is unregistered and hidden until a certified site', () => {
  const parent = new Group();
  const local = mountTownC2R30Domestic({ parent });
  try {
    assert.equal(local.group.parent, parent);
    assert.equal(local.group.visible, false);
    assert.equal(local.group.userData.worldAnchor, false);
    assert.equal(local.stats().worldAnchor, false);
    assert.equal(local.stats().registrationChanges, 0);
    assert.equal(local.stats().lootCount, 0);
    assert.equal(local.stats().presenceChanges, 0);
  } finally { local.dispose(); }

  const hosted = mountTownC2R30Domestic({
    site: { ...c2R30DomesticFixtureSite, domainId: 'host:u10:city' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally { hosted.dispose(); }
});

test('C2 R02 domestic uses the seven-colour 16px Nearest Lambert board', () => {
  const scene = mountTownC2R30Domestic();
  try {
    const stats = scene.stats();
    assert.equal(Object.keys(c2R30DomesticPalette).length, 7);
    assert.equal(stats.paletteColorCount, 7);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 7);
    for (const family of Object.keys(c2R30DomesticPalette) as (keyof typeof c2R30DomesticPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent`);
    }
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count, 0), stats.pieceCount);
    for (const mesh of meshes) {
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      const map = mesh.material.map;
      assert.ok(map instanceof DataTexture);
      assert.equal(map.image.width, 16);
      assert.equal(map.minFilter, NearestFilter);
      assert.equal(map.magFilter, NearestFilter);
      assert.equal(map.generateMipmaps, false);
    }
    assert.equal(stats.colliderCount, scene.colliders.length);
    assert.ok(stats.colliderCount > 0);
  } finally { scene.dispose(); }
});

test('C2 R02 domestic dispose is idempotent and frees owned GPU resources once', () => {
  const parent = new Group();
  const scene = mountTownC2R30Domestic({ parent });
  const meshes: InstancedMesh[] = [];
  scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  scene.dispose();
  scene.dispose();
  assert.equal(scene.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(scene.group.children.length, 0);
  assert.equal(scene.stats().disposed, true);
  assert.equal(scene.stats().drawBatchCount, 0);
  assert.equal(counts.geometry, 1);
  assert.ok(counts.mesh >= 1 && counts.material >= 1 && counts.texture >= 1);
});
