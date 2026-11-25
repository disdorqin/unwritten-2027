import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundLiftCinematic } from '../tools/voxel-tavern/town-blockout/underground-lift-cinematic';
import { createUndergroundLiftCinematicEffects } from '../tools/voxel-tavern/town-blockout/underground-lift-cinematic-effects';

const first = { id: 1, first: true, departedAt: 1000, travelMs: 10_000 } as const;
const repeat = { id: 2, first: false, departedAt: 30_000, travelMs: 20_000 } as const;

test('first descent stages build toward full black and waking waits for the accepted landing', () => {
  const cinema = createUndergroundLiftCinematic();
  assert.equal(cinema.sample(1000), undefined);
  assert.equal(cinema.start(first, 1000), true);
  assert.equal(cinema.sample(1000)?.phase, 'boarding');
  assert.equal(cinema.confirmBlackout(first.id), false);
  assert.equal(cinema.skip(first.id), false);
  const early = cinema.sample(3400);
  const late = cinema.sample(6700);
  assert.equal(early?.phase, 'sway');
  assert.equal(late?.phase, 'sway');
  assert.ok(late!.sway > early!.sway);
  assert.equal(cinema.sample(7700)?.phase, 'flash');
  assert.equal(cinema.sample(8600)?.phase, 'screech');
  assert.equal(cinema.sample(9800)?.blackout, true);
  assert.equal(cinema.confirmBlackout(first.id), true);
  assert.equal(cinema.beginHandoff(first.id), false);
  assert.equal(cinema.sample(10_999)?.phase, 'blackout');
  assert.equal(cinema.beginHandoff(first.id), false);
  assert.equal(cinema.sample(11_000)?.phase, 'blackout');
  assert.equal(cinema.acceptLanding(first.id, 11_000), false);
  assert.equal(cinema.beginHandoff(first.id), true);
  assert.equal(cinema.beginHandoff(first.id), false);
  assert.equal(cinema.sample(50_000)?.phase, 'blackout');
  assert.equal(cinema.acceptLanding(2, 50_000), false);
  assert.equal(cinema.acceptLanding(first.id, 50_000), true);
  assert.deepEqual(cinema.sample(50_000), {
    tripId: first.id, phase: 'waking', progress: 0, sway: 0, blackout: false, canSkip: true, skipped: false,
  });
  assert.equal(cinema.acceptLanding(first.id, 50_500), false);
  assert.equal(cinema.sample(51_150)?.phase, 'sitting');
  assert.equal(cinema.sample(52_100)?.phase, 'complete');
});

test('skip only shortens the second half and failed handoffs can retry under the same blackout', () => {
  const cinema = createUndergroundLiftCinematic();
  cinema.start(first, 1000);
  assert.equal(cinema.sample(9700)?.canSkip, false);
  assert.equal(cinema.skip(first.id), false);
  assert.equal(cinema.sample(11_000)?.canSkip, true);
  assert.equal(cinema.skip(first.id + 1), false);
  assert.equal(cinema.skip(first.id), true);
  assert.equal(cinema.skip(first.id), false);
  assert.equal(cinema.beginHandoff(first.id), false);
  assert.equal(cinema.confirmBlackout(first.id), true);
  assert.equal(cinema.beginHandoff(first.id), true);
  assert.equal(cinema.retryHandoff(first.id + 1), false);
  assert.equal(cinema.retryHandoff(first.id), true);
  assert.equal(cinema.acceptLanding(first.id, 12_000), false);
  assert.equal(cinema.sample(12_000)?.blackout, true);
  assert.equal(cinema.beginHandoff(first.id), true);
  assert.equal(cinema.acceptLanding(first.id, 12_000), true);
  assert.equal(cinema.sample(12_000)?.phase, 'complete');
  assert.equal(cinema.sample(12_000)?.skipped, true);
});

test('repeat uses a short visual finish with the original physical trip duration', () => {
  const cinema = createUndergroundLiftCinematic();
  cinema.start(repeat, 30_000);
  const phases = new Set<string>();
  for (let time = 30_000; time < 50_000; time += 50) {
    const frame = cinema.sample(time)!;
    phases.add(frame.phase);
    assert.equal(frame.canSkip, false);
  }
  assert.deepEqual([...phases], ['boarding', 'ride', 'sway', 'blackout']);
  assert.equal(cinema.confirmBlackout(repeat.id), true);
  assert.equal(cinema.beginHandoff(repeat.id), false);
  cinema.sample(50_000);
  assert.equal(cinema.beginHandoff(repeat.id), true);
  assert.equal(cinema.acceptLanding(repeat.id, 50_000), true);
  assert.equal(cinema.sample(50_000)?.phase, 'complete');
});

