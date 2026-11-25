import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { createTownOutdoorWeatherHost, townOutdoorWeatherAt } from '../../src/presence/town-outdoor-weather.js';
import {
  createTownOutdoorWeatherCueReceiver,
  readTownOutdoorWeatherCue,
  readTownOutdoorWeatherFrame,
  readTownOutdoorWeatherState,
  townOutdoorWeatherEffects,
  townOutdoorWhiteoutFirePoolMeters,
  townOutdoorWindWalkingScale,
  type TownOutdoorWeather,
  type TownOutdoorWeatherCue,
  type TownOutdoorWeatherFrame,
} from '../../src/shared/town-outdoor-weather.js';
import { townDayMs } from '../../src/shared/town-night-window.js';

const minute = 60_000;
const dawnEpoch = Date.parse('2026-11-20T00:00:00Z');
const windAt = dawnEpoch + 30 * minute;
const whiteoutAt = dawnEpoch + 40 * minute;
const retreatAt = dawnEpoch + 50 * minute;
type Event = TownOutdoorWeatherFrame | TownOutdoorWeatherCue;

test('the deterministic cycle has exact 60/30/10 real-time occupancy and valid adjacent phase lengths', () => {
  const hold = { 'clear-snow': [20, 40], wind: [10, 20], whiteout: [5, 10] } as const;
  const totals = { 'clear-snow': 0, wind: 0, whiteout: 0 };
  const grade = { 'clear-snow': 0, wind: 1, whiteout: 2 } as const;
  let weather: TownOutdoorWeather = 'wind';
  const whiteoutDays = new Set<number>();
  const cycleEnd = dawnEpoch + 100 * minute;
  for (let at = dawnEpoch; at < cycleEnd;) {
    const state = townOutdoorWeatherAt(at, dawnEpoch);
    assert.equal(state.startedAt, at);
    assert.equal((state.nextChangeAt - dawnEpoch) % (5 * minute), 0);
    assert.equal(Math.abs(grade[weather] - grade[state.weather]), 1);
    const length = (state.nextChangeAt - at) / minute;
    assert.ok(hold[state.weather][0] <= length && length <= hold[state.weather][1]);
    totals[state.weather] += length;
    if (state.weather === 'whiteout') {
      const day = Math.floor((at - dawnEpoch) / townDayMs);
      assert.ok(!whiteoutDays.has(day));
      whiteoutDays.add(day);
    }
    assert.deepEqual(townOutdoorWeatherAt(state.nextChangeAt - 1, dawnEpoch), state);
    assert.deepEqual(readTownOutdoorWeatherState(JSON.parse(JSON.stringify(state))), state);
    assert.notDeepEqual(
      [state.windEast, state.windNorth],
      [townOutdoorWeatherAt(state.nextChangeAt, dawnEpoch).windEast, townOutdoorWeatherAt(state.nextChangeAt, dawnEpoch).windNorth],
    );
    at = state.nextChangeAt;
    weather = state.weather;
  }
  assert.deepEqual(totals, { 'clear-snow': 60, wind: 30, whiteout: 10 });
  assert.equal(townOutdoorWeatherAt(cycleEnd, dawnEpoch).weather, 'clear-snow');
  assert.equal(townOutdoorWeatherAt(dawnEpoch - 1, dawnEpoch).weather, 'wind');
});

test('one cue appears 30 or 60 seconds before worsening, and only phase changes publish state', () => {
  let now = dawnEpoch;
  const events: Event[] = [];
  const saved: number[] = [];
  const host = createTownOutdoorWeatherHost({
    now: () => now, dawnEpoch, broadcast: frame => events.push(frame), saveWarning: at => saved.push(at),
  });
  assert.equal(host.tick(), host.snapshot());
  now = dawnEpoch + 5 * minute;
  assert.equal(host.tick(), host.snapshot());
  assert.deepEqual(events, []);
  const windWarning = windAt - 30_000;
  now = windWarning - 1;
  host.tick();
  assert.deepEqual(events, []);
  now++;
  assert.equal(host.snapshot().weather, 'clear-snow');
  assert.deepEqual(events, []);
  host.tick();
  host.tick();
  const whiteoutWarning = whiteoutAt - 60_000;
  now = windAt;
  const joinedDuringTransition = host.snapshot();
  assert.equal(joinedDuringTransition.weather, 'wind');
  assert.equal(events.length, 1);
  host.tick();
  now = whiteoutWarning;
  host.tick();
  now = whiteoutAt;
  host.tick();
  now = retreatAt - 30_000;
  host.tick();
  now = retreatAt;
  host.tick();
  now--;
  assert.equal(host.tick().startedAt, retreatAt);
  assert.deepEqual(saved, [windWarning, whiteoutWarning]);
  assert.deepEqual(events, [
    { type: 'event', kind: 'town-outdoor-weather-warning', weather: 'wind', at: windWarning, expiresAt: windAt },
    { type: 'event', kind: 'town-outdoor-weather', state: joinedDuringTransition },
    { type: 'event', kind: 'town-outdoor-weather-warning', weather: 'whiteout', at: whiteoutWarning, expiresAt: whiteoutAt },
    { type: 'event', kind: 'town-outdoor-weather', state: townOutdoorWeatherAt(whiteoutAt, dawnEpoch) },
    { type: 'event', kind: 'town-outdoor-weather', state: townOutdoorWeatherAt(retreatAt, dawnEpoch) },
  ]);
});

