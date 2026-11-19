import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Scene } from 'three';
import { createRemoteSledCues, createSledAnimation, sledSnowAmount } from '../tools/voxel-tavern/town-blockout/sled-animation';
import { createSledRiderMatrices, writeSledRiderPart } from '../tools/voxel-tavern/town-blockout/sled-rider-pose';
import { createSledTracks, sledTrackCapacity } from '../tools/voxel-tavern/town-blockout/sled-tracks';
import { voxelPersonParts } from '../tools/voxel-tavern/town-blockout/town-voxel-person';

const cue = { mounted: true, east: 0, north: 0, height: 12, yaw: 0,
  speed: 0, turn: 0, braking: false, airborne: false };

test('the rider crosses the frame over 400 ms, brakes with one foot and restores camera FOV', () => {
  const animation = createSledAnimation(() => 12);
  let frame = animation.step(.2, cue);
  assert.equal(frame.weight, .5);
  assert.ok(frame.crossing > .99 && frame.seatBob < -.039);
  frame = animation.step(.2, cue);
  assert.equal(frame.weight, 1);
  for (let i = 0; i < 50; i++) frame = animation.step(.02, { ...cue, speed: 12, turn: 2.4 });
  assert.ok(frame.bend > .30 && frame.bend <= Math.PI / 10);
  assert.ok(frame.fov > 5.9 && frame.fov <= 6);
  for (let i = 0; i < 70; i++) frame = animation.step(.02, { ...cue, speed: 9, turn: -2.4 });
  assert.ok(frame.bend < -.30 && frame.bend >= -Math.PI / 10);
  animation.step(.015, { ...cue, speed: 8, braking: true, turn: 2 });
  frame = animation.step(.015, { ...cue, speed: 8, braking: true, turn: 2 });
  assert.ok(frame.cameraDip > 0 && frame.cameraDip <= .055);
  assert.equal(frame.side, -1);
  for (let i = 0; i < 25; i++) frame = animation.step(.02, { ...cue, speed: 7, braking: true, turn: 2 });
  assert.ok(frame.torso < 0 && frame.brake > .9);
  assert.equal(frame.cameraDip, 0);

  const output = new Float32Array(new Matrix4().toArray());
  const calfDepth = (part: number) => {
    createSledRiderMatrices(0, 0, 0, Math.PI, { ...frame, shellRoll: 0, shellPitch: 0 });
    writeSledRiderPart(output, 0, voxelPersonParts[part], frame);
    return output[14];
  };
  assert.ok(Math.abs(calfDepth(12) - calfDepth(13)) > .05);
  for (let i = 0; i < 15; i++) frame = animation.step(.025, { ...cue, height: 12.8, speed: 8, airborne: true });
  assert.ok(frame.flight > .95 && frame.shellPitch < 0);
  animation.step(.015, cue);
  assert.ok(animation.step(.015, cue).cameraDip > 0);
  assert.equal(animation.step(.2, { ...cue, mounted: false }).weight, .5);
  assert.equal(animation.step(.2, { ...cue, mounted: false }).weight, 0);
  for (let i = 0; i < 12; i++) frame = animation.step(.2, { ...cue, mounted: false });
  assert.ok(frame.fov < .01);
});

test('roughness adds bounded motion and stationary riders look and pat snow after five seconds', () => {
  const animation = createSledAnimation(x => x === 0 ? 12 : 12.12);
  animation.step(.2, cue);
  animation.step(.2, cue);
  let moving = animation.step(.2, { ...cue, speed: 11 });
  for (let i = 0; i < 20; i++) {
    moving = animation.step(.02, { ...cue, speed: 11 });
    assert.ok(Math.abs(moving.jitter) <= .3 * Math.PI / 180);
    assert.ok(Math.abs(moving.seatBob) <= .05);
  }
  let pose = animation.step(.2, cue);
  for (let i = 0; i < 23; i++) pose = animation.step(.2, cue);
  assert.equal(pose.idleLook, 0);
  let looked = false, dusted = false;
  for (let i = 0; i < 15; i++) {
    pose = animation.step(.2, cue);
    looked ||= Math.abs(pose.idleLook) > .05;
    dusted ||= pose.idlePat > .03;
  }
  assert.ok(looked && dusted);
  assert.deepEqual([sledSnowAmount(2.9, false), sledSnowAmount(3, false), sledSnowAmount(8.1, false), sledSnowAmount(4, true)], [0, 2, 9, 14]);
});

test('existing position and yaw samples distinguish turns, hard braking, air and discontinuities', () => {
  const observer = createRemoteSledCues(() => 12);
  const point = (time: number, north: number, yaw: number, height = 12) => ({ time, north, yaw, height, east: 5 });
  observer.observe(point(0, 0, 6.24));
  observer.observe(point(100, 1, .05));
  assert.ok(observer.turn > .9 && observer.turn < .95);
  assert.equal(observer.speed, 10);
  observer.observe(point(200, 1.91, .05));
  assert.equal(observer.braking, true);
  observer.observe(point(300, 2.8, .05, 12.2));
  assert.equal(observer.airborne, true);
  observer.observe(point(400, 3.7, .05));
  assert.equal(observer.takeLanding(), true);
  assert.equal(observer.takeLanding(), false);
  observer.observe(point(810, 7.8, .05));
  assert.ok(observer.speed > 9);
  observer.observe(point(920, 25, .05));
  assert.equal(observer.speed, 0);
  assert.equal(observer.airborne, false);
});

test('the two-rail trail is one draw, overwrites the oldest slot and disappears by twenty seconds', () => {
  const scene = new Scene();
  const tracks = createSledTracks(scene, () => 12);
  for (let i = 0; i < 4500; i++) {
    tracks.mark(i * .7, 60, i % 2 === 0);
    tracks.update(.04);
    assert.ok(tracks.count <= sledTrackCapacity);
  }
  assert.equal(scene.children.length, 1);
  assert.equal(tracks.count, sledTrackCapacity);
  const mesh = scene.children[0] as import('three').Mesh;
  assert.equal(mesh.geometry.drawRange.count / 3, 1600);
  tracks.breakPath();
  tracks.update(19);
  assert.ok(tracks.count > 0 && tracks.count < 40);
  tracks.update(1.06);
  assert.equal(tracks.count, 0);
  assert.equal(mesh.visible, false);
});
