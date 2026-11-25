import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  avatarRootOffset, effectiveTownAvatarPose, isTownAvatarPose, writeAvatarPart,
} from '../tools/voxel-tavern/town-blockout/town-presence-pose.ts';
import { voxelPersonParts } from '../tools/voxel-tavern/town-blockout/town-voxel-person.ts';

test('online activity pose follows layered priority and a half-metre skate threshold', () => {
  assert.equal(effectiveTownAvatarPose(true, true, true, true, 8), 4);
  assert.equal(effectiveTownAvatarPose(false, true, true, true, 8), 2);
  assert.equal(effectiveTownAvatarPose(false, false, true, true, 8), 5);
  assert.equal(effectiveTownAvatarPose(false, false, false, true, 8), 1);
  assert.equal(effectiveTownAvatarPose(false, false, false, false, .5), 0);
  assert.equal(effectiveTownAvatarPose(false, false, false, false, .51), 3);
  for (const v of [0, 1, 2, 3, 4, 5]) assert.equal(isTownAvatarPose(v), true);
  for (const v of [undefined, null, -1, 1.5, 6, 255, '1', NaN]) assert.equal(isTownAvatarPose(v), false);
});

test('pose 7 is sledding: valid, ranked below riding, with no root offset; pose 6 stays invalid', () => {
  assert.equal(isTownAvatarPose(7), true);
  assert.equal(isTownAvatarPose(8), true);
  assert.equal(isTownAvatarPose(9), false);
  assert.equal(isTownAvatarPose(6), false);
  assert.equal(effectiveTownAvatarPose(false, false, false, false, 0, true), 7);
  assert.equal(effectiveTownAvatarPose(false, false, false, true, 8, true), 7);
  assert.equal(effectiveTownAvatarPose(false, false, true, false, 0, true), 5);
  assert.equal(effectiveTownAvatarPose(false, true, false, false, 0, true), 2);
  assert.equal(effectiveTownAvatarPose(true, false, false, false, 0, true), 4);
  assert.equal(effectiveTownAvatarPose(false, false, false, false, 0, true, true), 8);
  assert.equal(effectiveTownAvatarPose(false, false, true, false, 0, true, true), 5);
  assert.equal(avatarRootOffset(7), 0);
  assert.equal(avatarRootOffset(8), 0);
});

test('shared avatar instances lower seats, spread soaking arms, and raise a drink', () => {
  const avatar = (part: number, pose: 0 | 1 | 2 | 3 | 4 | 5, gait = 0, throwPitch = 0) => {
    const out = new Float32Array(16);
    out[15] = 1;
    writeAvatarPart(out, 0, voxelPersonParts[part], pose, 0, avatarRootOffset(pose), 0, 1, 0, gait, throwPitch);
    return out;
  };
  const standing = avatar(11, 0);
  const seat = avatar(11, 1);
  assert.ok(Math.abs(seat[5]) < .001 && seat[14] > standing[14] + .3);
  assert.deepEqual(avatar(11, 5), seat);
  assert.ok(avatar(17, 2)[12] > avatar(17, 0)[12] + .2);
  assert.ok(avatar(21, 4)[13] > avatar(21, 0)[13] + .6);
  assert.ok(avatar(21, 0, 0, -1.5)[14] > .45);
  assert.ok(avatar(11, 3, .8)[14] * avatar(10, 3, .8)[14] < 0);
  assert.deepEqual(avatar(11, 0), standing);
});
