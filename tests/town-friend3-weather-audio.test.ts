import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND3_WEATHER_ACCENTS,
  FRIEND3_WEATHER_AUDIO_DEFAULT_STATE,
  FRIEND3_WEATHER_REGIONS,
  createFriend3WeatherAudio,
  friend3WeatherAudioTargets,
  friend3WeatherIndoorFactor,
  friend3WeatherRegionGain,
  friend3WeatherSnowAmount,
  friend3WeatherWeightsFromField,
  normalizeFriend3WeatherAudioState,
  normalizeFriend3WeatherField,
  normalizeFriend3WeatherWeights,
} from '../tools/voxel-tavern/town-blockout/town-friend3-weather-audio.js';

test('Night-F3 weather catalog exposes four distinct region beds and four accents', () => {
  assert.deepEqual(FRIEND3_WEATHER_REGIONS.map(region => region.id), ['town', 'mountain', 'crater', 'summit']);
  assert.deepEqual(FRIEND3_WEATHER_ACCENTS.map(accent => accent.id), ['chime', 'ice-crack', 'rail-clack', 'pulley-squeak']);
  for (const region of FRIEND3_WEATHER_REGIONS) {
    assert.ok(region.label.length > 0);
    assert.ok(region.baseGain > 0 && region.baseGain < 1);
    assert.ok(region.filterHz > 0);
  }
  assert.ok(FRIEND3_WEATHER_REGIONS[1].windResponse > FRIEND3_WEATHER_REGIONS[0].windResponse);
  assert.ok(FRIEND3_WEATHER_REGIONS[3].snowResponse > FRIEND3_WEATHER_REGIONS[0].snowResponse);
});

test('Night-F3 region weights normalize, clamp and default to town', () => {
  assert.deepEqual(normalizeFriend3WeatherWeights(undefined), { town: 1, mountain: 0, crater: 0, summit: 0 });
  assert.deepEqual(normalizeFriend3WeatherWeights({ town: 0, mountain: 0, crater: 0, summit: 0 }), {
    town: 1,
    mountain: 0,
    crater: 0,
    summit: 0,
  });
  const mixed = normalizeFriend3WeatherWeights({ town: 2, mountain: 2, crater: -1, summit: Number.NaN });
  assert.equal(mixed.town, 0.5);
  assert.equal(mixed.mountain, 0.5);
  assert.equal(mixed.crater, 0);
  assert.equal(mixed.summit, 0);
});

test('Night-F3 F1 weather field maps to four regional layers', () => {
  const town = friend3WeatherWeightsFromField({ region: 'town', severity: 0 });
  const foothill = friend3WeatherWeightsFromField({ region: 'foothill', severity: 0.4 });
  const alpine = friend3WeatherWeightsFromField({ region: 'alpine', severity: 0.6 });
  const summit = friend3WeatherWeightsFromField({ region: 'summit', severity: 0.8 });
  const crater = friend3WeatherWeightsFromField({ region: 'crater', severity: 0.7 });
  const edge = friend3WeatherWeightsFromField({ region: 'map-edge', severity: 1 });
  assert.equal(town.town, 0.9);
  assert.ok(foothill.mountain > 0.38 && foothill.town > 0.2);
  assert.ok(alpine.summit > 0.24 && alpine.mountain > 0.5);
  assert.ok(summit.summit > 0.9);
  assert.ok(crater.crater > 0.85);
  assert.ok(edge.mountain > 0.4 && edge.crater > 0.5);
  for (const weights of [town, foothill, alpine, summit, crater, edge]) {
    const total = weights.town + weights.mountain + weights.crater + weights.summit;
    assert.ok(Math.abs(total - 1) < 1e-9);
  }
  assert.equal(normalizeFriend3WeatherField({ region: 'bad' as never }).region, 'town');
  assert.equal(normalizeFriend3WeatherField({ region: 'summit', severity: 2 }).severity, 1);
});

test('Night-F3 indoor, wind, snow and master scale the four target gains', () => {
  const base = normalizeFriend3WeatherAudioState({
    weights: { town: 0.25, mountain: 0.25, crater: 0.25, summit: 0.25 },
    indoor: 0,
    wind: 0,
    snow: 0,
    masterVolume: 100,
  });
  const indoor = friend3WeatherAudioTargets({ ...base, indoor: 1 });
  const windy = friend3WeatherAudioTargets({ ...base, wind: 1 });
  const snowy = friend3WeatherAudioTargets({ ...base, snow: 1 });
  const muted = friend3WeatherAudioTargets({ ...base, muted: true });
  const disabled = friend3WeatherAudioTargets({ ...base, enabled: false });
  assert.ok(indoor.regions.summit < friend3WeatherAudioTargets(base).regions.summit);
  assert.ok(friend3WeatherIndoorFactor(1) < friend3WeatherIndoorFactor(0));
  assert.ok(windy.regions.mountain > friend3WeatherAudioTargets(base).regions.mountain);
  assert.ok(windy.regions.mountain - friend3WeatherAudioTargets(base).regions.mountain >
    windy.regions.town - friend3WeatherAudioTargets(base).regions.town);
  assert.ok(snowy.snowHiss > friend3WeatherAudioTargets(base).snowHiss);
  assert.equal(muted.regions.summit, 0);
  assert.equal(muted.snowHiss, 0);
  assert.equal(disabled.regions.summit, 0);
  assert.equal(friend3WeatherSnowAmount(0.6), 0);
  assert.equal(friend3WeatherSnowAmount(1.55), 1);
  const profile = FRIEND3_WEATHER_REGIONS[0];
  assert.ok(friend3WeatherRegionGain(profile, 1, base) > 0);
});

test('Night-F3 engine is silent and safe without an AudioContext', () => {
  const audio = createFriend3WeatherAudio({ getContext: () => undefined });
  assert.equal(audio.start(), false);
  assert.equal(audio.isStarted(), false);
  assert.deepEqual(audio.getState(), FRIEND3_WEATHER_AUDIO_DEFAULT_STATE);
  assert.ok(audio.getTargets().regions.town > 0);
  assert.equal(audio.triggerAccent('chime'), false);
  audio.setRegionWeights({ summit: 1 });
  audio.updateFromField({ region: 'crater', severity: 1, windStrength: 1, snowIntensityScale: 1.5 });
  audio.setIndoor(1);
  audio.setWeatherIntensity(1, 1);
  audio.setMasterVolume(0);
  audio.setMuted(true);
  audio.setEnabled(false);
  audio.stop();
  audio.dispose();
  assert.equal(audio.isStarted(), false);
});

test('Night-F3 state normalization rejects malformed values', () => {
  const state = normalizeFriend3WeatherAudioState({
    weights: { town: -1, summit: 3 },
    indoor: 2,
    wind: -1,
    snow: 5,
    masterVolume: 300,
    muted: 'yes',
    enabled: 0,
  });
  assert.equal(state.weights.summit, 1);
  assert.equal(state.indoor, 1);
  assert.equal(state.wind, 0);
  assert.equal(state.snow, 1);
  assert.equal(state.masterVolume, 100);
  assert.equal(state.muted, false);
  assert.equal(state.enabled, true);
});