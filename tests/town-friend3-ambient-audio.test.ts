import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND3_AMBIENT_SOUNDS,
  FRIEND3_AUDIO_DEFAULT_SETTINGS,
  normalizeFriend3AudioSettings,
  createFriend3AmbientAudio,
} from '../tools/voxel-tavern/town-blockout/town-friend3-ambient-audio.js';

test('FR-07 catalog is original, unique and clearly loopable', () => {
  assert.equal(FRIEND3_AMBIENT_SOUNDS.length, 6);
  const ids = new Set<string>();
  for (const sound of FRIEND3_AMBIENT_SOUNDS) {
    assert.ok(!ids.has(sound.id));
    ids.add(sound.id);
    assert.equal(sound.license, 'Original-WebAudio-MIT');
    assert.ok(sound.label.length > 0);
    assert.ok(sound.description.length > 0);
  }
  assert.deepEqual(
    FRIEND3_AMBIENT_SOUNDS.filter(sound => sound.loopable).map(sound => sound.id),
    ['wind-chime', 'stove'],
  );
});

test('FR-07 settings normalize volume, mute and malformed storage', () => {
  assert.deepEqual(normalizeFriend3AudioSettings(undefined), FRIEND3_AUDIO_DEFAULT_SETTINGS);
  assert.deepEqual(normalizeFriend3AudioSettings(null), FRIEND3_AUDIO_DEFAULT_SETTINGS);
  assert.deepEqual(normalizeFriend3AudioSettings({ volume: 50, muted: true }), { volume: 50, muted: true });
  assert.equal(normalizeFriend3AudioSettings({ volume: -5 }).volume, 0);
  assert.equal(normalizeFriend3AudioSettings({ volume: 150 }).volume, 100);
  assert.equal(normalizeFriend3AudioSettings({ volume: Number.NaN }).volume, 70);
  assert.equal(normalizeFriend3AudioSettings({ muted: 'yes' }).muted, false);
  assert.equal(normalizeFriend3AudioSettings({ volume: 42.6 }).volume, 43);
});

test('FR-07 audio is silent and safe without an AudioContext', () => {
  const audio = createFriend3AmbientAudio({ getContext: () => undefined });
  assert.deepEqual(audio.getSettings(), FRIEND3_AUDIO_DEFAULT_SETTINGS);
  for (const sound of FRIEND3_AMBIENT_SOUNDS) {
    assert.equal(audio.play(sound.id), false);
    assert.equal(audio.isPlaying(sound.id), false);
  }
  assert.equal(audio.play('missing' as never), false);
  audio.stop('stove');
  audio.stopAll();
  audio.setVolume(35);
  audio.setMuted(true);
  assert.deepEqual(audio.getSettings(), { volume: 35, muted: true });
  audio.setVolume(-10);
  assert.equal(audio.getSettings().volume, 0);
  audio.setVolume(180);
  assert.equal(audio.getSettings().volume, 100);
  audio.setMuted(false);
  assert.equal(audio.getSettings().muted, false);
  audio.dispose();
});

test('FR-07 loop requests are ignored for one-shot sounds without a context', () => {
  const audio = createFriend3AmbientAudio({ getContext: () => undefined });
  assert.equal(audio.play('wood-door', true), false);
  assert.equal(audio.play('snow-step', true), false);
  assert.equal(audio.isPlaying('wood-door'), false);
  audio.dispose();
});