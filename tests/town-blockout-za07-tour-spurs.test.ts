import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22CloudSurfaceAt, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

// ZA-07: keep the signed-off terminal, gate and starport lanes intact while opening
// the existing snow mesh to the south gliding lip and east-facing overlook.
test('ZA-07 summit walking spurs connect to the cable terminal with no ghost floors', () => {
  const epoch = Date.UTC(2026, 0, 1);
  let now = epoch;
  const transfers: string[] = [];
  const cloud = createZa22CloudRoute({
    now: () => now,
    view() {},
    enterOrExit(terminal) { transfers.push(terminal); },
  });
  cloud.action(za22StationApproach)?.run();
  cloud.update(za22StationApproach);
  assert.equal(cloud.riding(), true);
  now += createZa22NorthRidgeLine(26).legMs;
  cloud.update(za22StationApproach);
  assert.deepEqual(transfers, ['summit']);
  assert.equal(cloud.riding(), false);

  const routes = [
    { name: 'cable-to-south-lip', points: [[336, 640], [336, 654.5], [318, 654.5], [318, 634], [320, 634]] },
    { name: 'cable-to-east-overlook', points: [[336, 640], [336, 654.5], [350, 654.5], [350, 650]] },
  ];
  for (const route of routes) {
    let previous: [number, number] | undefined;
    let samples = 0;
    for (let leg = 1; leg < route.points.length; leg++) {
      const from = route.points[leg - 1]!, to = route.points[leg]!;
      const count = Math.ceil(Math.hypot(from[0]! - to[0]!, from[1]! - to[1]!) / .1);
      for (let i = 0; i <= count; i++) {
        const east = from[0]! + (to[0]! - from[0]!) * i / count;
        const north = from[1]! + (to[1]! - from[1]!) * i / count;
        const height = cloud.walkingSurfaceAt(east, north, .27);
        assert.equal(height, 347, `${route.name}: foot missing at ${east}/${north}`);
        assert.equal(cloud.blocked(east, north, height, .27, 1.8), false, `${route.name}: collision at ${east}/${north}`);
        if (previous) assert.equal(cloud.acceptsStep(previous[0], previous[1], east, north, .27), true);
        previous = [east, north];
        samples++;
      }
    }
    assert.ok(samples > 180, route.name);
  }

  // The central monument's steep cap remains outside these corridors;
  // do not authorize an invisible walkable bridge or passage beyond the edge.
  assert.equal(za22CloudSurfaceAt(320, 650, .27), undefined);
  assert.equal(za22CloudSurfaceAt(313, 640, .27), undefined);
  assert.equal(za22CloudSurfaceAt(354, 650, .27), undefined);
  assert.equal(za22CloudSurfaceAt(350, 650, .27), 347);
  assert.equal(za22CloudSurfaceAt(320, 634, .27), 347);

  cloud.action({ east: 336, north: 640, height: 347 })?.run();
  cloud.update({ east: 336, north: 640, height: 347 });
  now += createZa22NorthRidgeLine(26).legMs;
  cloud.update({ east: 336, north: 640, height: 347 });
  assert.deepEqual(transfers, ['summit', 'base']);
});
