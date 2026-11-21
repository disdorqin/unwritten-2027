import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundMineSpiritAudio, type MineSpiritAudioFrame, type MineSpiritKnockCue,
} from '../tools/voxel-tavern/town-blockout/underground-mine-spirit-audio.ts';

function fakeAudio() {
  const samples: Float32Array[] = [];
  const lines: Array<[unknown, unknown]> = [];
  const sources: Array<ReturnType<typeof sourceNode>> = [];
  const panners: Array<ReturnType<typeof pannerNode>> = [];
  const context = {
    state: 'running', sampleRate: 48_000, currentTime: 5,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      samples.push(data);
      return { getChannelData: () => data };
    },
    createBufferSource() {
      const source = sourceNode();
      sources.push(source);
      return source;
    },
    createPanner() {
      const panner = pannerNode();
      panners.push(panner);
      return panner;
    },
  };

  function audioNode() {
    return {
      disconnected: false,
      connect<T>(target: T) { lines.push([this, target]); return target; },
      disconnect() { this.disconnected = true; },
    };
  }

  function sourceNode() {
    return {
      ...audioNode(), starts: [] as number[], stops: 0, onended: null as (() => void) | null,
      start(at: number) { this.starts.push(at); },
      stop() { this.stops++; },
    };
  }

  function pannerNode() {
    return {
      ...audioNode(), positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 },
      refDistance: 0, maxDistance: 0,
    };
  }

  const hostBus = { context };
  const sound = createUndergroundMineSpiritAudio(
    context as unknown as BaseAudioContext, hostBus as unknown as AudioNode,
  );
  return { context, hostBus, samples, sources, panners, lines, sound };
}

const cue: MineSpiritKnockCue = {
  sequence: 10, domainId: 'mine-first', origin: { x: 2, y: -90.1, z: 6 }, rangeMetres: 4,
};
const frame: MineSpiritAudioFrame = {
  activeDomain: 'mine-first', soulSightGranted: true, listener: { x: 1, y: -90, z: 5 },
};

test('permission, domain, accepted distance, and live audio all gate new knocks', () => {
  const { context, sound, sources } = fakeAudio();
  assert.equal(sound.sync({ ...frame, soulSightGranted: false, cue }), false);
  assert.equal(sound.sync({ ...frame, cue }), false);
  assert.equal(sound.sync({ ...frame, activeDomain: 'surface', cue: { ...cue, sequence: 11 } }), false);
  assert.equal(sound.sync({ ...frame, listener: { x: -3, y: -90, z: 5 }, cue: { ...cue, sequence: 12 } }), false);
  assert.equal(sound.sync({ ...frame, listener: undefined, cue: { ...cue, sequence: 13 } }), false);
  context.state = 'suspended';
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 14 } }), false);
  context.state = 'running';
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 14 } }), false);
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 11 } }), false);
  assert.equal(sources.length, 0);
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 15 } }), true);
});

test('one quiet, three-blow spatial voice reaches the shared bus and refuses replay', () => {
  const { sound, context, hostBus, lines, sources, panners, samples } = fakeAudio();
  assert.equal(sound.sync({ ...frame, cue }), true);
  assert.equal(sound.sync({ ...frame, cue }), false);
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 9 } }), false);
  assert.deepEqual(sources[0].starts, [5]);
  assert.equal(sources.length, 1);
  const [panner] = panners;
  assert.deepEqual([panner.positionX.value, panner.positionY.value, panner.positionZ.value], [2, -90.1, 6]);
  assert.equal(panner.maxDistance, cue.rangeMetres);
  assert.equal(lines[1][1], hostBus);
  const [raw] = samples;
  const peak = (start: number, end: number) => Math.max(
    ...raw.slice(start * context.sampleRate, end * context.sampleRate).map(Math.abs),
  );
  assert.equal(raw.length / context.sampleRate, .50);
  assert.ok(peak(.014, .10) > .01);
  assert.ok(peak(.159, .24) > .01);
  assert.ok(peak(.337, .42) > .01);
  assert.ok(peak(0, .50) < .05);
  assert.equal(peak(.45, .50), 0);
  sources[0].onended?.();
  assert.equal(sources[0].disconnected, true);
  assert.equal(panner.disconnected, true);
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 11 } }), true);
  assert.equal(samples.length, 1);
});

test('domain or privilege loss stops a voice, without closing the host context or leaving hooks', () => {
  const { sound, context, sources, panners } = fakeAudio();
  sound.sync({ ...frame, cue });
  assert.equal(sound.sync({ ...frame, activeDomain: 'surface' }), false);
  assert.equal(sources[0].stops, 1);
  assert.equal(sources[0].onended, null);
  assert.equal(panners[0].disconnected, true);
  assert.equal(sound.sync({ ...frame, cue }), false);

  sound.sync({ ...frame, cue: { ...cue, sequence: 11 } });
  sound.sync({ ...frame, soulSightGranted: false });
  assert.equal(sources[1].stops, 1);
  sound.sync({ ...frame, cue: { ...cue, sequence: 12 } });
  sound.dispose();
  sound.dispose();
  assert.equal(sources[2].stops, 1);
  assert.equal(panners[2].disconnected, true);
  assert.equal(context.state, 'running');
  assert.equal(sound.sync({ ...frame, cue: { ...cue, sequence: 13 } }), false);
});
