import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Raycaster, Vector3, type Object3D } from 'three';
import { mountMainSummitAssembly, summitWorldPoint } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { createMainSummitBlock, mainSummitLayout, mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';
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


test('P-3 local excavation clears the buried tread and keeps the surrounding mountain closed', context => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  const original = createMainSummitBlock(mainSummitLayout, assembly.arrivalHeight, 100);
  context.after(assembly.dispose);
  context.after(original.dispose);
  const trail = createMainSummitTrail(original.heightAt, assembly.arrivalHeight);
  const cut = assembly.block.coarse;
  const ribbon = assembly.group.getObjectByName('main-summit-walkway') as unknown as Object3D;
  assembly.group.updateMatrixWorld(true);

  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  function hitHeight(object: Object3D, east: number, north: number) {
    ray.ray.origin.set(east, 900, -north);
    const hit = ray.intersectObject(object, false)[0];
    assert.ok(hit !== undefined, `missing surface at E${east}/N${north}`);
    return hit.point.y;
  }

  let previousOcclusions = 0;
  let deepest = { east: 0, north: 0, depth: 0 };
  for (const point of trail.points.slice(1)) {
    const world = summitWorldPoint(point.east, point.north, point.height);
    const before = hitHeight(original.coarse as unknown as Object3D, point.east, point.north);
    const tread = point.height + .07;
    if (before > tread + .001) {
      previousOcclusions++;
      const depth = before - tread;
      if (depth > deepest.depth) deepest = { east: point.east, north: point.north, depth };
      assert.ok(Math.abs(hitHeight(ribbon, world.east, world.north) - tread) < .001);
    }
    const after = hitHeight(cut as unknown as Object3D, world.east, world.north);
    assert.ok(after <= tread + .005, `buried tread at E${point.east}/N${point.north}`);
  }
  assert.ok(previousOcclusions > 0 && deepest.depth > 3);
  assert.ok(cut.geometry.index!.count < 509_340 * 3 / 10);

  const lowTurnEdges = [
    { east: 32.51267977, north: 49.21044575 },
    { east: 35.94541350, north: 46.03053157 },
  ];
  for (const { east, north } of lowTurnEdges) {
    assert.ok(assembly.trailSurfaceAt(east, north, .27) !== undefined);
    const world = summitWorldPoint(east, north, 0);
    const tread = hitHeight(ribbon, world.east, world.north);
    assert.ok(hitHeight(original.coarse as unknown as Object3D, east, north) > tread + 1);
    assert.ok(hitHeight(cut as unknown as Object3D, world.east, world.north) <= tread + .005);
  }

  for (const [east, north] of [[-900, 30], [-720, 825], [0, 3], [1010, 1700], [220, 1300]]) {
    const world = summitWorldPoint(east!, north!, 0);
    const before = hitHeight(original.coarse as unknown as Object3D, east!, north!);
    const after = hitHeight(cut as unknown as Object3D, world.east, world.north);
    assert.ok(Math.abs(after - before) < .001);
  }
  for (let offset = -6; offset <= 6; offset += .25) {
    const world = summitWorldPoint(deepest.east, deepest.north + offset, 0);
    const before = hitHeight(original.coarse as unknown as Object3D, deepest.east, deepest.north + offset);
    const after = hitHeight(cut as unknown as Object3D, world.east, world.north);
    assert.ok(after <= before + .005, 'the cut cannot raise the adjoining terrain');
  }
});
