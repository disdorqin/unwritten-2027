import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLakeSkateMotion } from '../tools/voxel-tavern/town-blockout/lake-skate-motion.ts';
import { townPhysicsDelta } from '../tools/voxel-tavern/town-blockout/town-physics-clock.ts';

test('ice skates accelerate gradually and cap diagonal speed', () => {
  const skates = createLakeSkateMotion();
  const first = skates.step(12, 12, townPhysicsDelta);
  assert.ok(first.east > 0 && Math.hypot(first.east, first.north) < 1);
  let velocity = first;
  for (let i = 0; i < 100; i++) velocity = skates.step(12, 12, townPhysicsDelta);
  assert.equal(velocity.east, velocity.north);
  assert.ok(Math.hypot(velocity.east, velocity.north) > 9.9);
  assert.ok(Math.hypot(velocity.east, velocity.north) <= 10);
});

test('sharp turns retain momentum and released input coasts to rest', () => {
  const skates = createLakeSkateMotion();
  for (let i = 0; i < 100; i++) skates.step(8, 0, townPhysicsDelta);
  const turn = skates.step(0, 8, townPhysicsDelta);
  assert.ok(turn.east > 7 && turn.north > 0, 'turn carries the previous velocity');
  const coast = skates.step(0, 0, townPhysicsDelta);
  assert.ok(coast.east > 0 && coast.east < turn.east, 'release slows without instantly stopping');
  for (let i = 0; i < 160; i++) skates.step(0, 0, townPhysicsDelta);
  assert.deepEqual(skates.step(0, 0, townPhysicsDelta), { east: 0, north: 0 });
});

test('halving the simulation step retains equivalent steering and coasting', () => {
  const regular = createLakeSkateMotion();
  const split = createLakeSkateMotion();
  for (const [east, north] of [[5, 7], [-3, 2], [0, 0]]) {
    const one = regular.step(east, north, townPhysicsDelta);
    split.step(east, north, townPhysicsDelta / 2);
    const two = split.step(east, north, townPhysicsDelta / 2);
    assert.ok(Math.abs(one.east - two.east) < 1e-10);
    assert.ok(Math.abs(one.north - two.north) < 1e-10);
  }
  regular.reset();
  assert.deepEqual(regular.step(0, 0, townPhysicsDelta), { east: 0, north: 0 });
});