test('restore suppresses an already committed warning and a late tick skips expired cues', () => {
  const events: Event[] = [];
  let now = windAt - 29_999;
  const config = { now: () => now, dawnEpoch, broadcast: (frame: Event) => events.push(frame) };
  const restarted = createTownOutdoorWeatherHost(config, windAt - 30_000);
  restarted.tick();
  assert.deepEqual(events, []);
  now = whiteoutAt + 1;
  restarted.tick();
  assert.deepEqual(events, [{
    type: 'event', kind: 'town-outdoor-weather', state: townOutdoorWeatherAt(now, dawnEpoch),
  }]);
  assert.deepEqual(createTownOutdoorWeatherHost(config).snapshot(), restarted.snapshot());
});

test('beacon-channel WebSocket clients share a warning and stable state across a reconnect', async (t) => {
  const listener = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(listener, 'listening');
  t.after(() => {
    for (const socket of listener.clients) socket.terminate();
    return new Promise<void>(resolve => listener.close(() => resolve()));
  });
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const { port } = address;
  let now = windAt - 30_001;
  const host = createTownOutdoorWeatherHost({
    now: () => now, dawnEpoch,
    broadcast: frame => {
      for (const socket of listener.clients) socket.send(JSON.stringify(frame));
    },
  });
  listener.on('connection', socket => socket.send(JSON.stringify({ type: 'welcome', townOutdoorWeather: host.snapshot() })));
  function connect() {
    const client = new WebSocket('ws://127.0.0.1:' + port);
    return { client, welcome: nextMessage(client) };
  }
  async function nextMessage(client: WebSocket): Promise<unknown> {
    const [message] = await once(client, 'message');
    return JSON.parse(message.toString());
  }

  const first = connect();
  const second = connect();
  assert.deepEqual(await first.welcome, await second.welcome);
  const warned = [nextMessage(first.client), nextMessage(second.client)];
  now++;
  host.tick();
  const [firstWarning, secondWarning] = await Promise.all(warned);
  const cue = readTownOutdoorWeatherCue(firstWarning);
  assert.ok(cue);
  assert.deepEqual(firstWarning, secondWarning);
  const effects: string[] = [];
  const receive = createTownOutdoorWeatherCueReceiver({
    ringTower: () => { effects.push('tower'); },
    stationBroadcast: () => { effects.push('station'); },
  });
  assert.equal(receive(cue, now - 1), undefined);
  assert.equal(receive(cue, cue.expiresAt), undefined);
  await new Promise<void>(resolve => {
    first.client.once('close', resolve);
    first.client.close();
  });
  assert.deepEqual(receive(cue, now), { cue, failures: [] });
  assert.equal(receive(secondWarning, now), undefined);
  assert.deepEqual(effects, ['tower', 'station']);

  const returning = connect();
  assert.deepEqual(await returning.welcome, { type: 'welcome', townOutdoorWeather: host.snapshot() });
  const changed = [nextMessage(second.client), nextMessage(returning.client)];
  now = windAt;
  host.tick();
  const [secondChange, returningChange] = await Promise.all(changed);
  assert.deepEqual(secondChange, returningChange);
  assert.deepEqual(readTownOutdoorWeatherFrame(secondChange)?.state, host.snapshot());
});

test('movement has exact headwind, tailwind, crosswind and stationary endpoints', () => {
  const wind = { ...townOutdoorWeatherAt(windAt, dawnEpoch), windEast: 1, windNorth: 0 };
  const whiteout = { ...wind, weather: 'whiteout' } as const;
  assert.equal(townOutdoorWindWalkingScale(wind, -2, 0), 0.85);
  assert.equal(townOutdoorWindWalkingScale(wind, 2, 0), 1.05);
  assert.equal(townOutdoorWindWalkingScale(whiteout, -2, 0), 0.6);
  assert.equal(townOutdoorWindWalkingScale(whiteout, 2, 0), 1.1);
  assert.equal(townOutdoorWindWalkingScale(whiteout, 0, 2), 1);
  assert.equal(townOutdoorWindWalkingScale(whiteout, 0, 0), 1);
  assert.equal(townOutdoorWeatherEffects.whiteout.exposureScale, 2);
  assert.equal(townOutdoorWeatherEffects.whiteout.visibilityMeters, 12);
  assert.equal(townOutdoorWhiteoutFirePoolMeters, 8);
  assert.equal(readTownOutdoorWeatherState({ ...whiteout, windEast: 2 }), undefined);
  assert.equal(readTownOutdoorWeatherState({ ...whiteout, windStrength: NaN }), undefined);
});
