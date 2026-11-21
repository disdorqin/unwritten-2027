import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSummitRingFeedbackAudio, summitRingTone } from '../tools/voxel-tavern/town-blockout/main-summit-glide-ring-audio';

test('ZD-08 native ring feedback has distinct original clean/graze/miss cues with safe amplitudes', () => {
  const clean = summitRingTone('clean', 7);
  const graze = summitRingTone('graze', 7);
  const missed = summitRingTone('miss', 0);
  assert.ok(clean.frequencyHz > graze.frequencyHz && graze.frequencyHz > missed.frequencyHz);
  assert.ok(clean.endFrequencyHz > clean.frequencyHz);
  assert.ok(missed.endFrequencyHz < missed.frequencyHz);
  assert.ok([clean, graze, missed].every(tone =>
    tone.durationSeconds >= .1 && tone.durationSeconds <= .3 &&
    tone.gain >= 0 && tone.gain <= .07));
  assert.ok(summitRingTone('clean', 500).frequencyHz === summitRingTone('clean', 7).frequencyHz,
    'Streak feedback must cap frequency, not climb indefinitely');
  assert.throws(() => summitRingTone('clean', -1), RangeError);
});

test('ZD-08 sound is muted until opt-in, follows visual grade, and stops immediately when muted', () => {
  const frequencies: number[] = [];
  const durations: number[] = [];
  let contexts = 0;
  let closed = 0;
  let oscillators = 0;
  let resumes = 0;
  function parameter(): any {
    return {
      setValueAtTime(value: number) { frequencies.push(value); },
      exponentialRampToValueAtTime(value: number) { frequencies.push(value); },
      linearRampToValueAtTime(value: number) { frequencies.push(value); },
    };
  }
  const fakeContext = (): AudioContext => {
    contexts++;
    return {
      currentTime: 1,
      destination: {},
      resume() { resumes++; return Promise.resolve(); },
      close() { closed++; return Promise.resolve(); },
      createOscillator() {
        oscillators++;
        return {
          frequency: parameter(),
          type: 'sine',
          connect() {},
          disconnect() {},
          start() {},
          stop(at: number) { durations.push(at - 1); },
          onended: null,
        };
      },
      createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; },
    } as unknown as AudioContext;
  };
  const sound = createSummitRingFeedbackAudio(fakeContext);
  assert.equal(sound.snapshot().enabled, false);
  assert.equal(sound.play('clean', 1), false);
  assert.equal(contexts, 0);
  assert.equal(sound.toggle(), true);
  assert.equal(contexts, 1);
  assert.equal(sound.play('clean', 1), true);
  assert.equal(sound.play('graze', 1), true);
  assert.equal(sound.play('miss', 0), true);
  assert.equal(sound.snapshot().played, 3);
  assert.equal(oscillators, 3);
  assert.equal(sound.toggle(), false);
  assert.equal(sound.play('clean', 2), false);
  assert.equal(sound.snapshot().played, 3);
  assert.equal(sound.toggle(), true);
  assert.equal(contexts, 1, 'Toggle does not allocate new AudioContexts each time');
  assert.ok(resumes >= 1);
  assert.equal(sound.play('clean', 2), true);
  assert.equal(sound.snapshot().played, 4);
  assert.equal(durations.length, 4);
  assert.ok(frequencies.length >= 12);
  sound.dispose();
  sound.dispose();
  assert.equal(closed, 1);
  assert.equal(sound.toggle(), false);
  assert.equal(sound.play('graze', 3), false);
});
