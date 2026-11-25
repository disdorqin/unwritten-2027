import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createPresenceServer } from '../../src/presence/server';
import { townOutdoorWeatherAt } from '../../src/presence/town-outdoor-weather';

const dawn = Date.UTC(2026, 0, 1);
const minute = 60_000;
const windAt = dawn + 30 * minute;
type WeatherWire = { type?: string; kind?: string; self?: boolean; townOutdoorWeather?: unknown;
  townOutdoorWeatherDawnEpoch?: number; weather?: string; at?: number; state?: unknown };

class PollWeather {
  readonly received: WeatherWire[] = [];
  private session = '';
  constructor(readonly root: string) {}
  private collect(messages: Array<{ t: string; d: string }>) {
    for (const message of messages) if (message.t === 'text') this.received.push(JSON.parse(message.d));
  }
  async join(name: string) {
    const response = await fetch(this.root + '/presence/poll/join', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as { session: string; messages: Array<{ t: string; d: string }> };
    this.session = result.session;
    this.collect(result.messages);
    return this.received.find(item => item.type === 'join' && item.self)!;
  }
  async poll() {
    const response = await fetch(this.root + '/presence/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-presence-session': this.session },
      body: '{}',
    });
    assert.equal(response.status, 200);
    this.collect((await response.json() as { messages: Array<{ t: string; d: string }> }).messages);
  }
  async awaitFrame(predicate: (frame: WeatherWire) => boolean, timeoutMs = 2500) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (this.received.some(predicate)) return this.received.find(predicate)!;
      await this.poll();
      await delay(25);
    }
    throw Error('G-09 poll expected frame missing');
  }
}

test('G-09 actual HTTP polling primary and follower share snapshots and one-shot broadcasts', { timeout: 8000 }, async t => {
  let now = windAt - 31_000;
  const first = await createPresenceServer({ host: '127.0.0.1', port: 0,
    wallNow: () => now, townOutdoorWeather: { dawnEpoch: dawn }, connectionLog() {} });
  t.after(() => first.close());
  const second = await createPresenceServer({ host: '127.0.0.1', port: 0,
    wallNow: () => now, townOutdoorWeatherFeed: first.townOutdoorWeatherFeed, connectionLog() {} });
  t.after(() => second.close());
  const town = new PollWeather('http://127.0.0.1:' + first.address().port);
  const mountain = new PollWeather('http://127.0.0.1:' + second.address().port);
  const [joinTown, joinMountain] = await Promise.all([town.join('镇里甲'), mountain.join('山上乙')]);
  const clear = townOutdoorWeatherAt(now, dawn);
  assert.equal(joinTown.townOutdoorWeatherDawnEpoch, dawn);
  assert.deepEqual(joinTown.townOutdoorWeather, clear);
  assert.deepEqual(joinMountain.townOutdoorWeather, clear);
  assert.equal(joinMountain.townOutdoorWeatherDawnEpoch, dawn);

  now = windAt - 30_000;
  const warnings = await Promise.all([town, mountain].map(client =>
    client.awaitFrame(item => item.kind === 'town-outdoor-weather-warning')));
  assert.deepEqual(warnings[0], warnings[1]);
  assert.equal(warnings[0].weather, 'wind');
  assert.equal(warnings[0].at, now);

  const late = new PollWeather('http://127.0.0.1:' + first.address().port);
  const lateJoin = await late.join('晚加入');
  assert.deepEqual(lateJoin.townOutdoorWeather, clear);
  assert.equal(late.received.some(frame => frame.kind === 'town-outdoor-weather-warning'), false);

  now = windAt;
  const states = await Promise.all([town, mountain, late].map(client =>
    client.awaitFrame(item => item.kind === 'town-outdoor-weather')));
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[1], states[2]);
  assert.deepEqual(states[0].state, townOutdoorWeatherAt(now, dawn));
  await Promise.all([town.poll(), mountain.poll(), late.poll()]);
  assert.equal(town.received.filter(item => item.kind === 'town-outdoor-weather').length, 1);
  assert.equal(mountain.received.filter(item => item.kind === 'town-outdoor-weather').length, 1);
  assert.equal(late.received.filter(item => item.kind === 'town-outdoor-weather').length, 1);
});
