import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { createSledMotion, sledCrashKind, sledMaximumSpeed, sledRadius } from '../tools/voxel-tavern/town-blockout/sled-motion.ts';
import { createSledRide } from '../tools/voxel-tavern/town-blockout/sled-ride.ts';
import { longHallSledRoute, longHallSledStart } from '../tools/voxel-tavern/town-blockout/sled-route.ts';
import { createTownSledVisuals } from '../tools/voxel-tavern/town-blockout/sled-visuals.ts';

test('S1 starts outside the long hall and crosses the central bridge before the plaza', () => {
  assert.deepEqual(longHallSledStart, [378, 303]);
  assert.equal(longHallSledRoute.length, 12);
  assert.deepEqual(longHallSledRoute.slice(-4), [[304, 192], [278, 192], [251, 192], [231, 192]]);
  assert.equal(sledRadius, .35);
});

test('sled motion respects the speed cap and brakes to a stop on the road', () => {
  const motion = createSledMotion();
  const tick = 1 / 120;
  motion.reset(0, 35);
  assert.equal(motion.state.speed, sledMaximumSpeed);
  motion.reset(0, 7.5);
  let position = 0;
  for (let i = 0; i < 600 && motion.state.speed > 0; i++) {
    position += motion.step(tick, { forward: -1, turn: 0 }, { grade: 0, surface: 1, deepSnow: false }).speed * tick;
  }
  assert.equal(motion.state.speed, 0);
  assert.ok(position > 7 && position < 9);
});

test('a fast collision detaches the sled and tumbles the rider for two turns', () => {
  assert.equal(sledCrashKind(6), 'fall');
  assert.equal(sledCrashKind(6.01), 'tumble');
  let burst = 0;
  const wall = 64;
  const ride = createSledRide({
    height: () => 12,
    surface: () => ({ surface: 1, deepSnow: false }),
    blocked: (_, north) => north > wall,
    snow: (_, __, ___, ____, count) => { burst = Math.max(burst, count); },
    stopped() {},
  });
  assert.equal(ride.mount(0, 0, 12, 0), true);
  for (let i = 0; i < 2_400 && ride.active(); i++) ride.step(1 / 120, { forward: 1, turn: 0 });
  assert.equal(ride.active(), false);
  assert.ok(ride.recovering());
  assert.equal(burst, 34);
  assert.ok(ride.parked() && ride.parked()!.speed > 0);
  ride.finishFrame(.625, 0, wall);
  assert.ok(Math.abs(ride.roll() - 2 * Math.PI) < 1e-8);
  ride.finishFrame(.625, 0, wall);
  assert.equal(ride.recovering(), false);
});

test('local sled, racks and mist use shared batches', () => {
  const scene = new Scene();
  createTownSledVisuals(scene, [{ x: 378, n: 303, y: 23, yaw: Math.PI }]);
  assert.equal(scene.children.length, 3);
  assert.equal(scene.children.filter(child => child.visible).length, 1);
});
