import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight,
} from 'three';
import {
  c2R30VaultBoxAllowed, c2R30VaultFixtureDatum, c2R30VaultFixtureSite,
  c2R30VaultPalette, c2R30VaultPlan, mountTownC2R30VaultApproach,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-vault-approach.js';

test('C2 R03 vault approach builds the dog-stone plinth and two cold braziers', () => {
  const pieces = c2R30VaultPlan();
  assert.ok(pieces.length > 40);
  assert.equal(Object.isFrozen(pieces), true);
  const features = new Set(pieces.map(piece => piece.feature));
  for (const feature of ['dog-plinth', 'cold-brazier-west', 'cold-brazier-east']) {
    assert.ok(features.has(feature as never), `missing ${feature}`);
  }
  // The plinth is centred on the shared zodiac dog-stone base.
  const plinth = pieces.filter(piece => piece.feature === 'dog-plinth' && piece.role === 'plinth');
  assert.ok(plinth.some(piece => Math.abs(piece.e - c2R30VaultFixtureDatum.dogStoneBase.east) < 1e-6 &&
    Math.abs(piece.n - c2R30VaultFixtureDatum.dogStoneBase.north) < 1e-6));
  // No real light or emissive fire: the canon braziers are already cold.
  assert.equal(pieces.some(piece => piece.role === 'ash'), true);
  assert.equal(pieces.filter(piece => piece.feature.startsWith('cold-brazier') &&
    (piece.role === 'brazier' || piece.role === 'ash')).length > 20, true);
});

test('C2 R03 every piece is guarded, off the processional centre and above the floor', () => {
  for (const piece of c2R30VaultPlan()) {
    assert.equal(c2R30VaultBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.n - piece.d / 2 >= 108 && piece.n + piece.d / 2 <= 124);
    assert.ok(piece.y >= 0 && piece.y + piece.h <= 8);
    if (piece.solid) assert.ok(Math.abs(piece.e) - piece.w / 2 >= 1.4, `${piece.id} blocks centre`);
  }
  const sample = c2R30VaultPlan()[0]!;
  assert.equal(c2R30VaultBoxAllowed({ ...sample, n: 200 }), false, 'outside forecourt rejected');
  assert.equal(c2R30VaultBoxAllowed({ ...sample, e: 0, w: 2, solid: true }), false, 'centre-block rejected');
});

test('C2 R03 is unregistered and hidden until an explicit certified site', () => {
  const parent = new Group();
  const local = mountTownC2R30VaultApproach({ parent });
  try {
    assert.equal(local.group.parent, parent);
    assert.equal(local.group.visible, false);
    assert.equal(local.group.userData.worldAnchor, false);
    assert.equal(local.stats().worldAnchor, false);
    assert.equal(local.stats().gateAuthorityChanges, 0);
    assert.equal(local.stats().lootCount, 0);
    assert.equal(local.stats().presenceChanges, 0);
    assert.equal(local.stats().realLightCount, 0);
  } finally { local.dispose(); }

  const hosted = mountTownC2R30VaultApproach({
    site: { ...c2R30VaultFixtureSite, domainId: 'host:u11:palace' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally { hosted.dispose(); }
});

test('C2 R03 uses the five-colour 16px Nearest Lambert board with no real lights', () => {
  const scene = mountTownC2R30VaultApproach();
  try {
    const stats = scene.stats();
    assert.equal(Object.keys(c2R30VaultPalette).length, 5);
    assert.equal(stats.paletteColorCount, 5);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 5);
    for (const family of Object.keys(c2R30VaultPalette) as (keyof typeof c2R30VaultPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent`);
    }
    const meshes: InstancedMesh[] = [];
    scene.group.traverse(object => {
      if (object instanceof InstancedMesh) meshes.push(object);
      assert.equal(object instanceof PointLight, false, 'a real light leaked into the vault');
    });
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
  } finally { scene.dispose(); }
});

test('C2 R03 dispose is idempotent and frees owned GPU resources once', () => {
  const parent = new Group();
  const scene = mountTownC2R30VaultApproach({ parent });
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
