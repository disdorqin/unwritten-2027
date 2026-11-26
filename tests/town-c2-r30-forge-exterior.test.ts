import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight } from 'three';
import {
  c2R30ForgeExteriorBoxAllowed, c2R30ForgeExteriorFixtureSite,
  c2R30ForgeExteriorPalette, c2R30ForgeExteriorPlan,
  mountTownC2R30ForgeExterior,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-forge-exterior.js';

test('C2 R09 builds the high gate, anvil stock, quench edge, charcoal and tool wall outside the forge hall', () => {
  const pieces = c2R30ForgeExteriorPlan();
  assert.ok(Object.isFrozen(pieces));
  assert.ok(pieces.length > 80);
  for (const role of ['portal', 'step', 'anvil', 'stock', 'quench', 'charcoal', 'tool-rack', 'paving', 'rubble', 'seam']) {
    assert.ok(pieces.some(piece => piece.role === role), `missing ${role}`);
  }
  for (const zone of ['gate', 'workyard', 'quench', 'tool-wall', 'street']) {
    assert.ok(pieces.some(piece => piece.zone === zone), `missing ${zone}`);
  }
  assert.ok(pieces.filter(piece => piece.role === 'portal').length >= 16);
  assert.ok(pieces.filter(piece => piece.role === 'anvil').length >= 8);
  assert.ok(pieces.filter(piece => piece.role === 'quench').length >= 6);
  assert.ok(pieces.filter(piece => piece.role === 'charcoal').length >= 7);
  assert.ok(pieces.every(piece => Object.isFrozen(piece)));
});

test('C2 R09 keeps the certified forge approach and gate centre walkable', () => {
  for (const piece of c2R30ForgeExteriorPlan()) {
    assert.equal(c2R30ForgeExteriorBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.ok(piece.y >= 0 && piece.y + piece.h <= 4.5);
  }
  assert.equal(c2R30ForgeExteriorBoxAllowed({
    id: 'path-block', zone: 'workyard', role: 'anvil', family: 'moon-metal',
    e: 142, y: 0, n: 3, w: 1, h: 1.8, d: 1, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30ForgeExteriorBoxAllowed({
    id: 'overhead-lintel', zone: 'gate', role: 'portal', family: 'ancient-stone',
    e: 142, y: 3.86, n: 4.0, w: 4.2, h: .5, d: .9, solid: true, emitter: false,
  }), true);

  const exterior = mountTownC2R30ForgeExterior();
  try {
    for (let n = 1.9; n <= 4.3; n += .1) {
      assert.equal(exterior.canStand(142, n), true, `approach blocked at n=${n.toFixed(1)}`);
    }
    assert.equal(exterior.blocks(142, 1.55), false, 'host collision overlay must not invent an edge wall');
    assert.equal(exterior.canStand(140.35, 2.62), false, 'anvil stand must be solid');
    assert.equal(exterior.blocks(140.35, 2.62), true);
    assert.equal(exterior.canStand(143.52, 3.02), false, 'quench trough must be solid');
    assert.equal(exterior.canStand(138, 3), false, 'outside the authored apron is unsupported');
  } finally {
    exterior.dispose();
  }
});

test('C2 R09 stays hidden and unregistered until the host certifies its site', () => {
  const parent = new Group();
  const local = mountTownC2R30ForgeExterior({ parent });
  try {
    assert.equal(local.group.parent, parent);
    assert.equal(local.group.visible, false);
    assert.equal(local.stats().siteCertified, false);
    assert.equal(local.stats().worldAnchor, false);
    assert.equal(local.stats().registrationChanges, 0);
    assert.equal(local.stats().interactionSockets, 0);
    assert.equal(local.stats().lootCount, 0);
    assert.equal(local.stats().presenceChanges, 0);
  } finally {
    local.dispose();
  }
  const hosted = mountTownC2R30ForgeExterior({
    site: { ...c2R30ForgeExteriorFixtureSite, domainId: 'host:u10:forge-exterior' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally {
    hosted.dispose();
  }
});

test('C2 R09 uses the nine-colour 16px Nearest Lambert board without real lights or new sockets', () => {
  const exterior = mountTownC2R30ForgeExterior();
  try {
    const stats = exterior.stats();
    assert.equal(Object.keys(c2R30ForgeExteriorPalette).length, 9);
    assert.equal(stats.paletteColorCount, 9);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.realLightCount, 0);
    assert.equal(stats.interactionSockets, 0);
    assert.ok(stats.drawBatchCount <= 9);
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    const meshes: InstancedMesh[] = [];
    exterior.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count, 0), stats.pieceCount);
    for (const family of Object.keys(c2R30ForgeExteriorPalette) as (keyof typeof c2R30ForgeExteriorPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent`);
    }
    for (const mesh of meshes) {
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      const map = mesh.material.map;
      assert.ok(map instanceof DataTexture);
      assert.equal(map.image.width, 16);
      assert.equal(map.image.height, 16);
      assert.equal(map.minFilter, NearestFilter);
      assert.equal(map.magFilter, NearestFilter);
      assert.equal(map.generateMipmaps, false);
    }
    let lights = 0;
    exterior.group.traverse(object => { if (object instanceof PointLight) lights++; });
    assert.equal(lights, 0);
  } finally {
    exterior.dispose();
  }
});

test('C2 R09 dispose is idempotent and releases only its owned GPU resources once', () => {
  const parent = new Group();
  const exterior = mountTownC2R30ForgeExterior({ parent });
  const meshes: InstancedMesh[] = [];
  exterior.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  exterior.dispose();
  exterior.dispose();
  assert.equal(exterior.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(exterior.group.children.length, 0);
  assert.equal(exterior.stats().disposed, true);
  assert.equal(exterior.stats().drawBatchCount, 0);
  assert.equal(counts.geometry, 1);
  assert.equal(counts.mesh, meshes.length);
  assert.ok(counts.material >= 1);
  assert.ok(counts.texture >= 1);
});
