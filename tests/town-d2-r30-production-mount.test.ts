import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, InstancedMesh, Matrix4, Vector3, type Object3D } from 'three';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mountMainSummitExtras } from '../tools/voxel-tavern/town-blockout/main-summit-extras';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { townD2R30NorthWallSpec } from '../tools/voxel-tavern/town-blockout/town-d2-r30-north-wall';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

function visibleInHierarchy(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function named(root: Group, name: string) {
  const matches: Object3D[] = [];
  root.traverse(object => { if (object.name === name) matches.push(object); });
  return matches;
}

const duplicateFacilityNames = [
  'main-summit-paint', 'main-summit-banner-cloud', 'main-summit-icefall', 'main-summit-rock-towers',
  'main-summit-survey-stations', 'main-summit-hut-furnishings', 'main-summit-wing-rack',
  'main-summit-wind-ground', 'sky-watch-relic', 'main-summit-trail-markers', 'main-summit-bell-posts',
  'main-summit-glide-rings', 'main-summit-glide-ring-entities',
] as const;

test('D2-R07 production mount uses R30 terrain, tread, ropeway, towers and facilities', context => {
  const parent = new Group();
  const assembly = mountMainSummitAssembly(parent, 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });

  assert.equal(assembly.r30Mounted, true);
  assert.ok(assembly.r30);
  assert.equal(assembly.r30.group.parent, assembly.group);
  const subPackages = assembly.r30.group.userData.subPackages as readonly string[];
  assert.ok(subPackages.includes('town-d2-r30-cable-towers'));
  assert.ok(subPackages.includes('town-d2-r30-summit-facilities'));
  assert.deepEqual(assembly.r30.stats().subPackages, subPackages);
  assert.ok(assembly.group.getObjectByName('town-d2-r30-cable-towers'));
  assert.ok(assembly.group.getObjectByName('town-d2-r30-summit-facilities'));
  assert.deepEqual(assembly.mountedParts(), ['P-1', 'P-2', 'P-3', 'P-4', 'P-7', 'P-8', 'P-9']);
  assert.equal(assembly.block.coarse.visible, false);
  assert.equal(assembly.clouds.group.visible, false);
  assert.equal(assembly.group.getObjectByName('main-summit-walkway')!.visible, false);
  assert.ok(assembly.group.getObjectByName('town-d2-r30-trail-tread'));
  assert.ok(assembly.group.getObjectByName('town-d2-r30-massif'));

  const cables = named(assembly.group, 'main-summit-cable');
  const stations = named(assembly.group, 'main-summit-station-facilities');
  assert.equal(cables.length, 2);
  assert.equal(stations.length, 2);
  assert.equal(cables.filter(visibleInHierarchy).length, 1);
  assert.equal(stations.filter(visibleInHierarchy).length, 1);
  assert.equal(assembly.cable, assembly.r30.ropeway!.cable);
  assert.equal(assembly.stations, assembly.r30.ropeway!.stations);
});

test('D2-R07 production extras hide duplicate facilities and retain additive scenery', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  const extras = mountMainSummitExtras(assembly);
  context.after(() => {
    extras.dispose();
    if (assembly.group.parent) assembly.dispose();
  });

  const facilities = assembly.group.getObjectByName('town-d2-r30-summit-facilities')!;
  assert.ok(facilities);
  for (const name of duplicateFacilityNames) {
    const copies = named(assembly.group, name);
    assert.equal(copies.length, 2, `${name} should have one R30 and one legacy root`);
    assert.equal(copies.filter(visibleInHierarchy).length, 1, `${name} should have one visible root`);
    const canonical = facilities.getObjectByName(name);
    assert.ok(canonical, `${name} should be mounted by R30`);
    assert.equal(visibleInHierarchy(canonical), true);
    assert.equal(visibleInHierarchy(copies.find(copy => copy !== canonical)!), false);
  }

  const additive = [
    extras.signs.group, extras.posts.group, extras.wishLock.group, extras.cloudTerraceArt.group,
    extras.shelterMid.group, extras.shelterIce.group, extras.machineRoom.group, extras.terraceEdge.group,
  ];
  for (const object of additive) assert.equal(visibleInHierarchy(object), true, object.name);

  extras.setNight(true);
  extras.update(1234);
  assert.equal((assembly.r30!.stats() as { night: boolean }).night, true);
  assert.equal(visibleInHierarchy(named(assembly.group, 'cloud-glow-band')[0]!), true);
  for (const name of duplicateFacilityNames) {
    assert.equal(named(assembly.group, name).filter(visibleInHierarchy).length, 1,
      `${name} must stay single-visible after night/update`);
  }
  extras.setNight(false);
  extras.update(5678);
  assert.equal((assembly.r30!.stats() as { night: boolean }).night, false);
  extras.dispose();
  extras.dispose();
  assert.equal(extras.signs.group.parent, null);
});

