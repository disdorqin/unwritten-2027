import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundCrystalMimicAudio } from '../tools/voxel-tavern/town-blockout/underground-crystal-mimic-audio.ts';
import { createUndergroundCrystalMimic } from '../tools/voxel-tavern/town-blockout/underground-crystal-mimic.ts';

function harness() {
  let now = 0;
  let contextState: AudioContextState = 'running';
  const sampleRate = 16_000;
  const output = {} as AudioNode;
  type SourceProbe = {
    buffer?: { channels: Float32Array; duration: number; sampleRate: number };
    offset?: number;
    target?: AudioNode;
    stops: number;
    disconnects: number;
  };
  const sources: SourceProbe[] = [];
  const context = {
    get currentTime() { return now / 1000; },
    get state() { return contextState; },
    sampleRate,
    createBuffer(_channels: number, length: number, rate: number) {
      const channels = new Float32Array(length);
      return { channels, duration: length / rate, sampleRate: rate, getChannelData: () => channels };
    },
    createBufferSource() {
      const probe: SourceProbe = { stops: 0, disconnects: 0 };
      sources.push(probe);
      return {
        onended: null,
        set buffer(value: SourceProbe['buffer']) { probe.buffer = value; },
        connect(target: AudioNode) { probe.target = target; },
        disconnect() { probe.disconnects++; },
        start(_time: number, offset: number) { probe.offset = offset; },
        stop() { probe.stops++; },
      };
    },
  } as unknown as BaseAudioContext;
  const mimic = createUndergroundCrystalMimic({ id: 'cue-a', crystalKind: 'blue', wildGrade: 1, now: () => now });
  const audio = createUndergroundCrystalMimicAudio(context, output, 'crystal');
  return {
    audio, sources, output,
    at(ms: number, distance?: number, domain: string | undefined = 'crystal') {
      now = ms;
      audio.sync({ listenerDomain: domain, acceptedDistanceMetres: distance, sample: mimic.sample(distance) });
    },
    reveal(ms: number) {
      now = ms;
      assert.equal(mimic.hit({ actorId: 'player', attackId: 'hit-a', weapon: 'snowball' }).kind, 'revealed');
    },
    setContext(state: AudioContextState) { contextState = state; },
  };
}

function peak(samples: Float32Array) {
  return samples.reduce((highest, value) => Math.max(highest, Math.abs(value)), 0);
}

test('U-3 disguised chime stays quiet, uses the host bus, and waits between beats within an accepted metre', () => {
  const h = harness();
  h.at(0, 0, 'mine');
  h.at(10, undefined);
  h.at(20, 1.001);
  assert.equal(h.sources.length, 0);
  h.at(30, 1);
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].target, h.output);
  assert.equal(h.sources[0].buffer?.duration, .15);
  const level = peak(h.sources[0].buffer!.channels);
  assert.ok(level > 0 && level < .012);
  h.at(35, .2);
  h.at(40, 2);
  assert.equal(h.sources[0].stops, 1);
  assert.equal(h.sources[0].disconnects, 1);
  h.at(2600, .5);
  assert.equal(h.sources.length, 1);
  h.at(2700, .5);
  assert.equal(h.sources.length, 2);
  h.at(2710, .5, 'mine');
  assert.equal(h.sources[1].stops, 1);
});

test('U-3 a confirmed unfolding replaces the chime with one quiet crackle spanning the authored unfold', () => {
  const h = harness();
  h.at(0, .7);
  h.reveal(100);
  h.at(400, .7);
  assert.equal(h.sources.length, 2);
  assert.equal(h.sources[0].stops, 1);
  const crackle = h.sources[1];
  assert.equal(crackle.offset, .3);
  assert.equal(crackle.buffer?.duration, 1.2);
  const level = peak(crackle.buffer!.channels);
  assert.ok(level > .01 && level < .052);
  h.at(500, .7);
  h.at(1100, .7, 'mine');
  h.at(1299, .7);
  h.at(1400, .7);
  assert.equal(h.sources.length, 2);
  assert.equal(crackle.stops, 1);
  assert.equal(crackle.disconnects, 1);
});

test('U-3 does not replay obsolete or suspended unfolding and disposes its active voice', () => {
  const h = harness();
  h.setContext('suspended');
  h.reveal(0);
  h.at(10, .6);
  h.setContext('running');
  h.at(20, .6);
  assert.equal(h.sources.length, 0);

  const late = harness();
  late.reveal(0);
  late.at(1200, .6);
  assert.equal(late.sources.length, 0);

  const active = harness();
  active.reveal(0);
  active.at(10, .6);
  active.audio.dispose();
  active.audio.dispose();
  active.at(20, .6);
  assert.equal(active.sources.length, 1);
  assert.equal(active.sources[0].stops, 1);
  assert.equal(active.sources[0].disconnects, 1);
});
