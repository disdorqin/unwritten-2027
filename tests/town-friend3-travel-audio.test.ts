import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS,
  FRIEND3_TRAVEL_SOUNDS,
  createFriend3TravelAudio,
  normalizeFriend3TravelAudioSettings,
} from '../tools/voxel-tavern/town-blockout/town-friend3-travel-audio.js';

test('FR-14 catalog covers six new traffic, mining and mountain sounds', () => {
  assert.equal(FRIEND3_TRAVEL_SOUNDS.length, 6);
  assert.deepEqual(
    FRIEND3_TRAVEL_SOUNDS.map(sound => sound.id),
    ['rail-wheel', 'cable-pulley', 'winch', 'hammer', 'mountain-wind', 'ice-crack'],
  );
  for (const sound of FRIEND3_TRAVEL_SOUNDS) {
    assert.equal(sound.license, 'Original-WebAudio-MIT');
    assert.ok(sound.label.length > 0);
    assert.ok(sound.description.length > 0);
  }
  assert.deepEqual(
    FRIEND3_TRAVEL_SOUNDS.filter(sound => sound.loopable).map(sound => sound.id),
    ['rail-wheel', 'cable-pulley', 'winch', 'mountain-wind'],
  );
});

test('FR-14 settings normalize volume, mute and malformed storage', () => {
  assert.deepEqual(normalizeFriend3TravelAudioSettings(undefined), FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS);
  assert.deepEqual(normalizeFriend3TravelAudioSettings({ volume: 45, muted: true }), { volume: 45, muted: true });
  assert.equal(normalizeFriend3TravelAudioSettings({ volume: -2 }).volume, 0);
  assert.equal(normalizeFriend3TravelAudioSettings({ volume: 220 }).volume, 100);
  assert.equal(normalizeFriend3TravelAudioSettings({ volume: Number.NaN }).volume, 70);
  assert.equal(normalizeFriend3TravelAudioSettings({ muted: 'yes' }).muted, false);
});

test('FR-14 audio is silent and safe without an AudioContext', () => {
  const audio = createFriend3TravelAudio({ getContext: () => undefined });
  assert.deepEqual(audio.getSettings(), FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS);
  for (const sound of FRIEND3_TRAVEL_SOUNDS) {
    assert.equal(audio.play(sound.id), false);
    assert.equal(audio.isPlaying(sound.id), false);
  }
  assert.equal(audio.play('missing' as never), false);
  audio.stop('hammer');
  audio.stopAll();
  audio.setVolume(40);
  audio.setMuted(true);
  assert.deepEqual(audio.getSettings(), { volume: 40, muted: true });
  audio.dispose();
});

test('FR-14 loop requests are ignored for one-shot sounds without a context', () => {
  const audio = createFriend3TravelAudio({ getContext: () => undefined });
  assert.equal(audio.play('hammer', true), false);
  assert.equal(audio.play('ice-crack', true), false);
  assert.equal(audio.isPlaying('hammer'), false);
  audio.dispose();
});