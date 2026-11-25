import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server.js';
import { readRecord, RECORD_BYTES } from '../../src/presence/protocol.js';
import {
  skyCityPresenceBounds, skyCityPresenceEndpoint, toSkyCityPresencePose,
  fromSkyCityPresencePose,
} from '../../src/shared/sky-city-presence-domain.js';

type WireClient = {
  socket: WebSocket;
  texts: Array<{ type?: string; self?: boolean; id?: number; name?: string }>;
  snapshots: Buffer[];
  selfId: number;
};

async function eventually<T>(fn: () => T | undefined, timeout = 4_000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = fn();
    if (found !== undefined) return found;
    await delay(25);
  }
  throw new Error('Timed out waiting for authoritative presence frame');
}

async function join(port: number, name: string, cleanup: (socket: WebSocket) => void): Promise<WireClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/presence`);
  cleanup(socket);
  const texts: WireClient['texts'] = [];
  const snapshots: Buffer[] = [];
  socket.on('message', (data, binary) => {
    const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (binary) snapshots.push(frame);
    else texts.push(JSON.parse(frame.toString()) as WireClient['texts'][number]);
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'join', name }));
  const id = await eventually(() => texts.find(frame => frame.type === 'join' && frame.self)?.id);
  assert.ok(Number.isInteger(id) && id > 0);
  return { socket, texts, snapshots, selfId: id };
}

function poseFrame(world: { east: number; north: number; height: number }, seq: number) {
  const local = toSkyCityPresencePose(world);
  assert.ok(local, 'world feet must be valid before they enter the wire');
  const frame = Buffer.alloc(RECORD_BYTES);
  frame.writeUInt16LE(Math.round(local.east * 100), 2);
  frame.writeUInt16LE(Math.round(local.north * 100), 4);
  frame.writeUInt16LE(Math.round(local.height * 100), 6);
  frame.writeUInt16LE(seq, 10);
  return frame;
}

function findRemote(client: WireClient, id: number) {
  for (const snapshot of client.snapshots) {
    const count = snapshot[0]!;
    if (snapshot.byteLength !== count * RECORD_BYTES + 1) continue;
    for (let i = 0; i < count; i++) {
      const record = readRecord(snapshot.subarray(1 + i * RECORD_BYTES, 1 + (i + 1) * RECORD_BYTES));
      if (record?.id !== id) continue;
      return fromSkyCityPresencePose({ east: record.east / 100, north: record.north / 100, height: record.height / 100 });
    }
  }
}

test('ZD-05 sky room sends two real WS poses at Y796 without leaking actors to the town room', { timeout: 12_000 }, async t => {
  const sky = await createPresenceServer({ host: '127.0.0.1', port: 0,
    ...skyCityPresenceBounds, ceremonyStartAt: 0, connectionLog() {} });
  const town = await createPresenceServer({ host: '127.0.0.1', port: 0,
    ceremonyStartAt: 0, connectionLog() {} });
  t.after(async () => { await sky.close(); await town.close(); });
  const cleanup = (socket: WebSocket) => t.after(() => socket.terminate());
  const a = await join(sky.address().port, '天空甲', cleanup);
  const b = await join(sky.address().port, '天空乙', cleanup);
  const ground = await join(town.address().port, '广场游客', cleanup);
  assert.equal(sky.stats().online, 2);
  assert.equal(town.stats().online, 1);
  assert.equal(ground.texts.some(frame => frame.name === '天空甲' || frame.name === '天空乙'), false);

  const pa = { east: -14, north: -250, height: 796 };
  const pb = { east: -13.5, north: -249, height: 796 };
  a.socket.send(poseFrame(pa, 1));
  b.socket.send(poseFrame(pb, 1));

  const remoteA = await eventually(() => findRemote(b, a.selfId));
  const remoteB = await eventually(() => findRemote(a, b.selfId));
  for (const axis of ['east', 'north', 'height'] as const) {
    assert.ok(Math.abs(remoteA[axis] - pa[axis]) < .011, `sky A ${axis}`);
    assert.ok(Math.abs(remoteB[axis] - pb[axis]) < .011, `sky B ${axis}`);
  }
  assert.equal(ground.snapshots.some(frame => frame.byteLength > 1 && frame[0]! > 0), false);
  a.socket.close();
  await eventually(() => b.texts.some(frame => frame.type === 'leave' && frame.id === a.selfId) || undefined);
  assert.equal(sky.stats().online, 1);
  assert.equal(town.stats().online, 1);
});

test('ZD-05 sky room accepts poll clients on the same rewritten endpoints and isolates session state', { timeout: 9_000 }, async t => {
  const sky = await createPresenceServer({ host: '127.0.0.1', port: 0,
    ...skyCityPresenceBounds, ceremonyStartAt: 0, connectionLog() {} });
  t.after(() => sky.close());
  const base = `http://127.0.0.1:${sky.address().port}`;
  const joined = await fetch(base + '/presence/poll/join', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '天空轮询' }),
  });
  assert.equal(joined.status, 200);
  const session = await joined.json() as { session: string; id: number };
  assert.ok(session.session.length >= 16);
  const local = toSkyCityPresencePose({ east: 0, north: 0, height: 750 })!;
  const state = Buffer.alloc(RECORD_BYTES);
  state.writeUInt16LE(local.east * 100, 2);
  state.writeUInt16LE(local.north * 100, 4);
  state.writeUInt16LE(local.height * 100, 6);
  state.writeUInt16LE(1, 10);
  const poll = await fetch(base + '/presence/poll', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-presence-session': session.session },
    body: JSON.stringify({ state: state.toString('base64') }),
  });
  assert.equal(poll.status, 200);
  assert.equal(sky.stats().online, 1);
  const left = await fetch(base + '/presence/poll/leave', {
    method: 'POST', headers: { 'x-presence-session': session.session },
  });
  assert.equal(left.status, 200);
  await eventually(() => sky.stats().online === 0 || undefined);
  assert.equal(skyCityPresenceEndpoint('/presence/poll/leave'), '/presence-sky/poll/leave');
});
