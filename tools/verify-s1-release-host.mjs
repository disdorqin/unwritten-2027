import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const release = '75859a094757c5dcee8b874eef86ec37f4204907';
const worktree = resolve(process.argv[2] ?? '.');
const serverPath = 'src/presence/server.ts';
const protocolPath = 'src/presence/protocol.ts';
const townPath = 'tools/voxel-tavern/town-blockout';
const motionPath = `${townPath}/town-presence-motion.ts`;
const terrainPath = `${townPath}/terrain.ts`;
const layoutPath = `${townPath}/layout.json`;

function git(...args) {
  return execFileSync('git', ['-C', worktree, ...args], { encoding: 'utf8' }).trim();
}

assert.equal(git('rev-parse', 'HEAD'), release);
for (const path of [serverPath, protocolPath, motionPath, terrainPath, layoutPath]) {
  assert.equal(git('hash-object', path), git('rev-parse', `HEAD:${path}`), path);
}

const load = path => import(pathToFileURL(resolve(worktree, path)).href);
const { WebSocket } = createRequire(resolve(worktree, 'package.json'))('ws');
const [{ createPresenceServer }, { TOWN_BOUNDS, readRecord }, motion, terrain] = await Promise.all([
  load(serverPath), load(protocolPath), load(motionPath), load(terrainPath),
]);
const { presenceRecordBytes, visitPresenceSnapshot, writePresencePose } = motion;
const { canEnter, createTerrainGrid, layout } = terrain;
const [plazaEast, plazaNorth] = layout.plaza.spawn;
const plazaHeight = createTerrainGrid().heightAt(plazaEast, plazaNorth);
assert.equal(plazaHeight, layout.plaza.height);
assert.equal(canEnter(plazaEast, plazaNorth), true);

const samples = [
  ['published-plaza-spawn', [plazaEast, plazaNorth, plazaHeight], [plazaEast, plazaNorth, plazaHeight]],
  ['p10-front-stele-candidate', [306, 659, 347], [306, 540, 347]],
  ['p10-upper-stele-candidate', [50, 998, 800], [50, 540, 655.35]],
  ['p10-upper-registrar-candidate', [62.5, 1014, 800], [62.5, 540, 655.35]],
  ['crater-relative-floor-codec-probe', [80, 120, -35], [80, 120, 0]],
  ['mine-level-codec-probe', [80, 120, -90], [80, 120, 0]],
  ['palace-level-codec-probe', [80, 120, -190], [80, 120, 0]],
];

function packet([east, north, height], seq) {
  const bytes = new ArrayBuffer(presenceRecordBytes);
  writePresencePose({ east, north, height, yaw: 0 }, seq, new DataView(bytes));
  return Buffer.from(bytes);
}

function snapshot(buffer, moverId, seq) {
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let pose;
  visitPresenceSnapshot(bytes, (id, east, north, height, _yaw, seenSeq) => {
    if (id === moverId && seenSeq === seq) pose = [east, north, height];
  });
  return pose;
}

function message(socket, inspect) {
  return new Promise((resolveFrame, reject) => {
    function receive(frame, binary) {
      const value = inspect(frame, binary);
      if (value === undefined) return;
      cleanup();
      resolveFrame(value);
    }
    function cleanup() {
      clearTimeout(timeout);
      socket.off('message', receive);
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for a presence frame'));
    }, 4000);
    socket.on('message', receive);
  });
}

const server = await createPresenceServer({ host: '127.0.0.1', port: 0, connectionLog() {} });
const port = server.address().port;
const sockets = [];
const polls = [];

async function joinWs(name) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/presence`);
  sockets.push(socket);
  await once(socket, 'open');
  const id = message(socket, (frame, binary) => {
    if (binary) return undefined;
    const reply = JSON.parse(frame.toString());
    return reply.type === 'join' && reply.self === true ? reply.id : undefined;
  });
  socket.send(JSON.stringify({ type: 'join', name }));
  return { id: await id, socket };
}

async function post(path, body, session) {
  const headers = { 'content-type': 'application/json' };
  if (session) headers['x-presence-session'] = session;
  const result = await fetch(`http://127.0.0.1:${port}/presence/poll${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(4000),
  });
  assert.equal(result.status, 200);
  return result.json();
}

async function joinPoll(name) {
  const peer = await post('/join', { name });
  assert.equal(typeof peer.session, 'string');
  polls.push(peer);
  return peer;
}

async function pollPose(observer, moverId, seq) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const { messages } = await post('', {}, observer.session);
    for (const message of messages) {
      if (message.t !== 'bin') continue;
      const pose = snapshot(Buffer.from(message.d, 'base64'), moverId, seq);
      if (pose) return pose;
    }
    await pause(40);
  }
  throw new Error('Timed out waiting for a polling presence frame');
}

try {
  const [wsMover, wsObserver, pollMover, pollObserver] = await Promise.all([
    joinWs('s1-ws-mover'), joinWs('s1-ws-observer'), joinPoll('s1-poll-mover'), joinPoll('s1-poll-observer'),
  ]);
  const results = [];
  for (const [index, [label, input, expected]] of samples.entries()) {
    const seq = index + 1;
    const bytes = packet(input, seq);
    const record = readRecord(bytes);
    assert.ok(record);
    const observed = message(wsObserver.socket, (frame, binary) => {
      return binary && Buffer.isBuffer(frame) ? snapshot(frame, wsMover.id, seq) : undefined;
    });
    const state = bytes.toString('base64');
    const httpSample = (async () => {
      await post('', { state }, pollObserver.session);
      await post('', { state }, pollMover.session);
      return pollPose(pollObserver, pollMover.id, seq);
    })();
    wsObserver.socket.send(bytes);
    wsMover.socket.send(bytes);
    const [websocket, polling] = await Promise.all([observed, httpSample]);
    assert.deepEqual(websocket, expected, label);
    assert.deepEqual(polling, expected, label);
    results.push({ label, input, encoded: [record.east / 100, record.north / 100, record.height / 100], websocket, polling });
  }
  console.log(JSON.stringify({ release, wireBytes: presenceRecordBytes, bounds: TOWN_BOUNDS, results }, null, 2));
} finally {
  await Promise.allSettled(polls.map(peer => post('/leave', {}, peer.session)));
  for (const socket of sockets) socket.terminate();
  await server.close();
}
