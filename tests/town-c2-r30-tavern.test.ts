import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, InstancedMesh, MeshLambertMaterial, NearestFilter, PointLight } from 'three';
import {
  c2R30TavernBoxAllowed, c2R30TavernFixtureSite, c2R30TavernPalette,
  c2R30TavernPlan, mountTownC2R30Tavern,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-tavern.js';

const foot = { minE: 119.55, maxE: 130.45, minN: 14.4, maxN: 24.55 };

test('C2 R02 tavern plan is a thick stone-and-timber room with all six zones', () => {
  const pieces = c2R30TavernPlan();
  assert.ok(pieces.length > 130);
  assert.equal(Object.isFrozen(pieces), true);
  const zones = new Set(pieces.map(piece => piece.zone));
  for (const zone of ['entrance', 'bar', 'hearth', 'seating', 'rear', 'back']) {
    assert.ok(zones.has(zone as never), `missing zone ${zone}`);
  }
  const roles = new Set(pieces.map(piece => piece.role));
  for (const role of ['wall', 'pillar', 'beam', 'hearth', 'barrel', 'shelf', 'lamp', 'sign', 'prop', 'rubble']) {
    assert.ok(roles.has(role as never), `missing role ${role}`);
  }
  assert.ok(pieces.filter(piece => piece.role === 'wall').length > 60, 'masonry courses too sparse');
  assert.ok(pieces.filter(piece => piece.emitter).length >= 4, 'not enough warm/moon emitters');
  assert.ok(pieces.filter(piece => piece.role === 'barrel').length >= 6, 'barrels missing');
});

test('C2 R02 every piece passes the guarded tavern footprint and height band', () => {
  for (const piece of c2R30TavernPlan()) {
    assert.equal(c2R30TavernBoxAllowed(piece), true, `${piece.id} failed guard`);
    assert.equal(Object.isFrozen(piece), true);
    assert.ok(piece.e - piece.w / 2 >= foot.minE - 1e-6 && piece.e + piece.w / 2 <= foot.maxE + 1e-6);
    const maxN = piece.zone === 'back' ? foot.maxN + .4 : foot.maxN;
    assert.ok(piece.n - piece.d / 2 >= foot.minN - 1e-6 && piece.n + piece.d / 2 <= maxN + 1e-6);
    assert.ok(piece.y >= 0 && piece.y + piece.h <= 4.6);
  }
  // Guard rejects an oversized box, a box above the roofline and a block in the entry throat.
  assert.equal(c2R30TavernBoxAllowed({ ...c2R30TavernPlan()[0]!, e: 140, w: 1 }), false);
  assert.equal(c2R30TavernBoxAllowed({ ...c2R30TavernPlan()[0]!, y: 4.5, h: 1 }), false);
  assert.equal(c2R30TavernBoxAllowed({
    id: 'throat-block', zone: 'entrance', role: 'prop', family: 'shadow',
    e: 125, y: 0, n: 15.2, w: 1, h: 2, d: 1, solid: true, emitter: false,
  }), false);
});

test('C2 R02 entry throat and bar approach centre-lines stay walkable', () => {
  const tavern = mountTownC2R30Tavern();
  try {
    // The safety-pocket path runs from the street to the bar at n=22.15.
    for (let n = 14.7; n <= 22.0; n += .2) {
      assert.equal(tavern.canStand(125, n), true, `centre-line blocked at n=${n.toFixed(1)}`);
    }
    // Two side seats are reachable; the wall masonry itself is not walk-through.
    assert.equal(tavern.canStand(127.6, 18.2), true);
    assert.equal(tavern.canStand(120.0, 24.1), false, 'rear wall must be solid');
    assert.equal(tavern.canStand(135, 20), false, 'outside the footprint is not supported');
  } finally {
    tavern.dispose();
  }
});

test('C2 R02 is unregistered and hidden until an explicit certified site is supplied', () => {
  const parent = new Group();
  const local = mountTownC2R30Tavern({ parent });
  try {
    assert.equal(local.group.parent, parent);
    assert.equal(local.group.visible, false);
    assert.equal(local.group.userData.worldAnchor, false);
    assert.equal(local.group.userData.siteCertified, false);
    assert.equal(local.stats().siteCertified, false);
    assert.equal(local.stats().worldAnchor, false);
    assert.equal(local.stats().registrationChanges, 0);
    assert.equal(local.stats().lootCount, 0);
    assert.equal(local.stats().presenceChanges, 0);
  } finally {
    local.dispose();
  }

  const hosted = mountTownC2R30Tavern({
    site: { ...c2R30TavernFixtureSite, domainId: 'host:u10:real-domain' },
    supportsSite: () => true,
  });
  try {
    assert.equal(hosted.group.visible, true);
    assert.equal(hosted.stats().siteCertified, true);
  } finally {
    hosted.dispose();
  }
});

test('C2 R02 uses the nine-colour 16px Nearest Lambert board in instanced batches', () => {
  const tavern = mountTownC2R30Tavern();
  try {
    const stats = tavern.stats();
    assert.equal(Object.keys(c2R30TavernPalette).length, 9);
    assert.equal(stats.paletteColorCount, 9);
    assert.equal(stats.textureSize, 16);
    assert.equal(stats.textureFilter, 'nearest');
    assert.equal(stats.shading, 'lambert');
    assert.equal(stats.drawBatchCount, stats.pixelTextureCount);
    assert.ok(stats.drawBatchCount <= 9);
    for (const family of Object.keys(c2R30TavernPalette) as (keyof typeof c2R30TavernPalette)[]) {
      assert.ok(stats.paletteCounts[family] > 0, `${family} absent from palette`);
    }
    const meshes: InstancedMesh[] = [];
    tavern.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
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
    tavern.dispose();
  }
});

test('C2 R02 warm pools are bounded by night and host light budget', () => {
  const day = mountTownC2R30Tavern({ readNight: () => false, readLightBudget: () => 9 });
  try {
    assert.equal(day.stats().realLightCount, 0);
  } finally { day.dispose(); }

  const none = mountTownC2R30Tavern({ readNight: () => true, readLightBudget: () => 0 });
  try {
    assert.equal(none.stats().realLightCount, 0);
  } finally { none.dispose(); }

  const one = mountTownC2R30Tavern({ readNight: () => true, readLightBudget: () => 1 });
  try {
    assert.equal(one.stats().realLightCount, 1);
  } finally { one.dispose(); }

  const two = mountTownC2R30Tavern({ readNight: () => true, readLightBudget: () => 9 });
  try {
    assert.equal(two.stats().realLightCount, 2);
    let lights = 0;
    two.group.traverse(object => { if (object instanceof PointLight) lights++; });
    assert.equal(lights, 2);
  } finally { two.dispose(); }
});

test('C2 R02 dispose is idempotent and releases only owned GPU resources once', () => {
  const parent = new Group();
  const tavern = mountTownC2R30Tavern({ parent, readNight: () => true, readLightBudget: () => 2 });
  const meshes: InstancedMesh[] = [];
  tavern.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
  const geometry = meshes[0]!.geometry;
  const material = meshes[0]!.material as MeshLambertMaterial;
  const texture = material.map as DataTexture;
  const counts = { geometry: 0, material: 0, texture: 0, mesh: 0, light: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  texture.addEventListener('dispose', () => counts.texture++);
  for (const mesh of meshes) mesh.addEventListener('dispose', () => counts.mesh++);
  const lights: PointLight[] = [];
  tavern.group.traverse(object => { if (object instanceof PointLight) lights.push(object); });
  for (const light of lights) {
    const original = light.dispose.bind(light);
    light.dispose = () => { counts.light++; original(); };
  }
  tavern.dispose();
  tavern.dispose();
  assert.equal(tavern.group.parent, null);
  assert.equal(parent.children.length, 0);
  assert.equal(tavern.group.children.length, 0);
  assert.equal(tavern.stats().disposed, true);
  assert.equal(tavern.stats().drawBatchCount, 0);
  assert.equal(tavern.stats().realLightCount, 0);
  assert.equal(counts.geometry, 1);
  assert.equal(counts.light, 2);
  assert.ok(counts.mesh >= 1);
  assert.ok(counts.material >= 1);
  assert.ok(counts.texture >= 1);
});
