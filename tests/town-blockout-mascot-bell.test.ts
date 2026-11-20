import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import type { MascotFollowPoint } from '../tools/voxel-tavern/town-blockout/mascot-follow.ts';
import { addMascotToNpcBatch, townMascotParts,
  type TownMascotFinaleFrame } from '../tools/voxel-tavern/town-blockout/town-mascot.ts';

test('the mascot neck bell uses its existing two animated instances', () => {
  const parts = townMascotParts.filter(part => part.joint === 3);
  assert.equal(townMascotParts.length, 100);
  assert.deepEqual(parts.map(({ tint }) => tint), ['#e9aa3d', '#302b35']);
});

function mockBellAudio() {
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
  return { frequencies, peaks, context, runningAudio: () => context as unknown as AudioContext };
}

test('walking chimes use unlocked audio only and respect distance, jump and mounted state', t => {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), townMascotParts.length);
  const point: MascotFollowPoint = { x: 0, n: 0, ground: 0, yaw: 0, speed: 2 };
  const { context, frequencies, peaks, runningAudio } = mockBellAudio();
  let time = 0, distance: number | undefined = 0;
  const update = addMascotToNpcBatch(batch, 0, {
    now: () => time,
    groundAt: () => undefined,
    follow: () => point,
    visible: () => false,
    bell: {
      runningAudio,
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

test('the finale keeps the neck bell on real strides and resets it across scene changes and missing poses', () => {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), townMascotParts.length);
  const { context, frequencies, runningAudio } = mockBellAudio();
  context.state = 'running';
  const resonance = { visible: true };
  let time = 0, frame: TownMascotFinaleFrame | undefined;
  const update = addMascotToNpcBatch(batch, 0, {
    now: () => time,
    groundAt: () => assert.fail('no old patrol while the host controls the model'),
    follow: () => assert.fail('no old follow pose while the host controls the model'),
    visible: () => true,
    bell: { runningAudio, listenerDistance: () => 0 },
    finale: { read: () => frame, ringResonance: resonance },
  });
  const scene = (
    x: number, phase: TownMascotFinaleFrame['phase'],
    progress: TownMascotFinaleFrame['progress'], speed = 2,
  ): TownMascotFinaleFrame => ({ point: { x, n: 0, ground: 0, yaw: 0, speed }, phase, progress });
  const progress = { ringCount: 11, goatRevealed: false, firstKeyLit: false };
  const revealed = { ...progress, goatRevealed: true };
  function step(next: TownMascotFinaleFrame | undefined, elapsed = 120) {
    time += elapsed;
    frame = next;
    update();
    update();
  }

  assert.equal(resonance.visible, false);
  step(scene(0, 'background', progress));
  step(scene(.2, 'background', progress));
  step(scene(.4, 'background', progress));
  assert.deepEqual(frequencies, [920, 1470]);
  step(scene(.6, 'background', progress));
  step(scene(.8, 'ring-passage', { ...revealed, ringCount: 10 }));
  assert.equal(resonance.visible, false);
  assert.deepEqual(frequencies, [920, 1470], 'the last background half-stride ends at the phase boundary');
  step(scene(.8, 'ring-passage', progress), 0);
  assert.equal(resonance.visible, false);
  step(scene(.8, 'ring-passage', revealed), 0);
  assert.equal(resonance.visible, true);
  step(scene(1, 'ring-passage', revealed));
  step(scene(1.2, 'ring-passage', revealed));
  assert.deepEqual(frequencies, [920, 1470, 920, 1470]);
  step(scene(1.4, 'ring-passage', revealed));
  step(scene(2, 'witness', revealed), 0);
  assert.equal(resonance.visible, false);
  const matrix = new Matrix4();
  batch.getMatrixAt(0, matrix);
  assert.equal(new Vector3().setFromMatrixPosition(matrix).x, 2, 'the witness pose applies on the same tick');
  step(scene(2.2, 'witness', revealed));
  step(undefined, 0);
  assert.equal(batch.count, 0);
  step(scene(2.4, 'witness', { ...revealed, ringCount: 12, firstKeyLit: true }));
  step(scene(2.6, 'witness', revealed, 0));
  assert.deepEqual(frequencies, [920, 1470, 920, 1470]);
});
test('the host motif consumes a live authorized ring cue once without replaying snapshot state', () => {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), 100);
  const revealed = { ringCount: 11, goatRevealed: true, firstKeyLit: false };
  const point = { x: 10, n: 22, ground: 12, yaw: 0, speed: 0 };
  const confirmed: TownMascotFinaleFrame = { progress: revealed, phase: 'ring-passage', point };
  const light = { visible: true };
  const heard: Array<{ at: number; x: number }> = [];
  let now = 1000, frame: TownMascotFinaleFrame | undefined;
  const update = addMascotToNpcBatch(batch, 0, {
    now: () => now,
    groundAt: () => undefined,
    visible: () => false,
    finale: {
      read: () => frame,
      ringResonance: light,
      onRingResonance: (at, pose) => heard.push({ at, x: pose.x }),
    },
  });
  function step(value?: TownMascotFinaleFrame) {
    frame = value;
    update();
  }

  step(confirmed);
  assert.equal(light.visible, true);
  step({ ...confirmed, resonanceAt: 999 });
  step({ ...confirmed, resonanceAt: 1002 });
  step({ ...confirmed, resonanceAt: 1000, progress: { ...revealed, goatRevealed: false } });
  step({ ...confirmed, resonanceAt: 1000, point: { ...point, ground: NaN } });
  assert.equal(light.visible, false);
  assert.deepEqual(heard, []);
  const cue = { ...confirmed, resonanceAt: 1000 };
  step(cue);
  step(cue);
  step();
  now += 40;
  step(cue);
  step({ ...confirmed, resonanceAt: 1001, phase: 'witness' });
  step({ ...confirmed, resonanceAt: 1001, progress: { ...revealed, ringCount: 12, firstKeyLit: true } });
  assert.equal(light.visible, false);
  assert.equal(batch.count, 0);
  assert.deepEqual(heard, [{ at: 1000, x: 10 }]);
});
