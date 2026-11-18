import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  BASE_TIER, CELL_METRES, MAX_SESSIONS, MAX_VISIBLE, PRESENCE_PATH, TOWN_BOUNDS,
  checkTiers, readRecord, validName, writeSnapshot, type PresenceRecord, type PresenceTier,
} from './protocol.js';
import { isSharedHomePosition } from './shared-home-space.js';

const inSharedHome = (state: PresenceRecord) =>
  isSharedHomePosition(state.east / 100, state.north / 100, state.height / 100);

type Options = {
  host?: string;
  port?: number;
  width?: number;
  depth?: number;
  height?: number;
  tiers?: readonly PresenceTier[];
};

type Peer = {
  socket: WebSocket;
  id: number;
  name?: string;
  record?: PresenceRecord;
  version: number;
  visible: { id: number; version: number }[];
  joinTimer: ReturnType<typeof setTimeout>;
  alive: boolean;
  tokens: number;
  tokenAt: number;
};

const centimetresPerCell = CELL_METRES * 100;
const backlogLimit = 32 * 1024;
const rateBurst = 2;

function metresToLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 655.35) throw new Error('Invalid presence coordinate limit.');
  return Math.round(value * 100);
}

function refuse(socket: Duplex, status: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function bytesOf(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}

export async function createPresenceServer(options: Options = {}) {
  const tiers = checkTiers(options.tiers ?? [BASE_TIER]);
  const eastLimit = metresToLimit(options.width ?? TOWN_BOUNDS.width);
  const northLimit = metresToLimit(options.depth ?? TOWN_BOUNDS.depth);
  const heightLimit = metresToLimit(options.height ?? TOWN_BOUNDS.height);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false });
  const http = createServer((_req, res) => { res.writeHead(404).end(); });
  const peers = new Map<number, Peer>();
  let nextId = 1;
  let online = 0;
  let tier = tiers[0];
  let lastTick = performance.now();
  let closing = false;
  let stop: Promise<void> | undefined;

  function send(peer: Peer, data: string | Uint8Array) {
    if (peer.socket.readyState !== WebSocket.OPEN || peer.socket.bufferedAmount > backlogLimit) return false;
    peer.socket.send(data);
    return true;
  }

  function broadcast(data: string, exclude: Peer) {
    for (const peer of peers.values()) if (peer !== exclude && peer.name) send(peer, data);
  }

  function remove(peer: Peer) {
    if (!peers.delete(peer.id)) return;
    clearTimeout(peer.joinTimer);
    if (!peer.name) return;
    online--;
    broadcast(JSON.stringify({ type: 'leave', id: peer.id }), peer);
  }

  function receiveText(peer: Peer, bytes: Uint8Array) {
    let message: unknown;
    try { message = JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')); }
    catch { peer.socket.close(1008); return; }
    if (!message || typeof message !== 'object' || !('type' in message)) {
      peer.socket.close(1008);
      return;
    }
    if (message.type === 'leave' && peer.name) {
      peer.socket.close();
      return;
    }
    if (message.type !== 'join' || peer.name || !('name' in message)) {
      peer.socket.close(1008);
      return;
    }
    const name = validName(message.name);
    if (!name) { peer.socket.close(1008); return; }
    clearTimeout(peer.joinTimer);
    peer.name = name;
    online++;
    send(peer, JSON.stringify({ type: 'join', id: peer.id, name, self: true }));
    for (const other of peers.values()) {
      if (other !== peer && other.name) send(peer, JSON.stringify({ type: 'join', id: other.id, name: other.name }));
    }
    broadcast(JSON.stringify({ type: 'join', id: peer.id, name }), peer);
  }

  function receiveState(peer: Peer, bytes: Uint8Array) {
    const record = readRecord(bytes);
    if (!peer.name || !record) { peer.socket.close(1008); return; }
    const now = performance.now();
    peer.tokens = Math.min(rateBurst, peer.tokens + (now - peer.tokenAt) * BASE_TIER.hz / 1000);
    peer.tokenAt = now;
    if (peer.tokens < 1) return;
    peer.tokens--;
    record.id = peer.id;
    record.east = Math.min(eastLimit, record.east);
    record.north = Math.min(northLimit, record.north);
    record.height = Math.min(heightLimit, record.height);
    if (peer.record?.seq === record.seq) return;
    peer.record = record;
    peer.version++;
  }

  function sendSnapshots() {
    const grid = new Map<number, Peer[]>();
    const cellStride = Math.ceil(eastLimit / centimetresPerCell) + 1;
    for (const peer of peers.values()) {
      const state = peer.record;
      if (!state) continue;
      const key = Math.floor(state.east / centimetresPerCell) + Math.floor(state.north / centimetresPerCell) * cellStride;
      const bucket = grid.get(key);
      if (bucket) bucket.push(peer);
      else grid.set(key, [peer]);
    }

    const radius = tier.radius * 100;
    const radiusSquared = radius * radius;
    for (const peer of peers.values()) {
      const state = peer.record;
      if (!state) continue;
      const nearby: { peer: Peer; distance: number }[] = [];
      const indoors = inSharedHome(state);
      const minX = Math.floor(Math.max(0, state.east - radius) / centimetresPerCell);
      const maxX = Math.floor(Math.min(eastLimit, state.east + radius) / centimetresPerCell);
      const minN = Math.floor(Math.max(0, state.north - radius) / centimetresPerCell);
      const maxN = Math.floor(Math.min(northLimit, state.north + radius) / centimetresPerCell);
      for (let north = minN; north <= maxN; north++) {
        for (let east = minX; east <= maxX; east++) {
          for (const other of grid.get(east + north * cellStride) ?? []) {
            if (other === peer) continue;
            const position = other.record!;
            if (inSharedHome(position) !== indoors) continue;
            const distance = (position.east - state.east) ** 2 + (position.north - state.north) ** 2;
            if (distance <= radiusSquared) nearby.push({ peer: other, distance });
          }
        }
      }
      nearby.sort((a, b) => a.distance - b.distance || a.peer.id - b.peer.id);
      const visible = nearby.slice(0, MAX_VISIBLE).map(entry => entry.peer).sort((a, b) => a.id - b.id);
      if (visible.length === peer.visible.length &&
          visible.every((other, i) => other.id === peer.visible[i].id && other.version === peer.visible[i].version)) continue;
      if (send(peer, writeSnapshot(visible.map(other => other.record!)))) {
        peer.visible = visible.map(other => ({ id: other.id, version: other.version }));
      }
    }
  }

  http.on('upgrade', (req, socket, head) => {
    if (req.url !== PRESENCE_PATH) { refuse(socket, '404 Not Found'); return; }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const source = new URL(origin);
        if ((source.protocol !== 'https:' && source.protocol !== 'http:') || source.host !== req.headers.host) {
          refuse(socket, '403 Forbidden');
          return;
        }
      } catch { refuse(socket, '403 Forbidden'); return; }
    }
    if (closing || peers.size >= MAX_SESSIONS) { refuse(socket, '503 Service Unavailable'); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      while (peers.has(nextId)) nextId = nextId % 65535 + 1;
      const id = nextId;
      nextId = nextId % 65535 + 1;
      const peer: Peer = {
        socket: ws, id, visible: [], version: 0, alive: true, tokens: rateBurst,
        tokenAt: performance.now(), joinTimer: setTimeout(() => ws.close(1008), 5000),
      };
      peers.set(id, peer);
      ws.on('error', () => { remove(peer); ws.terminate(); });
      ws.on('close', () => remove(peer));
      ws.on('pong', () => { peer.alive = true; });
      ws.on('message', (data, binary) => {
        if (!peers.has(id)) return;
        if (binary) receiveState(peer, bytesOf(data));
        else receiveText(peer, bytesOf(data));
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      http.off('error', reject);
      resolve();
    });
  });
  const tick = setInterval(() => {
    if (!online) return;
    const now = performance.now();
    tier = tiers[0];
    for (const candidate of tiers) if (online >= candidate.minOnline) tier = candidate;
    if (now - lastTick < 1000 / tier.hz) return;
    lastTick += 1000 / tier.hz;
    if (now - lastTick >= 1000 / tier.hz) lastTick = now;
    sendSnapshots();
  }, 10);
  const heartbeat = setInterval(() => {
    for (const peer of peers.values()) {
      if (!peer.alive) { peer.socket.terminate(); continue; }
      if (peer.socket.readyState === WebSocket.OPEN) {
        peer.alive = false;
        peer.socket.ping();
      }
    }
  }, 20_000);

  return {
    address: () => http.address() as AddressInfo,
    close() {
      if (stop) return stop;
      closing = true;
      clearInterval(tick);
      clearInterval(heartbeat);
      for (const peer of peers.values()) {
        clearTimeout(peer.joinTimer);
        peer.socket.terminate();
      }
      wss.close();
      stop = new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      return stop;
    },
  };
}
