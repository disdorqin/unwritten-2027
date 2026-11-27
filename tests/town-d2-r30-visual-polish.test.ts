import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Color, InstancedMesh, Mesh, MeshLambertMaterial } from 'three';
import { createTownD2R30Assembly } from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';
import { createTownD2R30Strata } from '../tools/voxel-tavern/town-blockout/town-d2-r30-strata';
import { createTownD2R30CloudTerraceHost } from '../tools/voxel-tavern/town-blockout/town-d2-r30-cloud-terrace-host';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

function cleanup<T extends { dispose(): void }>(context: TestContext, value: T): T {
  context.after(() => value.dispose());
  return value;
}

function materialColorSum(meshes: Mesh[], name: string): Color {
  const sum = new Color(0, 0, 0);
  let found = 0;
  for (const mesh of meshes) {
    if (mesh.name !== name || !(mesh.material instanceof MeshLambertMaterial)) continue;
    sum.add(mesh.material.color);
    found++;
  }
  assert.ok(found > 0, `expected at least one ${name} mesh`);
  return sum;
}

test('R5: static assembly darkens the massif terrain at night (regression for missing hook)', context => {
  const assembly = cleanup(context, createTownD2R30Assembly());
  const massif = assembly.group.getObjectByName('town-d2-r30-massif');
  assert.ok(massif, 'static mode must mount the closed massif');
  let material: MeshLambertMaterial | undefined;
  massif!.traverse(object => {
    if (!material && object instanceof Mesh && object.material instanceof MeshLambertMaterial) {
      material = object.material;
    }
  });
  assert.ok(material, 'the massif group must contain a Lambert surface');
  const day = material.color.clone();
  assembly.setNight(true);
  const night = material.color.clone();
  assert.ok(night.r < day.r && night.g < day.g && night.b < day.b,
    'the massif material must darken with the rest of the assembly');
  assembly.setNight(false);
  assert.ok(material.color.equals(day), 'day pass restores the exact massif color');
});

test('R5: every valley glacier darkens at night, not just the first (regression for single-material tint)', context => {
  const heightAt = (east: number, north: number) => sampleTownD2R30Height(east, north, 347);
  const strata = cleanup(context, createTownD2R30Strata({ heightAt, arrivalHeight: 347 }));
  const meshes: Mesh[] = [];
  strata.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  const ice = meshes.filter(mesh => mesh.name.startsWith('town-d2-r30-glacier-'));
  assert.equal(ice.length, 4, 'four valley glaciers must be present');
  const dayColors = ice.map(mesh => (mesh.material as MeshLambertMaterial).color.clone());
  strata.setNight(true);
  for (let i = 0; i < ice.length; i++) {
    const night = (ice[i]!.material as MeshLambertMaterial).color;
    const day = dayColors[i]!;
    assert.ok(night.r < day.r && night.g < day.g && night.b < day.b,
      `glacier ${i} must darken at night`);
  }
  strata.setNight(false);
  for (let i = 0; i < ice.length; i++) {
    assert.ok((ice[i]!.material as MeshLambertMaterial).color.equals(dayColors[i]!),
      `glacier ${i} day color must be restored exactly`);
  }
});

test('R5: cloud terrace outer ring follows night tint and restores (regression for untinted ring)', context => {
  const host = cleanup(context, createTownD2R30CloudTerraceHost());
  const instances: InstancedMesh[] = [];
  host.group.traverse(object => { if (object instanceof InstancedMesh) instances.push(object); });
  const ring = instances.filter(mesh => mesh.parent?.name === 'town-d2-cloud-terrace-outer-ring');
  assert.ok(ring.length > 0, 'the reviewed outer ring batches must be mounted');
  const dayColors = ring.map(mesh => (mesh.material as MeshLambertMaterial).color.clone());
  host.setNight(true);
  for (let i = 0; i < ring.length; i++) {
    const night = (ring[i]!.material as MeshLambertMaterial).color;
    const day = dayColors[i]!;
    assert.ok(night.r < day.r && night.g < day.g && night.b < day.b,
      `outer ring batch ${i} must darken at night`);
  }
  host.setNight(false);
  for (let i = 0; i < ring.length; i++) {
    assert.ok((ring[i]!.material as MeshLambertMaterial).color.equals(dayColors[i]!),
      `outer ring batch ${i} day color must be restored exactly`);
  }
});

test('R5: massif surface keeps layered ice/snow relief colors (M08, no flat fill)', () => {
  // Imported lazily via the assembly: verify the surface attribute still has
  // the varied band/relief palette after the M08 highlight/snow-line edits.
  const assembly = createTownD2R30Assembly();
  let varied = 0, iceTones = 0;
  assembly.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const color = object.geometry.getAttribute('color');
    if (!color) return;
    const seen = new Set<string>();
    for (let i = 0; i < color.count; i++) {
      seen.add(`${color.getX(i).toFixed(3)}:${color.getY(i).toFixed(3)}:${color.getZ(i).toFixed(3)}`);
      const r = color.getX(i), g = color.getY(i), b = color.getZ(i);
      if (b > r * 1.025 && g > r * 1.025) iceTones++;
    }
    varied += seen.size;
  });
  assembly.dispose();
  assert.ok(varied > 1000, 'terrain must retain varied relief colors');
  assert.ok(iceTones > 0, 'ice/snow band tones must remain visible');
});
