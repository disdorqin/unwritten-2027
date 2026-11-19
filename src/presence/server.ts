import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  BASE_TIER, CELL_METRES, MASCOT_ACTOR_ID, MAX_SESSIONS, MAX_VISIBLE, POLL_JOIN_PATH, POLL_LEAVE_PATH,
  POLL_PATH, POLL_SESSION_TIMEOUT_MS, PRESENCE_PATH, RECORD_BYTES, TOWN_BOUNDS,
  checkTiers, readRecord, validName, writeSnapshot, type PresenceRecord, type PresenceTier,
} from './protocol.js';
import {
  fireworksCooldownMs, fireworksShowMs, fireworksSiteRangeMetres, isFireworksSeed, isFireworksTheme, publicFireworksStand, type FireworksTheme,
} from './firework-sites.js';
import { createPresenceEgress } from './egress.js';
import { createIceThroneAuthority } from './ice-throne-authority.js';
import { isIcePalaceThroneRecord } from './ice-throne-site.js';
import { personalFireworkCooldownMs, personalFireworkRestricted, readPersonalFirework } from './personal-fireworks.js';
import { decodeSnowballClientEvent, encodeSnowballRelay, SNOWBALL_EVENT_PREFIX } from './snowball-events.js';
import {
  SNOWFIGHT_POINTS, SNOWFIGHT_TEAM_NAMES, SnowWallField, SnowfightMatch, WALL_BLOCK_HP, WALL_CELL, buildHalfAllows,
  classifyWallSite, freeWallTeam, wallCellCentre,
} from './snowfight.js';
import {
  SNOWFIGHT_PLACE, SNOWFIGHT_SLED_SMASH, SNOWFIGHT_WALL_HIT, decodeSnowfightClientEvent, encodeWallClear,
  encodeWallSet,
} from './snowfight-events.js';
import { createTestFireworksSchedule } from './test-fireworks.js';
import {
  ceremonyLandingAnnouncement, ceremonyLandingCentre, ceremonyLandingLeadMs, ceremonyLandingOuterRadius,
  ceremonyLateWindowMs, townCeremonyMidnight, type CeremonyArrival,
} from './ceremony-arrival.js';
import {
  inPlazaPhotoRequestZone, plazaPhotoCountdownMs, plazaPhotoGatherMs, plazaPhotoLineup, plazaPhotoLockMs,
  type PlazaPhotoInvite, type PlazaPhotoNotice, type PlazaPhotoPerson,
} from './plaza-photo.js';
import {
  applyBellTouch, bellStandings, bellTitleDue, createBellMatch, defaultBellConfig, dropBell, endBellMatch,
  inBellVenue, tryBellTouch, type BellConfig, type BellState, type BellStateEvent,
} from './bell-game.js';

/** S2 连接日志出口：每个连接事件调用一次，参数为一行完整的 JSON 文本。 */
export type PresenceConnectionLog = (line: string) => void;

type Options = {
  host?: string;
  port?: number;
  width?: number;
  depth?: number;
  height?: number;
  tiers?: readonly PresenceTier[];
  now?: () => number;
  testFireworks?: boolean;
  ownerKey?: string;
  onMascotClaimRejected?: (total: number) => void;
  requestListener?: RequestListener;
  ceremonyStartAt?: number;
  bellConfig?: Partial<BellConfig>;
  /** S2 结构化连接日志的注入点；默认 console.log。 */
  connectionLog?: PresenceConnectionLog;
};

type PollFrame = { t: 'text'; d: string } | { t: 'bin'; d: Uint8Array };

