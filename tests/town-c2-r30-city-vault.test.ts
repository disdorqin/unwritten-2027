import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight } from 'three';
import {
  c2R30VaultBoxAllowed, c2R30VaultFixtureSite, c2R30VaultFootprint, c2R30VaultLookout,
  c2R30VaultPalette, c2R30VaultPlan, mountTownC2R30CityVault,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-city-vault.js';
import { warriorDistrictStations } from '../src/shared/underground-warrior-district.js';

test('C2 R06 overlook is built on the shared wall-lookout station', () => {
  const station = warriorDistrictStations.find(item => item.id === 'u10/wall-lookout');
  assert.ok(station, 'shared wall-lookout station missing');
  assert.equal(c2R30VaultLookout.id, 'u10/wall-lookout');
  assert.equal(c2R30VaultLookout.foot.east, station!.localFoot[0]);
  assert.equal(c2R30VaultLookout.foot.height, station!.localFoot[1]);
  assert.equal(c2R30VaultLookout.foot.north, station!.localFoot[2]);
  assert.ok(c2R30VaultLookout.foot.height > 6, 'the overlook must sit on the raised wall walk');
});

test('C2 R06 plan builds a vault, ledges, an overlook and three alley roof lines', () => {
  const pieces = c2R30VaultPlan();
  assert.ok(pieces.length > 400, `only ${pieces.length} pieces`);
  assert.equal(Object.isFrozen(pieces), true);
  const zones = new Set(pieces.map(piece => piece.zone));
  for (const zone of ['vault', 'wall', 'formation', 'overlook', 'alley']) {
    assert.ok(zones.has(zone as never), `missing zone ${zone}`);
  }
  const roles = new Set(pieces.map(piece => piece.role));
  for (const role of ['arch', 'course', 'formation', 'deck', 'post', 'rail', 'banner', 'prop', 'roof']) {
    assert.ok(roles.has(role as never), `missing role ${role}`);
  }
  assert.ok(pieces.filter(piece => piece.role === 'arch').length >= 150, 'vault spans too sparse');
  assert.ok(pieces.filter(piece => piece.role === 'formation').length >= 20, 'no hanging formations');
  assert.ok(pieces.filter(piece => piece.role === 'deck').length >= 9, 'overlook deck missing');
  assert.ok(pieces.filter(piece => piece.role === 'roof').length >= 15, 'alley roof lines missing');
});

test('C2 R06 every piece passes the guarded footprint, street and wall-walk rules', () => {
  for (const piece of c2R30VaultPlan()) {
    assert.equal(c2R30VaultBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.e - piece.w / 2 >= c2R30VaultFootprint.minE - 1e-6 &&
      piece.e + piece.w / 2 <= c2R30VaultFootprint.maxE + 1e-6);
    assert.ok(piece.n - piece.d / 2 >= c2R30VaultFootprint.minN - 1e-6 &&
      piece.n + piece.d / 2 <= c2R30VaultFootprint.maxN + 1e-6);
    assert.ok(piece.y >= 0 && piece.y + piece.h <= 19);
    // Nothing solid may hang into the street corridor below the shopfront line.
    if (piece.solid && piece.y < 4.5) {
      assert.ok(piece.n - piece.d / 2 >= 8 || piece.n + piece.d / 2 <= -8,
        `${piece.id} blocks the street corridor`);
    }
    // The shared wall walk may only be met by a flush surface or passed over.
    if (piece.solid && piece.n - piece.d / 2 < 29.6 && piece.n + piece.d / 2 > 24.4) {
      const flush = piece.y + piece.h <= 7.3 + 1e-6;
      const overhead = piece.y >= 9.4;
      assert.ok(flush || overhead, `${piece.id} fouls the wall walk`);
    }
  }
  const sample = c2R30VaultPlan()[0]!;
  assert.equal(c2R30VaultBoxAllowed({ ...sample, e: 200, w: 1 }), false);
  assert.equal(c2R30VaultBoxAllowed({ ...sample, y: 18.9, h: 1 }), false);
  assert.equal(c2R30VaultBoxAllowed({
    id: 'street-block', zone: 'vault', role: 'arch', family: 'rock-mid',
    e: 125, y: 0, n: 0, w: 2, h: 3, d: 2, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30VaultBoxAllowed({
    id: 'walk-block', zone: 'overlook', role: 'post', family: 'timber',
    e: 147, y: 7.12, n: 27, w: .3, h: 2, d: .3, solid: true, emitter: false,
  }), false);
});

test('C2 R06 keeps the street and the shared lookout foot walkable', () => {
  const vault = mountTownC2R30CityVault();
  try {
    assert.equal(vault.canStand(125, 0), true, 'the city main street must stay open');
    assert.equal(vault.canStand(60, 0), true);
    assert.equal(vault.canStand(c2R30VaultLookout.foot.east, c2R30VaultLookout.foot.north,
      c2R30VaultLookout.foot.height), true, 'the shared lookout foot must stay walkable');
    assert.equal(vault.canStand(c2R30VaultLookout.foot.east, 21, c2R30VaultLookout.foot.height),
      false, 'the balcony deck itself is solid');
    assert.equal(vault.canStand(200, 0), false, 'outside the vault footprint is not supported');
  } finally {
    vault.dispose();
  }
});

test('C2 R06 is unregistered, silent and hidden until a host certifies the site', () => {
  const parent = new Group();
  const local = mountTownC2R30CityVault({ parent });
  try {
    assert.equal(local.group.parent, parent);
    assert.equal(local.group.visible, false);
    assert.equal(local.group.userData.worldAnchor, false);
    assert.equal(local.stats().siteCertified, false);
    assert.equal(local.stats().worldAnchor, false);
    assert.equal(local.stats().registrationChanges, 0);
    assert.equal(local.stats().lootCount, 0);
    assert.equal(local.stats().presenceChanges, 0);
    assert.equal(local.stats().realLightCount, 0);
    assert.equal(local.stats().visibleLightCount, 0);
    let lights = 0;
    local.group.traverse(object => { if (object instanceof PointLight) lights++; });
    assert.equal(lights, 0, 'the city shell owns the lamps');
  } finally {
    local.dispose();
  }

  const hosted = mountTownC2R30CityVault({
    site: { ...c2R30VaultFixtureSite, domainId: 'host:u10:warrior-city' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally {
    hosted.dispose();
  }
});

test('C2 R06 uses the nine-colour 16px Nearest Lambert board in instanced batches', () => {
  const vault = mountTownC2R30CityVault();
  try {
    const stats = vault.stats();
    assert.equal(Object.keys(c2R30VaultPalette).length, 9);
    assert.equal(stats.paletteColorCount, 9);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 9);
    for (const family of Object.keys(c2R30VaultPalette) as (keyof typeof c2R30VaultPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent from palette`);
    }
    const meshes: InstancedMesh[] = [];
    vault.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.length, stats.drawBatchCount);
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
  } finally {
    vault.dispose();
  }
});

test('C2 R06 dispose is idempotent and releases only owned GPU resources once', () => {
  const parent = new Group();
  const vault = mountTownC2R30CityVault({ parent });
  const meshes: InstancedMesh[] = [];
  vault.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  vault.dispose();
  vault.dispose();
  assert.equal(vault.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(vault.group.children.length, 0);
  assert.equal(vault.stats().disposed, true);
  assert.equal(vault.stats().drawBatchCount, 0);
  assert.equal(counts.geometry, 1);
  assert.equal(counts.material, 1);
  assert.equal(counts.texture, 1);
  assert.ok(counts.mesh >= 1);
});
