import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3,
  type BufferGeometry, type Material, type Object3D,
} from 'three';
import snowSurvey from '../tools/fixtures/main-summit-snow-belt-survey.json';
import { mountMainSummitAssembly, summitWorldPoint } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
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

test('ZD-07 resolves visible fragment faces from the three existing stands with a finite camera ray', () => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  const mounted = assembly.group.getObjectByName('main-summit-wreckage');
  assert.ok(mounted);
  assembly.group.updateMatrixWorld(true);

  const sightlines: Raycaster[] = [];
  for (const { id, stand } of assembly.wreckageSites) {
    const mesh = mounted.getObjectByName(id) as Mesh | undefined;
    assert.ok(mesh?.isMesh);
    const eye = summitWorldPoint(stand.east, stand.north, stand.height + 1.65);
    const origin = new Vector3(eye.east, eye.height, -eye.north);
    // Aim at a rendered face. Cutaway and ring fragments may have empty bounding-box centers.
    const vertices = mesh.geometry.getAttribute('position');
    let target: Vector3 | undefined;
    let sightline: Raycaster | undefined;
    for (let i = 0; i < vertices.count && !sightline; i += 3) {
      const center = new Vector3().fromBufferAttribute(vertices, i)
        .add(new Vector3().fromBufferAttribute(vertices, i + 1))
        .add(new Vector3().fromBufferAttribute(vertices, i + 2)).multiplyScalar(1 / 3);
      const face = mesh.localToWorld(center);
      const probe = new Raycaster(origin, face.clone().sub(origin).normalize(), 0, face.distanceTo(origin) + .001);
      if (assembly.aimWreckage(probe)?.id === id) {
        target = face;
        sightline = probe;
      }
    }
    assert.ok(target && sightline, `${id} must have a rendered face visible from its surveyed stand`);
    sightlines.push(sightline);
    const direction = sightline.ray.direction;
    assert.equal(assembly.aimWreckage(new Raycaster(origin, direction, 0, .75)), null);
    assert.equal(assembly.aimWreckage(new Raycaster(origin, direction.clone().negate(), 0, sightline.far)), null);
    const belowTrail = origin.clone().add(new Vector3(0, -3, 0));
    const throughTrail = new Raycaster(belowTrail, target.clone().sub(belowTrail).normalize(), 0, target.distanceTo(belowTrail));
    assert.ok(throughTrail.intersectObject(mesh, false)[0]);
    assert.equal(assembly.aimWreckage(throughTrail), null, `${id} must be occluded from below the tread`);
  }

  const blocker = new Mesh(new BoxGeometry(.2, .2, .2), new MeshBasicMaterial());
  const first = sightlines[0]!;
  blocker.position.copy(assembly.group.worldToLocal(first.ray.at(.5, new Vector3())));
  assembly.group.add(blocker);
  assert.equal(assembly.aimWreckage(first), null);
  blocker.material.transparent = true;
  blocker.material.opacity = .5;
  assert.equal(assembly.aimWreckage(first), null);
  blocker.material.visible = false;
  assert.equal(assembly.aimWreckage(first)?.id, assembly.wreckageSites[0]!.id);
  blocker.material.visible = true;
  blocker.visible = false;
  assert.equal(assembly.aimWreckage(first)?.id, assembly.wreckageSites[0]!.id);
  blocker.removeFromParent();
  blocker.geometry.dispose();
  blocker.material.dispose();
  assembly.dispose();
  assert.equal(assembly.aimWreckage(first), null);
});
