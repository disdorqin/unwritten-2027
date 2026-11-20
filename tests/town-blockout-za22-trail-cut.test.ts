import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3, type Object3D } from 'three';
import { summitAssemblyAnchor } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

test('the default ZA-22 route mounts the P-3 cut and foot surface and releases them after returning', () => {
  const epoch = Date.UTC(2026, 0, 1);
  const line = createZa22NorthRidgeLine(26);
  let now = epoch + 500;
  const arrivals: string[] = [];
  const cloud = createZa22CloudRoute({
    now: () => now,
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
  assert.ok(assembly && cut && ribbon);
  const radius = .27;
  assert.equal(cloud.walkingSurfaceAt(300, 715.74, radius), undefined);
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
  const [, plazaEnd] = mainSummitSpec.arrivalPlaza;
  const handoffNorth = plazaEnd - radius - .001;
  const plaza = cloud.surfaceAt(summitAssemblyAnchor.east, summitAssemblyAnchor.north + handoffNorth, radius);
  const tread = assembly.trailSurfaceAt(0, handoffNorth, radius);
  assert.ok(plaza !== undefined && tread !== undefined && Math.abs(plaza - tread) < .005);
  assert.equal(cloud.walkingSurfaceAt(300, summitAssemblyAnchor.north + handoffNorth, radius), plaza);
  for (const [east, north] of [[300, 715.74], [332.51267977, 725.21044575], [639.992384, 797.022799]] as const) {
    const height = assembly.trailSurfaceAt(east - summitAssemblyAnchor.east, north - summitAssemblyAnchor.north, radius);
    assert.ok(height !== undefined);
    assert.equal(cloud.walkingSurfaceAt(east, north, radius), height);
    assert.equal(cloud.surfaceAt(east, north, radius), undefined);
    assert.equal(cloud.blocked(east, north, height, radius, 1.8), false);
  }
  const outside = { east: 640.060046, north: 797.059391 };
  assert.ok(assembly.trailSurfaceAt(outside.east - summitAssemblyAnchor.east,
    outside.north - summitAssemblyAnchor.north, radius) !== undefined);
  assert.equal(cloud.walkingSurfaceAt(outside.east, outside.north, radius), undefined);
  assert.equal(cloud.walkingSurfaceAt(330, 1658, radius), undefined);
  assert.equal(cloud.acceptsStep(300, 665.9, 300, 666.1, radius), true);
  assert.equal(cloud.acceptsStep(304, 665.9, 304, 666.1, radius), false);
  const terminal = { east: 336, north: 640, height: 347 };
  const returnTrip = cloud.action(terminal);
  assert.ok(returnTrip);
  returnTrip.run();
  cloud.update(terminal);
  now = epoch + 2 * line.legMs + 500;
  cloud.update(terminal);
  assert.deepEqual(arrivals, ['summit', 'base']);
  assert.equal(cloud.assembly(), undefined);
  assert.equal(cloud.walkingSurfaceAt(300, 715.74, radius), undefined);
  assert.equal(cut.parent, null);
  assert.equal(releases, 1);
});
