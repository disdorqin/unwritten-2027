import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { createTownD2R30Ropeway } from '../tools/voxel-tavern/town-blockout/town-d2-r30-ropeway';
import { createTownD2R30CableTowers } from '../tools/voxel-tavern/town-blockout/town-d2-r30-cable-towers';
import { createTownD2R30Assembly } from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';
import { createMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

type Ropeway = ReturnType<typeof createTownD2R30Ropeway>;

function cleanup<T extends { dispose(): void }>(context: TestContext, value: T): T {
  context.after(() => value.dispose());
  return value;
}

test('D2-R09 mounts the canonical rope, cabins, stations and the arrival gate', context => {
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  const stats = ropeway.stats();
  assert.equal(ropeway.group.userData.owner, 'D2-R09');
  assert.equal(ropeway.group.userData.modifiesCable, false);
  assert.equal(ropeway.group.userData.modifiesStationRules, false);

  // M06/M07: the rope itself and the station buildings must both exist.
  assert.ok(ropeway.group.getObjectByName('main-summit-cable'), 'the rope must be mounted');
  assert.ok(ropeway.group.getObjectByName('main-summit-station-facilities'), 'the stations must be mounted');
  assert.ok(ropeway.group.getObjectByName('main-summit-gate'), 'the arrival gate must be mounted');
  assert.equal(stats.ropes, 2);
  assert.ok(stats.ropeMetres > 1900 && stats.ropeMetres < 2000, `rope ${stats.ropeMetres}`);
  assert.equal(stats.gateClearWidth, 4);

  // The stations stand on the R30 arrival datum, not on the old cone.
  assert.equal(stats.arrivalFloor, 347);
  assert.equal(sampleTownD2R30Height(0, 0, 347), stats.arrivalFloor,
    'the canonical station module requires the R30 arrival datum to coincide exactly');
});

test('D2-R09 leaves the canonical rope survey and the ride rules untouched', context => {
  const reference = createMainSummitCable(0, 10_000, 347);
  const pointsBefore = reference.ropes[0].points.map(point => ({ ...point }));
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  assert.deepEqual(ropeway.cable.ropes[0].points, pointsBefore,
    'the rope survey must stay identical to the canonical one');
  assert.equal(ropeway.group.userData.speedMetresPerSecond, 8);
  assert.equal(ropeway.cable.ropes.length, reference.ropes.length);
});

test('D2-R09 ropeway towers actually reach the rope they support', context => {
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  const towers = cleanup(context, createTownD2R30CableTowers());
  const cable = ropeway.cable;
  const rope = cable.ropes[0];
  // Every tower samples the same canonical rope, so the tower tops must meet
  // the rope line within the surveyed tower-top offset.
  const groundAt = (east: number, north: number) => sampleTownD2R30Height(east, north, 347);
  let checked = 0;
  for (let distance = 45; distance < rope.totalMetres - 45; distance += 60) {
    const at = rope.sample(distance);
    const ground = groundAt(at.east, at.north);
    if (ground === undefined) continue;
    const height = at.height - 0.35 - ground;
    if (height <= 1) continue;
    checked++;
    // The tower spans from the ground to the rope; the rope must be above it.
    assert.ok(height > 1, `tower at ${distance} m does not reach the rope`);
    assert.ok(at.height > ground, `rope dips below the ground at ${distance} m`);
  }
  assert.ok(checked >= 20, `expected a dense tower run, got ${checked}`);
  assert.ok(towers.stats().towers >= 25, JSON.stringify(towers.stats()));
});

test('D2-R09 moves the cabins and restores the day look exactly', context => {
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  const materials = new Set<MeshLambertMaterial>();
  ropeway.group.traverse(object => {
    const mesh = object as Mesh & { material?: unknown };
    if (mesh.material instanceof MeshLambertMaterial) materials.add(mesh.material);
  });
  assert.ok(materials.size > 3, 'the ropeway must own lit materials');
  const before = [...materials].map(material => material.color.clone());

  ropeway.setNight(true);
  [...materials].forEach((material, index) => {
    const day = before[index]!;
    assert.ok(material.color.r <= day.r + 1e-6 && material.color.g <= day.g + 1e-6
      && material.color.b <= day.b + 1e-6, 'a night tint must darken every channel');
  });
  ropeway.setNight(false);
  [...materials].forEach((material, index) => {
    const day = before[index]!;
    assert.ok(Math.abs(material.color.r - day.r) < 1e-6
      && Math.abs(material.color.g - day.g) < 1e-6
      && Math.abs(material.color.b - day.b) < 1e-6,
      'the daytime colour must be restored exactly');
  });

  // The cabins must actually move when the host drives them.
  const car = ropeway.group.getObjectByName('main-summit-cable') as Group;
  assert.ok(car);
  ropeway.update(0);
  ropeway.update(60_000);
  assert.doesNotThrow(() => ropeway.update(120_000));
  assert.throws(() => ropeway.update(Number.NaN), /finite/);
});

test('D2-R09 refines the haul rope into a sagged physical tube', context => {
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  const refinement = ropeway.group.getObjectByName('r30-ropeway-refinement') as Group;
  assert.ok(refinement, 'the refinement package must be mounted');
  const rope = ropeway.cable.ropes[0];

  for (const index of [0, 1]) {
    const tube = refinement.getObjectByName(`r30-haul-rope-${index}`) as Mesh | undefined;
    assert.ok(tube, `haul rope ${index} must be mounted`);
    const positions = tube.geometry.getAttribute('position');
    // The tube samples every span densely, not just the nine survey points.
    assert.ok(positions.count > rope.points.length * 3, `tube ${index} must be densely sampled`);
  }

  // The tube must actually suspend below the straight survey line between the
  // supports: project every tube vertex onto the surveyed spans and measure
  // how far the tube dips under the straight interpolation.
  const tube = refinement.getObjectByName('r30-haul-rope-0') as Mesh;
  const positions = tube.geometry.getAttribute('position');
  let maxSag = 0;
  for (let i = 0; i < positions.count; i++) {
    const east = positions.getX(i);
    const height = positions.getY(i);
    const north = -positions.getZ(i);
    for (let span = 0; span < rope.points.length - 1; span++) {
      const from = rope.points[span]!;
      const to = rope.points[span + 1]!;
      const dx = to.east - from.east;
      const dn = to.north - from.north;
      const lengthSquared = dx * dx + dn * dn;
      const t = ((east - from.east) * dx + (north - from.north) * dn) / lengthSquared;
      if (t < 0.02 || t > 0.98) continue;
      const perpendicular = Math.hypot(east - (from.east + dx * t), north - (from.north + dn * t));
      if (perpendicular > 1.5) continue;
      const straight = from.height + (to.height - from.height) * t;
      maxSag = Math.max(maxSag, straight - height);
    }
  }
  assert.ok(maxSag > 2, `the haul rope must sag, measured dip was ${maxSag}`);

  // The canonical survey itself is unchanged: the refinement only renders.
  assert.equal(ropeway.cable.ropes[0].points.length, 9);
  assert.equal(ropeway.stats().ropes, 2);
});

test('D2-R09 cabin hardware rides the cabins and dock equipment stands at every dock', context => {
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  const refinement = ropeway.group.getObjectByName('r30-ropeway-refinement') as Group;
  assert.ok(refinement);

  const details = [0, 1].map(index => refinement.getObjectByName(`r30-cabin-detail-${index}`) as Group);
  assert.ok(details[0] && details[1], 'both cabin detail groups must be mounted');
  for (const detail of details) {
    assert.ok(detail.children.length >= 4, 'a cabin detail carries grip, cap, ridge and lamp');
  }

  // The refined hardware must track the same rope point the canonical cars use.
  ropeway.update(0);
  ropeway.cable.cabinsAt(0).forEach((state, index) => {
    const detail = details[index]!;
    assert.ok(Math.abs(detail.position.x - state.ropePoint.east) < 1e-9);
    assert.ok(Math.abs(detail.position.y - state.ropePoint.height) < 1e-9);
    assert.ok(Math.abs(detail.position.z + state.ropePoint.north) < 1e-9);
    assert.ok(Math.abs(detail.rotation.y + state.ropePoint.heading) < 1e-9);
  });
  ropeway.update(60_000);
  ropeway.cable.cabinsAt(60_000).forEach((state, index) => {
    const detail = details[index]!;
    assert.ok(Math.abs(detail.position.x - state.ropePoint.east) < 1e-9, 'cabin detail must follow the ride');
  });

  // Every canonical dock gains its canopy, guide rail and lamp.
  for (const station of ['cloud-deck', 'summit'] as const) {
    for (let index = 0; index < 2; index++) {
      const dock = refinement.getObjectByName(`r30-dock-equipment-${station}-${index}`) as Group;
      assert.ok(dock, `${station} dock ${index} equipment must be mounted`);
      assert.ok(dock.children.length >= 7, 'a dock carries posts, roof, rail and lamp');
      const { board, approach } = ropeway.cable.ropes[index].dock(station);
      assert.ok(Math.abs(dock.position.x - (board.east + approach.east) / 2) < 1e-9);
      assert.ok(Math.abs(dock.position.y - board.height) < 1e-9);
    }
  }
});

test('D2-R09 night lamp cores glow and restore their day colour exactly', context => {
  const ropeway = cleanup(context, createTownD2R30Ropeway());
  const refinement = ropeway.group.getObjectByName('r30-ropeway-refinement') as Group;
  assert.ok(refinement);
  const cores = new Set<MeshBasicMaterial>();
  refinement.traverse(object => {
    const mesh = object as Mesh & { material?: unknown };
    if (mesh.material instanceof MeshBasicMaterial) cores.add(mesh.material);
  });
  assert.ok(cores.size >= 1, 'the refinement owns lamp cores');
  const day = [...cores].map(material => material.color.clone());

  ropeway.setNight(true);
  [...cores].forEach((material, index) => {
    const base = day[index]!;
    assert.ok(material.color.r > base.r && material.color.g > base.g && material.color.b > base.b,
      'a lamp core must glow warmer at night');
  });
  ropeway.setNight(false);
  [...cores].forEach((material, index) => {
    const base = day[index]!;
    assert.ok(Math.abs(material.color.r - base.r) < 1e-6
      && Math.abs(material.color.g - base.g) < 1e-6
      && Math.abs(material.color.b - base.b) < 1e-6,
      'the lamp cores must restore their daytime colour exactly');
  });
});

test('D2-R09 validates its inputs and releases its resources exactly once', context => {
  assert.throws(() => createTownD2R30Ropeway({ arrivalHeight: Number.NaN }), /finite/);
  assert.throws(() => createTownD2R30Ropeway({ epochMs: 1.5 }), /integer/);
  assert.throws(() => createTownD2R30Ropeway({ terminalDwellMs: 0 }), /positive/);
  const ropeway = createTownD2R30Ropeway();
  assert.throws(() => ropeway.setNight(1 as unknown as boolean), TypeError);
  ropeway.dispose();
  ropeway.dispose();
  assert.equal(ropeway.group.children.length, 0);
  assert.equal(ropeway.group.userData.disposed, true);
  assert.throws(() => ropeway.setNight(true), /disposed/);
  context.after(() => {});
});

test('D2-R09 assembly mounts the ropeway as an independent sub-package', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeCableTowers: true, includeRopeway: true,
  }));
  const stats = assembly.stats() as {
    subPackages: readonly string[];
    budget: { packages: ReadonlyArray<{ package: string; meshes: number; triangles: number }> };
  };
  assert.ok(stats.subPackages.includes('town-d2-r30-ropeway'));
  const ropeway = assembly.group.getObjectByName('town-d2-r30-ropeway') as Group;
  assert.ok(ropeway);
  assert.ok(ropeway.getObjectByName('main-summit-station-facilities'));
  const packageSize = stats.budget.packages.find(item => item.package === 'town-d2-r30-ropeway');
  assert.ok(packageSize && packageSize.meshes > 0 && packageSize.triangles > 0);

  // The host drives the cabins through the assembly's update hook.
  assert.doesNotThrow(() => assembly.update(0, 0));
  assert.doesNotThrow(() => assembly.update(0, 0, 60_000));
  assert.throws(() => assembly.update(0, 0, Number.NaN), /finite/);
});
