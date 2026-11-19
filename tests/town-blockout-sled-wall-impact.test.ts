import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeWallTeam, SnowWallField, wallCellOf } from '../src/presence/snowfight';
import { createSledRide, createSledWallCollider } from '../tools/voxel-tavern/town-blockout/sled-ride';

test('the sled ride traverses four layers and retains 70 percent of its pre-step speed', () => {
  const field = new SnowWallField();
  const floor = (_x: number, n: number) => 100 - .2 * n;
  const getColumn = (gx: number, gy: number) => {
    const height = field.height(gx, gy);
    return height ? { height, ground: floor(0, (gy + .5) * .5) } : undefined;
  };
  const reports: number[] = [];
  const collider = createSledWallCollider(getColumn, (gx, gy, speed) => {
    reports.push(speed);
    field.breakTop(gx, gy, 4);
    return true;
  });
  const ride = createSledRide({
    height: floor,
    surface: () => ({ surface: 4, deepSnow: false }),
    blocked: () => false,
    wallImpact: collider.collide,
    snow() {},
    stopped() {},
  });
  const input = { forward: 0, turn: 0 };
  assert.ok(ride.mount(10.25, 0, floor(10.25, 0), 0));
  for (let i = 0; i < 1800 && ride.speed() < 24; i++) ride.step(1 / 60, input);
  assert.ok(ride.speed() >= 24, 'ordinary downhill dynamics reach the upper band');
  const gx = wallCellOf(ride.spot.x);
  const gy = wallCellOf(ride.spot.n) + 2;
  for (let i = 0; i < 4; i++) assert.ok('block' in field.place(gx, gy, 1, freeWallTeam, 0));
  let before = 0;
  let from = 0;
  for (let i = 0; i < 10 && reports.length === 0; i++) {
    before = ride.speed();
    from = ride.spot.n;
    ride.step(1 / 60, input);
  }
  const after = ride.speed();
  assert.ok(before > 22);
  assert.equal(reports[0], Math.ceil(before));
  assert.ok(from < gy * .5 && ride.spot.n >= gy * .5);
  assert.ok(ride.active());
  assert.equal(field.height(gx, gy), 0);
  assert.ok(Math.abs(after - before * .7) < 1e-9);
  console.log('sled wall four-layer traversal', { before, after, from, to: ride.spot.n, gx, gy, report: reports[0] });
  for (let i = 0; i < 10; i++) ride.step(1 / 60, input);
  assert.ok(ride.spot.n > (gy + 1) * .5);
  assert.equal(reports.length, 1);
});
