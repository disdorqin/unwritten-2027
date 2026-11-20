import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Group, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';
import snowSurvey from '../tools/fixtures/main-summit-snow-belt-survey.json';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { cloudPavilionSites } from '../tools/voxel-tavern/town-blockout/main-summit-pavilion-site';
import { createMainSummitSledRoute } from '../tools/voxel-tavern/town-blockout/main-summit-sled-route';
import { createMainSummitSnowBelt, type SnowBeltKnot } from '../tools/voxel-tavern/town-blockout/main-summit-snow-belt';
import { surveyedSledConnection } from '../tools/voxel-tavern/town-blockout/main-summit-snow-transition';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { mountMainSummitWreckage } from '../tools/voxel-tavern/town-blockout/main-summit-wreckage';

const playerRadius = .27;
const playerHeight = 1.8;

type Horizontal = Readonly<{ east: number; north: number }>;

function distanceToSegment(point: Horizontal, from: Horizontal, to: Horizontal) {
  const east = to.east - from.east;
  const north = to.north - from.north;
  const lengthSquared = east ** 2 + north ** 2;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.east - from.east) * east + (point.north - from.north) * north) / lengthSquared));
  return Math.hypot(point.east - from.east - ratio * east, point.north - from.north - ratio * north);
}

function meshesOf(group: Object3D) {
  const meshes: Mesh[] = [];
  group.traverse(object => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  return meshes;
}

test('ZD-07 mounts three stable slope fragments on the existing P-3 ribbon without blocking walkers or the sled line', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  context.after(assembly.dispose);
  const mounted = assembly.group.getObjectByName('main-summit-wreckage');
  assert.ok(mounted?.isObject3D);
  assert.equal(mounted.parent, assembly.group);
  const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
  const owner = new Group();
  const wreckage = mountMainSummitWreckage(owner, trail);
  context.after(wreckage.dispose);

  assert.equal(wreckage.group.parent, owner);
  assert.deepEqual(wreckage.sites.map(({ id }) => id), [
    'summit-wreckage-nozzle', 'summit-wreckage-skin', 'summit-wreckage-collar',
  ]);
  assert.notEqual(wreckage.group, mounted);
  assert.deepEqual(assembly.wreckageSites, wreckage.sites);
  assert.deepEqual(mounted.children.map(mesh => [mesh.name, mesh.position.toArray()]),
    wreckage.sites.map(({ id, model }) => [id, [model.east, model.height, -model.north]]));
  const meshes = meshesOf(wreckage.group);
  assert.equal(meshes.length, wreckage.sites.length);
  const bounds = new Map(meshes.map(mesh => [mesh.name, new Box3().setFromObject(mesh)]));
  const snowBelt = createMainSummitSnowBelt(snowSurvey.map(([east, north, bearing, height]): SnowBeltKnot =>
    [east!, north!, bearing!, height!]), -surveyedSledConnection.grade);
  const { points: sledPoints } = createMainSummitSledRoute();
  const sledSegments = sledPoints.slice(1).map((to, index) => [sledPoints[index]!, to] as const);
  const footOffsets = [[playerRadius, 0], [-playerRadius, 0], [0, playerRadius], [0, -playerRadius]] as const;

  for (const { id, label, model, stand } of wreckage.sites) {
    assert.ok(id.length && label.length);
    const standIndex = trail.points.findIndex(point => point.east === stand.east && point.north === stand.north);
    assert.ok(standIndex > 5 && standIndex < trail.points.length - 6, `${id} has a surveyed stand`);
    const modelSupport = trail.sampleSurface(model.east, model.north);
    assert.ok(modelSupport !== undefined, `${id} has ribbon support`);
    assert.ok(Math.abs(modelSupport + .07 - model.height) < 1e-7, `${id} rests on the rendered ribbon`);
    assert.equal(trail.sampleSurface(stand.east, stand.north), stand.height);
    assert.ok(Math.abs(Math.hypot(stand.east - model.east, stand.north - model.north) - 1.15) < 1e-7);
    assert.ok(Math.abs(stand.height - model.height) <= .43);
    const box = bounds.get(id);
    assert.ok(box && box.min.x <= model.east && box.max.x >= model.east &&
      box.min.z <= -model.north && box.max.z >= -model.north &&
      box.min.y >= modelSupport && box.max.y > model.height && box.max.y < model.height + .6,
    `${id} has a small visible model seated above the trail surface`);

    for (const point of [stand, model]) {
      assert.equal(snowBelt.sampleSurface(point.east, point.north), undefined);
      assert.ok(sledSegments.every(([from, to]) => distanceToSegment(point, from, to) > 2.1 + playerRadius));
      assert.ok(cloudPavilionSites.every(site => Math.hypot(site.east - point.east, site.north - point.north) > 8));
    }

    for (let index = standIndex - 5; index < standIndex + 5; index++) {
      const from = trail.points[index]!, to = trail.points[index + 1]!;
      for (let sample = 0; sample <= 5; sample++) {
        const fraction = sample / 5;
        const east = from.east + (to.east - from.east) * fraction;
        const north = from.north + (to.north - from.north) * fraction;
        const height = trail.sampleSurface(east, north);
        assert.ok(height !== undefined);
        for (const [dx, dn] of footOffsets) {
          assert.ok(trail.sampleSurface(east + dx, north + dn) !== undefined);
        }
        assert.equal(assembly.blocked(east, north, height, playerRadius, playerHeight), false);
        for (const box of bounds.values()) {
          const dx = Math.max(box.min.x - east, east - box.max.x, 0);
          const dz = Math.max(box.min.z + north, -north - box.max.z, 0);
          assert.ok(Math.hypot(dx, dz) > playerRadius, `${id} leaves clear walking space around the centerline`);
        }
      }
    }
  }
});

test('ZD-07 detaches the decoration and releases its model resources when the assembly closes', () => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, 0);
  const wreckage = assembly.group.getObjectByName('main-summit-wreckage');
  assert.ok(wreckage?.isObject3D);
  const releases = new Map<BufferGeometry | Material, number>();
  for (const mesh of meshesOf(wreckage)) {
    for (const resource of [mesh.geometry, ...[mesh.material].flat()]) {
      if (releases.has(resource)) continue;
      releases.set(resource, 0);
      resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource)! + 1));
    }
  }
  assert.ok(releases.size >= 4);
  assembly.dispose();
  assert.equal(wreckage.parent, null);
  assert.equal(owner.children.length, 0);
  assert.ok([...releases.values()].every(count => count === 1));
});
