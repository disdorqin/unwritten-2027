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

test('a fast collision tumbles twice without ejecting the rider or moving through the wall', () => {
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
  const push = { forward: 1, turn: 0 };
  for (let i = 0; i < 2_400 && !ride.recovering(); i++) ride.step(1 / 120, push);
  assert.equal(ride.active(), true);
  assert.equal(ride.recovering(), true);
  assert.equal(ride.parked(), undefined);
  assert.equal(ride.speed(), 0);
  assert.equal(burst, 34);
  const collision = { ...ride.spot };
  assert.ok(collision.n > wall - 1 && collision.n <= wall);
  ride.jump(8);
  assert.equal(ride.airborne(), false);
  for (let i = 0; i < 75; i++) {
    ride.step(1 / 120, push);
    ride.finishFrame(1 / 120);
  }
  assert.ok(Math.abs(ride.roll() - 2 * Math.PI) < 1e-8);
  assert.deepEqual(ride.spot, collision);
  ride.finishFrame(.7);
  assert.equal(ride.recovering(), false);
  assert.equal(ride.active(), true);
  assert.equal(ride.roll(), 0);
  assert.deepEqual(ride.spot, collision);
});

test('a slower solid contact stops the occupied sled without tumbling or forcing a dismount', () => {
  let burst = 0;
  const ride = createSledRide({
    height: () => 12,
    surface: () => ({ surface: 1, deepSnow: false }),
    blocked: (_, north) => north > 5,
    snow: (_, __, ___, ____, count) => { burst = Math.max(burst, count); },
    stopped() {},
  });
  assert.equal(ride.mount(0, 0, 12, 0), true);
  for (let i = 0; i < 1_200 && !ride.recovering(); i++) ride.step(1 / 120, { forward: 1, turn: 0 });
  assert.equal(ride.active(), true);
  assert.equal(ride.recovering(), true);
  assert.equal(ride.parked(), undefined);
  assert.equal(ride.roll(), 0);
  assert.equal(ride.speed(), 0);
  assert.equal(burst, 15);
  const collision = { ...ride.spot };
  assert.ok(collision.n > 4.5 && collision.n <= 5);
  assert.equal(ride.leave(), true);
  assert.equal(ride.active(), false);
  assert.equal(ride.recovering(), false);
  assert.deepEqual(ride.parked(), collision);
});

test('a hard airborne landing settles the occupied sled on its support', () => {
  const ride = createSledRide({
    height: () => 12,
    surface: () => ({ surface: 1, deepSnow: false }),
    blocked: () => false,
    snow() {},
    stopped() {},
  });
  assert.equal(ride.mount(0, 0, 12, 0), true);
  ride.jump(20);
  assert.equal(ride.airborne(), true);
  for (let i = 0; i < 1_200 && !ride.recovering(); i++) ride.step(1 / 120, { forward: 0, turn: 0 });
  assert.equal(ride.recovering(), true);
  assert.equal(ride.active(), true);
  assert.equal(ride.parked(), undefined);
  assert.equal(ride.airborne(), false);
  assert.equal(ride.spot.y, 12);
});

test('manual exit parks one sled at its route position and remounts that same sled from nearby', () => {
  let blocked = false;
  const ride = createSledRide({
    height: () => 12,
    surface: () => ({ surface: 1, deepSnow: false }),
    blocked: () => blocked,
    snow() {},
    stopped() {},
  });
  assert.equal(ride.mount(4, 0, 12, .2), true);
  for (let i = 0; i < 600; i++) ride.step(1 / 120, { forward: 1, turn: 0 });
  assert.ok(ride.spot.n > 10 && ride.speed() > 6);
  const stoppingPoint = { ...ride.spot };
  assert.equal(ride.leave(), true);
  assert.equal(ride.leave(), false);
  assert.equal(ride.active(), false);
  assert.deepEqual(ride.parked(), stoppingPoint);

  ride.finishFrame(60, stoppingPoint.x + 40, stoppingPoint.n);
  ride.interrupt();
  assert.deepEqual(ride.parked(), stoppingPoint);
  const { x, n, y } = stoppingPoint;
  assert.equal(ride.mount(4, 0, 12, 0), false);
  assert.equal(ride.canRemount(x + 2.5, n, y), false);
  assert.equal(ride.canRemount(x, n, y + 1), false);
  blocked = true;
  assert.equal(ride.remount(x + 1, n, y), false);
  assert.deepEqual(ride.parked(), stoppingPoint);
  blocked = false;
  assert.equal(ride.canRemount(x + 1, n, y), true);
  assert.equal(ride.remount(x + 1, n, y), true);
  assert.equal(ride.active(), true);
  assert.deepEqual(ride.spot, stoppingPoint);
  assert.equal(ride.parked(), undefined);
  assert.equal(ride.speed(), 0);
  for (let i = 0; i < 120; i++) ride.step(1 / 120, { forward: 1, turn: 0 });
  assert.ok(ride.spot.n > n);
});

test('local sled, racks and mist use shared batches', () => {
  const scene = new Scene();
  createTownSledVisuals(scene, [{ x: 378, n: 303, y: 23, yaw: Math.PI }]);
  assert.equal(scene.children.length, 3);
  assert.equal(scene.children.filter(child => child.visible).length, 1);
});
