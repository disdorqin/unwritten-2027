import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server';
import { townOutdoorWeatherAt } from '../../src/presence/town-outdoor-weather';

const dawn = Date.UTC(2026, 0, 1);
const minute = 60_000;
const windAt = dawn + 30 * minute;
const whiteoutAt = dawn + 40 * minute;
type Message = {
  type: string; kind?: string; name?: string; self?: boolean; id?: number; epochMs?: number;
  townOutdoorWeather?: unknown; townOutdoorWeatherDawnEpoch?: number; townNightWindow?: unknown; weather?: string; at?: number; expiresAt?: number;
  state?: unknown;
};

async function connected(t: TestContext, server: Awaited<ReturnType<typeof createPresenceServer>>, name: string) {
  const socket = new WebSocket('ws://127.0.0.1:' + server.address().port + '/presence');
  const frames: Message[] = [];
  const wake = new Set<() => void>();
  socket.on('message', (raw, binary) => {
    if (binary) return;
    try { frames.push(JSON.parse(raw.toString())); } catch { return; }
    for (const listener of wake) listener();
  });
  t.after(() => socket.terminate());
  await once(socket, 'open');
  async function next(predicate: (frame: Message) => boolean, timeoutMs = 2_000) {
    const limit = Date.now() + timeoutMs;
    for (;;) {
      const index = frames.findIndex(predicate);
      if (index >= 0) return frames.splice(0, index + 1)[index]!;
      const left = limit - Date.now();
      if (left <= 0) throw Error('Timed out waiting for G-09 presence message; buffered ' + JSON.stringify(frames));
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const resume = () => { clearTimeout(timer); wake.delete(resume); resolve(); };
        wake.add(resume);
        timer = setTimeout(() => { wake.delete(resume); reject(Error('G-09 presence frame timeout')); }, left);
      });
    }
  }
  socket.send(JSON.stringify({ type: 'join', name }));
  const joined = await next(message => message.type === 'join' && message.self === true);
  return { socket, next, joined, pending: () => [...frames] };
}

test('G-09 real primary + secondary Presence WebSockets broadcast one shared phase, warning and current reconnect snapshot', { timeout: 10_000 }, async t => {
  let epoch = windAt - 31_000;
  const host = await createPresenceServer({
    host: '127.0.0.1', port: 0, wallNow: () => epoch,
    townOutdoorWeather: { dawnEpoch: dawn }, connectionLog() {},
  });
  t.after(() => host.close());
  const follower = await createPresenceServer({
    host: '127.0.0.1', port: 0, wallNow: () => epoch,
    townOutdoorWeatherFeed: host.townOutdoorWeatherFeed, connectionLog() {},
  });
  t.after(() => follower.close());
  assert.ok(host.townOutdoorWeatherFeed);
  assert.equal(follower.townOutdoorWeatherFeed, undefined, 'follower cannot write a second calendar');

  const [first, second, mountain] = await Promise.all([
    connected(t, host, '天气甲'), connected(t, host, '天气乙'), connected(t, follower, '山房丙'),
  ]);
  const clear = townOutdoorWeatherAt(epoch, dawn);
  assert.deepEqual(first.joined.townOutdoorWeather, clear);
  assert.equal(first.joined.townOutdoorWeatherDawnEpoch, dawn);
  assert.deepEqual(second.joined.townOutdoorWeather, clear);
  assert.deepEqual(mountain.joined.townOutdoorWeather, clear);

  epoch = windAt - 30_000;
  const warning = await Promise.all([first, second, mountain].map(client =>
    client.next(frame => frame.kind === 'town-outdoor-weather-warning')));
  const expectedWarning = {
    type: 'event', kind: 'town-outdoor-weather-warning', weather: 'wind',
    at: epoch, expiresAt: windAt,
  };
  for (const value of warning) assert.deepEqual(value, expectedWarning);
  await new Promise(resolve => setTimeout(resolve, 35));
  for (const client of [first, second, mountain]) {
    assert.equal(client.pending().some(frame => frame.kind === 'town-outdoor-weather-warning'), false,
      'a weather cue is sent once, never per tick');
  }
  // Late join after a live warning gets only the current phase snapshot.
  const late = await connected(t, host, '晚到');
  assert.deepEqual(late.joined.townOutdoorWeather, clear);
  assert.equal(late.pending().some(frame => frame.kind === 'town-outdoor-weather-warning'), false);

  epoch = windAt;
  const changed = await Promise.all([first, second, mountain, late].map(client =>
    client.next(frame => frame.kind === 'town-outdoor-weather')));
  const windState = townOutdoorWeatherAt(windAt, dawn);
  for (const value of changed) assert.deepEqual(value, {
    type: 'event', kind: 'town-outdoor-weather', state: windState,
  });
  assert.deepEqual(host.townOutdoorWeatherFeed?.snapshot(), windState);

  const returning = await connected(t, follower, '重连');
  assert.deepEqual(returning.joined.townOutdoorWeather, windState);
  assert.equal(returning.pending().some(frame => frame.kind?.includes('weather-')), false);
  epoch = whiteoutAt - 60_000;
  const approaching = await Promise.all([first, second, mountain, late, returning].map(client =>
    client.next(frame => frame.kind === 'town-outdoor-weather-warning' && frame.weather === 'whiteout')));
  assert.ok(approaching.every(frame => frame.at === epoch && frame.expiresAt === whiteoutAt));
  epoch = whiteoutAt;
  const storm = await Promise.all([first, second, mountain, late, returning].map(client =>
    client.next(frame => frame.kind === 'town-outdoor-weather' && (frame.state as { weather?: string })?.weather === 'whiteout')));
  assert.ok(storm.every(frame => JSON.stringify(frame.state) === JSON.stringify(townOutdoorWeatherAt(epoch, dawn))));
});

