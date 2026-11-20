import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZa22CloudRoute, createZa22NorthRidgeLine, za22CloudRunway, za22CloudSurfaceAt, za22StationApproach } from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

test('the front line follows three surveyed stations on one opposed-car clock', () => {
  const line = createZa22NorthRidgeLine(26);
  const epoch = Date.UTC(2026, 0, 1);
  assert.deepEqual(line.pointAt(0), { east: 526, north: 329, height: 26 });
  assert.deepEqual(line.pointAt(line.lowerMetres), { east: 440, north: 520, height: 140 });
  assert.deepEqual(line.pointAt(line.length), { east: 336, north: 640, height: 347 });
  assert.ok(line.length > 490 && line.length < 545, `witnessed line ${line.length} m`);
  assert.equal(line.timeline(epoch + 500, 0).boarding, 'base');
  assert.equal(line.timeline(epoch + 500, 1).boarding, 'summit');
  assert.equal(line.timeline(epoch + 8001, 0).boarding, undefined);
  for (let time = 8000; time < line.legMs; time += 100) {
    const upward = line.timeline(epoch + time, 0);
    const downward = line.timeline(epoch + time, 1);
    assert.equal(upward.direction, 'up');
    assert.equal(downward.direction, 'down');
    assert.equal(upward.arrivalAt, epoch + line.legMs);
  }
  assert.ok(line.points.slice(1, -1).every(point => point.height >= sampleNorthRidge350(point.east, point.north)));
  assert.equal(line.timeline(epoch + line.legMs, 0).boarding, 'summit');
  assert.equal(line.timeline(epoch + line.legMs, 1).boarding, 'base');
});

test('the shared front floor reaches the surveyed cloud connection and the runway without a step', () => {
  const path = [[336, 640], [336, 663.25], [300, 663.25], [300, 665.9]] as const;
  for (let part = 1; part < path.length; part++) {
    const a = path[part - 1]!, b = path[part]!;
    const steps = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / .09);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      assert.equal(za22CloudSurfaceAt(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), 347);
    }
  }
  for (let east = za22CloudRunway.end; east <= za22CloudRunway.start; east += .25) {
    assert.equal(za22CloudSurfaceAt(east, za22CloudRunway.north + 2.2), 347);
    assert.equal(za22CloudSurfaceAt(east, za22CloudRunway.north - 2.2), 347);
  }
  assert.equal(za22CloudSurfaceAt(300, 666), undefined);
  assert.equal(za22CloudSurfaceAt(350, 654), undefined);
});

test('boarding uses the station and the cable schedule, and pending riders can be disqualified', () => {
  const cloud = createZa22CloudRoute({
    now: () => Date.UTC(2026, 0, 1) + 20_000,
    enterOrExit() { assert.fail('must not transfer'); }, view() { assert.fail('must not interact'); },
  });
  assert.equal(cloud.action({ ...za22StationApproach, height: 27.7 }), undefined);
  assert.equal(cloud.action({ ...za22StationApproach, north: 320 }), undefined);
  const board = cloud.action(za22StationApproach);
  assert.equal(board?.label, '乘缆车一线前往云海台');
  board?.run();
  cloud.update(za22StationApproach);
  assert.match(cloud.action(za22StationApproach)?.label ?? '', /等候前山缆车/);
  assert.ok(!cloud.active());
  cloud.update(za22StationApproach, false);
  assert.equal(cloud.action(za22StationApproach)?.label, '乘缆车一线前往云海台');
  cloud.action(za22StationApproach)?.run();
  cloud.update({ ...za22StationApproach, north: 320 });
  assert.equal(cloud.action(za22StationApproach)?.label, '乘缆车一线前往云海台');
});

test('the default mountain route offers the lower stamp at the mounted monument when authority is available', () => {
  const epoch = Date.UTC(2026, 0, 1);
  let now = epoch;
  let available = true;
  let requests = 0;
  const cloud = createZa22CloudRoute({
    now: () => now,
    enterOrExit(terminal) { assert.equal(terminal, 'summit'); },
    view() { assert.fail('stamping must use the passport transport'); },
    cloudStamp: { available: () => available, request() { requests++; } },
  });
  const height = cloud.surfaceAt(306, 659, .27);
  assert.equal(height, 347);
  const stamp = { east: 306, north: 659, height };
  assert.equal(cloud.action(stamp), undefined);
  cloud.action(za22StationApproach)?.run();
  cloud.update(za22StationApproach);
  assert.ok(cloud.riding());
  assert.equal(cloud.action(stamp), undefined);
  now += createZa22NorthRidgeLine(26).legMs;
  cloud.update(stamp);
  assert.ok(cloud.active() && !cloud.riding());
  assert.equal(cloud.blocked(stamp.east, stamp.north, stamp.height, .27, 1.72), false);
  available = false;
  assert.equal(cloud.action(stamp), undefined);
  available = true;
  assert.equal(cloud.action({ ...stamp, height: stamp.height + .44 }), undefined);
  assert.equal(cloud.action({ ...stamp, east: stamp.east + 1.11 }), undefined);
  assert.equal(cloud.action({ east: 350, north: 1674, height: 800 }), undefined);
  const action = cloud.action(stamp);
  assert.equal(action?.label, '在前山碑盖章');
  assert.equal(requests, 0);
  available = false;
  action?.run();
  assert.equal(requests, 0);
  available = true;
  action?.run();
  assert.equal(requests, 1);
  assert.equal(cloud.assembly()?.interact(6, -17, 347).changed, true);
});
