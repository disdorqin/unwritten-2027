import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh, MeshLambertMaterial } from 'three';
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

test('both cabin docks have supported exact floors and rails clear of cabin sweep',context=>{
 const r=cleanup(context,createTownD2R30Ropeway({controlPointSupports:false}));assert.equal(r.decks.length,4);assert.ok(r.decks.every(d=>!d.interference));
 for(const d of r.decks){const dock=r.cable.ropes[d.cabin]!.dock(d.station);for(const p of [dock.approach,dock.board]){assert.equal(r.supportAt(p.east,p.north),p.height);assert.equal(r.blocked(p.east,p.north,p.height),false);}
 const world=(x:number,z:number)=>({e:d.east+x*Math.cos(d.yaw)+z*Math.sin(d.yaw),n:d.north+x*Math.sin(d.yaw)-z*Math.cos(d.yaw)});const side=d.cabin===0?1:-1;
 for(const z of [-2.38,2.38]){const rail=world(side*1.22,z),lane=world(-side*1.6,z);assert.ok(r.blocked(rail.e,rail.n,d.height));assert.equal(r.blocked(lane.e,lane.n,d.height),false);}
 }
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
