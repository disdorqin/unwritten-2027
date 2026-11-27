import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, PointLight } from 'three';
import {
  c2R30TerraceBoxAllowed, c2R30TerraceFixtureSite, c2R30TerraceFootprint,
  c2R30TerracePalette, c2R30TerracePlan, c2R30TerraceRiser,
  c2R30TerraceWaterLevels, mountTownC2R30RiverTerrace,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-river-terrace.js';
import {
  canStandSecondMine, secondMineAnchors, secondMineRiver,
} from '../src/shared/underground-second-mine-layout.js';

test('C2 R07 water levels match the shared mine hydrology', () => {
  assert.equal(c2R30TerraceWaterLevels.high, -.025);
  assert.equal(c2R30TerraceWaterLevels.middle, -.24);
  assert.equal(c2R30TerraceWaterLevels.low, -.7);
  assert.ok(c2R30TerraceWaterLevels.low < c2R30TerraceWaterLevels.middle);
  assert.ok(c2R30TerraceWaterLevels.middle < c2R30TerraceWaterLevels.high);
});

test('C2 R07 the terrace risers follow the shared bed profile', () => {
  const high = c2R30TerraceRiser(c2R30TerraceWaterLevels.high);
  const middle = c2R30TerraceRiser(c2R30TerraceWaterLevels.middle);
  const low = c2R30TerraceRiser(c2R30TerraceWaterLevels.low);
  // Every riser has to sit on the shared slope run, four metres per bank.
  for (const riser of [high, middle, low]) {
    assert.ok(riser.nearNorth > secondMineRiver.n0);
    assert.ok(riser.nearNorth <= secondMineRiver.n0 + 4);
    assert.ok(riser.farNorth < secondMineRiver.n1);
    assert.ok(riser.farNorth >= secondMineRiver.n1 - 4);
  }
  // The levels walk down the bank from the shore towards the middle.
  assert.ok(high.nearNorth < middle.nearNorth);
  assert.ok(middle.nearNorth < low.nearNorth);
  assert.ok(high.farNorth > middle.farNorth);
  assert.ok(middle.farNorth > low.farNorth);
  // Each riser height is the reported level, clamped into its own step.
  assert.ok(Math.abs(high.y - c2R30TerraceWaterLevels.high) <= .03);
  assert.ok(Math.abs(middle.y - c2R30TerraceWaterLevels.middle) <= .03);
  assert.ok(Math.abs(low.y - c2R30TerraceWaterLevels.low) <= .03);
});

test('C2 R07 plan builds levees, three waterlines and bypass markers', () => {
  const pieces = c2R30TerracePlan();
  assert.ok(pieces.length > 250, `only ${pieces.length} pieces`);
  assert.equal(Object.isFrozen(pieces), true);
  const zones = new Set(pieces.map(piece => piece.zone));
  for (const zone of ['near-bank', 'far-bank', 'channel', 'bypass']) {
    assert.ok(zones.has(zone as never), `missing zone ${zone}`);
  }
  const roles = new Set(pieces.map(piece => piece.role));
  for (const role of ['levee', 'stain', 'cairn', 'post', 'rope', 'sign', 'scree', 'crest', 'mark']) {
    assert.ok(roles.has(role as never), `missing role ${role}`);
  }
  assert.ok(pieces.filter(piece => piece.role === 'levee').length >= 100, 'bank levees too sparse');
  assert.ok(pieces.filter(piece => piece.role === 'stain').length >= 60, 'waterline stains missing');
  assert.ok(pieces.filter(piece => piece.role === 'cairn').length >= 24, 'bypass cairns missing');
  assert.ok(pieces.filter(piece => piece.role === 'rope').length >= 6, 'bypass rope guides missing');
  assert.ok(pieces.filter(piece => piece.role === 'crest').length >= 40, 'flood lip stones missing');
  assert.ok(pieces.filter(piece => piece.role === 'mark').length >= 8, 'route paving line missing');
  assert.ok(pieces.filter(piece => piece.emitter).length >= 6, 'no crystal markers');
  // One crust band per level per bank.
  for (const level of ['high', 'middle', 'low'] as const) {
    const bands = pieces.filter(piece => piece.role === 'stain' && piece.level === level);
    assert.ok(bands.length >= 30, `${level} crust band missing`);
    assert.equal(new Set(bands.map(piece => piece.n)).size, 2, `${level} must mark both banks`);
  }
});

test('C2 R07 every piece passes the guarded footprint, channel, pier and bypass rules', () => {
  for (const piece of c2R30TerracePlan()) {
    assert.equal(c2R30TerraceBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.e - piece.w / 2 >= c2R30TerraceFootprint.minE - 1e-6 &&
      piece.e + piece.w / 2 <= c2R30TerraceFootprint.maxE + 1e-6);
    assert.ok(piece.n - piece.d / 2 >= c2R30TerraceFootprint.minN - 1e-6 &&
      piece.n + piece.d / 2 <= c2R30TerraceFootprint.maxN + 1e-6);
    assert.ok(piece.y >= -1.1 && piece.y + piece.h <= 3.2);
    // The ferry lane is measured on the box extent, so nothing reaches into
    // the shared pier band by even one centimetre.
    if (piece.n + piece.d / 2 > 127 && piece.n - piece.d / 2 < 147) {
      assert.ok(Math.abs(piece.e) - piece.w / 2 >= 5.45 - 1e-6,
        `${piece.id} reaches into the ferry lane`);
    }
    if (piece.solid && piece.y + piece.h > .1) {
      const inChannel = piece.e + piece.w / 2 > secondMineRiver.x0 &&
        piece.e - piece.w / 2 < secondMineRiver.x1 &&
        piece.n + piece.d / 2 > secondMineRiver.n0 &&
        piece.n - piece.d / 2 < secondMineRiver.n1;
      assert.equal(inChannel, false, `${piece.id} stands in the navigable channel`);
      for (const pier of [secondMineAnchors.nearPier, secondMineAnchors.farPier]) {
        const dx = Math.max(0, Math.abs(piece.e - pier.east) - piece.w / 2);
        const dn = Math.max(0, Math.abs(piece.n - pier.north) - piece.d / 2);
        assert.ok(Math.hypot(dx, dn) >= 2.4, `${piece.id} blocks a shared pier`);
      }
      const onBypass = Math.abs(piece.e - 51.5) < 1.3 &&
        piece.n > 111 && piece.n < 163;
      assert.equal(onBypass, false, `${piece.id} blocks the dry bypass centre line`);
    }
  }
  const sample = c2R30TerracePlan()[0]!;
  assert.equal(c2R30TerraceBoxAllowed({ ...sample, e: -60, w: 1 }), false);
  assert.equal(c2R30TerraceBoxAllowed({ ...sample, y: 3.1, h: 1 }), false);
  assert.equal(c2R30TerraceBoxAllowed({
    id: 'channel-block', zone: 'channel', role: 'levee', family: 'silt-stone',
    e: 0, y: 0, n: 137, w: 2, h: .6, d: 2, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30TerraceBoxAllowed({
    id: 'pier-block', zone: 'near-bank', role: 'levee', family: 'silt-stone',
    e: secondMineAnchors.nearPier.east, y: 0, n: secondMineAnchors.nearPier.north,
    w: 1, h: .6, d: 1, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30TerraceBoxAllowed({
    id: 'bypass-block', zone: 'bypass', role: 'cairn', family: 'dry-stone',
    e: 51.5, y: 0, n: 130, w: .6, h: .6, d: .6, solid: true, emitter: false,
  }), false);
  // A solid bank dressing would steal the shared bed from the player.
  assert.equal(c2R30TerraceBoxAllowed({
    id: 'solid-levee', zone: 'near-bank', role: 'levee', family: 'silt-stone',
    e: -30, y: -.95, n: 129, w: 1.98, h: .95, d: 1, solid: true, emitter: false,
  }), false);
});

test('C2 R07 the piers and the dry bypass stay walkable', () => {
  const terrace = mountTownC2R30RiverTerrace();
  try {
    assert.equal(terrace.canStand(51.5, 130), true, 'the bypass centre line must stay open');
    assert.equal(terrace.canStand(51.5, 152), true);
    assert.equal(terrace.canStand(secondMineAnchors.nearPier.east, secondMineAnchors.nearPier.north),
      true, 'the near pier landing must stay clear');
    assert.equal(terrace.canStand(secondMineAnchors.farPier.east, secondMineAnchors.farPier.north),
      true, 'the far pier landing must stay clear');
    // Bank dressing is a visual layer: it never carries a collider, so the
    // shared bed keeps being the walkable surface when the water is low.
    assert.equal(terrace.canStand(-44, 126.6), true,
      'the dressed bank must not add a collider to the shared bed');
    assert.equal(terrace.canStand(0, 137), true,
      'the terrace must not block the navigable channel');
    // The hydrology authority stays where it was.
    assert.equal(canStandSecondMine(0, 137, 'low'), true, 'the shared bed is walkable when low');
    assert.equal(canStandSecondMine(0, 137, 'middle'), false, 'the shared bed floods when middle');
    // No collider of this module may sit over the navigable channel.
    const channelColliders = terrace.colliders.filter(collider =>
      collider.max[2] > secondMineRiver.n0 && collider.min[2] < secondMineRiver.n1);
    assert.equal(channelColliders.length, 0);
  } finally {
    terrace.dispose();
  }
});

test('C2 R07 the visible boxes and the colliders share one source', () => {
  const terrace = mountTownC2R30RiverTerrace();
  try {
    const pieces = terrace.pieces;
    const solid = pieces.find(piece => piece.solid)!;
    const familyPieces = pieces.filter(piece => piece.family === solid.family);
    const index = familyPieces.indexOf(solid);
    const mesh = terrace.group.getObjectByName(`town-c2-r30-terrace/${solid.family}`) as InstancedMesh;
    assert.ok(mesh, 'family mesh missing');
    const matrix = new Matrix4();
    mesh.getMatrixAt(index, matrix);
    // `y` is the bottom of the piece, so the box centre sits half a height up.
    assert.ok(Math.abs(matrix.elements[13] - (solid.y + solid.h / 2)) < 1e-4,
      'the visible box and the collider disagree about the piece height');
    assert.ok(Math.abs(matrix.elements[14] + solid.n) < 1e-4, 'the visible box moved in north');
    assert.ok(Math.abs(matrix.elements[12] - solid.e) < 1e-4, 'the visible box moved in east');
    const collider = terrace.colliders.find(entry =>
      Math.abs(entry.min[1] - solid.y) < 1e-6 && Math.abs(entry.max[1] - (solid.y + solid.h)) < 1e-6);
    assert.ok(collider, 'the collider must use the same bottom and top');
  } finally {
    terrace.dispose();
  }
});

test('C2 R07 the live waterline follows the reported hydrology state', () => {
  const terrace = mountTownC2R30RiverTerrace();
  try {
    assert.equal(terrace.stats().waterState, 'middle');
    assert.equal(terrace.stats().waterLevel, c2R30TerraceWaterLevels.middle);
    const strip = terrace.group.getObjectByName('town-c2-r30-terrace/live-waterline') as InstancedMesh;
    assert.ok(strip, 'live waterline strip missing');
    assert.equal(strip.count, 40);
    const before = new Matrix4();
    strip.getMatrixAt(0, before);
    const high = terrace.setWaterState('high');
    assert.equal(high.waterState, 'high');
    assert.equal(high.waterLevel, c2R30TerraceWaterLevels.high);
    assert.equal(terrace.group.userData.waterState, 'high');
    const after = new Matrix4();
    strip.getMatrixAt(0, after);
    assert.ok(Math.abs(after.elements[13] - before.elements[13]) > .1,
      'the live waterline must move with the reported level');
    assert.ok(Math.abs(after.elements[14] - before.elements[14]) > .05,
      'the live waterline must move along the bank with the reported level');
    assert.equal(terrace.setWaterState('low').waterLevel, c2R30TerraceWaterLevels.low);
    assert.throws(() => terrace.setWaterState('mid' as never), RangeError);
  } finally {
    terrace.dispose();
  }
});

test('C2 R07 is unregistered, silent and hidden until a host certifies the site', () => {
  const parent = new Group();
  const local = mountTownC2R30RiverTerrace({ parent });
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
    assert.equal(lights, 0, 'the mine camps own the lamps');
  } finally {
    local.dispose();
  }

  const hosted = mountTownC2R30RiverTerrace({
    site: { ...c2R30TerraceFixtureSite, domainId: 'host:u17:second-mine' },
    supportsSite: () => true,
    readWaterState: () => 'high',
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
    assert.equal(hosted.stats().waterState, 'high');
  } finally {
    hosted.dispose();
  }
});

test('C2 R07 uses the nine-colour 16px Nearest Lambert board in instanced batches', () => {
  const terrace = mountTownC2R30RiverTerrace();
  try {
    const stats = terrace.stats();
    assert.equal(Object.keys(c2R30TerracePalette).length, 9);
    assert.equal(stats.paletteColorCount, 9);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 10);
    for (const family of Object.keys(c2R30TerracePalette) as (keyof typeof c2R30TerracePalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent from palette`);
    }
    const meshes: InstancedMesh[] = [];
    terrace.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
    assert.equal(meshes.length, stats.drawBatchCount);
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
    terrace.dispose();
  }
});

test('C2 R07 dispose is idempotent and releases only owned GPU resources once', () => {
  const parent = new Group();
  const terrace = mountTownC2R30RiverTerrace({ parent });
  const meshes: InstancedMesh[] = [];
  terrace.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  terrace.dispose();
  terrace.dispose();
  assert.equal(terrace.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(terrace.group.children.length, 0);
  assert.equal(terrace.stats().disposed, true);
  assert.equal(terrace.stats().drawBatchCount, 0);
  assert.equal(counts.geometry, 1);
  assert.equal(counts.material, 1);
  assert.equal(counts.texture, 1);
  assert.ok(counts.mesh >= 1);
});
