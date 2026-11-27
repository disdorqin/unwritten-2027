import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, PointLight } from 'three';
import {
  c2R30RingBoxAllowed, c2R30RingFixtureDatum, c2R30RingFixtureSite,
  c2R30RingPalette, c2R30RingPlan, mountTownC2R30RemnantRing,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-remnant-ring.js';
import { undergroundPalaceDressing } from '../tools/voxel-tavern/town-blockout/underground-palace-dressing.js';

const FLOOR = -2.4;

function radius(e: number, n: number) {
  const centre = c2R30RingFixtureDatum.forecourtCentre;
  return Math.hypot(e - centre.east, n - centre.north);
}

test('C2 R08 the ring reads the forecourt anchors instead of inventing them', () => {
  const datum = c2R30RingFixtureDatum;
  assert.equal(datum.forecourtCentre.east, 0);
  assert.equal(datum.forecourtCentre.north, 126);
  assert.equal(datum.floorDatum, FLOOR);
  assert.equal(datum.worldAnchor, false);
  // The band the ring may use sits strictly between the column ring the
  // dressing owns and the apron rim the dressing owns.
  assert.ok(datum.ringRadius > datum.columnRingRadius);
  assert.ok(datum.ringRadius < datum.apronRimRadius);
  for (const piece of c2R30RingPlan()) {
    const r = radius(piece.e, piece.n);
    assert.ok(r >= 16.9 - 1e-6 && r <= datum.apronRimRadius - .05 + 1e-6,
      `${piece.id} left the exclusive ring band at r=${r.toFixed(2)}`);
  }
});

test('C2 R08 the plan builds the ring, the ruin and the inscription band', () => {
  const pieces = c2R30RingPlan();
  assert.ok(pieces.length > 200, `only ${pieces.length} pieces`);
  assert.equal(Object.isFrozen(pieces), true);
  const zones = new Set(pieces.map(piece => piece.zone));
  for (const zone of ['outer-ring', 'inscription-band', 'opening']) {
    assert.ok(zones.has(zone as never), `missing zone ${zone}`);
  }
  const roles = new Set(pieces.map(piece => piece.role));
  for (const role of ['stele', 'plinth', 'inscription', 'glyph', 'rubble', 'foundation']) {
    assert.ok(roles.has(role as never), `missing role ${role}`);
  }
  const standing = pieces.filter(piece => piece.role === 'stele' && piece.solid && piece.h > 3);
  assert.ok(standing.length >= 11, `only ${standing.length} standing monoliths`);
  assert.ok(pieces.filter(piece => piece.role === 'inscription').length >= 14,
    'inscription panels missing');
  assert.ok(pieces.filter(piece => piece.role === 'glyph').length >= 60, 'glyph marks missing');
  assert.ok(pieces.filter(piece => piece.role === 'foundation').length >= 4,
    'the two open slots need their foundation stones');
  assert.ok(pieces.filter(piece => piece.role === 'rubble').length >= 20, 'rubble missing');
  // The inscription is cut into the stone: never a light, never a collider.
  assert.equal(pieces.filter(piece => piece.emitter).length, 0);
  assert.equal(pieces.filter(piece => piece.role === 'glyph' && piece.solid).length, 0);
  // A few glyphs in cold metal mark the one band that was touched again.
  assert.ok(pieces.filter(piece => piece.family === 'moon-metal').length >= 4,
    'the reworked band is missing its later metal');
});

test('C2 R08 every piece passes the guarded footprint, band and axis rules', () => {
  const datum = c2R30RingFixtureDatum;
  for (const piece of c2R30RingPlan()) {
    assert.equal(c2R30RingBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.e - piece.w / 2 >= -21 - 1e-6 && piece.e + piece.w / 2 <= 21 + 1e-6);
    assert.ok(piece.n - piece.d / 2 >= 104 - 1e-6 && piece.n + piece.d / 2 <= 126.5 + 1e-6);
    assert.ok(piece.y >= -1e-6 && piece.y + piece.h <= 8);
    if (piece.solid) {
      assert.ok(Math.abs(piece.e) - piece.w / 2 >= datum.axisHalfWidth - 1e-6,
        `${piece.id} blocks the processional axis`);
    }
    if (piece.role === 'glyph') {
      assert.ok(piece.w <= .32 && piece.h <= .32);
      assert.ok(Math.abs(radius(piece.e, piece.n) - datum.ringRadius) <= 1.1 + 1e-6,
        `${piece.id} left the monolith face`);
    }
  }
  const sample = c2R30RingPlan()[0]!;
  assert.equal(c2R30RingBoxAllowed({ ...sample, e: 40, w: 1 }), false);
  assert.equal(c2R30RingBoxAllowed({ ...sample, y: 7.5, h: 2 }), false);
  assert.equal(c2R30RingBoxAllowed({
    id: 'axis-block', zone: 'outer-ring', role: 'stele', family: 'ancient-stone',
    e: 0, y: 0, n: 112, w: 1.4, h: 5, d: .7, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30RingBoxAllowed({
    id: 'apron-overlap', zone: 'outer-ring', role: 'stele', family: 'ancient-stone',
    e: 0, y: 0, n: 104.6, w: 1.4, h: 5, d: .7, solid: true, emitter: false,
  }), false);
  assert.equal(c2R30RingBoxAllowed({
    id: 'column-overlap', zone: 'outer-ring', role: 'stele', family: 'ancient-stone',
    e: 0, y: 0, n: 112, w: 1.4, h: 5, d: .7, solid: true, emitter: false,
  }), false);
});

test('C2 R08 the ring never overlaps a piece the palace dressing already owns', () => {
  const mine = c2R30RingPlan().map(piece => ({
    id: piece.id,
    minE: piece.e - piece.w / 2, maxE: piece.e + piece.w / 2,
    minY: piece.y + FLOOR, maxY: piece.y + FLOOR + piece.h,
    minN: piece.n - piece.d / 2, maxN: piece.n + piece.d / 2,
  }));
  const theirs = undergroundPalaceDressing.pieces.map(piece => {
    const [e, y, n] = piece.center;
    const [w, h, d] = piece.size;
    return {
      minE: e - w / 2, maxE: e + w / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minN: n - d / 2, maxN: n + d / 2,
    };
  });
  let deepOverlaps = 0, flushCoverings = 0;
  for (const a of mine) {
    for (const b of theirs) {
      const hit = a.minE < b.maxE - 1e-6 && a.maxE > b.minE + 1e-6 &&
        a.minN < b.maxN - 1e-6 && a.maxN > b.minN + 1e-6;
      if (!hit) continue;
      const penetration = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      if (penetration > .015) deepOverlaps++;
      // The dressing owns flush court paver seams only eight millimetres
      // thick; a monolith standing on that paving covers them, which is the
      // correct relationship and not a duplicated build.
      else flushCoverings++;
    }
  }
  assert.equal(deepOverlaps, 0, `${deepOverlaps} ring pieces overlap the palace dressing`);
  assert.ok(flushCoverings > 0, 'the ring no longer stands on the dressed court paving');
  assert.ok(theirs.length > 1000, 'the dressing reference looks empty');
});

test('C2 R08 the processional axis to the sealed gate stays open', () => {
  const ring = mountTownC2R30RemnantRing();
  try {
    for (let n = 105; n <= 124; n += 1) {
      assert.equal(ring.canStand(0, n), true, `the axis is blocked at n=${n}`);
    }
    // The two open slots keep their foundation stones flush and collider-free.
    const foundations = ring.pieces.filter(piece => piece.role === 'foundation');
    assert.equal(foundations.length, 4);
    for (const stone of foundations) {
      assert.equal(stone.solid, false, 'a foundation stone must not block the court');
      assert.ok(stone.y + stone.h <= .13, 'a foundation stone must stay flush');
    }
    // A monolith stands in the way of the ring, not of the gate.
    const monolith = ring.pieces.find(piece => piece.role === 'stele' && piece.solid && piece.h > 3)!;
    assert.equal(ring.canStand(monolith.e, monolith.n), false);
  } finally {
    ring.dispose();
  }
});

test('C2 R08 is unregistered, silent and hidden until a host certifies the site', () => {
  const parent = new Group();
  const local = mountTownC2R30RemnantRing({ parent });
  try {
    assert.equal(local.group.parent, parent);
    assert.equal(local.group.visible, false);
    assert.equal(local.group.userData.worldAnchor, false);
    assert.equal(local.stats().siteCertified, false);
    assert.equal(local.stats().worldAnchor, false);
    assert.equal(local.stats().registrationChanges, 0);
    assert.equal(local.stats().gateAuthorityChanges, 0);
    assert.equal(local.stats().lootCount, 0);
    assert.equal(local.stats().presenceChanges, 0);
    assert.equal(local.stats().realLightCount, 0);
    assert.equal(local.stats().visibleLightCount, 0);
    let lights = 0;
    local.group.traverse(object => { if (object instanceof PointLight) lights++; });
    assert.equal(lights, 0, 'the palace owns its lamps');
  } finally {
    local.dispose();
  }

  const hosted = mountTownC2R30RemnantRing({
    site: { ...c2R30RingFixtureSite, domainId: 'host:u12:palace' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally {
    hosted.dispose();
  }
});

test('C2 R08 uses the six-colour 16px Nearest Lambert board in instanced batches', () => {
  const ring = mountTownC2R30RemnantRing();
  try {
    const stats = ring.stats();
    assert.equal(Object.keys(c2R30RingPalette).length, 6);
    assert.equal(stats.paletteColorCount, 6);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 10);
    for (const family of Object.keys(c2R30RingPalette) as (keyof typeof c2R30RingPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent from palette`);
    }
    const meshes: InstancedMesh[] = [];
    ring.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
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
    // The visible box is drawn from the authored bottom, like every collider.
    const solid = ring.pieces.find(piece => piece.solid)!;
    const family = ring.pieces.filter(piece => piece.family === solid.family);
    const mesh = ring.group.getObjectByName(`town-c2-r30-ring/${solid.family}`) as InstancedMesh;
    const matrix = new Matrix4();
    mesh.getMatrixAt(family.indexOf(solid), matrix);
    assert.ok(Math.abs(matrix.elements[13] - (solid.y + solid.h / 2)) < 1e-4);
  } finally {
    ring.dispose();
  }
});

test('C2 R08 dispose is idempotent and releases only owned GPU resources once', () => {
  const parent = new Group();
  const ring = mountTownC2R30RemnantRing({ parent });
  const meshes: InstancedMesh[] = [];
  ring.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  ring.dispose();
  ring.dispose();
  assert.equal(ring.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(ring.group.children.length, 0);
  assert.equal(ring.stats().disposed, true);
  assert.equal(ring.stats().drawBatchCount, 0);
  assert.equal(counts.geometry, 1);
  assert.equal(counts.material, 1);
  assert.equal(counts.texture, 1);
  assert.ok(counts.mesh >= 1);
});
