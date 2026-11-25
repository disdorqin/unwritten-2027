import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Raycaster, Vector3, type Object3D } from 'three';
import { mountMainSummitAssembly, summitWorldPoint } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

test('P-3 assembly offers a continuous local tread from the reduced gate plaza to the summit', context => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, 0);
  context.after(assembly.dispose);
  const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight);
  const [, plazaEnd] = mainSummitSpec.arrivalPlaza;
  const radius = .27;

  const overlap = assembly.trailSurfaceAt(0, plazaEnd - radius);
  assert.ok(overlap !== undefined && Math.abs(overlap - assembly.arrivalHeight) < .005);
  assert.equal(assembly.trailSurfaceAt(0, plazaEnd - 3), undefined);
  assert.equal(assembly.trailSurfaceAt(0, plazaEnd, 1.51), undefined);
  assert.equal(assembly.trailSurfaceAt(0, plazaEnd, -1), undefined);
  assert.equal(assembly.trailSurfaceAt(0, plazaEnd, NaN), undefined);

  const [plaza, ...walkway] = trail.points.slice(1);
  assert.ok(plaza);
  assert.equal(plaza.north, plazaEnd);
  // The line curves south after leaving the plaza, without returning to its footprint.
  const southBend = walkway.find(point => point.north < plazaEnd - 5 &&
    point.east > mainSummitSpec.arrivalPlaza[0] / 2);
  assert.ok(southBend, 'the real survey exhibits the old north-filter gap');
  assert.ok(Math.abs(assembly.trailSurfaceAt(southBend.east, southBend.north)! - southBend.height) < 1e-8);
  for (const point of [plaza, ...walkway]) {
    const support = assembly.trailSurfaceAt(point.east, point.north);
    assert.ok(support !== undefined && Math.abs(support - point.height) < 1e-8);
  }
  assert.equal(assembly.trailSurfaceAt(30, 982), 800);

  const from = trail.points[20]!;
  const to = trail.points[21]!;
  const east = (from.east + to.east) / 2;
  const north = (from.north + to.north) / 2;
  const width = Math.hypot(to.east - from.east, to.north - from.north);
  const eastNormal = (from.north - to.north) / width;
  const northNormal = (to.east - from.east) / width;
  assert.ok(assembly.trailSurfaceAt(east + eastNormal * 1.2, north + northNormal * 1.2) !== undefined);
  assert.ok(assembly.trailSurfaceAt(east + eastNormal * 1.35, north + northNormal * 1.35, 0) !== undefined);
  assert.equal(assembly.trailSurfaceAt(east + eastNormal * 1.35, north + northNormal * 1.35, radius), undefined);

  // The viewer and the test runner install different Three.js versions.
  const ribbon = assembly.group.getObjectByName('main-summit-walkway') as unknown as Object3D | undefined;
  assert.ok(ribbon);
  assembly.group.updateMatrixWorld(true);
  for (const point of [plaza, southBend]) {
    const world = summitWorldPoint(point.east, point.north, point.height);
    const origin = new Vector3(world.east, world.height + 1, -world.north);
    const ray = new Raycaster(origin, new Vector3(0, -1, 0), 0, 2);
    const hit = ray.intersectObject(ribbon, false)[0];
    assert.ok(hit && Math.abs(hit.point.y - world.height - .07) < .001);
  }
});