test('both downward trips share a single water-film cue before landing, and skip leaves the blackout locked', () => {
  const cinema = createUndergroundLiftCinematic();
  assert.equal(cinema.start(first, 1000), true);
  assert.equal(cinema.sample(9499)?.waterFilm, undefined);
  assert.equal(cinema.sample(9500)?.waterFilm, true);
  const firstBlackout = cinema.sample(9800)!;
  assert.equal(firstBlackout.waterFilm, true);
  assert.equal(cinema.skip(first.id), true);
  assert.equal(cinema.sample(9900)?.waterFilm, undefined);
  assert.equal(cinema.confirmBlackout(first.id), true);
  assert.equal(cinema.beginHandoff(first.id), false);
  assert.equal(cinema.sample(11_000)?.phase, 'blackout');
  assert.equal(cinema.beginHandoff(first.id), true);
  assert.equal(cinema.acceptLanding(first.id, 11_000), true);
  assert.equal(cinema.sample(11_000)?.phase, 'complete');
  assert.equal(cinema.start(repeat, 30_000), true);
  assert.equal(cinema.sample(48_499)?.waterFilm, undefined);
  assert.equal(cinema.sample(48_500)?.waterFilm, true);
  const repeatBlackout = cinema.sample(49_200)!;
  assert.equal(repeatBlackout.waterFilm, true);
  assert.equal(cinema.sample(50_000)?.waterFilm, undefined);
  assert.equal(cinema.start({ ...repeat, id: 3 }, 50_000), false);

  const played: Array<{ destination?: object; stopped: boolean }> = [];
  const samples = new Float32Array(65);
  const context = {
    state: 'running', currentTime: 0, sampleRate: 100,
    createBuffer() { return { getChannelData: () => samples }; },
    createBufferSource() {
      const record: (typeof played)[number] = { stopped: false };
      return {
        connect(destination: object) { record.destination = destination; },
        start() { played.push(record); },
        stop() { record.stopped = true; },
      };
    },
  };
  const output = { context };
  const makeElement = () => ({
    hidden: false, dataset: {}, style: {},
    append() {}, setAttribute() {}, remove() {}, addEventListener() {}, removeEventListener() {},
  });
  const parent = { ...makeElement(), ownerDocument: { createElement: makeElement } } as unknown as HTMLElement;
  const effects = createUndergroundLiftCinematicEffects({
    parent, cameraMotion: () => {}, onSkip: () => {}, reducedMotion: () => true,
    getAudioContext: () => context as unknown as BaseAudioContext, audioOutput: () => output as unknown as AudioNode,
  });

  effects.present(firstBlackout, 8.8);
  effects.present(firstBlackout, 9);
  assert.equal(played.length, 1);
  assert.equal(played[0].destination, output);
  assert.equal(Math.abs(samples[0]), 0);
  assert.ok(samples.some(value => Math.abs(value) > .001));
  effects.present({ ...firstBlackout, waterFilm: undefined, skipped: true }, 9.1);
  assert.equal(played[0].stopped, true);
  effects.present(repeatBlackout, 19.2);
  effects.present(repeatBlackout, 19.4);
  assert.equal(played.length, 2);
  effects.dispose();
  assert.equal(played[1].stopped, true);
});

test('late snapshots never replay earlier effects or reopen completed and cancelled descents', () => {
  const cinema = createUndergroundLiftCinematic();
  assert.equal(cinema.start({ ...first, travelMs: 0 }, 1000), false);
  assert.equal(cinema.start({ ...repeat, travelMs: 1000 }, 1000), false);
  assert.equal(cinema.start(first, 20_000), true);
  assert.equal(cinema.sample(20_000)?.phase, 'blackout');
  assert.equal(cinema.sample(1000)?.phase, 'blackout');
  assert.equal(cinema.start(first, 20_000), false);
  assert.equal(cinema.start(repeat, 20_000), false);
  assert.equal(cinema.cancel(first.id), true);
  assert.equal(cinema.start(first, 20_000), false);
  assert.equal(cinema.start(repeat, 30_000), true);
  assert.equal(cinema.confirmBlackout(first.id), false);
  assert.equal(cinema.acceptLanding(first.id, 51_000), false);
  assert.equal(cinema.sample(30_000)?.phase, 'boarding');
});
