import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUndergroundMineCartAudio } from '../tools/voxel-tavern/town-blockout/underground-mine-cart-audio.ts';

function makeAudio() {
  const sounds: Array<{ samples: Float32Array }> = [];
  const voices: Array<ReturnType<typeof createBufferSource>> = [];
  const panners: Array<ReturnType<typeof createPanner>> = [];
  const connections: unknown[][] = [];
  const context = { state: 'running', sampleRate: 48_000 };
  const destination = { context };
  function makeNode() {
    return {
      disconnected: false,
      connect<T>(target: T) { connections.push([this, target]); return target; },
      disconnect() { this.disconnected = true; },
    };
  }
  function createPanner() {
    return {
      ...makeNode(),
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
      maxDistance: 0,
    };
  }
  function createBufferSource() {
    return {
      ...makeNode(),
      buffer: undefined as unknown,
      onended: null as (() => void) | null,
      starts: 0, stops: 0,
      start() { this.starts++; },
      stop() { this.stops++; },
    };
  }
  Object.assign(context, {
    destination,
    createPanner() { const panner = createPanner(); panners.push(panner); return panner; },
    createBufferSource() { const voice = createBufferSource(); voices.push(voice); return voice; },
    createBuffer(_channels: number, length: number) {
      const samples = new Float32Array(length);
      sounds.push({ samples });
      return { getChannelData: () => samples };
    },
  });
  return { context, destination, sounds, voices, panners, connections, audioContext: context as unknown as AudioContext };
}

const cart = { layer: 'mine-first', x: -1.15, y: -91.2, z: -12.4 };

test('an accepted push creates one short and bounded spatial voice on the host audio bus', () => {
  const fixture = makeAudio();
  const hostBus = { context: fixture.context } as unknown as AudioNode;
  let requestedContexts = 0;
  const audio = createUndergroundMineCartAudio({
    getContext() { requestedContexts++; return fixture.audioContext; },
    output: () => hostBus,
  });

  assert.equal(audio.play(cart), false);
  audio.setListenerLayer('surface');
  assert.equal(audio.play(cart), false);
  audio.setListenerLayer(cart.layer);
  assert.equal(audio.play({ ...cart, y: NaN }), false);
  assert.equal(requestedContexts, 0);
  fixture.context.state = 'suspended';
  assert.equal(audio.play(cart), false);
  assert.equal(fixture.voices.length, 0);
  fixture.context.state = 'running';

  assert.equal(audio.play(cart), true);
  assert.equal(audio.play(cart), false);
  assert.deepEqual(fixture.voices.map(voice => voice.starts), [1]);
  const [panner] = fixture.panners;
  assert.deepEqual([panner.positionX.value, panner.positionY.value, panner.positionZ.value], [cart.x, cart.y, cart.z]);
  assert.equal(fixture.connections[1][1], hostBus);
  const [{ samples }] = fixture.sounds;
  assert.ok(samples.length / fixture.context.sampleRate < .5);
  const peak = Math.max(...samples.map(Math.abs));
  assert.ok(peak > .025 && peak < .15, 'the rail rattle should remain audible and quiet');

  fixture.voices[0].onended?.();
  assert.equal(fixture.voices[0].disconnected, true);
  assert.equal(panner.disconnected, true);
  assert.equal(audio.play(cart), true);
  assert.equal(fixture.sounds.length, 1);
});

test('leaving a layer or disposing immediately removes scheduled sound and keeps the shared context running', () => {
  const fixture = makeAudio();
  const audio = createUndergroundMineCartAudio({ getContext: () => fixture.audioContext });
  audio.setListenerLayer(cart.layer);
  assert.equal(audio.play(cart), true);
  audio.setListenerLayer('surface');
  assert.equal(fixture.voices[0].stops, 1);
  assert.equal(fixture.voices[0].onended, null);
  assert.equal(fixture.panners[0].disconnected, true);
  assert.equal(audio.play(cart), false);

  audio.setListenerLayer(cart.layer);
  assert.equal(audio.play(cart), true);
  assert.equal(fixture.sounds.length, 1);
  audio.dispose();
  audio.dispose();
  assert.equal(fixture.voices[1].stops, 1);
  assert.equal(fixture.panners[1].disconnected, true);
  assert.equal(fixture.context.state, 'running');
  audio.setListenerLayer(cart.layer);
  assert.equal(audio.play(cart), false);
});
