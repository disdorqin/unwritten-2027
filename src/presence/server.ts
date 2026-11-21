import { randomBytes } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { createTownNightWindow, type TownNightSchedule } from '../shared/town-night-window.js';
import {
  BASE_TIER, CELL_METRES, MAX_SESSIONS, MAX_VISIBLE, PRESENCE_PATH, RECORD_BYTES, TOWN_BOUNDS,
  checkTiers, readRecord, validName, writeSnapshot, type PresenceRecord, type PresenceTier,
} from './protocol.js';
import {
  fireworksCooldownMs, fireworksShowMs, fireworksSiteRangeMetres, isFireworksSeed, isFireworksTheme, publicFireworksStand, type FireworksTheme,
} from './firework-sites.js';
import { createPresenceEgress } from './egress.js';
import { decodeSnowballClientEvent, encodeSnowballRelay, SNOWBALL_EVENT_PREFIX, type SnowballThrow } from './snowball-events.js';
import { createTestFireworksSchedule } from './test-fireworks.js';
import { createTownNightBeaconHost } from './town-night-beacon.js';
import {
  ceremonyLandingAnnouncement, ceremonyLandingLeadMs, ceremonyLateWindowMs, townCeremonyMidnight, type CeremonyArrival,
} from './ceremony-arrival.js';
import {
  inPlazaPhotoArc, plazaPhotoCountdownMs, plazaPhotoGatherMs, plazaPhotoLineup, plazaPhotoLockMs,
  type PlazaPhotoInvite, type PlazaPhotoNotice, type PlazaPhotoPerson,
} from './plaza-photo.js';

export type PresenceTownNightOptions = Readonly<{
  scheduleAt: (now: number) => TownNightSchedule | undefined;
  restoredBeaconAt?: number | null;
  saveBeacon?: (at: number) => void;
  onSaveError?: (error: unknown) => void;
}>;

type Options = {
  host?: string;
  port?: number;
  width?: number;
  depth?: number;
  height?: number;
  tiers?: readonly PresenceTier[];
  now?: () => number;
  wallNow?: () => number;
  townNight?: PresenceTownNightOptions;
  /** Optional server-authoritative G-09 wind for the relay; clients cannot supply it. */
  snowballWindForThrow?: (event: Readonly<SnowballThrow>, epoch: number) => Readonly<{ east: number; north: number }> | undefined;
  testFireworks?: boolean;
  requestListener?: RequestListener;
  ceremonyStartAt?: number;
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
  throws: TokenBucket;
  chat: TokenBucket;
  poseRate: TokenBucket;
  pose: number;
  floodAt: number;
  floodCount: number;
  pendingThrows: Map<number, PendingThrow>;
  nextClockSample: number;
  nextFireworksRequest: number;
  nextPersonalFireworks: number;
  nextPhotoRequest: number;
  joinedAt?: number;
  ceremonyWarned?: boolean;
  ceremonyArrival?: CeremonyArrival;
};

type TokenBucket = { tokens: number; at: number };
type PendingThrow = { expiresAt: number; recipients: Set<Peer>; confirmed: boolean };

const centimetresPerCell = CELL_METRES * 100;
const backlogLimit = 32 * 1024;
const rateBurst = 2;
const throwRate = 4;
const throwBurst = 6;
const throwWindowMs = 3000;
const eventFloodPerSecond = 128;
const eventVisibleLimits = [MAX_VISIBLE, 40, 32] as const;
const fallbackLoadTier = { minOnline: 49, radius: 48, hz: 2.5 } as const;

function consume(bucket: TokenBucket, now: number, rate: number, capacity: number) {
  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) * rate / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}

