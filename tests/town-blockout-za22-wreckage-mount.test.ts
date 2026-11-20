import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3, type Mesh, type Object3D } from 'three';
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
    nightOpen: () => true,
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
  assert.ok(wreckage && ribbon);
  assert.equal(wreckage.parent, assembly.group);
  assert.deepEqual(assembly.wreckageSites.map(site => site.id), [
    'summit-wreckage-nozzle', 'summit-wreckage-skin', 'summit-wreckage-collar',
  ]);
  assert.equal(wreckage.children.length, assembly.wreckageSites.length);

  cloud.scene.updateMatrixWorld(true);
  const releases: Array<{ count: number }> = [];
  for (const { id, model } of assembly.wreckageSites) {
    const mesh = wreckage.getObjectByName(id) as Mesh | undefined;
    assert.ok(mesh?.isMesh);
    const point = summitWorldPoint(model.east, model.north, model.height);
    const position = new Vector3(point.east, point.height, -point.north);
    assert.ok(mesh.getWorldPosition(new Vector3()).distanceTo(position) < .00001);
    const ray = new Raycaster(position.clone().add(new Vector3(0, 2, 0)), new Vector3(0, -1, 0), 0, 4);
    const hit = ray.intersectObject(ribbon, false)[0];
    assert.ok(hit && Math.abs(hit.point.y - position.y) < .001, id);
    const release = { count: 0 };
    releases.push(release);
    mesh.geometry.addEventListener('dispose', () => release.count++);
  }

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
  assert.deepEqual(releases.map(release => release.count), [1, 1, 1]);
});
