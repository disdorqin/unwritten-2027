import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh } from 'three';
import {
  createTownD2R30Assembly,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30Spec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

type Assembly = ReturnType<typeof createTownD2R30Assembly>;

function cleanup(context: TestContext, assembly: Assembly) {
  context.after(() => assembly.dispose());
  return assembly;
}

function meshesOf(assembly: Assembly) {
  const meshes: Mesh[] = [];
  assembly.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}

test('D2-R30 assembly mounts a complete four-side massif with shared height and collision', context => {
  const parent = new Group();
  const assembly = cleanup(context, createTownD2R30Assembly());
  parent.add(assembly.group);
  assert.equal(assembly.group.parent, parent);
  assert.equal(assembly.group.userData.owner, 'D2-R01/R04');
  assert.equal(assembly.group.userData.includesWorldCollision, true);
  assert.equal(assembly.group.userData.modifiesHeightAt, false);
  assert.deepEqual(assembly.group.userData.worldAnchor, townD2R30Spec.worldAnchor);

  const stats = assembly.stats() as {
    terrainMode: string;
    subPackages: readonly string[];
    collision: { spacing: number; vertexCount: number };
  };
  assert.equal(stats.terrainMode, 'static');
  assert.deepEqual([...stats.subPackages], [
    'town-d2-r30-massif', 'town-d2-r30-strata',
    'town-d2-r30-snow-rock-host', 'town-d2-r30-cloud-terrace-host',
  ]);

  // The static massif must close every side: a skirt + floor below the top tiles.
  const meshNames = meshesOf(assembly).map(mesh => mesh.name);
  assert.ok(meshNames.includes('town-d2-r30-closed-perimeter'), 'missing outward perimeter wall');
  assert.ok(meshNames.includes('town-d2-r30-floor'), 'missing bottom cap');

  // Visual terrain height and the walking surface share one sampler.
  for (const [east, north] of [[0, 0], [40, 690], [-760, 520], [760, 590], [160, 1450]]) {
    const visual = assembly.heightAt(east, north);
    const walking = assembly.collision.surfaceAt(east, north);
    assert.equal(visual, sampleTownD2R30Height(east, north));
    if (visual !== undefined && walking !== undefined) {
      assert.ok(Number.isFinite(walking));
      assert.ok(Math.abs(walking - visual!) < 20, `surface drift at E${east}/N${north}`);
    }
  }
  assert.ok(stats.collision.vertexCount > 0);
});

test('D2-R30 assembly streaming mode streams chunks and exposes the same height field', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({ terrainMode: 'streaming',
    includeSnowRock: false, includeStrata: false, includeCloudTerrace: false }));
  const before = assembly.stats() as { terrain: { cachedChunks: number; rebuilds: number } };
  assert.doesNotThrow(() => assembly.update(townD2R30Anchors.gate.east, townD2R30Anchors.gate.north));
  const after = assembly.stats() as { terrain: { cachedChunks: number; visibleChunks: number } };
  assert.ok(after.terrain.cachedChunks > 0, 'streaming mode must cache resident chunks');
  assert.ok(before.terrain.rebuilds >= 0);
  assert.equal(assembly.heightAt(0, 0), sampleTownD2R30Height(0, 0));
  assert.throws(() => assembly.update(NaN, 0), /finite/);
});

test('D2-R30 assembly toggles night on every layer and disposes exactly once', context => {
  const parent = new Group();
  const assembly = createTownD2R30Assembly();
  parent.add(assembly.group);
  const meshes = meshesOf(assembly);
  const resources = new Set<unknown>();
  for (const mesh of meshes) {
    resources.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(material => resources.add(material));
  }
  let disposals = 0;
  for (const resource of resources) {
    (resource as { addEventListener(type: 'dispose', cb: () => void): void })
      .addEventListener('dispose', () => { disposals++; });
  }

  assert.equal(assembly.group.userData.night, undefined);
  assembly.setNight(true);
  assert.equal(assembly.group.userData.night, true);
  assembly.setNight(true);
  assembly.setNight(false);
  assert.equal(assembly.group.userData.night, false);
  assert.throws(() => assembly.setNight('x' as never), /boolean/);

  assembly.dispose();
  assembly.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(assembly.group.children.length, 0);
  assert.equal(assembly.group.userData.disposed, true);
  assert.equal(disposals, resources.size);
  assert.equal((assembly.stats() as { disposed: boolean }).disposed, true);
  assert.throws(() => assembly.setNight(true), /disposed/);
  assert.equal(assembly.collision.surfaceAt(0, 0), undefined);
  context.after(() => {});
});

test('D2-R30 assembly can include D2-R02 walkway support and cable towers', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeTrailSupport: true, includeCableTowers: true,
  }));
  const stats = assembly.stats() as { subPackages: readonly string[] };
  assert.ok(stats.subPackages.includes('town-d2-r30-trail-support'));
  assert.ok(stats.subPackages.includes('town-d2-r30-cable-towers'));
  const names = meshesOf(assembly).map(mesh => mesh.name);
  assert.ok(names.includes('town-d2-r30-trail-tread'));
  assert.ok(names.includes('town-d2-r30-trail-earthwork'));
  assert.ok(names.some(name => name.includes('cable-tower')));
  assert.doesNotThrow(() => assembly.setNight(true));
  assert.doesNotThrow(() => assembly.setNight(false));
});

test('D2-R30 assembly can include D2-R03 facility and sled support', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeFacilityFoundations: true, includeSledGateSupport: true,
  }));
  const stats = assembly.stats() as { subPackages: readonly string[] };
  assert.ok(stats.subPackages.includes('town-d2-r30-facility-foundations'));
  assert.ok(stats.subPackages.includes('town-d2-r30-sled-gate-support'));
  const foundationGroup = assembly.group.getObjectByName('town-d2-r30-facility-foundations');
  const sledGroup = assembly.group.getObjectByName('town-d2-r30-sled-gate-support');
  assert.ok(foundationGroup && sledGroup);
  assert.ok(foundationGroup.children.some(child => child.name.includes('upper-cloud')));
  assert.ok(sledGroup.children.length > 0);
});

test('D2-R30 assembly supports minimal composition without supplements', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeStrata: false, includeSnowRock: false, includeCloudTerrace: false,
  }));
  const stats = assembly.stats() as { subPackages: readonly string[] };
  assert.deepEqual([...stats.subPackages], ['town-d2-r30-massif']);
  assert.ok(meshesOf(assembly).length > 0);
  assert.throws(() => createTownD2R30Assembly({ terrainMode: 'fly' as never }), /terrainMode/);
  assert.throws(() => createTownD2R30Assembly({ includeStrata: 'yes' as never }), /booleans/);
});