type Peer = {
  transport: 'ws' | 'poll';
  socket?: WebSocket;
  /** 轮询通道的待发队列（WS 通道为空）；快照帧只保留最新一帧。 */
  outbox: PollFrame[];
  outboxBytes: number;
  /** 轮询会话令牌与最近一次轮询时刻（now() 时钟）。 */
  session?: string;
  lastPollAt: number;
  /** S2 连接日志：断开原因码，由各断开路径在回收前置入，remove() 统一记录。 */
  dropReason?: string;
  id: number;
  name?: string;
  record?: PresenceRecord;
  version: number;
  visible: { id: number; version: number }[];
  joinTimer?: ReturnType<typeof setTimeout>;
  alive: boolean;
  tokens: number;
  tokenAt: number;
  throws: TokenBucket;
  chat: TokenBucket;
  poseRate: TokenBucket;
  snowPlace: TokenBucket;
  nextSnowfightRequest: number;
  pose: number;
  floodAt: number;
  floodCount: number;
  pendingThrows: Map<number, PendingThrow>;
  nextClockSample: number;
  nextBellRequest: number;
  nextFireworksRequest: number;
  nextPersonalFireworks: number;
  nextFirecracker: number;
  nextPhotoRequest: number;
  joinedAt?: number;
  ceremonyWarned?: boolean;
  ceremonyArrival?: CeremonyArrival;
  ownerChallenge?: { nonce: string; expiresAt: number };
  ownerFailures?: number;
  ownerRetryAt?: number;
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
const pollOutboxLimitBytes = 512 * 1024;
const pollBodyLimitBytes = 64 * 1024;
const pollEventsPerRequest = 64;
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
  const connectionLog = options.connectionLog ?? ((line: string) => console.log(line));
  /**
   * S2 结构化连接日志：一行一个 JSON，字段只有时间戳/传输/peer/步骤/结果码。
   * 与客户端四步故障码（PG-1/WS-2/FR-3/HB-4）对位：attempt≈页面/握手到达、
   * session≈握手与会话建立、join≈首帧完成、drop≈心跳超时或会话回收。
   * 绝不记录聊天文本、昵称、IP 或任何口令类信息。
   */
  function connLog(transport: 'ws' | 'poll' | '-', peer: number | '-', step: 'attempt' | 'session' | 'join' | 'drop', result: string) {
    try {
      connectionLog(JSON.stringify({ ts: new Date().toISOString(), transport, peer, step, result }));
    } catch { /* 日志出口异常不得影响连接服务本身。 */ }
  }
  const egress = createPresenceEgress();
  const fireworks = options.testFireworks ? createTestFireworksSchedule() : undefined;
  const eastLimit = metresToLimit(options.width ?? TOWN_BOUNDS.width);
  const northLimit = metresToLimit(options.depth ?? TOWN_BOUNDS.depth);
  const heightLimit = metresToLimit(options.height ?? TOWN_BOUNDS.height);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false });
  const fallbackListener: RequestListener = (_req, res) => { res.writeHead(404).end(); };
  const http = createServer((req, res) => {
    if (req.url === POLL_JOIN_PATH || req.url === POLL_PATH || req.url === POLL_LEAVE_PATH) {
      void handlePoll(req, res);
      return;
    }
    (options.requestListener ?? fallbackListener)(req, res);
  });
  const peers = new Map<number, Peer>();
  const pollSessions = new Map<string, Peer>();
  let crownOwner: number | null = null;
  const iceThrone = createIceThroneAuthority(({ ownerId, message }) => {
    const oldOwner = crownOwner;
    crownOwner = ownerId;
    for (const id of [oldOwner, ownerId]) {
      if (id === null) continue;
      const actor = peers.get(id);
      if (actor) broadcast(poseMessage(actor, true));
    }
    broadcast(JSON.stringify({ type: 'event', kind: 'announce', message }));
  });
  const ceremonyStartAt = options.ceremonyStartAt ?? townCeremonyMidnight;
  const ceremonyEndAt = ceremonyStartAt + ceremonyLateWindowMs;
  const ceremonyWaiting = new Set<Peer>();
  const snowMatch = new SnowfightMatch();
  const snowWalls = new SnowWallField();
  const wallHitSeen = new Map<string, number>();
  let snowStateAt = 0;
  let snowDecayAt = 0;
  const ceremonyPreannouncement = JSON.stringify({ type: 'event', kind: 'announce', message: ceremonyLandingAnnouncement });
  const bellConfig: BellConfig = { ...defaultBellConfig, ...options.bellConfig };
  let bell: BellState | undefined;
  let bellAnnounced = new Set<string>();
  const bellNames = new Map<number, string>();
  let bellSyncAt = 0;
  let owner: Peer | undefined;
  let mascot: { id: number; record: PresenceRecord; version: number; pose: number } | undefined;
  let mascotUntil = 0;
  let nextMascotSample = 0;
  let mascotVersion = 0;
  let rejectedMascotClaims = 0;
  let fireworksOccupiedUntil = 0;
  const personalFireworkBudget = { tokens: 10, at: now() };
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
    const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
    if (peer.transport === 'poll') {
      // 快照是状态而非事件：队列里只保留最新一帧，慢轮询者不会积压旧位置。
      if (typeof data !== 'string' && data[0] !== SNOWBALL_EVENT_PREFIX) {
        const stale = peer.outbox.findIndex(frame => frame.t === 'bin' && frame.d[0] !== SNOWBALL_EVENT_PREFIX);
        if (stale >= 0) {
          peer.outboxBytes -= (peer.outbox[stale] as { d: Uint8Array }).d.byteLength;
          peer.outbox.splice(stale, 1);
        }
      }
      if (peer.outboxBytes + bytes > pollOutboxLimitBytes) return false;
      peer.outbox.push(typeof data === 'string' ? { t: 'text', d: data } : { t: 'bin', d: data });
      peer.outboxBytes += bytes;
      egress.record(now(), bytes);
      return true;
    }
    const socket = peer.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > backlogLimit) return false;
    socket.send(data);
    egress.record(now(), bytes);
    return true;
  }

  /** 协议错误时断开该对等端：WS 关连接（1008），轮询直接回收会话。 */
  function failPeer(peer: Peer) {
    peer.dropReason ??= 'protocol-error';
    if (peer.transport === 'ws') peer.socket?.close(1008);
    else remove(peer);
  }

  /** 对等端主动离开（leave 消息）：与 failPeer 同路，只是 WS 侧用普通关闭。 */
  function closePeer(peer: Peer) {
    peer.dropReason ??= 'leave';
    if (peer.transport === 'ws') peer.socket?.close();
    else remove(peer);
  }

  function drainOutbox(peer: Peer) {
    const messages = peer.outbox.map(frame => frame.t === 'text'
      ? { t: 'text', d: frame.d }
      : { t: 'bin', d: Buffer.from(frame.d).toString('base64') });
    peer.outbox = [];
    peer.outboxBytes = 0;
    return messages;
  }

  function createPeer(transport: 'ws' | 'poll', socket?: WebSocket): Peer {
    while (nextId === MASCOT_ACTOR_ID || peers.has(nextId)) nextId = nextId % 65535 + 1;
    const id = nextId;
    nextId = nextId % 65535 + 1;
    const t = now();
    const peer: Peer = {
      transport, socket, id, visible: [], version: 0, alive: true, tokens: rateBurst,
      tokenAt: t, outbox: [], outboxBytes: 0, lastPollAt: t,
      throws: { tokens: throwBurst, at: t }, chat: { tokens: 2, at: t }, poseRate: { tokens: 5, at: t },
      snowPlace: { tokens: 6, at: t }, nextSnowfightRequest: 0, pose: 0,
      floodAt: t, floodCount: 0, pendingThrows: new Map(),
      nextClockSample: 0, nextBellRequest: 0, nextPhotoRequest: 0, nextFireworksRequest: 0, nextPersonalFireworks: 0, nextFirecracker: 0,
    };
    peers.set(id, peer);
    return peer;
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', chunk => {
        size += (chunk as Buffer).byteLength;
        if (size > pollBodyLimitBytes) { reject(new Error('body too large')); req.destroy(); return; }
        chunks.push(chunk as Buffer);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  /**
   * S3 备用通道端点（与 WS 共用 peers 与全部接收逻辑，只是传输换成 HTTP 往返）：
   * - POST /presence/poll/join {name} → {session, id, messages}（messages 为入队帧：text 原文 / bin base64）
   * - POST /presence/poll（头 x-presence-session）{state?: base64(12B), events?: [{t,d}]} → {messages}
   * - POST /presence/poll/leave（头 x-presence-session）→ {}
   */
  async function handlePoll(req: IncomingMessage, res: ServerResponse) {
    const reply = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
    };
    if (req.method !== 'POST') {
      if (req.url === POLL_JOIN_PATH) connLog('poll', '-', 'attempt', 'method');
      reply(405, { error: 'method' });
      return;
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const source = new URL(origin);
        if ((source.protocol !== 'https:' && source.protocol !== 'http:') || source.host !== req.headers.host) {
          if (req.url === POLL_JOIN_PATH) connLog('poll', '-', 'attempt', 'origin');
          reply(403, { error: 'origin' });
          return;
        }
      } catch {
        if (req.url === POLL_JOIN_PATH) connLog('poll', '-', 'attempt', 'origin');
        reply(403, { error: 'origin' });
        return;
      }
    }
    let body: { name?: unknown; state?: unknown; events?: unknown };
    try { body = JSON.parse(await readBody(req) || '{}') as typeof body; }
    catch {
      if (req.url === POLL_JOIN_PATH) connLog('poll', '-', 'attempt', 'body');
      reply(400, { error: 'body' });
      return;
    }

    if (req.url === POLL_JOIN_PATH) {
      if (closing || peers.size >= MAX_SESSIONS) {
        connLog('poll', '-', 'attempt', 'full');
        reply(503, { error: 'full' });
        return;
      }
      connLog('poll', '-', 'attempt', 'accepted');
      const peer = createPeer('poll');
      connLog('poll', peer.id, 'session', 'ok');
      receiveText(peer, Buffer.from(JSON.stringify({ type: 'join', name: body.name }), 'utf8'));
      if (!peer.name || !peers.has(peer.id)) { reply(400, { error: 'name' }); return; }
      const session = randomBytes(16).toString('hex');
      peer.session = session;
      pollSessions.set(session, peer);
      reply(200, { session, id: peer.id, messages: drainOutbox(peer) });
      return;
    }

    const token = req.headers['x-presence-session'];
    const peer = typeof token === 'string' ? pollSessions.get(token) : undefined;
    if (!peer || !peers.has(peer.id)) {
      connLog('poll', '-', 'session', 'unknown');
      reply(401, { error: 'session' });
      return;
    }
    peer.lastPollAt = now();

    if (req.url === POLL_LEAVE_PATH) {
      peer.dropReason ??= 'leave';
      remove(peer);
      reply(200, {});
      return;
    }
    if (typeof body.state === 'string') {
      const bytes = Buffer.from(body.state, 'base64');
      if (bytes.byteLength === RECORD_BYTES) receiveState(peer, bytes);
      if (!peers.has(peer.id)) { reply(410, { error: 'gone' }); return; }
    }
    if (Array.isArray(body.events)) {
      for (const item of body.events.slice(0, pollEventsPerRequest)) {
        if (!peers.has(peer.id)) break;
        const frame = item as { t?: unknown; d?: unknown };
        if (frame.t === 'text' && typeof frame.d === 'string') {
          receiveText(peer, Buffer.from(frame.d, 'utf8'));
        } else if (frame.t === 'bin' && typeof frame.d === 'string') {
          const bytes = Buffer.from(frame.d, 'base64');
          if (bytes.byteLength === RECORD_BYTES && bytes.readUInt16LE(0) === MASCOT_ACTOR_ID) {
            receiveState(peer, bytes);
          } else if (bytes.byteLength > 0 && bytes[0] === SNOWBALL_EVENT_PREFIX) {
            // 与 WS 分发同口径：snowfight 帧（放墙/命中/撞穿）先行裁定，其余才是雪球。
            if (bytes[1] === SNOWFIGHT_PLACE || bytes[1] === SNOWFIGHT_WALL_HIT ||
              bytes[1] === SNOWFIGHT_SLED_SMASH) receiveSnowfight(peer, bytes);
            else receiveSnowball(peer, bytes);
          }
        }
      }
    }
    if (!peers.has(peer.id)) { reply(410, { error: 'gone' }); return; }
    reply(200, { messages: drainOutbox(peer) });
  }

  function broadcast(data: string, exclude?: Peer) {
    for (const peer of peers.values()) if (peer !== exclude && peer.name) send(peer, data);
  }

  function updateFireworks(time: number) {
    const event = fireworks?.update(online, time, Date.now(), () => randomBytes(4).readUInt32LE());
    if (event) broadcast(JSON.stringify(event));
  }

  function inCeremonyArrivalWindow(time: number) {
    return time >= ceremonyStartAt - ceremonyLandingLeadMs && time < ceremonyEndAt;
  }

  function blocksCeremonyArrival(east: number, north: number) {
    const dx = Math.max(0, Math.abs(east - ceremonyLandingCentre[0]) - WALL_CELL / 2);
    const dn = Math.max(0, Math.abs(north - ceremonyLandingCentre[1]) - WALL_CELL / 2);
    return Math.hypot(dx, dn) <= ceremonyLandingOuterRadius;
  }

  function clearCeremonyWalls(time: number) {
    if (!inCeremonyArrivalWindow(time)) return;
    const cleared = snowWalls.clearWhere(block => block.team === freeWallTeam &&
      blocksCeremonyArrival(wallCellCentre(block.gx), wallCellCentre(block.gy)));
    for (const frame of encodeWallClear(cleared)) broadcastBinary(frame);
  }

  function updateCeremony(time: number) {
    if (!inCeremonyArrivalWindow(time) || !ceremonyWaiting.size) return;
    clearCeremonyWalls(time);
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

  function bellStateEvent(): BellStateEvent | undefined {
    if (!bell) return undefined;
    const holderPeer = bell.holderId === null ? undefined : peers.get(bell.holderId);
    return {
      type: 'event', kind: 'bell-state',
      phase: bell.phase,
      endsAt: bell.endsAt,
      holderSince: bell.holderSince,
      holder: holderPeer?.name && holderPeer.record ? {
        id: holderPeer.id, name: holderPeer.name,
        east: holderPeer.record.east / 100, north: holderPeer.record.north / 100, height: holderPeer.record.height / 100,
      } : null,
      loose: bell.loose ? { ...bell.loose } : null,
      pickableAt: bell.pickableAt,
      totals: [...bell.totals.entries()],
    };
  }

  function publishBell() {
    const event = bellStateEvent();
    if (event) broadcast(JSON.stringify(event));
  }

  function requestBell(peer: Peer) {
    const throttleNow = performance.now();
    if (throttleNow < peer.nextBellRequest) return;
    peer.nextBellRequest = throttleNow + 500;
    if (bell?.phase === 'running') {
      send(peer, JSON.stringify({ type: 'bell-rejected', reason: 'busy' }));
      return;
    }
    const position = peer.record;
    if (!position || !inBellVenue({ east: position.east / 100, north: position.north / 100 })) {
      send(peer, JSON.stringify({ type: 'bell-rejected', reason: 'position' }));
      return;
    }
    bell = createBellMatch(Date.now(), bellConfig);
    bellAnnounced = new Set();
    bellNames.clear();
    bellSyncAt = Date.now();
    publishBell();
  }

  function requestBellTouch(peer: Peer) {
    if (!bell || bell.phase !== 'running' || !peer.record) return;
    const holderPeer = bell.holderId === null ? undefined : peers.get(bell.holderId);
    const result = tryBellTouch(bell, peer.id,
      { east: peer.record.east / 100, north: peer.record.north / 100 },
      holderPeer?.record ? { east: holderPeer.record.east / 100, north: holderPeer.record.north / 100 } : null,
      Date.now(), bellConfig);
    if (!result.ok) return;
    if (peer.name) bellNames.set(peer.id, peer.name);
    applyBellTouch(bell, peer.id, Date.now());
    publishBell();
  }

  function dropHeldBell(holder: Peer, dirEast: number, dirNorth: number, pickupDelayMs?: number) {
    if (!bell || bell.phase !== 'running' || bell.holderId !== holder.id || !holder.record) return;
    dropBell(bell,
      { east: holder.record.east / 100, north: holder.record.north / 100 },
      dirEast, dirNorth, Date.now(), bellConfig, pickupDelayMs);
    publishBell();
  }

  function updateBell(wallNow: number) {
    if (!bell || bell.phase !== 'running') return;
    const due = bellTitleDue(bell, wallNow, bellAnnounced, bellConfig);
    if (due) {
      bellAnnounced.add(due.key);
      const name = bellNames.get(due.id) ?? peers.get(due.id)?.name;
      if (name) broadcast(JSON.stringify({ type: 'event', kind: 'bell-title', id: due.id, name, tier: due.tier }));
    }
    if (wallNow >= bell.endsAt) {
      endBellMatch(bell, wallNow);
      publishBell();
      const standings = bellStandings(bell, wallNow)
        .map(({ id, ms }) => ({ id, name: bellNames.get(id) ?? peers.get(id)?.name ?? '', ms }))
        .filter(entry => entry.name);
      broadcast(JSON.stringify({
        type: 'event', kind: 'bell-end',
        winner: standings[0] ?? null, standings: standings.slice(0, 8),
      }));
      return;
    }
    if (wallNow - bellSyncAt >= 5000) {
      bellSyncAt = wallNow;
      publishBell();
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
    failPeer(peer);
    return false;
  }

  function receiveSnowball(peer: Peer, bytes: Uint8Array) {
    if (!peer.name) { failPeer(peer); return; }
    const time = now();
    if (!allowEvent(peer, time)) return;
    const event = decodeSnowballClientEvent(bytes);
    if (!event || !peer.record) return;

    if (event.kind === 'hit') {
      const thrower = peers.get(event.throwerId);
      const pending = thrower?.pendingThrows.get(event.ballId);
      if (!thrower || !pending || pending.expiresAt <= time || pending.confirmed || !pending.recipients.has(peer)) return;
      pending.confirmed = true;
      iceThrone.confirmedHit(time, peer.id, event.throwerId, event.ballId);
      const relay = encodeSnowballRelay({ ...event, confirmerId: peer.id });
      send(thrower, relay);
      for (const recipient of pending.recipients) send(recipient, relay);
      // 持铃人被雪球命中：铃按投掷方向滚出（D3 规则，服务端权威触发）。
      if (bell?.phase === 'running' && bell.holderId === peer.id && peer.record && thrower.record) {
        dropHeldBell(peer,
          (peer.record.east - thrower.record.east) / 100,
          (peer.record.north - thrower.record.north) / 100);
      }
      const victimPos = peer.record ? { east: peer.record.east / 100, north: peer.record.north / 100 } : undefined;
      for (const matchEvent of snowMatch.onHit(peer.id, event.throwerId, victimPos)) {
        if (matchEvent.type === 'streak') {
          const name = peers.get(matchEvent.playerId)?.name;
          if (name) announceSnowfight(`${name} 三连中！`);
        } else if (matchEvent.type === 'capture-reset') broadcastSnowfightState();
      }
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
    const relay = encodeSnowballRelay({ ...event, throwerId: peer.id });
    const recipients = new Set<Peer>();
    for (const recipient of relevantPeers(peer, tier.radius, eventVisibleLimits[tierIndex])) {
      if (send(recipient, relay)) recipients.add(recipient);
    }
    peer.pendingThrows.set(event.ballId, { expiresAt: time + throwWindowMs, recipients, confirmed: false });
  }

  function broadcastBinary(data: Uint8Array) {
    for (const peer of peers.values()) if (peer.name) send(peer, data);
  }

  function announceSnowfight(message: string) {
    broadcast(JSON.stringify({ type: 'event', kind: 'announce', message }));
  }

  function sendSnowfightStateTo(peer: Peer) {
    send(peer, JSON.stringify({ type: 'snowfight', ...snowMatch.state(now()) }));
  }

  function broadcastSnowfightState() {
    snowStateAt = now();
    for (const peer of peers.values()) if (peer.name) sendSnowfightStateTo(peer);
  }

  function rejectSnowfight(peer: Peer, reason: string) {
    send(peer, JSON.stringify({ type: 'snowfight-rejected', reason }));
  }

  function handleMatchEvents(events: ReturnType<SnowfightMatch['tick']>) {
    for (const event of events) {
      if (event.type === 'phase' && event.phase === 'battle') {
        announceSnowfight('建造结束 · 开打！在光圈里站满 5 秒占领据点');
        broadcastSnowfightState();
      } else if (event.type === 'captured') {
        announceSnowfight(`${SNOWFIGHT_TEAM_NAMES[event.team]}占领${SNOWFIGHT_POINTS[event.index].label}！`);
        broadcastSnowfightState();
      } else if (event.type === 'score' || event.type === 'capture-reset') {
        broadcastSnowfightState();
      } else if (event.type === 'finished') {
        const [a, b] = event.scores;
        announceSnowfight(event.winner === 'draw'
          ? `团队雪仗结束 · ${a} : ${b} 平局！`
          : `团队雪仗结束 · ${SNOWFIGHT_TEAM_NAMES[event.winner]}胜 ${a} : ${b}！`);
        const cleared = snowWalls.clearWhere(block => block.team !== freeWallTeam);
        for (const frame of encodeWallClear(cleared)) broadcastBinary(frame);
        broadcastSnowfightState();
      }
    }
  }

  function updateSnowfight(time: number) {
    const matchActive = snowMatch.phase === 'build' || snowMatch.phase === 'battle';
    if (matchActive) {
      const positions = new Map<number, { east: number; north: number }>();
      for (const peer of peers.values()) {
        if (peer.name && peer.record) positions.set(peer.id, { east: peer.record.east / 100, north: peer.record.north / 100 });
      }
      handleMatchEvents(snowMatch.tick(time, positions));
    }
    if (time - snowDecayAt >= 1000) {
      snowDecayAt = time;
      for (const peer of peers.values()) {
        if (peer.name && peer.record) snowWalls.refreshFor(peer.id, peer.record.east / 100, peer.record.north / 100, time);
      }
      const removed = snowWalls.decay(time);
      for (const frame of encodeWallClear(removed)) broadcastBinary(frame);
      if (matchActive && time - snowStateAt >= 1000) broadcastSnowfightState();
    }
  }

  function requestSnowfightStart(peer: Peer) {
    const wallNow = performance.now();
    if (wallNow < peer.nextSnowfightRequest) return;
    peer.nextSnowfightRequest = wallNow + 1000;
    if (snowMatch.phase === 'build' || snowMatch.phase === 'battle') {
      sendSnowfightStateTo(peer);
      return;
    }
    const cleared = snowWalls.clearWhere(block => block.team !== freeWallTeam);
    for (const frame of encodeWallClear(cleared)) broadcastBinary(frame);
    snowMatch.start([...peers.values()].filter(other => other.name).map(other => other.id), now());
    announceSnowfight('团队雪仗开始 · 先堆墙备战，三分钟后开打！');
    broadcastSnowfightState();
  }

  function receiveSnowfight(peer: Peer, bytes: Uint8Array) {
    if (!peer.name) { failPeer(peer); return; }
    const time = now();
    if (!allowEvent(peer, time)) return;
    const event = decodeSnowfightClientEvent(bytes);
    if (!event) return;
    if (event.kind === 'place') {
      const matchActive = snowMatch.phase === 'build' || snowMatch.phase === 'battle';
      const team = matchActive ? snowMatch.teamOf(peer.id) : freeWallTeam;
      if (team === undefined) {
        rejectSnowfight(peer, 'phase');
        return;
      }
      const east = wallCellCentre(event.gx);
      const north = wallCellCentre(event.gy);
      if (team !== freeWallTeam && snowMatch.phase === 'build' && !buildHalfAllows(team, east)) {
        rejectSnowfight(peer, 'half');
        return;
      }
      const site = classifyWallSite(east, north);
      if (site) {
        rejectSnowfight(peer, site);
        return;
      }
      if (team === freeWallTeam && inCeremonyArrivalWindow(Date.now()) && blocksCeremonyArrival(east, north)) {
        rejectSnowfight(peer, 'phase');
        return;
      }
      if (!consume(peer.snowPlace, time, 4, 6)) return;
      const placed = snowWalls.place(event.gx, event.gy, peer.id, team, time);
      if ('reason' in placed) {
        rejectSnowfight(peer, placed.reason);
        return;
      }
      for (const frame of encodeWallClear(placed.cleared)) broadcastBinary(frame);
      broadcastBinary(encodeWallSet(placed.block));
      return;
    }
    if (event.kind === 'sled-smash') {
      // 雪橇撞穿一层墙（车道 B）：报告端为骑乘者本端，服务端按现行列高、报告速度与
      // 本人位置裁定。速度沿用本协议的模拟端报告信任模型（同 WALL_HIT)，只作闸门：
      // 须 >6（与 sledCrashKind 同阈值），上限为重调后的 30 m/s 硬顶。
      if (event.speed <= 6 || event.speed > 30) return;
      if (snowWalls.height(event.gx, event.gy) !== 1) return;
      if (!peer.record) return;
      // 位置记录 10 Hz、30 m/s 下每 100 ms 位移 3 m；6 m 容差覆盖记录滞后，
      // 同时把裁定范围钉在墙边，杜绝隔图遥报。
      const distance = Math.hypot(peer.record.east / 100 - wallCellCentre(event.gx),
        peer.record.north / 100 - wallCellCentre(event.gy));
      if (distance > 6) return;
      // 按雪墙规则销毁：等效 damage×WALL_BLOCK_HP（D1 回执挂载口径），中间受损态不广播，
      // 全体只收最终 WALL_CLEAR，双端镜像一次收敛。
      for (let i = 0; i < WALL_BLOCK_HP; i++) {
        const result = snowWalls.damage(event.gx, event.gy, 0, time);
        if (result && 'destroyed' in result) {
          for (const frame of encodeWallClear(result.destroyed)) broadcastBinary(frame);
          break;
        }
      }
      return;
    }
    const seenKey = `${event.throwerId}:${event.ballId}`;
    const seenAt = wallHitSeen.get(seenKey);
    if (seenAt !== undefined && time - seenAt < throwWindowMs) return;
    wallHitSeen.set(seenKey, time);
    if (wallHitSeen.size > 512) {
      for (const [key, at] of wallHitSeen) if (time - at >= throwWindowMs) wallHitSeen.delete(key);
    }
    const result = snowWalls.damage(event.gx, event.gy, event.layer, time);
    if (!result) return;
    if ('damaged' in result) broadcastBinary(encodeWallSet(result.damaged));
    else for (const frame of encodeWallClear(result.destroyed)) broadcastBinary(frame);
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

  function poseMessage(actor: { id: number; pose: number }, crownChanged = false) {
    const crowned = actor.id === crownOwner;
    return JSON.stringify({
      type: 'pose', id: actor.id, pose: actor.pose,
      ...(crowned || crownChanged ? { crowned } : {}),
    });
  }

  function observeIceThrone(peer: Peer, time: number) {
    if (!peer.record || !peer.name) return;
    iceThrone.observe(time, peer.id, peer.name, peer.pose === 1 && isIcePalaceThroneRecord(peer.record));
  }

  function receivePose(peer: Peer, pose: unknown) {
    // The existing pose event carries pose 7 (sled) or 8 (drift); 6 stays reserved.
    if (typeof pose !== 'number' || !Number.isInteger(pose) || pose < 0 || pose > 8 || pose === 6 ||
        peer.pose === pose || !consume(peer.poseRate, now(), 5, 5)) return;
    peer.pose = pose;
    observeIceThrone(peer, now());
    const relay = poseMessage(peer);
    for (const recipient of relevantPeers(peer, tier.radius, eventVisibleLimits[tierIndex])) send(recipient, relay);
  }

  function issueOwnerChallenge(peer: Peer) {
    const time = now();
    if (!options.ownerKey || peer === owner || time < (peer.ownerRetryAt ?? 0)) return;
    if (peer.ownerRetryAt !== undefined) {
      peer.ownerRetryAt = undefined;
      peer.ownerFailures = 0;
    }
    const nonce = randomBytes(24).toString('hex');
    peer.ownerChallenge = { nonce, expiresAt: time + 120_000 };
    send(peer, JSON.stringify({ type: 'owner-challenge', nonce }));
  }

  function releaseMascot() {
    if (!mascot) return;
    mascot = undefined;
    broadcast(JSON.stringify({ type: 'leave', id: MASCOT_ACTOR_ID }));
  }

  function remove(peer: Peer) {
    if (!peers.delete(peer.id)) return;
    if (peer.session) pollSessions.delete(peer.session);
    connLog(peer.transport, peer.id, 'drop', peer.dropReason ?? (peer.name ? 'closed' : 'unjoined'));
    snowMatch.removePlayer(peer.id);
    iceThrone.remove(now(), peer.id);
    ceremonyWaiting.delete(peer);
    // 持铃人离镇：铃原地掉落、立即拾取，不让对局卡死。
    if (bell?.phase === 'running' && bell.holderId === peer.id) dropHeldBell(peer, 0, 0, 0);
    if (peer === owner) {
      owner = undefined;
      releaseMascot();
    }
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
      type: 'event', kind: 'fireworks', from: peer.id, seed, theme, startAt: Date.now() + startDelayMs,
    });
    for (const recipient of peers.values()) if (recipient.name) send(recipient, event);
  }

  function requestPersonalFirework(peer: Peer, message: unknown) {
    const event = readPersonalFirework(message);
    if (!event) return;
    const time = now();
    if (!allowEvent(peer, time)) return;
    const position = peer.record;
    // The existing presence poses also cover indoor or vehicle areas whose position alone is ambiguous.
    const onTrainOrInBath = peer.pose === 5 || peer.pose === 2;
    if (!position || onTrainOrInBath ||
        Math.hypot(event.east - position.east / 100, event.north - position.north / 100) > 2.4 ||
        Math.abs(event.height - position.height / 100) > 2.2 ||
        personalFireworkRestricted(position.east / 100, position.north / 100, position.height / 100) ||
        personalFireworkRestricted(event.east, event.north, event.height)) {
      send(peer, JSON.stringify({ type: 'personal-firework-rejected', seed: event.seed, reason: 'position' }));
      return;
    }
    const startAt = Date.now();
    const festival = startAt >= ceremonyStartAt - 10_000 && startAt < ceremonyEndAt;
    if (time < peer.nextFirecracker || !consume(personalFireworkBudget, time, 16, 10)) {
      send(peer, JSON.stringify({ type: 'personal-firework-rejected', seed: event.seed, reason: 'cooldown' }));
      return;
    }
    peer.nextFirecracker = time + personalFireworkCooldownMs * (festival ? 2 : 1);
    const data = JSON.stringify({ ...event, type: 'event', kind: 'personal-firework', from: peer.id, startAt: startAt + 120 });
    send(peer, data);
    const recipients = Math.min(eventVisibleLimits[tierIndex], egressBytesPerSecond > 300_000 ? 16 : MAX_VISIBLE);
    for (const recipient of relevantPeers(peer, tier.radius, recipients)) send(recipient, data);
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
    const now = Date.now();
    updatePhoto(now);
    if (photo) {
      send(peer, JSON.stringify({ type: 'plaza-photo-rejected', reason: 'busy' }));
      return;
    }
    const person = photoPerson(peer);
    if (!person || !inPlazaPhotoRequestZone(person.east, person.north, person.height)) {
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
    catch { failPeer(peer); return; }
    if (!message || typeof message !== 'object' || !('type' in message)) {
      failPeer(peer);
      return;
    }
    if (message.type === 'event' && 'kind' in message && message.kind === 'fireworks' && peer.name) {
      if ('seed' in message && isFireworksSeed(message.seed) && 'theme' in message && isFireworksTheme(message.theme)) {
        requestFireworks(peer, message.seed, message.theme);
      }
      return;
    }
    if (message.type === 'owner-challenge-request' && peer.name) {
      if (allowEvent(peer, now())) issueOwnerChallenge(peer);
      return;
    }
    if (message.type === 'owner-mascot-stop' && peer.name) {
      if (peer === owner) releaseMascot();
      return;
    }
    if (message.type === 'owner-proof' && peer.name) {
      if (!allowEvent(peer, now())) return;
      const challenge = peer.ownerChallenge;
      peer.ownerChallenge = undefined;
      const proof = 'proof' in message ? message.proof : undefined;
      const key = options.ownerKey;
      let accepted = false;
      if (key && challenge && now() < challenge.expiresAt && typeof proof === 'string' && /^[0-9a-f]{64}$/.test(proof)) {
        const expected = createHash('sha256').update(key).update(challenge.nonce).digest();
        accepted = timingSafeEqual(expected, Buffer.from(proof, 'hex')) && (!owner || owner === peer);
        if (accepted) {
          owner = peer;
          nextMascotSample = 0;
        }
      }
      if (!accepted && challenge) {
        peer.ownerFailures = (peer.ownerFailures ?? 0) + 1;
        if (peer.ownerFailures >= 5) peer.ownerRetryAt = now() + 600_000;
      }
      send(peer, JSON.stringify({ type: 'owner-result', accepted }));
      if (!accepted) issueOwnerChallenge(peer);
      return;
    }
    if (message.type === 'leave' && peer.name) {
      closePeer(peer);
      return;
    }
    if (message.type === 'chat' && peer.name) {
      if (allowEvent(peer, now())) {
        receiveChat(peer, 'text' in message ? message.text : undefined, 'scope' in message ? message.scope : undefined);
      }
      return;
    }
    if (message.type === 'event' && 'kind' in message && peer.name) {
      if (message.kind === 'bell-start') {
        if (allowEvent(peer, now())) requestBell(peer);
        return;
      }
      if (message.kind === 'bell-touch') {
        if (allowEvent(peer, now())) requestBellTouch(peer);
        return;
      }
      if (message.kind === 'snowfight-start') {
        requestSnowfightStart(peer);
        return;
      }
      if (message.kind === 'grand-prix') {
        // 3.0 D2 town leaderboard relay: the server only validates and relays;
        // timing authority stays with the finishing client, boards are per-client.
        if (allowEvent(peer, now())) {
          const totalMs = 'totalMs' in message ? message.totalMs : undefined;
          if (typeof totalMs === 'number' && Number.isInteger(totalMs) && totalMs >= 45_000 && totalMs <= 1_800_000) {
            broadcast(JSON.stringify({ type: 'event', kind: 'grand-prix', id: peer.id, name: peer.name, totalMs, at: Date.now() }));
          }
        }
        return;
      }
      if (message.kind === 'personal-firework') {
        requestPersonalFirework(peer, message);
        return;
      }
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
      send(peer, JSON.stringify({ type: 'clock', sentAt: message.sentAt, epochMs: Date.now() }));
      return;
    }
    if (message.type === 'pose' && peer.name) {
      if (allowEvent(peer, now())) receivePose(peer, 'pose' in message ? message.pose : undefined);
      return;
    }
    if (message.type !== 'join' || peer.name || !('name' in message)) {
      failPeer(peer);
      return;
    }
    const name = validName(message.name);
    if (!name) { peer.dropReason ??= 'invalid-name'; failPeer(peer); return; }
    clearTimeout(peer.joinTimer);
    peer.name = name;
    const joinedAt = Date.now();
    peer.joinedAt = joinedAt;
    if (joinedAt < ceremonyEndAt) ceremonyWaiting.add(peer);
    online++;
    connLog(peer.transport, peer.id, 'join', 'ok');
    send(peer, JSON.stringify({ type: 'join', id: peer.id, name, self: true, epochMs: joinedAt, tier: tierIndex, fireworks: true, plazaPhoto: true, bell: true, snowfight: true, freeSnowWalls: true, firecrackers: true, iceThrone: true }));
    if (photo && !photo.ended && Date.now() < photo.invite.captureAt - plazaPhotoLockMs) send(peer, JSON.stringify(photo.invite));
    const bellEvent = bellStateEvent();
    if (bellEvent) send(peer, JSON.stringify(bellEvent));
    for (const other of peers.values()) {
      if (other !== peer && other.name) send(peer, JSON.stringify({ type: 'join', id: other.id, name: other.name, pose: other.pose, ...(other.id === crownOwner ? { crowned: true } : {}) }));
    }
    issueOwnerChallenge(peer);
    broadcast(JSON.stringify({ type: 'join', id: peer.id, name }), peer);
    if (snowMatch.phase === 'build' || snowMatch.phase === 'battle') {
      snowMatch.addPlayer(peer.id);
      sendSnowfightStateTo(peer);
      broadcastSnowfightState();
    }
    clearCeremonyWalls(joinedAt);
    const blocks = snowWalls.snapshot();
    for (let i = 0; i < blocks.length; i += 20) {
      send(peer, Buffer.concat(blocks.slice(i, i + 20).map(block => encodeWallSet(block))));
    }
    updateFireworks(now());
    updateCeremony(joinedAt);
  }

  function receiveState(peer: Peer, bytes: Uint8Array) {
    const record = readRecord(bytes);
    if (!peer.name || !record) { failPeer(peer); return; }
    const time = now();
    if (record.id === MASCOT_ACTOR_ID) {
      if (peer !== owner) {
        rejectedMascotClaims++;
        if (rejectedMascotClaims === 1 || rejectedMascotClaims % 100 === 0)
          options.onMascotClaimRejected?.(rejectedMascotClaims);
        return;
      }
      if (time < nextMascotSample || !peer.record || mascot?.record.seq === record.seq) return;
      if (record.east > eastLimit || record.north > northLimit || record.height > heightLimit ||
          // Follow permits a 30 m gap with room for one position sample in flight.
          horizontalDistanceSquared(peer.record, record) > 3_200 ** 2 ||
          Math.abs(peer.record.height - record.height) > 500) return;
      nextMascotSample = time + 1000 / BASE_TIER.hz;
      mascotUntil = time + 2250;
      mascot = { id: MASCOT_ACTOR_ID, record, version: ++mascotVersion, pose: 0 };
      return;
    }
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
    observeIceThrone(peer, time);
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
      const visible: { id: number; record?: PresenceRecord; version: number; pose: number }[] =
        nearby.slice(0, eventVisibleLimits[tierIndex]).map(entry => entry.peer);
      if (mascot && horizontalDistanceSquared(state, mascot.record) <= radiusSquared &&
          Math.abs(state.height - mascot.record.height) <= 1000) {
        if (visible.length === eventVisibleLimits[tierIndex]) visible.pop();
        visible.push(mascot);
      }
      visible.sort((a, b) => a.id - b.id);
      if (visible.length === peer.visible.length &&
          visible.every((other, i) => other.id === peer.visible[i].id && other.version === peer.visible[i].version)) continue;
      if (send(peer, writeSnapshot(visible.map(other => other.record!)))) {
        // The returning peer may have cached another pose before it moved beyond interest.
        for (const other of visible) if (other.id !== MASCOT_ACTOR_ID && !peer.visible.some(previous => previous.id === other.id)) {
          send(peer, poseMessage(other));
        }
        peer.visible = visible.map(other => ({ id: other.id, version: other.version }));
      }
    }
  }

  http.on('upgrade', (req, socket, head) => {
    if (req.url !== PRESENCE_PATH) { connLog('ws', '-', 'attempt', 'path'); refuse(socket, '404 Not Found'); return; }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const source = new URL(origin);
        if ((source.protocol !== 'https:' && source.protocol !== 'http:') || source.host !== req.headers.host) {
          connLog('ws', '-', 'attempt', 'origin');
          refuse(socket, '403 Forbidden');
          return;
        }
      } catch { connLog('ws', '-', 'attempt', 'origin'); refuse(socket, '403 Forbidden'); return; }
    }
    if (closing || peers.size >= MAX_SESSIONS) { connLog('ws', '-', 'attempt', 'full'); refuse(socket, '503 Service Unavailable'); return; }
    connLog('ws', '-', 'attempt', 'accepted');
    wss.handleUpgrade(req, socket, head, ws => {
      const peer = createPeer('ws', ws);
      connLog('ws', peer.id, 'session', 'ok');
      peer.joinTimer = setTimeout(() => { connLog('ws', peer.id, 'join', 'timeout'); ws.close(1008); }, 5000);
      ws.on('error', () => { peer.dropReason ??= 'socket-error'; remove(peer); ws.terminate(); });
      ws.on('close', () => remove(peer));
      ws.on('pong', () => { peer.alive = true; });
      ws.on('message', (data, binary) => {
        if (!peers.has(peer.id)) return;
        const bytes = bytesOf(data);
        if (!binary) receiveText(peer, bytes);
        else if (bytes.byteLength === RECORD_BYTES || bytes[0] !== SNOWBALL_EVENT_PREFIX) receiveState(peer, bytes);
        else if (bytes[1] === SNOWFIGHT_PLACE || bytes[1] === SNOWFIGHT_WALL_HIT ||
          bytes[1] === SNOWFIGHT_SLED_SMASH) receiveSnowfight(peer, bytes);
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
    // 轮询会话回收：超时未轮询的对等端视为离线（WS 侧由心跳负责）。
    for (const peer of [...peers.values()]) {
      if (peer.transport === 'poll' && time - peer.lastPollAt > POLL_SESSION_TIMEOUT_MS) {
        peer.dropReason ??= 'poll-timeout';
        remove(peer);
      }
    }
    updateFireworks(time);
    iceThrone.tick(time);
    const wallNow = Date.now();
    updateCeremony(wallNow);
    updateBell(wallNow);
    if (photo) updatePhoto(wallNow);
    if (mascot && time >= mascotUntil) releaseMascot();
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
      const socket = peer.socket;
      if (!socket) continue;
      if (!peer.alive) { peer.dropReason ??= 'heartbeat-timeout'; socket.terminate(); continue; }
      if (socket.readyState === WebSocket.OPEN) {
        peer.alive = false;
        socket.ping();
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
        peer.socket?.terminate();
      }
      wss.close();
      stop = new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      return stop;
    },
  };
}
