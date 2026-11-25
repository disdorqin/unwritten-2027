import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Scene, Vector3 } from 'three';
import { canEnter, createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { addMascotToNpcBatch, makeMascotPatrol, mascotHome, sampleMascotLocation,
  townMascotParts } from '../tools/voxel-tavern/town-blockout/town-mascot.ts';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc.ts';

const grid = createTerrainGrid();
const groundAt = (east: number, north: number) =>
  canEnter(east, north) && !isWater(east, north) ? grid.heightAt(east, north) : undefined;

test('小未 has four black hooves, two full gold coils and an approved-scale stepped silhouette', () => {
  const parts = townMascotParts;
  const horns = parts.filter(part => part.tint === '#e9aa3d' && part.at[1] > .5);
  assert.equal(horns.length, 22);
  assert.equal(horns.filter(part => part.at[0] < 0).length, 11);
  assert.equal(parts.filter(part => part.tint === '#e9aa3d').length - horns.length, 1, 'only the bell adds gold');
  assert.equal(parts.filter(part => part.tint === '#302b35' && part.at[1] < .1).length, 4);
  assert.equal(parts.filter(part => part.tint === '#ad3645').length, 8);
  assert.equal(parts.filter(part => part.expression === 'eye').length, 2);
  assert.equal(parts.filter(part => part.expression === 'glint').length, 2);
  assert.equal(parts.length * 12, 1_200);
  assert.ok(Math.min(...parts.map(({ at, size }) => at[1] - size[1] / 2)) >= 0);
  const height = Math.max(...parts.map(({ at, size }) => at[1] + size[1] / 2));
  assert.ok(height > .60 && height < .65);
});

test('the shared hourly clock follows the four patrol landmarks on dry walkable ground and returns home', () => {
  const routeA = makeMascotPatrol(groundAt), routeB = makeMascotPatrol(groundAt);
  assert.ok(routeA && routeB);
  const points: [number, number][] = [];
  for (let t = 0; t <= 720_000; t += 1000) {
    const a = sampleMascotLocation(t, routeA);
    assert.deepEqual(a, sampleMascotLocation(3_600_000 + t, routeB));
    assert.notEqual(groundAt(a.x, a.n), undefined);
    points.push([a.x, a.n]);
  }
  assert.ok(points.some(([x, n]) => x === 232 && n === 190));
  assert.ok(points.some(([x, n]) => x === 154 && n === 97.9));
  assert.ok(points.some(([x, n]) => x === 226 && n === 211.1));
  assert.deepEqual(points[0], mascotHome);
  assert.deepEqual(points.at(-1), mascotHome);
  const blocked = makeMascotPatrol((x, n) => x === 232 && n === 190 ? undefined : groundAt(x, n));
  assert.equal(blocked, undefined);
  assert.deepEqual([sampleMascotLocation(10_000, blocked).x, sampleMascotLocation(10_000, blocked).n], mascotHome);
});

test('小未 reuses the NPC draw and drops the tail of the batch outside the camera range', () => {
  let now = 900_000, visible = false;
  const opts = { now: () => now, groundAt, visible: () => visible };
  const contextFor = (scene: Scene) => ({
    scene, open: () => { throw Error('not needed'); }, announce: () => {}, sit: () => {}, face: () => {},
  });
  const control = new Scene(), actual = new Scene();
  createTownNpcActivity(contextFor(control), grid.heightAt);
  const activity = createTownNpcActivity(contextFor(actual), grid.heightAt, undefined, undefined, undefined, undefined, opts);
  assert.equal(actual.children.length, 1);
  const onlyMesh = actual.children[0] as InstancedMesh;
  const baseline = (control.children[0] as InstancedMesh).count;
  assert.equal(onlyMesh.count, baseline);
  visible = true;
  activity.update?.(0);
  assert.equal(onlyMesh.count - baseline, 100);
  const matrix = new Matrix4(), focus = new Vector3();
  onlyMesh.getMatrixAt(baseline, matrix);
  focus.setFromMatrixPosition(matrix);
  assert.ok(Math.hypot(focus.x - mascotHome[0], focus.z + mascotHome[1]) < .07);
  assert.equal(activity.snowballTargets.some(actor => actor.id.includes('小未')), false);
  visible = false;
  activity.update?.(0);
  assert.equal(onlyMesh.count, baseline);

  let shown = true;
  const testBatch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), 100);
  const update = addMascotToNpcBatch(testBatch, 0, { ...opts, visible: () => shown });
  assert.equal(update(), true);
  assert.equal(update(), false);
  now += 40;
  assert.equal(update(), true);
  shown = false;
  assert.equal(update(), false);
  assert.equal(testBatch.count, 0);
});
