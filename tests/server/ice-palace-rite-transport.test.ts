import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server';

type Message = {
  type: string; kind?: string; self?: boolean; icePalaceRites?: boolean;
  requestId?: string; accepted?: boolean; present?: boolean;
  state?: { frozen: boolean; leverAvailable: boolean; harvestAvailable: boolean; solsticeRite: string };
};

const RECORD_BYTES = 12;
function encodePose(east: number, north: number, height: number, sequence: number) {
  const bytes = Buffer.alloc(RECORD_BYTES);
  [999, east, north, height, 0, sequence].forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
  return bytes;
}

// Palace-local stands in world centimetres (building origin E484 / N72 / H12):
const LEVER = { east: 47100, north: 7330, height: 1212 };   // stand [-13, .12, -1.30]
const FRAGMENT = { east: 48435, north: 7747, height: 1212 }; // stand [.35, .12, -5.47]
const FAR = { east: 20000, north: 20000, height: 500 };

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
      if (left <= 0) throw Error('Timed out waiting for ice-palace message; buffered ' + JSON.stringify(frames));
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const resume = () => { clearTimeout(timer); wake.delete(resume); resolve(); };
        wake.add(resume);
        timer = setTimeout(() => { wake.delete(resume); reject(Error('ice-palace frame timeout')); }, left);
      });
    }
  }
  socket.send(JSON.stringify({ type: 'join', name }));
  const joined = await next(message => message.type === 'join' && message.self === true);
  let seq = 0;
  const pose = (at: { east: number; north: number; height: number }) =>
    socket.send(encodePose(at.east, at.north, at.height, ++seq));
  const send = (frame: Record<string, unknown>) => socket.send(JSON.stringify({ type: 'event', ...frame }));
  return { socket, next, joined, pose, send, pending: () => [...frames] };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('ice palace rite + fragment flow through the real server', { timeout: 15_000 }, async t => {
  const server = await createPresenceServer({ host: '127.0.0.1', port: 0, connectionLog() {} });
  t.after(() => server.close());
  const a = await connected(t, server, '宫客甲');
  const b = await connected(t, server, '宫客乙');

  // Join advertises the wiring and delivers the honest closed snapshot plus
  // the fragment's initial presence to each joiner.
  assert.equal(a.joined.icePalaceRites, true);
  const snapshot = await a.next(frame => frame.type === 'ice-palace-rite');
  assert.deepEqual(snapshot.state, { frozen: false, leverAvailable: false, harvestAvailable: false, solsticeRite: 'closed' });
  assert.equal((await a.next(frame => frame.type === 'ice-palace-fragment')).present, true);
  assert.equal((await b.next(frame => frame.type === 'ice-palace-fragment')).present, true);

  // A rite request from the lever alcove is pose-validated and answered, but
  // no policy store exists yet, so the authority cannot accept it; a fresh
  // snapshot follows the verdict.
  a.pose(LEVER);
  a.send({ kind: 'ice-palace-rite', requestId: 't-lever-1', rite: 'lever' });
  const leverResult = await a.next(frame => frame.type === 'ice-palace-rite-result');
  assert.deepEqual([leverResult.requestId, leverResult.accepted], ['t-lever-1', false]);
  assert.equal((await a.next(frame => frame.type === 'ice-palace-rite')).state?.leverAvailable, false);

  // A rite request from far away fails the pose gate with the same verdict.
  b.pose(FAR);
  b.send({ kind: 'ice-palace-rite', requestId: 't-lever-2', rite: 'lever' });
  assert.equal((await b.next(frame => frame.type === 'ice-palace-rite-result')).accepted, false);

  // A malformed rite name is rejected by the command reader.
  a.send({ kind: 'ice-palace-rite', requestId: 't-bad-1', rite: 'dance' });
  assert.equal((await a.next(frame => frame.type === 'ice-palace-rite-result')).accepted, false);

  // A distant fragment claim fails the pose gate and consumes nothing.
  b.send({ kind: 'ice-palace-fragment', requestId: 't-frag-0', id: 'ice-palace-coil-fragment' });
  assert.equal((await b.next(frame => frame.type === 'ice-palace-fragment-result')).accepted, false);
  await sleep(150);
  assert.equal(a.pending().some(frame => frame.type === 'ice-palace-fragment' && frame.present === false), false);

  // Standing on the fragment stand, the pickup commits: the requester gets
  // the verdict and everyone in the room sees the fragment gone.
  a.pose(FRAGMENT);
  a.send({ kind: 'ice-palace-fragment', requestId: 't-frag-1', id: 'ice-palace-coil-fragment' });
  assert.equal((await a.next(frame => frame.type === 'ice-palace-fragment-result')).accepted, true);
  assert.equal((await b.next(frame => frame.type === 'ice-palace-fragment')).present, false);

  // A second claim and a replay of the winning requestId both fail.
  a.send({ kind: 'ice-palace-fragment', requestId: 't-frag-2', id: 'ice-palace-coil-fragment' });
  assert.equal((await a.next(frame => frame.type === 'ice-palace-fragment-result')).accepted, false);
  a.send({ kind: 'ice-palace-fragment', requestId: 't-frag-1', id: 'ice-palace-coil-fragment' });
  assert.equal((await a.next(frame => frame.type === 'ice-palace-fragment-result')).accepted, false);

  // A late joiner is told the fragment is already gone.
  const c = await connected(t, server, '宫客丙');
  assert.equal((await c.next(frame => frame.type === 'ice-palace-fragment')).present, false);
});
