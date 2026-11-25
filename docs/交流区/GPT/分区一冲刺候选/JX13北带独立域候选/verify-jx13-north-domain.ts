import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket, type RawData } from 'ws';
import { createPresenceServer } from '../src/presence/server.js';
import { TOWN_BOUNDS } from '../src/presence/protocol.js';
import { northRidgeCableAnchors, northRidgeFrame, northRidgeNorthWall, northRidgeSummit } from
  './voxel-tavern/town-blockout/north-ridge-350-terrain.js';
import { railPlatforms } from './voxel-tavern/town-blockout/town-rail-stops.js';
import { presenceRecordBytes, visitPresenceSnapshot, writePresencePose } from
  './voxel-tavern/town-blockout/town-presence-motion.js';

type Server = Awaited<ReturnType<typeof createPresenceServer>>;
type Position = readonly [east: number, north: number, height: number];
type Joined = { id: number; seenNames: Set<string>; socket: WebSocket };

const sockets = new Set<WebSocket>();
const servers: Server[] = [];
const foothillNorth = 270;
const trialNorthDepth = northRidgeFrame.depth - foothillNorth;

async function start(depth: number) {
  const server = await createPresenceServer({ host: '127.0.0.1', port: 0, depth, connectionLog() {} });
  servers.push(server);
  return server;
}

function message<T>(socket: WebSocket, select: (frame: RawData, binary: boolean) => T | undefined) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for the accepted presence record'));
    }, 5000);
    function onMessage(frame: RawData, binary: boolean) {
      const selected = select(frame, binary);
      if (selected === undefined) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(selected);
    }
    socket.on('message', onMessage);
  });
}

async function join(server: Server, name: string): Promise<Joined> {
  const socket = new WebSocket('ws://127.0.0.1:' + server.address().port + '/presence');
  sockets.add(socket);
  const seenNames = new Set<string>();
  socket.on('message', (raw: RawData, binary: boolean) => {
    if (binary) return;
    const event = JSON.parse(raw.toString());
    if (event.type === 'join' && typeof event.name === 'string') seenNames.add(event.name);
  });
  await once(socket, 'open');
  const joined = message(socket, (raw, binary) => {
    if (binary) return undefined;
    const reply = JSON.parse(raw.toString());
    if (reply.type === 'join' && reply.self === true && Number.isInteger(reply.id)) return reply.id as number;
  });
  socket.send(JSON.stringify({ type: 'join', name }));
  return { socket, id: await joined, seenNames };
}

function positionPacket([east, north, height]: Position, seq: number) {
  const wire = new ArrayBuffer(presenceRecordBytes);
  writePresencePose({ east, north, height, yaw: 0 }, seq, new DataView(wire));
  return wire;
}

async function roundTrip(mover: Joined, observer: Joined, position: Position, seq: number) {
  // Keep the observer near the published sample using the same production codec.
  observer.socket.send(positionPacket(position, seq));
  const sample = message(observer.socket, (raw, binary) => {
    if (!binary || !Buffer.isBuffer(raw)) return undefined;
    const view = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    let result: Position | undefined;
    visitPresenceSnapshot(view, (id, east, north, height, _yaw, receivedSeq) => {
      if (id === mover.id && receivedSeq === seq) result = [east, north, height];
    });
    return result;
  });
  const wire = positionPacket(position, seq);
  mover.socket.send(wire);
  return {
    sent: position,
    wireNorth: new DataView(wire).getUint16(4, true) / 100,
    broadcast: await sample,
  };
}

try {
  await assert.rejects(() => start(northRidgeFrame.depth), /Invalid presence coordinate limit/);
  const [town, front] = await Promise.all([start(TOWN_BOUNDS.depth), start(trialNorthDepth)]);
  const [townWalker, townObserver, frontWalker, frontObserver] = await Promise.all([
    join(town, 'town-walker'),
    join(town, 'town-observer'),
    join(front, 'front-walker'),
    join(front, 'front-observer'),
  ]);

  const [oldMatch, frontMatch] = await Promise.all([
    roundTrip(townWalker, townObserver, [526, 59, 26], 1),
    roundTrip(frontWalker, frontObserver, [526, 59, 26], 1),
  ]);
  assert.deepEqual(oldMatch.broadcast, frontMatch.broadcast);
  for (const peer of [townWalker, townObserver]) {
    assert.deepEqual([...peer.seenNames].sort(), ['town-observer', 'town-walker']);
  }
  for (const peer of [frontWalker, frontObserver]) {
    assert.deepEqual([...peer.seenNames].sort(), ['front-observer', 'front-walker']);
  }

  const oldBoundary = [];
  for (const [index, north] of [540, 650, 655.35, 655.36, 800].entries()) {
    const row = await roundTrip(townWalker, townObserver, [320, north, 350], index + 2);
    assert.equal(row.broadcast[1], 540);
    oldBoundary.push(row);
  }

  const fixturePoints: readonly { name: string; at: Position }[] = [
    { name: 'foothill-boundary', at: [320, foothillNorth, 18] },
    { name: 'southwest-storage-corner', at: [0, foothillNorth, 18] },
    { name: 'trail-start-design', at: [290, 300, 18] },
    { name: 'cable-base-design', at: [...northRidgeCableAnchors[0], 26] },
    { name: 'middle-station', at: [...northRidgeCableAnchors[1], 140] },
    { name: 'summit-cable-station', at: [...northRidgeCableAnchors[2], 347] },
    { name: 'summit-reference', at: [northRidgeSummit.east, northRidgeSummit.north, northRidgeSummit.height] },
    { name: 'centimetre-storage-sample', at: [321.24, 655.36, 347.64] },
    { name: 'reserved-north-wall-end', at: [320, northRidgeNorthWall.north, 100] },
    { name: 'northern-frame-end', at: [320, northRidgeFrame.depth, 18] },
    { name: 'northeast-storage-corner', at: [northRidgeFrame.width, northRidgeFrame.depth, 18] },
  ];
  const localSamples = [];
  for (const [index, { name, at }] of fixturePoints.entries()) {
    const [east, north, height] = at;
    const row = await roundTrip(frontWalker, frontObserver, [east, north - foothillNorth, height], index + 2);
    const reconstructed = [row.broadcast[0], row.broadcast[1] + foothillNorth, row.broadcast[2]];
    assert.deepEqual(reconstructed, at);
    localSamples.push({ name, at, ...row, reconstructed });
  }

  const stations = railPlatforms.filter(stop => stop.id === 'north-ridge-station' || stop.id === 'railway-station')
    .map(({ id, east, north, railY }) => ({ id, east, north, railY }));
  console.log(JSON.stringify({
    legacy: TOWN_BOUNDS,
    trial: { width: northRidgeFrame.width, depth: trialNorthDepth, northOffset: foothillNorth },
    absoluteDepth800Rejected: true,
    oldBoundary,
    localSamples,
    seen: { town: [...townObserver.seenNames].sort(), front: [...frontObserver.seenNames].sort() },
    stations,
    cableBaseDesign: northRidgeCableAnchors[0],
  }, null, 2));
} finally {
  for (const socket of sockets) socket.terminate();
  await Promise.all(servers.map(server => server.close()));
}
