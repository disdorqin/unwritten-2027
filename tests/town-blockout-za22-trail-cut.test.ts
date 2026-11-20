import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3, type Object3D } from 'three';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

test('the default ZA-22 route mounts the relieved P-3 terrain and releases it after returning', () => {
  const epoch = Date.UTC(2026, 0, 1);
  const line = createZa22NorthRidgeLine(26);
  let now = epoch + 500;
  const arrivals: string[] = [];
  const cloud = createZa22CloudRoute({
    now: () => now,
    nightOpen: () => true,
    enterOrExit(terminal) { arrivals.push(terminal); },
    view() { assert.fail('boarding the cable does not open an exhibit'); },
  });
  const board = cloud.action(za22StationApproach);
  assert.ok(board);
  board.run();
  cloud.update(za22StationApproach);
  assert.ok(cloud.riding());

  const assembly = cloud.assembly();
  const cut = assembly?.block.coarse;
  // The viewer installs a different Three.js version from the test runner.
  const ribbon = cloud.scene.getObjectByName('main-summit-walkway') as unknown as Object3D | undefined;
  assert.ok(cut && ribbon);
  assert.ok(cut.geometry.index && cut.geometry.index.count > 1450 * 3);
  assert.ok(cut.geometry.index.count < 509_340 * 3 / 4);
  cloud.scene.updateMatrixWorld(true);
  for (const [east, north] of [[332.51267977, 725.21044575], [335.94541350, 722.03053157]] as const) {
    const ray = new Raycaster(new Vector3(east, 900, -north), new Vector3(0, -1, 0));
    const tread = ray.intersectObject(ribbon, false)[0];
    const terrain = ray.intersectObject(cut as unknown as Object3D, false)[0];
    assert.ok(tread && terrain);
    assert.ok(terrain.point.y < tread.point.y);
  }

  let releases = 0;
  cut.geometry.addEventListener('dispose', () => releases++);
  now = epoch + line.legMs + 500;
  cloud.update(za22StationApproach);
  assert.deepEqual(arrivals, ['summit']);
  const terminal = { east: 336, north: 640, height: 347 };
  const returnTrip = cloud.action(terminal);
  assert.ok(returnTrip);
  returnTrip.run();
  cloud.update(terminal);
  now = epoch + 2 * line.legMs + 500;
  cloud.update(terminal);
  assert.deepEqual(arrivals, ['summit', 'base']);
  assert.equal(cloud.assembly(), undefined);
  assert.equal(cut.parent, null);
  assert.equal(releases, 1);
});
