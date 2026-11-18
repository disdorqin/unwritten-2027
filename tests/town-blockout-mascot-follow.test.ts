import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMascotFollower } from '../tools/voxel-tavern/town-blockout/mascot-follow';

const leader = { x: 50, n: 50, ground: 10, yaw: 0, speed: 0,
  indoor: false, wet: false, skating: false, bathing: false };

test('following lands at the agreed rear point and holds a dry stop', () => {
  const follower = createMascotFollower((east, north, around) => north < 51 ? around : undefined);
  const home = follower.update(leader, .01)!;
  assert.ok(Math.abs(Math.hypot(home.x - leader.x, home.n - leader.n) - 1.6) < .001);
  assert.equal(follower.update({ ...leader, n: 90, wet: true }, .01), home);
  assert.equal(follower.update({ ...leader, n: 52, bathing: true }, .01), home);
  assert.equal(home.speed, 0);
  const sample = follower.update({ ...leader, n: 90 }, .01)!;
  assert.ok(sample.n < 51);
});

test('following does not step through solid sampled ground and caps the ice pace', () => {
  const follower = createMascotFollower((east, north, around) => east > 50 && east < 51 ? undefined : around);
  let point = follower.update(leader, .01)!;
  for (let i = 0; i < 50; i++) {
    point = follower.update({ ...leader, x: 54, speed: 7, skating: true, yaw: Math.PI / 2 }, .02)!;
    assert.ok(point.x <= 50);
    assert.ok(point.speed <= 4.000001);
  }
});

test('boarding attaches the animal and the room boundary has a one-second delay', () => {
  const follower = createMascotFollower((_east, _north, around) => around);
  const carriage = { x: 40, n: 55, yaw: 1, ground: 9 };
  assert.deepEqual(follower.update(leader, .01, carriage), { ...carriage, speed: 0, seated: true });
  const room = { ...leader, x: 626, n: 498, ground: 150, indoor: true };
  for (let i = 0; i < 10; i++) assert.equal(follower.update(room, .1), undefined);
  const landed = follower.update(room, .1) ?? follower.update(room, .1);
  assert.equal(landed?.ground, 150);
  assert.ok(Math.hypot(landed!.x - room.x, landed!.n - room.n) <= 2);
});

test('leaving a moving carriage reattaches to a dry follower point without waiting for a large gap', () => {
  const follower = createMascotFollower((_east, _north, around) => around);
  follower.update(leader, .02, { x: 48, n: 51, yaw: 1, ground: 18 });
  const landed = follower.update(leader, .02)!;
  assert.equal(landed.ground, leader.ground);
  assert.equal(landed.seated, undefined);
  assert.ok(Math.abs(Math.hypot(landed.x - leader.x, landed.n - leader.n) - 1.6) < .001);
});

test('the mascot walks to the dry pool tread and sits there after five seconds', () => {
  const follower = createMascotFollower((_east, north, around) => north < 51 ? around : undefined);
  follower.update(leader, .02);
  const soak = { ...leader, n: 52, ground: 10, bathing: true };
  const edge = { x: 50, n: 50.8, ground: 10 };
  let last = follower.update(soak, .02, undefined, edge)!;
  for (let i = 0; i < 330; i++) last = follower.update(soak, .02, undefined, edge)!;
  assert.ok(Math.hypot(last.x - edge.x, last.n - edge.n) < .23);
  assert.equal(last.seated, true);
  assert.equal(last.speed, 0);
});

test('one 100 ms render frame preserves the walking pace without overstretching a collision sample', () => {
  const samples: number[] = [];
  const follower = createMascotFollower((_east, north, around) => {
    samples.push(north);
    return around;
  });
  const first = follower.update(leader, .02)!;
  samples.length = 0;
  const then = follower.update({ ...leader, n: 55, speed: 5.6 }, .1)!;
  assert.ok(Math.abs(Math.hypot(then.x - first.x, then.n - first.n) - .56) < .001);
  assert.ok(samples.length >= 3);
  const increments = samples.map((sample, index) => sample - (samples[index - 1] ?? first.n));
  assert.ok(Math.max(...increments) <= .20 + 1e-8);
});

test('following a real walking trace rounds a solid footprint without jumping ahead', () => {
  const isSolid = (east: number, north: number) => east > 50.4 && east < 55.4 && north > 47.3 && north < 55.4;
  const follower = createMascotFollower((east, north, around) => isSolid(east, north) ? undefined : around);
  let previous = follower.update({ ...leader, yaw: Math.PI }, .02)!;
  function walk(x0: number, n0: number, x1: number, n1: number) {
    const d = Math.hypot(x1 - x0, n1 - n0);
    const steps = Math.ceil(d / .07);
    const yaw = Math.atan2(x1 - x0, n1 - n0);
    for (let i = 1; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps;
      const n = n0 + (n1 - n0) * i / steps;
      const next = follower.update({ ...leader, x, n, yaw, speed: 3.5 }, .02)!;
      assert.ok(!isSolid(next.x, next.n));
      assert.ok(Math.hypot(next.x - previous.x, next.n - previous.n) < .21);
      previous = next;
    }
  }
  walk(50, 50, 50, 46.7);
  walk(50, 46.7, 56, 46.7);
  walk(56, 46.7, 56, 53.7);
  assert.ok(previous.x > 55.4, JSON.stringify(previous));
  for (let i = 0; i < 65; i++) {
    const next = follower.update({ ...leader, x: 56, n: 53.7 }, .02)!;
    assert.ok(!isSolid(next.x, next.n) && Math.hypot(next.x - previous.x, next.n - previous.n) < .21);
    previous = next;
  }
  const gap = Math.hypot(previous.x - 56, previous.n - 53.7);
  assert.ok(gap >= 1.2 && gap <= 2.5, JSON.stringify(previous));
});
