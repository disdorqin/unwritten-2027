import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTownPresenceWeather } from '../tools/voxel-tavern/town-blockout/town-presence-weather';
import { townOutdoorWeatherAt } from '../src/presence/town-outdoor-weather';

const dawn = Date.UTC(2026, 0, 1);
const minute = 60_000;
const clear = townOutdoorWeatherAt(dawn + 20 * minute, dawn);
const windy = townOutdoorWeatherAt(dawn + 30 * minute, dawn);
const whiteout = townOutdoorWeatherAt(dawn + 40 * minute, dawn);
const windWarning = { type: 'event', kind: 'town-outdoor-weather-warning', weather: 'wind', at: dawn + 30 * minute - 30_000, expiresAt: dawn + 30 * minute } as const;
const whiteoutWarning = { type: 'event', kind: 'town-outdoor-weather-warning', weather: 'whiteout', at: dawn + 40 * minute - 60_000, expiresAt: dawn + 40 * minute } as const;

test('G-09 weather consumer only activates on a server join snapshot and never manufactures a local state', () => {
  let now = dawn + 20 * minute;
  const client = createTownPresenceWeather(() => now);
  assert.equal(client.state(), undefined);
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: windy }), undefined);
  client.join(clear);
  assert.deepEqual(client.state(), clear);
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: clear }), undefined);
  now = dawn + 30 * minute;
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: windy })?.kind, 'weather');
  assert.deepEqual(client.state(), windy);
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: clear }), undefined);
  client.disconnect();
  assert.equal(client.state(), undefined);
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: whiteout }), undefined);
  client.join(whiteout);
  assert.deepEqual(client.state(), whiteout);
  client.join({ ...whiteout, windStrength: 99 });
  assert.equal(client.state(), undefined);
});

test('G-09 only plays live, correctly parsed, one-shot warning effects, never on reconnect snapshot', () => {
  let now = windWarning.at - 1;
  const effects: number[] = [];
  const client = createTownPresenceWeather(() => now);
  client.onWarning(cue => effects.push(cue.at));
  client.join(clear);
  assert.equal(client.accept(windWarning), undefined, 'too early');
  now = windWarning.at;
  assert.equal(client.accept(windWarning)?.kind, 'warning');
  assert.equal(client.accept(windWarning), undefined, 'duplicate');
  assert.equal(client.accept({ ...windWarning, expiresAt: windWarning.expiresAt + 1 }), undefined, 'malformed');
  client.disconnect();
  client.join(windy);
  assert.equal(client.accept(windWarning), undefined, 'late reconnect never repeats cue');
  now = whiteoutWarning.at;
  assert.equal(client.accept(whiteoutWarning)?.kind, 'warning');
  assert.deepEqual(effects, [windWarning.at, whiteoutWarning.at]);
  assert.equal(client.accept(whiteoutWarning), undefined);
  now = whiteoutWarning.expiresAt;
  assert.equal(client.accept({ ...whiteoutWarning, at: whiteoutWarning.at + 1, expiresAt: whiteoutWarning.expiresAt + 1 }), undefined);
});

test('G-09 client rejects fake weather and never rewinds a later authoritative phase', () => {
  let now = dawn + 45 * minute;
  const client = createTownPresenceWeather(() => now);
  client.join(windy);
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: { ...whiteout, windEast: 2 } }), undefined);
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: whiteout })?.kind, 'weather');
  assert.equal(client.accept({ type: 'event', kind: 'town-outdoor-weather', state: windy }), undefined);
  assert.equal(client.state()?.weather, 'whiteout');
  now = whiteoutWarning.at;
  const unsafe = { ...whiteoutWarning, weather: 'clear-snow' };
  assert.equal(client.accept(unsafe), undefined);
});
