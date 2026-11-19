import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSledMotion, sledGlideRatio, sledMaximumSpeed, sledSoftSpeed,
} from '../tools/voxel-tavern/town-blockout/sled-motion.ts';
import { createSledRide } from '../tools/voxel-tavern/town-blockout/sled-ride.ts';

const tick = 1 / 120;
const snow = { grade: 0, surface: 0, deepSnow: false };
const coast = { forward: 0, turn: 0 };
const push = { forward: 1, turn: 0 };

function near(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected} ± ${tolerance}, measured ${actual}`);
}

test('retuned snow, ice, wood, stone and deep snow use the specified friction and base drag', () => {
  for (const [surface, deepSnow, friction] of [
    [0, false, .25], [4, false, .12], [1, false, .6], [3, false, .7], [0, true, .45],
  ] as const) {
    const motion = createSledMotion();
    motion.reset(0, 10);
    const speed = motion.step(tick, coast, { grade: 0, surface, deepSnow }).speed;
    near((10 - speed) / tick, friction + .0045 * 100);
  }

  const effectiveDrag = (speed: number) => {
    const motion = createSledMotion();
    motion.reset(0, speed);
    const next = motion.step(tick, coast, snow).speed;
    return ((speed - next) / tick - .25) / speed ** 2;
  };
  near(effectiveDrag(24), .0045);
  assert.ok(effectiveDrag(27) > effectiveDrag(24));
  near(effectiveDrag(30), .0045 * 3);

  const onSlope = (deepSnow: boolean) => {
    const motion = createSledMotion();
    motion.reset(0, 10);
    return motion.step(tick, coast, { ...snow, grade: -.2, deepSnow }).speed;
  };
  near((onSlope(false) - onSlope(true)) / tick, .2);
});

test('flat kicking caps at 9.5 and downhill converges by grade below the 30 m/s hard limit', () => {
  assert.equal(sledMaximumSpeed, 30);
  assert.equal(sledSoftSpeed, 28);
  const measured: number[] = [];
  for (const [grade, min, max] of [[0, 9.499, 9.501], [-.10, 16, 18], [-.20, 24, 27], [-.30, 26, 29]]) {
    const motion = createSledMotion();
    motion.reset(0);
    let peak = 0;
    for (let frame = 0; frame < 60 / tick; frame++) {
      peak = Math.max(peak, motion.step(tick, push, { ...snow, grade }).speed);
    }
    assert.ok(peak <= sledMaximumSpeed + 1e-9, `grade ${grade} reached ${peak}`);
    const terminal = motion.state.speed;
    assert.ok(terminal >= min && terminal <= max, `grade ${grade} terminal ${terminal}`);
    measured.push(terminal);
  }
  const steep = createSledMotion();
  steep.reset(0, 45);
  near(steep.state.speed, 30);
  for (let frame = 0; frame < 30 / tick; frame++) {
    assert.ok(steep.step(tick, coast, { ...snow, grade: -.55 }, 3.9).speed <= 30 + 1e-9);
  }
  console.log('sled terminals m/s (flat, 10%, 20%, 30%):', measured.map(n => n.toFixed(3)).join(', '));
});

test('a real 15% uphill can be restarted after the old stall timer and rolls back when released', () => {
  const world = {
    height: (_: number, north: number) => 16 + north * .15,
    surface: () => ({ surface: 0, deepSnow: false }),
    blocked: () => false,
    snow() {},
    stopped() {},
  };
  const rider = createSledRide(world);
  assert.ok(rider.mount(0, 0, 16, 0));
  for (let frame = 0; frame < 240; frame++) rider.step(tick, { forward: -1, turn: 0 });
  near(rider.spot.n, 0);
  for (let frame = 0; frame < 480; frame++) rider.step(tick, push);
  const uphillSpeed = rider.speed();
  assert.ok(uphillSpeed >= 3.5 && uphillSpeed <= 4 + 1e-9, `uphill speed ${uphillSpeed}`);
  assert.ok(rider.spot.n > 6);
  let farthest = rider.spot.n;
  for (let frame = 0; frame < 480; frame++) {
    rider.step(tick, coast);
    farthest = Math.max(farthest, rider.spot.n);
  }
  assert.ok(rider.spot.n < farthest - 1, `farthest ${farthest}, after coasting ${rider.spot.n}`);
  console.log('15% uphill full push m/s and rollback m:', uphillSpeed.toFixed(3), (farthest - rider.spot.n).toFixed(3));

  const edge = createSledMotion();
  edge.reset(0);
  const slope = { ...snow, grade: .25 };
  assert.ok(edge.step(.1, push, slope).north > 0, 'the steepest allowed push starts uphill');
  edge.reset(0);
  assert.ok(edge.step(.1, push, { ...slope, grade: .251 }).north <= 0, 'beyond the cutoff, pushing cannot start uphill');
});

test('brake or drift-key with turning enters at 8 m/s and keeps slip at or below 35°', () => {
  for (const cue of [{ forward: -1, turn: 1 }, { forward: 0, turn: 1, drift: true }]) {
    const drift = createSledMotion();
    drift.reset(0, 7.99);
    assert.equal(drift.step(tick, cue, snow).drifting, false);
    drift.reset(0, 8);
    assert.equal(drift.step(tick, cue, snow).drifting, true);
    drift.reset(0, 18);
    let maximumSlip = 0;
    for (let frame = 0; frame < 72; frame++) {
      const state = drift.step(tick, cue, snow);
      maximumSlip = Math.max(maximumSlip, Math.abs(state.slipAngle));
      assert.ok(state.drifting);
    }
    const beforeRelease = drift.state.speed;
    const released = drift.step(tick, coast, snow);
    assert.equal(released.drifting, false);
    assert.ok(released.speed > beforeRelease && released.speed <= 28);
    assert.ok(maximumSlip <= 35 * Math.PI / 180 + 1e-9);
    assert.ok(maximumSlip >= 30 * Math.PI / 180);
    console.log('drift peak slip °, release m/s:', (maximumSlip * 180 / Math.PI).toFixed(3), released.speed.toFixed(3));
  }
  const early = createSledMotion();
  early.reset(0, 18);
  for (let frame = 0; frame < 48; frame++) early.step(tick, { forward: -1, turn: 1 }, snow);
  const earlySpeed = early.state.speed;
  assert.ok(early.step(tick, coast, snow).speed < earlySpeed, 'release before 0.5s has no bonus');

  const straight = createSledMotion();
  straight.reset(0, 18);
  assert.equal(straight.step(tick, { forward: 0, turn: 0, drift: true }, snow).drifting, false);
  assert.equal(straight.step(tick, { forward: 0, turn: 1 }, snow).drifting, false);
});

test('airborne neutral target uses the 4.5 glide ratio, with the current pitch controls and low-speed fall', () => {
  assert.equal(sledGlideRatio, 4.5);
  const flight = (speed: number, forward: number) => {
    const motion = createSledMotion();
    motion.reset(0, speed);
    motion.takeOff(0);
    return motion.step(tick, { forward, turn: 0 }, snow);
  };
  const neutral = flight(15, 0), dive = flight(15, 1), flare = flight(15, -1);
  near(neutral.vertical, -(15 / 4.5) * -Math.expm1(-tick / .5));
  near(flight(5.49, 0).vertical, -22 * tick);
  assert.ok(dive.vertical < neutral.vertical && neutral.vertical < flare.vertical);
  assert.ok(dive.speed > 15 && neutral.speed < 15 && flare.speed < neutral.speed);
  assert.ok(flight(28, 1).speed < 28, 'diving cannot override the speed limit');
  console.log('glide neutral sink target m/s:', (15 / 4.5).toFixed(3));
});
