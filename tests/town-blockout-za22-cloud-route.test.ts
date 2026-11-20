import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAircraftFlight, surveyAircraftRunway, type AircraftWorld } from '../src/shared/aircraft-flight';
import { createFlightThrust } from '../src/shared/flight-thrust';
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
  for (let east = za22CloudRunway.start; east <= za22CloudRunway.end; east += .25) {
    assert.equal(za22CloudSurfaceAt(east, za22CloudRunway.north + 2.2), 347);
    assert.equal(za22CloudSurfaceAt(east, za22CloudRunway.north - 2.2), 347);
  }
  assert.equal(za22CloudSurfaceAt(300, 666), undefined);
  assert.equal(za22CloudSurfaceAt(350, 662), 347);
  assert.equal(za22CloudSurfaceAt(353, 662), undefined);
});

test('the mounted eastbound strip supports a full takeoff roll behind the retained registration monument', () => {
  const epoch = Date.UTC(2026, 0, 1);
  let now = epoch;
  const inspected: Array<{ title: string; message: string }> = [];
  const cloud = createZa22CloudRoute({
    now: () => now,
    enterOrExit() {},
    view(title, message) { inspected.push({ title, message }); },
  });
  cloud.action(za22StationApproach)?.run();
  cloud.update(za22StationApproach);
  const { legMs } = createZa22NorthRidgeLine(26);
  now += legMs;
  cloud.update(za22StationApproach);
  const point = (east: number, north: number) => ({ east, north, height: 347 });
  const { start, end, north, width } = za22CloudRunway;
  const runway = { id: 'starport', start: point(start, north), end: point(end, north), width };
  const world: AircraftWorld = {
    contains: ({ east, north }) => cloud.surfaceAt(east, north, 0) !== undefined,
    surfaceAt(east, north, heading) {
      const height = cloud.surfaceAt(east, north, 0);
      if (height === undefined) return;
      const slope = Math.hypot(sampleNorthRidge350(east + .5, north) - sampleNorthRidge350(east - .5, north),
        sampleNorthRidge350(east, north + .5) - sampleNorthRidge350(east, north - .5));
      let obstacleAhead = 0;
      for (let metres = 0; metres <= 8; metres += .5) {
        if (cloud.blocked(east + Math.sin(heading) * metres, north + Math.cos(heading) * metres,
          height + 1.01, .7, .05)) {
          obstacleAhead = 1.01;
          break;
        }
      }
      return { height, kind: 'snow', slopeDegrees: Math.atan(slope) * 180 / Math.PI, obstacleAhead };
    },
    sweep(from, to, clearance) {
      const steps = Math.max(1, Math.ceil(Math.hypot(to.east - from.east, to.north - from.north) / .05));
      for (let step = 0; step <= steps; step++) {
        const part = step / steps;
        if (cloud.blocked(from.east + (to.east - from.east) * part, from.north + (to.north - from.north) * part,
          from.height + (to.height - from.height) * part, clearance, 1.8)) return 'wall';
      }
    },
    recoveryAt: () => undefined,
  };
  try {
    assert.equal(cloud.riding(), false);
    assert.ok(cloud.assembly());
    assert.equal(cloud.blocked(306, 662, 347, .27, 1.8), true);
    assert.equal(cloud.surfaceAt(306, 659, .27), 347);
    assert.equal(cloud.blocked(306, 659, 347, .27, 1.8), false);
    assert.equal(cloud.action(point(324, 659)), undefined);
    assert.equal(cloud.action(point(327.75, 657)), undefined);
    const inspect = cloud.action(point(324, 655));
    assert.equal(inspect?.label, '查看星港坪装配和起飞线');
    inspect?.run();
    assert.equal(inspected.length, 1);
    assert.equal(inspected[0]?.title, '星港坪');
    assert.match(inspected[0]?.message ?? '', /向东滑跑/);
    assert.deepEqual(surveyAircraftRunway(runway, world), { ok: true, length: 41, heading: Math.PI / 2, checkedMetres: 41 });
    const reverse = { ...runway, start: runway.end, end: runway.start };
    assert.equal(surveyAircraftRunway(reverse, world).ok, false);
    const flight = createAircraftFlight(world, createFlightThrust(600));
    assert.equal(flight.launchRunway(false, runway.start, runway), false);
    assert.equal(flight.launchRunway(true, reverse.start, reverse), false);
    assert.equal(flight.snapshot(), undefined);
    assert.equal(flight.launchRunway(true, runway.start, runway), true);
    assert.equal(flight.snapshot()?.phase, 'rolling');
    for (let second = 0; second < 10; second++) flight.advance(1, { throttle: 'full' });
    const liftoff = flight.snapshot();
    assert.equal(liftoff?.phase, 'airborne');
    assert.equal(liftoff.rollMetres, 40);
    assert.equal(liftoff.speed, 8);
    assert.equal(liftoff.heading, Math.PI / 2);
    assert.equal(liftoff.point.height, 347.35);
    assert.ok(Math.abs(liftoff.point.east - 350.5) < 1e-7);
    assert.ok(Math.abs(liftoff.elapsed - 10) < 1e-7);
  } finally {
    const landing = point(336, 640);
    cloud.action(landing)?.run();
    cloud.update(landing);
    now += legMs;
    cloud.update(landing);
  }
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
