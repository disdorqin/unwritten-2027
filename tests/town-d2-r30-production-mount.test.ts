import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, type Object3D } from 'three';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

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

test('D2-R07 production mount uses R30 terrain, tread and ropeway without double-drawing the legacy shell', context => {
  const parent = new Group();
  const assembly = mountMainSummitAssembly(parent, 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });

  assert.equal(assembly.r30Mounted, true);
  assert.ok(assembly.r30);
  assert.equal(assembly.r30.group.parent, assembly.group);
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

test('D2-R07 production mount exposes R30 collision without changing the walkway-only query contract', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });
  const point = { east: -760, north: 520 };
  const expected = assembly.r30!.collision.surfaceAt(point.east, point.north);
  assert.ok(expected !== undefined);
  assert.equal(assembly.trailSurfaceAt(point.east, point.north), undefined);
  assert.equal(assembly.r30!.collision.surfaceAt(point.east, point.north), expected);
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
  context.after(() => { if (assembly.group.parent) assembly.dispose(); });
  assert.equal(assembly.r30Mounted, false);
  assert.equal(assembly.r30, undefined);
  assert.equal(assembly.block.coarse.visible, true);
  assert.equal(assembly.clouds.group.visible, true);
  assert.equal(assembly.group.getObjectByName('main-summit-walkway')!.visible, true);
});
