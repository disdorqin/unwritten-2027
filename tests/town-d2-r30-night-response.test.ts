import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Color, Group, Mesh, MeshLambertMaterial } from 'three';
import { createTownD2R30CableTowers } from '../tools/voxel-tavern/town-blockout/town-d2-r30-cable-towers';
import { createTownD2R30FacilityFoundations } from '../tools/voxel-tavern/town-blockout/town-d2-r30-facility-foundations';
import { createTownD2R30SledGateSupport } from '../tools/voxel-tavern/town-blockout/town-d2-r30-sled-gate-support';
import { createTownD2R30Assembly } from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';

function materialsOf(group: Group): MeshLambertMaterial[] {
  const found: MeshLambertMaterial[] = [];
  group.traverse(object => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.material instanceof MeshLambertMaterial) found.push(mesh.material);
  });
  return found;
}

function snapshot(materials: readonly MeshLambertMaterial[]): string[] {
  return materials.map(material => material.color.getHexString());
}

test('D2-R09 cable towers dim and restore at night', context => {
  const towers = createTownD2R30CableTowers();
  context.after(() => towers.dispose());
  const materials = materialsOf(towers.group);
  assert.ok(materials.length > 0, 'cable towers must own real material');

  const day = snapshot(materials);
  towers.setNight(true);
  const night = snapshot(materials);
  assert.notDeepEqual(night, day, 'night must change the tower material');
  towers.setNight(false);
  assert.deepEqual(snapshot(materials), day, 'day must restore the tower material exactly');
});

test('D2-R09 facility foundations dim and restore at night', context => {
  const foundations = createTownD2R30FacilityFoundations();
  context.after(() => foundations.dispose());
  const materials = materialsOf(foundations.group);
  assert.ok(materials.length > 0);

  const day = snapshot(materials);
  foundations.setNight(true);
  assert.notDeepEqual(snapshot(materials), day);
  foundations.setNight(false);
  assert.deepEqual(snapshot(materials), day);
});

test('D2-R09 sled gate stands dim and restore at night', context => {
  const sled = createTownD2R30SledGateSupport();
  context.after(() => sled.dispose());
  const materials = materialsOf(sled.group);
  assert.ok(materials.length > 0);

  const day = snapshot(materials);
  sled.setNight(true);
  assert.notDeepEqual(snapshot(materials), day);
  sled.setNight(false);
  assert.deepEqual(snapshot(materials), day);
});

test('D2-R09 the full assembly tints every sub-package at night', context => {
  const assembly = createTownD2R30Assembly({
    includeTrailSupport: true,
    includeCableTowers: true,
    includeFacilityFoundations: true,
    includeSledGateSupport: true,
  });
  context.after(() => assembly.dispose());

  const packages = [
    'town-d2-r30-trail-support',
    'town-d2-r30-cable-towers',
    'town-d2-r30-facility-foundations',
    'town-d2-r30-sled-gate-support',
  ];
  const dayState = new Map<string, string[]>();
  for (const name of packages) {
    const child = assembly.group.getObjectByName(name);
    assert.ok(child instanceof Group, `${name} must be mounted`);
    dayState.set(name, snapshot(materialsOf(child)));
  }

  assembly.setNight(true);
  for (const name of packages) {
    const child = assembly.group.getObjectByName(name) as Group;
    const night = snapshot(materialsOf(child));
    assert.notDeepEqual(night, dayState.get(name), `${name} ignored the night tint`);
  }

  assembly.setNight(false);
  for (const name of packages) {
    const child = assembly.group.getObjectByName(name) as Group;
    assert.deepEqual(snapshot(materialsOf(child)), dayState.get(name),
      `${name} did not restore its day colours`);
  }
});

test('D2-R09 night toggles reject non-boolean input', () => {
  const towers = createTownD2R30CableTowers();
  const foundations = createTownD2R30FacilityFoundations();
  const sled = createTownD2R30SledGateSupport();
  try {
    assert.throws(() => towers.setNight(1 as unknown as boolean), TypeError);
    assert.throws(() => foundations.setNight('yes' as unknown as boolean), TypeError);
    assert.throws(() => sled.setNight(null as unknown as boolean), TypeError);
  } finally {
    towers.dispose();
    foundations.dispose();
    sled.dispose();
  }
  // A disposed package must refuse further night changes.
  assert.throws(() => towers.setNight(true), /disposed/);
});

test('D2-R09 the night tint stays a tint and never adds light', context => {
  const assembly = createTownD2R30Assembly({
    includeCableTowers: true,
    includeFacilityFoundations: true,
    includeSledGateSupport: true,
  });
  context.after(() => assembly.dispose());

  let lights = 0;
  assembly.group.traverse(object => {
    if ((object as { isLight?: boolean }).isLight) lights += 1;
  });
  assert.equal(lights, 0, 'D2-R09 only tints materials; lighting is a separate D2-R08 package');

  // The night state must be a darkened version of the same colour, not a hue swap.
  const towers = assembly.group.getObjectByName('town-d2-r30-cable-towers') as Group;
  const before = materialsOf(towers).map(material => material.color.clone());
  assembly.setNight(true);
  const after = materialsOf(towers).map(material => material.color.clone());
  before.forEach((colour, index) => {
    const night = after[index]!;
    assert.ok(night.r <= colour.r + 1e-6 && night.g <= colour.g + 1e-6 && night.b <= colour.b + 1e-6,
      'night tint must darken, not brighten or repaint');
    assert.ok(Math.abs(new Color(night).getHSL({ h: 0, s: 0, l: 0 } as never).l) >= 0);
  });
});