test('D2-R07 production mount exposes R30 collision without changing the walkway-only query contract', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });
  const point = { east: -760, north: 520 };
  const expected = assembly.r30!.collision.surfaceAt(point.east, point.north);
  assert.ok(expected !== undefined);
  assert.equal(assembly.trailSurfaceAt(point.east, point.north), undefined);
  assert.equal(assembly.r30!.collision.surfaceAt(point.east, point.north), expected);
});

test('D2-R3 production mount blocks R30 landmark bodies and terrain slopes for the player', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });
  assert.ok(assembly.r30?.northWall, 'production host lost the north-wall body set');
  const spec = townD2R30NorthWallSpec;
  const ground = sampleTownD2R30Height(spec.monument.east, spec.monument.north)!;
  assert.equal(assembly.blocked(spec.monument.east, spec.monument.north, ground, .27, 1.7), true,
    'player can walk through the summit monument in the real mount');
  const open = sampleTownD2R30Height(0, 1000)!;
  assert.equal(assembly.blocked(0, 1000, open, .27, 1.7), false, 'open summit falsely blocked');
  // Cable tower masts are solid in the real mount too (B supplies the tower
  // bodies, D2 supplies the collision exposure).
  assert.ok(assembly.r30.cableTowers, 'production host lost the tower collision set');
  const towerGroup = assembly.r30.cableTowers.group;
  const mastBatch = towerGroup.children.find(child => child instanceof InstancedMesh && child.name.endsWith('-mast')) as InstancedMesh | undefined;
  assert.ok(mastBatch, 'production host lost the mast instance batch');
  const matrix = new Matrix4(), position = new Vector3();
  mastBatch.getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  const towerEast = position.x, towerNorth = -position.z;
  const towerGround = sampleTownD2R30Height(towerEast, towerNorth)!;
  assert.equal(assembly.blocked(towerEast, towerNorth, towerGround, .27, 1.8), true,
    'player can walk through a cable tower mast in the real mount');
  // A point outside the R30 collision domain stays on the P-1 contract.
  assert.equal(assembly.trailSurfaceAt(-760, 520), undefined);
});

test('D2-R07 production mount keeps night and cabin updates on the active R30 host', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });
  assembly.setNight(true);
  assert.equal((assembly.r30!.stats() as { night: boolean }).night, true);
  assembly.setNight(false);
  assert.equal((assembly.r30!.stats() as { night: boolean }).night, false);
  assert.equal(assembly.update(123).length, 2);
});

test('D2-R07 canonical trail remains traversable in both directions on the production mount', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });
  const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
  const walkway = trail.points.slice(1);
  assert.equal(assembly.stations.heightAt(0, -10), trail.points[0]!.height);
  for (const point of walkway) {
    assert.ok(Math.abs(assembly.trailSurfaceAt(point.east, point.north)! - point.height) < 1e-8,
      `forward support at E${point.east}/N${point.north}`);
  }
  for (const point of [...walkway].reverse()) {
    assert.ok(Math.abs(assembly.trailSurfaceAt(point.east, point.north)! - point.height) < 1e-8,
      `return support at E${point.east}/N${point.north}`);
  }
  for (let index = 1; index < walkway.length; index++) {
    const from = walkway[index - 1]!, to = walkway[index]!;
    const east = (from.east + to.east) / 2, north = (from.north + to.north) / 2;
    const height = (from.height + to.height) / 2;
    assert.ok(Math.abs(assembly.trailSurfaceAt(east, north, 0)! - height) < 1e-8,
      `segment midpoint support at index ${index}`);
  }
  const support = assembly.group.getObjectByName('town-d2-r30-trail-support')!;
  const stats = support.userData.stats as { sections: number; supportedSections: number; bridgedSections: number; maxGap: number };
  assert.equal(stats.supportedSections + stats.bridgedSections, stats.sections);
  assert.ok(Number.isFinite(stats.maxGap));
});

test('D2-R07 legacy mount remains available for isolated canonical reviews', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0, undefined, { r30: false });
  const extras = mountMainSummitExtras(assembly);
  context.after(() => {
    extras.dispose();
    if (assembly.group.parent) assembly.dispose();
  });
  assert.equal(assembly.r30Mounted, false);
  assert.equal(assembly.r30, undefined);
  assert.equal(assembly.block.coarse.visible, true);
  assert.equal(assembly.clouds.group.visible, true);
  assert.equal(assembly.group.getObjectByName('main-summit-walkway')!.visible, true);
  for (const name of duplicateFacilityNames) {
    const copies = named(assembly.group, name);
    assert.equal(copies.length, 1, `${name} should only have its legacy root`);
    assert.equal(visibleInHierarchy(copies[0]!), true, `${name} should remain visible in legacy mode`);
  }
});