function horizontalDistanceSquared(a: PresenceRecord, b: PresenceRecord) {
  return (a.east - b.east) ** 2 + (a.north - b.north) ** 2;
}

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
  const now = options.now ?? (() => performance.now());
  const wallNow = options.wallNow ?? Date.now;
  const nightConfig = options.townNight;
  const townNight = nightConfig && createTownNightBeaconHost(createTownNightWindow({
    now: wallNow,
    scheduleAt: nightConfig.scheduleAt,
    saveBeacon: nightConfig.saveBeacon,
  }, nightConfig.restoredBeaconAt), cue => broadcast(JSON.stringify(cue)));
  let lastTownNightWindow = townNight?.snapshot();
  let nightErrorReported = false;
  const egress = createPresenceEgress();
  const fireworks = options.testFireworks ? createTestFireworksSchedule() : undefined;
  const eastLimit = metresToLimit(options.width ?? TOWN_BOUNDS.width);
  const northLimit = metresToLimit(options.depth ?? TOWN_BOUNDS.depth);
  const heightLimit = metresToLimit(options.height ?? TOWN_BOUNDS.height);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false });
  const http = createServer(options.requestListener ?? ((_req, res) => { res.writeHead(404).end(); }));
  const peers = new Map<number, Peer>();
  const ceremonyStartAt = options.ceremonyStartAt ?? townCeremonyMidnight;
  const ceremonyEndAt = ceremonyStartAt + ceremonyLateWindowMs;
  const ceremonyWaiting = new Set<Peer>();
  const ceremonyPreannouncement = JSON.stringify({ type: 'event', kind: 'announce', message: ceremonyLandingAnnouncement });
  let fireworksOccupiedUntil = 0;
  let photo: { invite: PlazaPhotoInvite; ended: boolean; optedOut: Set<number> } | undefined;
  let photoId = 0;
  let nextId = 1;
  let online = 0;
  let tier = tiers[0];
  let tierIndex = 0;
  let egressBytesPerSecond = 0;
  let lastTick = now();
  let closing = false;
  let stop: Promise<void> | undefined;

  function send(peer: Peer, data: string | Uint8Array) {
    if (peer.socket.readyState !== WebSocket.OPEN || peer.socket.bufferedAmount > backlogLimit) return false;
    peer.socket.send(data);
    egress.record(now(), typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength);
    return true;
  }

  function broadcast(data: string, exclude?: Peer) {
    for (const peer of peers.values()) if (peer !== exclude && peer.name) send(peer, data);
  }

  function updateTownNight() {
    if (!townNight) return;
    let state;
    try {
      state = townNight.tick();
      nightErrorReported = false;
    } catch (error) {
      // A failed receipt write leaves the cue uncommitted. Retry while it is fresh.
      if (!nightErrorReported) {
        nightErrorReported = true;
        if (nightConfig?.onSaveError) nightConfig.onSaveError(error);
        else console.error('Town night beacon could not advance:', error);
      }
      return;
    }
    if (lastTownNightWindow?.phase === state.phase && lastTownNightWindow.layersOverlap === state.layersOverlap &&
        lastTownNightWindow.beaconAt === state.beaconAt && lastTownNightWindow.morningBellAt === state.morningBellAt) return;
    lastTownNightWindow = state;
    broadcast(JSON.stringify({ type: 'event', kind: 'town-night-window', state }));
  }

  function updateFireworks(time: number) {
    const event = fireworks?.update(online, time, wallNow(), () => randomBytes(4).readUInt32LE());
    if (event) broadcast(JSON.stringify(event));
  }

  function updateCeremony(time: number) {
    if (time < ceremonyStartAt - ceremonyLandingLeadMs || time >= ceremonyEndAt || !ceremonyWaiting.size) return;
    for (const peer of ceremonyWaiting) {
      if (time < ceremonyStartAt && !peer.ceremonyWarned) {
        if (!send(peer, ceremonyPreannouncement)) continue;
        peer.ceremonyWarned = true;
      }
      if (!peer.ceremonyArrival) {
        const edge = peer.joinedAt! >= ceremonyStartAt;
        const occupied = new Set([...peers.values()].flatMap(other =>
          other.ceremonyArrival?.edge === edge ? [other.ceremonyArrival.slot] : []));
        let slot = 0;
        while (occupied.has(slot)) slot++;
        peer.ceremonyArrival = { type: 'event', kind: 'ceremony-arrival', startAt: ceremonyStartAt, slot, edge };
      }
      if (send(peer, JSON.stringify(peer.ceremonyArrival))) ceremonyWaiting.delete(peer);
    }
  }

  function relevantPeers(peer: Peer, radius: number, limit: number, heightGate = false) {
    const state = peer.record;
    if (!state) return [];
    const radiusSquared = (radius * 100) ** 2;
    const nearby: { peer: Peer; distance: number }[] = [];
    for (const candidate of peers.values()) {
      const candidateState = candidate.record;
      if (candidate === peer || !candidateState) continue;
      if (heightGate && Math.abs(state.height - candidateState.height) > 1000) continue;
      const distance = horizontalDistanceSquared(state, candidateState);
      if (distance <= radiusSquared) nearby.push({ peer: candidate, distance });
    }
    nearby.sort((a, b) => a.distance - b.distance || a.peer.id - b.peer.id);
    return nearby.slice(0, limit).map(entry => entry.peer);
  }

  function allowEvent(peer: Peer, time: number) {
    if (time - peer.floodAt >= 1000) {
      peer.floodAt = time;
      peer.floodCount = 0;
    }
    if (++peer.floodCount <= eventFloodPerSecond) return true;
    peer.socket.close(1008);
    return false;
  }

  function receiveSnowball(peer: Peer, bytes: Uint8Array) {
    if (!peer.name) { peer.socket.close(1008); return; }
    const time = now();
    if (!allowEvent(peer, time)) return;
    const event = decodeSnowballClientEvent(bytes);
    if (!event || !peer.record) return;

    if (event.kind === 'hit') {
      const thrower = peers.get(event.throwerId);
      const pending = thrower?.pendingThrows.get(event.ballId);
      if (!thrower || !pending || pending.expiresAt <= time || pending.confirmed || !pending.recipients.has(peer)) return;
      pending.confirmed = true;
      const relay = encodeSnowballRelay({ ...event, confirmerId: peer.id });
      send(thrower, relay);
      for (const recipient of pending.recipients) send(recipient, relay);
      return;
    }

    if (!consume(peer.throws, time, throwRate, throwBurst)) return;
    const feet = peer.record;
    event.east = Math.min(eastLimit / 100, event.east);
    event.north = Math.min(northLimit / 100, event.north);
    event.height = Math.min(heightLimit / 100, event.height);
    const handDistanceSquared = (event.east - feet.east / 100) ** 2
      + (event.north - feet.north / 100) ** 2 + (event.height - feet.height / 100 - 1.5) ** 2;
    if (handDistanceSquared > 9) return;
    for (const [ballId, pending] of peer.pendingThrows) {
      if (pending.expiresAt <= time) peer.pendingThrows.delete(ballId);
    }
    if (peer.pendingThrows.has(event.ballId)) return;
    // Only the server may add the windy relay variant. On invalid/unconfigured
    // weather, preserve the original 18-byte packet for older consumers.
    const candidateWind = options.snowballWindForThrow?.(event, wallNow());
    const wind = candidateWind && Number.isFinite(candidateWind.east) && Number.isFinite(candidateWind.north) &&
      Math.abs(candidateWind.east) <= 2 && Math.abs(candidateWind.north) <= 2 ? candidateWind : undefined;
    const relay = encodeSnowballRelay({ ...event, throwerId: peer.id,
      ...(wind ? { windEast: wind.east, windNorth: wind.north } : {}),
    });
    const recipients = new Set<Peer>();
    for (const recipient of relevantPeers(peer, tier.radius, eventVisibleLimits[tierIndex])) {
      if (send(recipient, relay)) recipients.add(recipient);
    }
    peer.pendingThrows.set(event.ballId, { expiresAt: time + throwWindowMs, recipients, confirmed: false });
  }

  function receiveChat(peer: Peer, text: unknown, requestedScope: unknown) {
    if (typeof text !== 'string') return;
    const clean = text.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '').trim();
    if (!clean || [...clean].length > 100 || !consume(peer.chat, now(), 1 / 1.5, 2)) return;
    const scope = requestedScope === 'town' ? 'town' : 'near';
    const relay = JSON.stringify({ type: 'chat', id: peer.id, name: peer.name, scope, text: clean });
    if (scope === 'town') broadcast(relay, peer);
    else for (const recipient of relevantPeers(peer, 40, MAX_SESSIONS, true)) send(recipient, relay);
  }

  function receivePose(peer: Peer, pose: unknown) {
    if (typeof pose !== 'number' || !Number.isInteger(pose) || pose < 0 || (pose > 5 && pose !== 7) ||
        peer.pose === pose || !consume(peer.poseRate, now(), 5, 5)) return;
    peer.pose = pose;
    const relay = JSON.stringify({ type: 'pose', id: peer.id, pose });
    for (const recipient of relevantPeers(peer, tier.radius, eventVisibleLimits[tierIndex])) send(recipient, relay);
  }

  function remove(peer: Peer) {
    if (!peers.delete(peer.id)) return;
    ceremonyWaiting.delete(peer);
    clearTimeout(peer.joinTimer);
    if (!peer.name) return;
    online--;
    broadcast(JSON.stringify({ type: 'leave', id: peer.id }), peer);
    updateFireworks(now());
  }

  function requestFireworks(peer: Peer, seed: number, theme: FireworksTheme) {
    const now = performance.now();
    if (now < peer.nextFireworksRequest) return;
    peer.nextFireworksRequest = now + 500;
    const position = peer.record;
    const { east, north } = publicFireworksStand;
    // Allow one sample of walking between the advertised stand and the latest pose.
    if (!position ||
        (position.east / 100 - east) ** 2 + (position.north / 100 - north) ** 2 > (fireworksSiteRangeMetres + .7) ** 2) {
      send(peer, JSON.stringify({ type: 'fireworks-rejected', reason: 'position' }));
      return;
    }
    const waitMs = Math.max(fireworksOccupiedUntil, peer.nextPersonalFireworks) - now;
    if (waitMs > 0) {
      send(peer, JSON.stringify({ type: 'fireworks-rejected', reason: 'cooldown', waitMs: Math.ceil(waitMs) }));
      return;
    }
    const startDelayMs = 250;
    fireworksOccupiedUntil = now + startDelayMs + fireworksShowMs;
    peer.nextPersonalFireworks = now + startDelayMs + fireworksCooldownMs;
    const event = JSON.stringify({
      type: 'event', kind: 'fireworks', from: peer.id, seed, theme, startAt: wallNow() + startDelayMs,
    });
    for (const recipient of peers.values()) if (recipient.name) send(recipient, event);
  }

  function photoPerson(peer: Peer): PlazaPhotoPerson | undefined {
    const { name, record } = peer;
    if (!name || !record) return;
    return { id: peer.id, name, east: record.east / 100, north: record.north / 100, height: record.height / 100 };
  }

  function publishPhoto(notice: PlazaPhotoNotice) {
    const data = JSON.stringify(notice);
    for (const peer of peers.values()) if (peer.name) send(peer, data);
  }

  function updatePhoto(now: number) {
    if (!photo) return;
    if (now > photo.invite.captureAt + 1_000) {
      photo = undefined;
      return;
    }
    if (photo.ended || now < photo.invite.captureAt - plazaPhotoLockMs) return;
    photo.ended = true;
    const people: PlazaPhotoPerson[] = [];
    for (const peer of peers.values()) {
      if (photo.optedOut.has(peer.id)) continue;
      const person = photoPerson(peer);
      if (person) people.push(person);
    }
    publishPhoto({ ...photo.invite, kind: 'plaza-photo-lineup', people: plazaPhotoLineup(people) });
  }

  function requestPhoto(peer: Peer) {
    const throttleNow = performance.now();
    if (throttleNow < peer.nextPhotoRequest) return;
    peer.nextPhotoRequest = throttleNow + 500;
    const now = wallNow();
    updatePhoto(now);
    if (photo) {
      send(peer, JSON.stringify({ type: 'plaza-photo-rejected', reason: 'busy' }));
      return;
    }
    const person = photoPerson(peer);
    if (!person || !inPlazaPhotoArc(person.east, person.north, person.height)) {
      send(peer, JSON.stringify({ type: 'plaza-photo-rejected', reason: 'position' }));
      return;
    }
    const invite: PlazaPhotoInvite = {
      type: 'event', kind: 'plaza-photo-invite', id: ++photoId,
      captureAt: now + plazaPhotoGatherMs + plazaPhotoCountdownMs,
    };
    photo = { invite, ended: false, optedOut: new Set() };
    publishPhoto(invite);
  }

  function receiveText(peer: Peer, bytes: Uint8Array) {
    let message: unknown;
    try { message = JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')); }
    catch { peer.socket.close(1008); return; }
    if (!message || typeof message !== 'object' || !('type' in message)) {
      peer.socket.close(1008);
      return;
    }
    if (message.type === 'event' && 'kind' in message && message.kind === 'fireworks' && peer.name) {
      if ('seed' in message && isFireworksSeed(message.seed) && 'theme' in message && isFireworksTheme(message.theme)) {
        requestFireworks(peer, message.seed, message.theme);
      }
      return;
    }
    if (message.type === 'leave' && peer.name) {
      peer.socket.close();
      return;
    }
    if (message.type === 'chat' && peer.name) {
      if (allowEvent(peer, now())) {
        receiveChat(peer, 'text' in message ? message.text : undefined, 'scope' in message ? message.scope : undefined);
      }
      return;
    }
    if (message.type === 'event' && 'kind' in message && peer.name) {
      if (message.kind === 'plaza-photo-request') {
        if (allowEvent(peer, now())) requestPhoto(peer);
        return;
      }
      if (message.kind === 'plaza-photo-opt-out') {
        if (photo && !photo.ended && 'id' in message && message.id === photo.invite.id) photo.optedOut.add(peer.id);
        return;
      }
    }
    if (message.type === 'clock' && peer.name && 'sentAt' in message &&
        typeof message.sentAt === 'number' && Number.isFinite(message.sentAt) && message.sentAt >= 0) {
      const now = performance.now();
      if (now < peer.nextClockSample) return;
      peer.nextClockSample = now + 750;
      send(peer, JSON.stringify({ type: 'clock', sentAt: message.sentAt, epochMs: wallNow() }));
      return;
    }
    if (message.type === 'pose' && peer.name) {
      if (allowEvent(peer, now())) receivePose(peer, 'pose' in message ? message.pose : undefined);
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
    const joinedAt = wallNow();
    peer.joinedAt = joinedAt;
    if (joinedAt < ceremonyEndAt) ceremonyWaiting.add(peer);
    online++;
    send(peer, JSON.stringify({ type: 'join', id: peer.id, name, self: true, epochMs: joinedAt, tier: tierIndex,
      fireworks: true, plazaPhoto: true, townNightWindow: townNight?.snapshot() }));
    if (photo && !photo.ended && wallNow() < photo.invite.captureAt - plazaPhotoLockMs) send(peer, JSON.stringify(photo.invite));
    for (const other of peers.values()) {
      if (other !== peer && other.name) send(peer, JSON.stringify({ type: 'join', id: other.id, name: other.name, pose: other.pose }));
    }
    broadcast(JSON.stringify({ type: 'join', id: peer.id, name }), peer);
    updateFireworks(now());
    updateCeremony(joinedAt);
  }

  function receiveState(peer: Peer, bytes: Uint8Array) {
    const record = readRecord(bytes);
    if (!peer.name || !record) { peer.socket.close(1008); return; }
    const time = now();
    peer.tokens = Math.min(rateBurst, peer.tokens + (time - peer.tokenAt) * BASE_TIER.hz / 1000);
    peer.tokenAt = time;
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
      const minX = Math.floor(Math.max(0, state.east - radius) / centimetresPerCell);
      const maxX = Math.floor(Math.min(eastLimit, state.east + radius) / centimetresPerCell);
      const minN = Math.floor(Math.max(0, state.north - radius) / centimetresPerCell);
      const maxN = Math.floor(Math.min(northLimit, state.north + radius) / centimetresPerCell);
      for (let north = minN; north <= maxN; north++) {
        for (let east = minX; east <= maxX; east++) {
          for (const other of grid.get(east + north * cellStride) ?? []) {
            if (other === peer) continue;
            const position = other.record!;
            const distance = (position.east - state.east) ** 2 + (position.north - state.north) ** 2;
            if (distance <= radiusSquared) nearby.push({ peer: other, distance });
          }
        }
      }
      nearby.sort((a, b) => a.distance - b.distance || a.peer.id - b.peer.id);
      const visible = nearby.slice(0, eventVisibleLimits[tierIndex]).map(entry => entry.peer).sort((a, b) => a.id - b.id);
      if (visible.length === peer.visible.length &&
          visible.every((other, i) => other.id === peer.visible[i].id && other.version === peer.visible[i].version)) continue;
      if (send(peer, writeSnapshot(visible.map(other => other.record!)))) {
        // The returning peer may have cached another pose before it moved beyond interest.
        for (const other of visible) if (!peer.visible.some(previous => previous.id === other.id)) {
          send(peer, JSON.stringify({ type: 'pose', id: other.id, pose: other.pose }));
        }
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
      const t = now();
      const peer: Peer = {
        socket: ws, id, visible: [], version: 0, alive: true, tokens: rateBurst,
        tokenAt: t, joinTimer: setTimeout(() => ws.close(1008), 5000),
        throws: { tokens: throwBurst, at: t }, chat: { tokens: 2, at: t }, poseRate: { tokens: 5, at: t }, pose: 0,
        floodAt: t, floodCount: 0, pendingThrows: new Map(),
        nextClockSample: 0, nextPhotoRequest: 0, nextFireworksRequest: 0, nextPersonalFireworks: 0,
      };
      peers.set(id, peer);
      ws.on('error', () => { remove(peer); ws.terminate(); });
      ws.on('close', () => remove(peer));
      ws.on('pong', () => { peer.alive = true; });
      ws.on('message', (data, binary) => {
        if (!peers.has(id)) return;
        const bytes = bytesOf(data);
        if (!binary) receiveText(peer, bytes);
        else if (bytes.byteLength === RECORD_BYTES || bytes[0] !== SNOWBALL_EVENT_PREFIX) receiveState(peer, bytes);
        else receiveSnowball(peer, bytes);
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
    const time = now();
    updateFireworks(time);
    const epoch = wallNow();
    updateTownNight();
    updateCeremony(epoch);
    if (photo) updatePhoto(epoch);
    const pressure = egress.sample(time);
    egressBytesPerSecond = pressure.bytesPerSecond;
    let nextTier = 0;
    for (let i = 1; i < tiers.length; i++) if (online >= tiers[i].minOnline) nextTier = i;
    if (pressure.forced) nextTier = Math.max(nextTier, 2);
    if (tierIndex !== nextTier) {
      tierIndex = nextTier;
      broadcast(JSON.stringify({ type: 'tier', tier: tierIndex, egressBytesPerSecond }));
    }
    tier = tiers[tierIndex] ?? fallbackLoadTier;
    if (!online || time - lastTick < 1000 / tier.hz) return;
    lastTick += 1000 / tier.hz;
    if (time - lastTick >= 1000 / tier.hz) lastTick = time;
    sendSnapshots();
  }, 10);
  const heartbeat = setInterval(() => {
    for (const peer of peers.values()) {
      if (!peer.alive) { peer.socket.terminate(); continue; }
      if (peer.socket.readyState === WebSocket.OPEN) {
        peer.alive = false;
        peer.socket.ping();
        egress.record(now(), 0);
      }
    }
  }, 20_000);

  return {
    address: () => http.address() as AddressInfo,
    stats: () => ({ online, tier: tierIndex, egressBytesPerSecond }),
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
