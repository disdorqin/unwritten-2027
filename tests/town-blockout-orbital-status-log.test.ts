import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrbitalEarlyRooms } from '../tools/voxel-tavern/town-blockout/orbital-early-rooms.js';
import {
  initialOrbitalLogState, orbitalLogReviewSlots, readOrbitalLogReach, resolveOrbitalLogAction,
} from '../tools/voxel-tavern/town-blockout/orbital-status-log.js';

const rooms = createOrbitalEarlyRooms();
const accepted = { x: 0, n: 8.63, ground: .32 };
const confirm = { type: 'confirm', leftHeld: true, rightHeld: true } as const;
const next = { type: 'next' } as const;

test('registered S-2 ground reaches the shared hand position through the physical cockpit ramp', () => {
  const route = [[0, -.42], [2.55, -1.44], [2.55, .1], [0, .1], [0, 5.65], [1.25, 5.65], [1.25, 8.72], [0, 8.72]];
  let samples = 0;
  let previous = 0;
  for (let index = 1; index < route.length; index++) {
    const [x, n] = route[index - 1];
    const [tx, tn] = route[index];
    const strides = Math.ceil(Math.hypot(tx - x, tn - n) / .025);
    for (let stride = 1; stride <= strides; stride++) {
      const east = x + (tx - x) * stride / strides;
      const north = n + (tn - n) * stride / strides;
      const ground = rooms.floorHeightAt(east, north);
      assert.ok(ground !== undefined && Math.abs(ground - previous) < .025);
      assert.ok(rooms.isWalkable(east, north, .22));
      previous = ground;
      samples++;
    }
  }
  assert.equal(samples, 720);
  assert.equal(previous, accepted.ground);
  assert.deepEqual(readOrbitalLogReach({ x: 0, n: 8.72, ground: previous }, rooms.cockpit), { left: true, right: true });
  assert.deepEqual(readOrbitalLogReach(accepted, rooms.cockpit), { left: true, right: true });
});

test('remote, wrong height and individual confirmations leave the log closed', () => {
  for (const point of [{ x: 0, n: -.42, ground: 0 }, { ...accepted, ground: 0 }, rooms.cockpit.leftHand, rooms.cockpit.rightHand]) {
    assert.equal(resolveOrbitalLogAction(initialOrbitalLogState, confirm, point, rooms.cockpit), initialOrbitalLogState);
  }
  for (const hands of [[true, false], [false, true]]) {
    assert.equal(resolveOrbitalLogAction(initialOrbitalLogState, {
      type: 'confirm', leftHeld: hands[0], rightHeld: hands[1],
    }, accepted, rooms.cockpit), initialOrbitalLogState);
  }
  assert.equal(resolveOrbitalLogAction(initialOrbitalLogState, next, accepted, rooms.cockpit), initialOrbitalLogState);
});

test('both hands open the first blank slot and successive turns extinguish the lamp only at the end', () => {
  let state = resolveOrbitalLogAction(initialOrbitalLogState, confirm, accepted, rooms.cockpit);
  assert.deepEqual(state, { slot: 0, lastReached: false });
  assert.equal(resolveOrbitalLogAction(state, next, rooms.cockpit.rightHand, rooms.cockpit), state);
  for (let slot = 1; slot < orbitalLogReviewSlots; slot++) {
    state = resolveOrbitalLogAction(state, next, accepted, rooms.cockpit);
    assert.deepEqual(state, { slot, lastReached: slot === orbitalLogReviewSlots - 1 });
  }
  assert.equal(resolveOrbitalLogAction(state, next, accepted, rooms.cockpit), state);
  assert.equal(resolveOrbitalLogAction(state, confirm, accepted, rooms.cockpit), state);
  assert.equal(rooms.cockpit.log.text, '');
  assert.equal(rooms.cockpit.log.lastPageFill, .5);
});
