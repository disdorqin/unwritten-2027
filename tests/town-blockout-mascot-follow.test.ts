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
  assert.deepEqual(follower.update(leader, .01, carriage), { ...carriage, speed: 0 });
  const room = { ...leader, x: 626, n: 498, ground: 150, indoor: true };
  for (let i = 0; i < 10; i++) assert.equal(follower.update(room, .1), undefined);
  const landed = follower.update(room, .1) ?? follower.update(room, .1);
  assert.equal(landed?.ground, 150);
  assert.ok(Math.hypot(landed!.x - room.x, landed!.n - room.n) <= 2);
});
