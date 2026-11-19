import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, InstancedMesh, MeshLambertMaterial } from 'three';
import type { MascotFollowPoint } from '../tools/voxel-tavern/town-blockout/mascot-follow.ts';
import { addMascotToNpcBatch, townMascotParts } from '../tools/voxel-tavern/town-blockout/town-mascot.ts';

test('the mascot neck bell uses its existing two animated instances', () => {
  const parts = townMascotParts.filter(part => part.joint === 3);
  assert.equal(townMascotParts.length, 100);
  assert.deepEqual(parts.map(({ tint }) => tint), ['#e9aa3d', '#302b35']);
});

test('walking chimes use unlocked audio only and respect distance, jump and mounted state', t => {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), townMascotParts.length);
  const point: MascotFollowPoint = { x: 0, n: 0, ground: 0, yaw: 0, speed: 2 };
  const frequencies: number[] = [], peaks: number[] = [];
  const context = {
    state: 'suspended', currentTime: 10, destination: {},
    createOscillator: () => ({
      frequency: { setValueAtTime: (frequency: number) => frequencies.push(frequency) },
      connect() {}, disconnect() {}, start() {}, stop() {},
    }),
    createGain: () => ({
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime: (gain: number) => { if (gain > 0) peaks.push(gain); },
      },
      connect() {}, disconnect() {},
    }),
  };
  let time = 0, distance: number | undefined = 0;
  const update = addMascotToNpcBatch(batch, 0, {
    now: () => time,
    groundAt: () => undefined,
    follow: () => point,
    visible: () => false,
    bell: {
      runningAudio: () => context as unknown as AudioContext,
      listenerDistance: () => distance,
    },
  });
  function step(east: number, elapsed = 120) {
    point.x = east;
    time += elapsed;
    update();
    update(); // A repeated render in the same tick must not replay the chime.
  }
  step(0);
  step(.2);
  step(.4);
  assert.deepEqual(frequencies, []);
  context.state = 'running';
  step(.6);
  step(.8);
  assert.deepEqual(frequencies, [920, 1470]);
  assert.deepEqual(peaks, [.03, .014]);
  assert.equal(batch.count, 0, 'chime remains audible just off camera without an extra draw');
  distance = 8;
  step(1);
  step(1.2);
  assert.deepEqual(peaks, [.03, .014, .0075, .0035]);
  distance = 16;
  step(1.4);
  step(1.6);
  step(1.8);
  distance = undefined;
  step(2);
  step(2.2);
  distance = 0;
  step(10); // A jump of more than one render step, not a walk.
  step(10.2, 480); // Ignore a suspended tab's elapsed time.
  point.seated = true;
  step(10.4);
  delete point.seated;
  point.sliding = true;
  step(10.6);
  delete point.sliding;
  point.speed = 0;
  step(10.8);
  assert.deepEqual(frequencies, [920, 1470, 920, 1470]);
  t.diagnostic('2 chimes / 4 partials; peaks 0.030 and 0.0075 at 0 m and 8 m; zero from suspended, boundary, other layer, teleport, seated, skating or stationary samples');
});
