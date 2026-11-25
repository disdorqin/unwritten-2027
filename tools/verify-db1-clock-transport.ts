import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../src/presence/server.js';
import { createTownPresenceClock } from './voxel-tavern/town-blockout/town-presence-clock.js';
import { createDailyTowerChime } from './voxel-tavern/town-blockout/town-clocktower-time.js';

type ClockFrame = { type: 'clock'; sentAt: number; epochMs: number };
type JoinFrame = { type: 'join'; self: true; id: number; epochMs: number };
type ControlFrame = Partial<ClockFrame> | Partial<JoinFrame>;

function nextMessage<T extends ControlFrame>(socket: WebSocket, matches: (frame: ControlFrame) => frame is T) {
  return new Promise<T>((resolve, reject) => {
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for a presence control frame'));
    }, 5000);
    function cleanup() {
      clearTimeout(deadline);
      socket.off('message', onMessage);
    }
    function onMessage(body: Buffer, binary: boolean) {
      if (binary) return;
      const frame: ControlFrame = JSON.parse(body.toString());
      if (!matches(frame)) return;
      cleanup();
      resolve(frame);
    }
    socket.on('message', onMessage);
  });
}

const server = await createPresenceServer({
  host: '127.0.0.1',
  port: 0,
  connectionLog() {},
});
const url = 'ws://127.0.0.1:' + server.address().port + '/presence';
const sockets: WebSocket[] = [];

async function join(name: string) {
  const socket = new WebSocket(url);
  sockets.push(socket);
  await once(socket, 'open');
  const response = nextMessage<JoinFrame>(socket, (frame): frame is JoinFrame =>
    frame.type === 'join' && frame.self === true &&
    Number.isSafeInteger(frame.id) && Number.isSafeInteger(frame.epochMs));
  socket.send(JSON.stringify({ type: 'join', name }));
  const { id, epochMs } = await response;

  const clock = createTownPresenceClock(() => 1);
  clock.accept(epochMs);
  async function sync() {
    const sentAt = performance.now();
    const response = nextMessage<ClockFrame>(socket, (frame): frame is ClockFrame =>
      frame.type === 'clock' && frame.sentAt === sentAt && Number.isSafeInteger(frame.epochMs));
    socket.send(JSON.stringify({ type: 'clock', sentAt }));
    const frame = await response;
    const roundTripMs = performance.now() - sentAt;
    assert.ok(roundTripMs < 2000, 'Presence clock must accept this sample');
    clock.accept(frame.epochMs, sentAt);
    return { epochMs: frame.epochMs, roundTripMs };
  }
  return { socket, id, clock, sync };
}

try {
  const name = 'DB-1 时钟验证';
  const [left, right] = await Promise.all([join(name), join(name)]);
  assert.notEqual(left.id, right.id);
  const samples = [];
  for (let index = 0; index < 3; index++) {
    if (index) await delay(800);
    const [a, b] = await Promise.all([left.sync(), right.sync()]);
    const skewMs = Math.abs(left.clock.now() - right.clock.now());
    assert.ok(skewMs < 1000, 'Clock skew exceeds one second');
    samples.push({ left: a, right: b, skewMs });
  }

  // Advance both transport-synchronised clocks by the same amount to exercise
  // the existing ordinary-hour detector without waiting for the wall-clock hour.
  const ordinaryAt = Date.parse('2026-11-21T20:00:00+08:00');
  const advanceMs = ordinaryAt - Date.now();
  const clients = [left, right];
  const detectors = clients.map(() => createDailyTowerChime());
  clients.forEach((client, index) => detectors[index](client.clock.now() + advanceMs - 1200, 'ordinary'));
  const cues = clients.map((client, index) =>
    detectors[index](client.clock.now() + advanceMs + 1200, 'ordinary'));
  assert.deepEqual(cues[0], cues[1]);
  assert.equal(cues[0]?.cue.at, ordinaryAt);
  assert.equal(cues[0]?.cue.strikes, 3);
  assert.equal(cues[0]?.audible, true);

  const closed = once(left.socket, 'close');
  left.socket.close();
  await closed;
  const rejoined = await join(name);
  assert.notEqual(rejoined.id, left.id);
  console.log(JSON.stringify({
    samples,
    cue: cues[0],
    peerIds: [left.id, right.id, rejoined.id],
    rejoinKeepsPeerId: false,
  }, null, 2));
} finally {
  for (const socket of sockets) socket.terminate();
  await server.close();
}
