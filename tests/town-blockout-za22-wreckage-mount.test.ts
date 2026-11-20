import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3, type Object3D } from 'three';
import { summitWorldPoint } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

test('ZA-22 boards into the three surveyed wreckage models and releases them on return', () => {
  const epoch = Date.UTC(2026, 0, 1);
  const line = createZa22NorthRidgeLine(26);
  let now = epoch + 500;
  const arrivals: string[] = [];
  const cloud = createZa22CloudRoute({
    now: () => now,
    enterOrExit(terminal) { arrivals.push(terminal); },
    view() { assert.fail('the cable route should board without opening an exhibit'); },
  });

  const board = cloud.action(za22StationApproach);
  assert.ok(board);
  board.run();
  cloud.update(za22StationApproach);
  assert.ok(cloud.riding());

  const assembly = cloud.assembly();
  assert.ok(assembly);
  const wreckage = cloud.scene.getObjectByName('main-summit-wreckage');
  // The viewer and the test runner install different Three.js versions.
  const ribbon = cloud.scene.getObjectByName('main-summit-walkway') as unknown as Object3D | undefined;
  const coarse = assembly.block.coarse as unknown as Object3D;
  assert.ok(wreckage && ribbon);
  assert.equal(wreckage.parent, assembly.group);
  assert.deepEqual(assembly.wreckageSites.map(site => site.id), [
    'summit-wreckage-nozzle', 'summit-wreckage-skin', 'summit-wreckage-collar',
  ]);
  assert.equal(wreckage.children.length, assembly.wreckageSites.length);

  cloud.scene.updateMatrixWorld(true);
  const releases: Array<{ count: number }> = [];
  const sightlines: Raycaster[] = [];
  for (const { id, model, stand } of assembly.wreckageSites) {
    const mesh = wreckage.getObjectByName(id) as Mesh | undefined;
    assert.ok(mesh?.isMesh);
    const point = summitWorldPoint(model.east, model.north, model.height);
    const position = new Vector3(point.east, point.height, -point.north);
    assert.ok(mesh.getWorldPosition(new Vector3()).distanceTo(position) < .00001);
    const ray = new Raycaster(position.clone().add(new Vector3(0, 2, 0)), new Vector3(0, -1, 0), 0, 4);
    const hit = ray.intersectObject(ribbon, false)[0];
    assert.ok(hit && Math.abs(hit.point.y - position.y) < .001, id);
    const ground = ray.intersectObject(coarse, false)[0];
    assert.ok(ground && ground.point.y < position.y, `${id} must stay above the coarse mountain surface`);

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
    const direction = target.clone().sub(origin).normalize();
    sightlines.push(sightline);
    assert.equal(assembly.aimWreckage(sightline)?.id, id, `${id} must be visible from its surveyed stand`);
    assert.equal(assembly.aimWreckage(new Raycaster(origin, direction, 0, .75)), null);
    assert.equal(assembly.aimWreckage(new Raycaster(origin, direction.clone().negate(), 0, sightline.far)), null);
    const belowTrail = origin.clone().add(new Vector3(0, -3, 0));
    const throughTrail = new Raycaster(belowTrail, target.clone().sub(belowTrail).normalize(), 0, target.distanceTo(belowTrail));
    assert.ok(throughTrail.intersectObject(mesh, false)[0]);
    assert.equal(assembly.aimWreckage(throughTrail), null, `${id} must be occluded from below the tread`);

    const release = { count: 0 };
    releases.push(release);
    mesh.geometry.addEventListener('dispose', () => release.count++);
  }

  const owner = assembly.group as unknown as Object3D;
  const blocker = new Mesh(new BoxGeometry(.2, .2, .2), new MeshBasicMaterial());
  const firstSightline = sightlines[0]!;
  blocker.position.copy(owner.worldToLocal(firstSightline.ray.at(.5, new Vector3())));
  owner.add(blocker);
  assert.equal(assembly.aimWreckage(firstSightline), null);
  blocker.visible = false;
  assert.equal(assembly.aimWreckage(firstSightline)?.id, assembly.wreckageSites[0]!.id);
  blocker.removeFromParent();
  blocker.geometry.dispose();
  blocker.material.dispose();

  const terminal = { east: 336, north: 640, height: 347 };
  now = epoch + line.legMs + 500;
  cloud.update(za22StationApproach);
  assert.deepEqual(arrivals, ['summit']);
  const returnTrip = cloud.action(terminal);
  assert.ok(returnTrip);
  returnTrip.run();
  cloud.update(terminal);
  assert.ok(cloud.riding());
  now = epoch + 2 * line.legMs + 500;
  cloud.update(terminal);
  assert.deepEqual(arrivals, ['summit', 'base']);
  assert.equal(cloud.assembly(), undefined);
  assert.equal(wreckage.parent, null);
  assert.equal(assembly.aimWreckage(firstSightline), null);
  assert.deepEqual(releases.map(release => release.count), [1, 1, 1]);
});