test('G-09 one failed warning receipt never publishes a phantom warning or crashes the room, then retries exactly once', { timeout: 7_000 }, async t => {
  let epoch = windAt - 31_000;
  let denyWrite = true;
  const writes: number[] = [];
  const errors: unknown[] = [];
  const host = await createPresenceServer({
    host: '127.0.0.1', port: 0, wallNow: () => epoch, connectionLog() {},
    townOutdoorWeather: {
      dawnEpoch: dawn,
      saveWarning(at) { if (denyWrite) throw new Error('temporary storage failure'); writes.push(at); },
      onSaveError(error) { errors.push(error); },
    },
  });
  t.after(() => host.close());
  const user = await connected(t, host, '存储故障观测员');
  epoch = windAt - 30_000;
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.ok(errors.length === 1, 'log a failed receipt once, without every-tick spam');
  assert.equal(user.pending().some(frame => frame.kind === 'town-outdoor-weather-warning'), false);
  assert.deepEqual(writes, []);
  denyWrite = false;
  const delivered = await user.next(frame => frame.kind === 'town-outdoor-weather-warning');
  assert.equal(delivered.at, epoch);
  assert.deepEqual(writes, [epoch]);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(user.pending().some(frame => frame.kind === 'town-outdoor-weather-warning'), false);
});

test('G-09 rejects a primary/follower split brain and mismatched ZB-17 dawn origin', async t => {
  await assert.rejects(createPresenceServer({
    host: '127.0.0.1', port: 0, townOutdoorWeather: { dawnEpoch: dawn },
    townOutdoorWeatherFeed: { dawnEpoch: dawn, snapshot: () => townOutdoorWeatherAt(dawn, dawn), subscribe: () => () => {} },
  }), /cannot author and follow/);
  await assert.rejects(createPresenceServer({
    host: '127.0.0.1', port: 0, townNight: { dawnEpoch: dawn + 10, scheduleAt: () => undefined },
    townOutdoorWeather: { dawnEpoch: dawn },
  }), /night dawn anchor/);
});
