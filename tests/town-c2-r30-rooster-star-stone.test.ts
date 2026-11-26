import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight } from 'three';
import {
  c2R30RoosterBoxAllowed, c2R30RoosterFireReserve, c2R30RoosterFixtureSite,
  c2R30RoosterFootprint, c2R30RoosterPalette, c2R30RoosterPlan, c2R30RoosterZodiac,
  mountTownC2R30RoosterStarStone,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-rooster-star-stone.js';
import { undergroundZodiacSites } from '../src/shared/underground-zodiac-sites.js';

test('C2 R05 rooster court dresses the shared zodiac anchor', () => {
  assert.equal(c2R30RoosterZodiac.id, 'rooster');
  assert.equal(c2R30RoosterZodiac.number, undergroundZodiacSites.rooster.number);
  assert.equal(c2R30RoosterZodiac.scene, 'warrior-city');
  assert.equal(c2R30RoosterZodiac.base.east, undergroundZodiacSites.rooster.base.east);
  assert.equal(c2R30RoosterZodiac.base.north, undergroundZodiacSites.rooster.base.north);
  assert.equal(c2R30RoosterZodiac.stand.north, undergroundZodiacSites.rooster.stand.north);
  assert.equal(c2R30RoosterZodiac.base.height, -165);
});

test('C2 R05 plan is a carved monolith plus a dressed cold-flame court', () => {
  const pieces = c2R30RoosterPlan();
  assert.ok(pieces.length > 120, `only ${pieces.length} pieces`);
  assert.equal(Object.isFrozen(pieces), true);
  const zones = new Set(pieces.map(piece => piece.zone));
  for (const zone of ['stone', 'sigil', 'approach', 'kerb', 'court']) {
    assert.ok(zones.has(zone as never), `missing zone ${zone}`);
  }
  const roles = new Set(pieces.map(piece => piece.role));
  for (const role of ['plinth', 'monolith', 'sigil', 'socket', 'paving', 'kerb', 'seat', 'prop', 'rubble']) {
    assert.ok(roles.has(role as never), `missing role ${role}`);
  }
  assert.ok(pieces.filter(piece => piece.role === 'monolith').length >= 5, 'monolith shaft missing');
  assert.ok(pieces.filter(piece => piece.role === 'sigil').length >= 14, 'rooster relief too sparse');
  assert.ok(pieces.filter(piece => piece.role === 'paving').length >= 40, 'court paving too sparse');
  assert.ok(pieces.filter(piece => piece.emitter).length >= 4, 'no self-lit relief accents');
});

test('C2 R05 every piece passes the guarded footprint, height band and clear zones', () => {
  for (const piece of c2R30RoosterPlan()) {
    assert.equal(c2R30RoosterBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.e - piece.w / 2 >= c2R30RoosterFootprint.minE - 1e-6 &&
      piece.e + piece.w / 2 <= c2R30RoosterFootprint.maxE + 1e-6);
    assert.ok(piece.n - piece.d / 2 >= c2R30RoosterFootprint.minN - 1e-6 &&
      piece.n + piece.d / 2 <= c2R30RoosterFootprint.maxN + 1e-6);
    assert.ok(piece.y >= 0 && piece.y + piece.h <= 3.2);
  }
  // Guard rejects: an outside box, an over-tall box, a blocker on the shared
  // standing foot and a blocker on the registered recovery fire reserve.
  const sample = c2R30RoosterPlan()[0]!;
  assert.equal(c2R30RoosterBoxAllowed({ ...sample, e: 120, w: 1 }), false);
  assert.equal(c2R30RoosterBoxAllowed({ ...sample, y: 3.1, h: 1 }), false);
  assert.equal(c2R30RoosterBoxAllowed({
    id: 'stand-block', zone: 'approach', role: 'prop', family: 'shadow',
    e: c2R30RoosterZodiac.stand.east, y: 0, n: c2R30RoosterZodiac.stand.north,
    w: 1, h: 2, d: 1, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30RoosterBoxAllowed({
    id: 'reserve-block', zone: 'court', role: 'prop', family: 'iron',
    e: c2R30RoosterFireReserve.east, y: 0, n: c2R30RoosterFireReserve.north,
    w: 1, h: 1, d: 1, solid: true, emitter: false,
  }), false);
});

test('C2 R05 the shared standing foot and recovery fire reserve stay walkable', () => {
  const court = mountTownC2R30RoosterStarStone();
  try {
    assert.equal(court.canStand(c2R30RoosterZodiac.stand.east, c2R30RoosterZodiac.stand.north), true,
      'the zodiac standing foot must stay walkable');
    assert.equal(court.canStand(c2R30RoosterFireReserve.east, c2R30RoosterFireReserve.north), true,
      'the registered recovery fire must stay clear');
    assert.equal(court.canStand(c2R30RoosterZodiac.base.east, c2R30RoosterZodiac.base.north), false,
      'the monolith itself must be solid');
    assert.equal(court.canStand(120, -12), false, 'outside the court is not supported');
  } finally {
    court.dispose();
  }
});

test('C2 R05 is unregistered, silent and hidden until a host certifies the site', () => {
  const parent = new Group();
  const local = mountTownC2R30RoosterStarStone({ parent });
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
    assert.equal(lights, 0, 'the city shell owns the cold-flame lamp');
  } finally {
    local.dispose();
  }

  const hosted = mountTownC2R30RoosterStarStone({
    site: { ...c2R30RoosterFixtureSite, domainId: 'host:u10:warrior-city' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally {
    hosted.dispose();
  }
});

test('C2 R05 uses the nine-colour 16px Nearest Lambert board in instanced batches', () => {
  const court = mountTownC2R30RoosterStarStone();
  try {
    const stats = court.stats();
    assert.equal(Object.keys(c2R30RoosterPalette).length, 9);
    assert.equal(stats.paletteColorCount, 9);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 9);
    for (const family of Object.keys(c2R30RoosterPalette) as (keyof typeof c2R30RoosterPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent from palette`);
    }
    const meshes: InstancedMesh[] = [];
    court.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.length, stats.drawBatchCount);
    assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count, 0), stats.pieceCount);
    let colours = 0;
    for (const mesh of meshes) {
      assert.ok(mesh.material instanceof MeshLambertMaterial);
      const map = mesh.material.map;
      assert.ok(map instanceof DataTexture);
      assert.equal(map.image.width, 16);
      assert.equal(map.minFilter, NearestFilter);
      assert.equal(map.magFilter, NearestFilter);
      assert.equal(map.generateMipmaps, false);
      colours += mesh.count;
    }
    assert.equal(colours, stats.pieceCount);
  } finally {
    court.dispose();
  }
});

test('C2 R05 dispose is idempotent and releases only owned GPU resources once', () => {
  const parent = new Group();
  const court = mountTownC2R30RoosterStarStone({ parent });
  const meshes: InstancedMesh[] = [];
  court.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  court.dispose();
  court.dispose();
  assert.equal(court.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(court.group.children.length, 0);
  assert.equal(court.stats().disposed, true);
  assert.equal(court.stats().drawBatchCount, 0);
  assert.equal(counts.geometry, 1);
  assert.equal(counts.material, 1);
  assert.equal(counts.texture, 1);
  assert.ok(counts.mesh >= 1);
});
