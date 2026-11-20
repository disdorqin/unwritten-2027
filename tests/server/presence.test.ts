import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createHash } from "node:crypto";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../src/presence/server.js";
import { MASCOT_ACTOR_ID } from "../../src/presence/protocol.js";
import { createRehearsalClockEndpoint } from "../../src/presence/rehearsal-clock.js";
import { ceremonyArrivalAt, ceremonyLandingAnnouncement, readCeremonyArrival, townCeremonyMidnight } from "../../src/presence/ceremony-arrival.js";
import { makeCeremonyScores, showFlightSeconds } from "../../tools/voxel-tavern/town-blockout/celebration-fireworks-score.js";
import { createCeremonyFireworksDispatch } from "../../tools/voxel-tavern/town-blockout/ceremony-fireworks-clock.js";
import { createCeremonyDirector, type CeremonyCue } from "../../tools/voxel-tavern/town-blockout/town-ceremony.js";
import { createTownPresenceClock } from "../../tools/voxel-tavern/town-blockout/town-presence-clock.js";
import {
  decodeSnowballClientEvent, decodeSnowballEvents, encodeSnowballHit, encodeSnowballRelay, encodeSnowballThrow,
  type SnowballRelayEvent,
} from "../../src/presence/snowball-events.js";
import { testFireworksAnnouncement, testFireworksDwellMs, testFireworksLeadMs, testFireworksNoticeMs } from "../../src/presence/test-fireworks.js";
import { plazaPhotoCountdownMs, plazaPhotoGatherMs, plazaPhotoLockMs, plazaPhotoStand, plazaPhotoTierRise, type PlazaPhotoPerson } from "../../src/presence/plaza-photo.js";

const recordBytes = 12;
const messageTimeout = 3500;
type Pose = { east: number; north: number; height: number; yaw: number; sequence: number };
type Record = Pose & { id: number };
type Control = {
  type: string;
  id?: number;
  name?: string;
  self?: boolean;
  epochMs?: number;
  kind?: string;
  message?: string;
  seed?: number;
  startAt?: number;
  tier?: number;
  egressBytesPerSecond?: number;
  scope?: string;
  text?: string;
  pose?: number;
  totalMs?: number;
  at?: number;
  sentAt?: number;
  from?: number;
  theme?: string;
  reason?: string;
  waitMs?: number;
  slot?: number;
  edge?: boolean;
  captureAt?: number;
  people?: PlazaPhotoPerson[];
  nonce?: string;
  accepted?: boolean;
};

function inbox<T>(socket: WebSocket, binary: boolean, decode: (frame: Buffer) => T, accept = (_frame: Buffer) => true) {
  const ready = new EventEmitter();
  const frames: Buffer[] = [];
  socket.on("message", (raw, isBinary) => {
    if (isBinary !== binary) return;
    const frame = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
    if (!accept(frame)) return;
    frames.push(frame);
    ready.emit("message");
  });
  return {
    pending: () => frames.map(decode),
    next(predicate: (frame: T) => boolean): Promise<T> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ready.off("message", available);
          reject(new Error(binary ? "Presence snapshot timed out" : "Presence control message timed out"));
        }, messageTimeout);
        function available() {
          try {
            for (let index = 0; index < frames.length; index++) {
              const frame = decode(frames[index]);
              if (!predicate(frame)) continue;
              frames.splice(0, index + 1);
              clearTimeout(timeout);
              ready.off("message", available);
              resolve(frame);
              return;
            }
          } catch (error) {
            clearTimeout(timeout);
            ready.off("message", available);
            reject(error);
          }
        }
        ready.on("message", available);
        available();
      });
    },
  };
}

function decodeSnapshot(frame: Buffer): Record[] {
  const count = frame.readUInt8(0);
  assert.ok(count <= 48);
  assert.equal(frame.length, 1 + count * recordBytes);
  return Array.from({ length: count }, (_, index) => {
    const offset = 1 + index * recordBytes;
    return {
      id: frame.readUInt16LE(offset),
      east: frame.readUInt16LE(offset + 2),
      north: frame.readUInt16LE(offset + 4),
      height: frame.readUInt16LE(offset + 6),
      yaw: frame.readUInt16LE(offset + 8),
      sequence: frame.readUInt16LE(offset + 10),
    };
  });
}

function encodePose({ east, north, height, yaw, sequence }: Pose, clientId = 999) {
  const bytes = Buffer.alloc(recordBytes);
  [clientId, east, north, height, yaw, sequence].forEach((value, index) => {
    bytes.writeUInt16LE(value, index * 2);
  });
  return bytes;
}

type Config = Omit<NonNullable<Parameters<typeof createPresenceServer>[0]>, "host" | "port">;

test("mascot actor requires a socket proof and is withdrawn on owner disconnect", async t => {
  const ownerKey = "local-test-key";
  const rejects: number[] = [];
  const town = await fixture(t, { ownerKey, onMascotClaimRejected: count => rejects.push(count) });
  const owner = await town.join("同名游客");
  const guest = await town.join("同名游客");
  const challenge = await owner.text.next(message => message.type === "owner-challenge");
  const guestChallenge = await guest.text.next(message => message.type === "owner-challenge");
  assert.notEqual(challenge.nonce, guestChallenge.nonce);

  const position = { east: 10_000, north: 10_000, height: 1800, yaw: 0, sequence: 1 };
  owner.socket.send(encodePose(position));
  guest.socket.send(encodePose(position));
  await owner.snapshot.next(records => records.some(record => record.id === guest.id));

  const proof = createHash("sha256").update(ownerKey + challenge.nonce).digest("hex");
  guest.socket.send(JSON.stringify({ type: "owner-proof", proof }));
  assert.equal((await guest.text.next(message => message.type === "owner-result")).accepted, false);
  guest.socket.send(encodePose(position, MASCOT_ACTOR_ID));

  owner.socket.send(JSON.stringify({ type: "owner-proof", proof }));
  assert.equal((await owner.text.next(message => message.type === "owner-result")).accepted, true);
  owner.socket.send(encodePose({ ...position, east: 10_160, sequence: 2 }, MASCOT_ACTOR_ID));
  const following = await guest.snapshot.next(records => records.some(record => record.id === MASCOT_ACTOR_ID));
  assert.equal(following.find(record => record.id === MASCOT_ACTOR_ID)?.east, 10_160);
  assert.deepEqual(rejects, [1]);

  // An authenticated actor can run to catch up from the design's >8 m gap.
  await new Promise(resolve => setTimeout(resolve, 115));
  owner.socket.send(encodePose({ ...position, east: 11_400, sequence: 3 }, MASCOT_ACTOR_ID));
  const catchingUp = await guest.snapshot.next(records => records.some(record => record.east === 11_400));
  assert.equal(catchingUp.find(record => record.id === MASCOT_ACTOR_ID)?.east, 11_400);
  await new Promise(resolve => setTimeout(resolve, 115));
  owner.socket.send(encodePose({ ...position, east: 13_250, sequence: 4 }, MASCOT_ACTOR_ID));
  // A later valid packet still succeeds, demonstrating the out-of-range request was not used as the new baseline.
  owner.socket.send(encodePose({ ...position, east: 11_700, sequence: 5 }, MASCOT_ACTOR_ID));
  const withinLimit = await guest.snapshot.next(records => records.some(record => record.east === 11_700));
  assert.equal(withinLimit.find(record => record.id === MASCOT_ACTOR_ID)?.east, 11_700);

  owner.socket.close();
  await guest.text.next(message => message.type === "leave" && message.id === MASCOT_ACTOR_ID);
  await guest.snapshot.next(records => !records.some(record => record.id === MASCOT_ACTOR_ID));
  assert.equal(town.server.stats().online, 1);
});

async function fixture(context: TestContext, config: Config = {}) {
  const server = await createPresenceServer({ host: "127.0.0.1", port: 0, ...config });
  const url = "ws://127.0.0.1:" + server.address().port + "/presence";
  const sockets: WebSocket[] = [];
  context.after(async () => {
    for (const socket of sockets) socket.terminate();
    await server.close();
  });

  function connectRaw() {
    const socket = new WebSocket(url);
    socket.on("error", () => undefined);
    sockets.push(socket);
    const text = inbox(socket, false, raw => JSON.parse(raw.toString()) as Control);
    const snapshot = inbox(socket, true, decodeSnapshot, frame => frame[0] !== 0xff);
    const events = inbox(socket, true, frame => decodeSnowballEvents(frame)!, frame => frame[0] === 0xff);
    const closed = new Promise<number>(resolve => socket.once("close", resolve));
    return { socket, text, snapshot, events, closed };
  }

  async function connect() {
    const client = connectRaw();
    await once(client.socket, "open");
    return client;
  }

  async function join(name: string) {
    const client = await connect();
    const joined = client.text.next(message => message.type === "join" && message.self === true);
    client.socket.send(JSON.stringify({ type: "join", name }));
    const self = await joined;
    assert.equal(typeof self.id, "number");
    return { ...client, id: self.id!, name: self.name, epochMs: self.epochMs };
  }

  return { connect, connectRaw, join, server };
}

test("rehearsal clock is shared and read-only while presence keeps its real epoch", { timeout: 5000 }, async context => {
  let wallNow = Date.parse("2026-11-18T12:00:00Z");
  const target = "2026-12-31T23:59:50+08:00";
  const requestListener = createRehearsalClockEndpoint(target, () => wallNow);
  const { server, join } = await fixture(context, { requestListener });
  const url = "http://127.0.0.1:" + server.address().port + "/presence/rehearsal-clock";
  const samples = await Promise.all([fetch(url), fetch(url)]);
  for (const response of samples) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { ceremonyEpochMs: Date.parse(target) });
  }
  wallNow += 10_000;
  assert.deepEqual(await (await fetch(url)).json(), { ceremonyEpochMs: Date.parse(target) + 10_000 });
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  const beforeJoin = Date.now();
  const clients = await Promise.all([join("彩排观众甲"), join("彩排观众乙")]);
  assert.ok(clients.every(({ epochMs }) => epochMs! >= beforeJoin && epochMs! <= Date.now()));
});

test("formal/default presence does not serve the rehearsal clock", { timeout: 5000 }, async context => {
  assert.equal(createRehearsalClockEndpoint(undefined), undefined);
  assert.throws(() => createRehearsalClockEndpoint("2026-12-31T23:59:50"), /explicit timezone/);
  assert.throws(() => createRehearsalClockEndpoint("2026-02-30T23:59:50+08:00"), /explicit timezone/);
  const { server } = await fixture(context);
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/presence/rehearsal-clock");
  assert.equal(response.status, 404);
});

test("ceremony preassigns the shared midnight and parks late arrivals once at the edge", { timeout: 7000 }, async context => {
  const startAt = Date.now() + 1600;
  const { join } = await fixture(context, { ceremonyStartAt: startAt });
  const players = await Promise.all([join("广场观众甲"), join("广场观众乙")]);
  const assigned = await Promise.all(players.map(async client => {
    const warning = await client.text.next(message => message.type === "event" && message.kind === "announce");
    assert.equal(warning.message, ceremonyLandingAnnouncement);
    return client.text.next(message => message.kind === "ceremony-arrival");
  }));
  assert.ok(Date.now() < startAt);
  assert.deepEqual(assigned.map(({ startAt: at, edge }) => [at, edge]), [[startAt, false], [startAt, false]]);
  assert.equal(new Set(assigned.map(({ slot }) => slot)).size, 2);

  await delay(Math.max(0, startAt - Date.now() + 20));
  const late = await join("晚到旅客");
  assert.deepEqual(await late.text.next(message => message.kind === "ceremony-arrival"), {
    type: "event", kind: "ceremony-arrival", startAt, slot: 0, edge: true,
  });
  await delay(35);
  for (const client of [...players, late]) {
    assert.equal(client.socket.readyState, WebSocket.OPEN);
    assert.ok(!client.text.pending().some(message => message.kind === "ceremony-arrival"));
  }
  assert.ok(!late.text.pending().some(message => message.message === ceremonyLandingAnnouncement));
});

test("presence joins beyond the first ten minutes without sending a ceremony arrival", { timeout: 5000 }, async context => {
  const { join } = await fixture(context, { ceremonyStartAt: Date.now() - 600_001 });
  const client = await join("日常旅客");
  await delay(35);
  assert.ok(!client.text.pending().some(message => message.kind === "ceremony-arrival"));
});

test("JX-11 follows the four shared midnight beats without altering arrival or the fireworks score", { timeout: 5000 }, async context => {
  const midnight = townCeremonyMidnight;
  const begin = midnight - 480_001;
  let wallTime = begin;
  let monotonicTime = 0;
  context.mock.method(Date, "now", () => wallTime);
  const { join } = await fixture(context, { ceremonyStartAt: midnight, connectionLog() {} });
  const { scores } = makeCeremonyScores(() => 12);
  const devices = await Promise.all([7500, -12_000].map(async skew => {
    const client = await join(skew > 0 ? "快钟" : "慢钟");
    assert.equal(client.epochMs, begin);
    const clock = createTownPresenceClock(() => wallTime + skew, () => monotonicTime);
    assert.notEqual(clock.now(), begin);
    clock.accept(client.epochMs!);
    const dispatch = createCeremonyFireworksDispatch(showFlightSeconds);
    const cues: CeremonyCue[] = [];
    const launches: number[] = [];
    const director = createCeremonyDirector({ now: clock.now, utcOffsetMinutes: 480 }, {
      onCue(cue) {
        cues.push(cue);
        if (cue.type === "fireworks-main") {
          assert.ok(dispatch(scores[cue.type], cue.at, begin, clock.now, (table, playback) => {
            launches.push(playback.startAt + Math.round((table.bursts[0].time - showFlightSeconds) * 1000));
            return true;
          }));
        }
      },
    });
    assert.equal(director.update().watchStarVisible, false);
    return { client, clock, director, cues, launches };
  }));

  function advance(delta: number, visible: boolean) {
    const previous = wallTime;
    wallTime = midnight + delta;
    monotonicTime += Math.max(0, wallTime - previous);
    for (const { clock, director } of devices) {
      if (wallTime < previous) clock.accept(wallTime);
      assert.equal(clock.now(), wallTime);
      assert.equal(director.update().watchStarVisible, visible);
    }
  }

  advance(-480_000, true);
  advance(-10_001, true);
  assert.ok(devices.every(({ client }) => !client.text.pending().some(message => message.kind === "ceremony-arrival")));
  advance(-10_000, true);
  const arrivals = await Promise.all(devices.map(async ({ client }) => {
    const notice = await client.text.next(message => message.kind === "announce");
    assert.equal(notice.message, ceremonyLandingAnnouncement);
    const arrival = readCeremonyArrival(await client.text.next(message => message.kind === "ceremony-arrival"));
    assert.ok(arrival);
    assert.equal(arrival.edge, false);
    assert.equal(arrival.startAt, midnight);
    assert.ok(ceremonyArrivalAt(arrival.slot, false));
    return arrival;
  }));
  assert.equal(new Set(arrivals.map(({ slot }) => slot)).size, 2);

  advance(0, true);
  advance(999, true);
  assert.ok(devices.every(({ launches }) => launches.length === 0));
  advance(1000, true);
  advance(60_000, true);
  const late = await join("迟到");
  const lateArrival = readCeremonyArrival(await late.text.next(message => message.kind === "ceremony-arrival"));
  assert.equal(lateArrival?.edge, true);
  const replayed: CeremonyCue[] = [];
  const reconnect = createCeremonyDirector({ now: () => wallTime, utcOffsetMinutes: 480 }, { onCue: cue => replayed.push(cue) });
  assert.equal(reconnect.update().watchStarVisible, true);
  assert.deepEqual(replayed, []);

  advance(539_999, true);
  advance(540_000, false);
  advance(539_999, true);
  advance(540_001, false);
  const observations = devices.map(({ cues, launches }, index) => {
    const star = cues.filter(cue => cue.type === "watch-star-rise" || cue.type === "watch-star-set");
    const bells = cues.filter(cue => cue.type === "grand-strike");
    assert.deepEqual(star.map(cue => cue.at), [midnight - 480_000, midnight + 540_000]);
    assert.deepEqual(bells.map(cue => cue.at - midnight), Array.from({ length: 12 }, (_, i) => i * 2020));
    assert.deepEqual(launches, [midnight + 1000]);
    return { starRise: star[0].at, arrival: arrivals[index].startAt, firstBell: bells[0].at,
      firstLaunch: launches[0], starSet: star[1].at, slot: arrivals[index].slot };
  });
  assert.deepEqual(Object.values(scores).map(score => score.bursts.length), [54, 28, 20]);
  assert.equal(observations[0].arrival, observations[1].arrival);
  context.diagnostic(JSON.stringify({ rehearsal: "loopback", observations, lateEdge: lateArrival?.edge }));
});

const pose: Pose = { east: 2000, north: 2000, height: 500, yaw: 40_000, sequence: 1 };

test("public fireworks publish one identical timed event and reject an early or distant start", { timeout: 7000 }, async context => {
  const { join } = await fixture(context);
  const first = await join("广场玩家");
  const second = await join("广场观众");
  const distant = await join("湖岸游客");
  const launch = (client: Awaited<ReturnType<typeof join>>) => client.socket.send(JSON.stringify({ type: "event", kind: "fireworks", seed: 35083, theme: "ice-blue" }));
  for (const client of [first, second]) client.socket.send(encodePose({ ...pose, east: 20400, north: 17400 }));
  distant.socket.send(encodePose({ ...pose, east: 35000, north: 10000 }));
  launch(first);
  const events = await Promise.all([first, second, distant].map(client =>
    client.text.next(message => message.type === "event" && message.kind === "fireworks")));
  assert.deepEqual(events[0], events[1]);
  assert.deepEqual(events[1], events[2]);
  assert.equal(events[0].from, first.id);
  assert.equal(events[0].seed, 35083);
  assert.equal(events[0].theme, "ice-blue");
  assert.ok(Number.isSafeInteger(events[0].startAt));
  launch(second);
  const cooldown = await second.text.next(message => message.type === "fireworks-rejected");
  assert.equal(cooldown.reason, "cooldown");
  assert.ok(cooldown.waitMs! > 0 && cooldown.waitMs! <= 20_250);
  launch(distant);
  assert.equal((await distant.text.next(message => message.type === "fireworks-rejected")).reason, "position");
});

test("nearby personal firecrackers relay beside the author, reject indoors and rate limit", { timeout: 7000 }, async context => {
  const { join, server } = await fixture(context);
  const players = await Promise.all(Array.from({ length: 10 }, (_, i) => join("爆竹测试" + i)));
  const distant = await join("远处测试");
  const indoors = await join("酒馆测试");
  const author = players[0];
  const observer = players[1];
  const setPose = (client: typeof author, east: number, north: number) =>
    client.socket.send(encodePose({ ...pose, east: east * 100, north: north * 100, height: 1500 }));
  for (const [i, player] of players.entries()) setPose(player, 154 + i, 97);
  setPose(distant, 514, 351);
  setPose(indoors, 159, 230);
  await observer.snapshot.next(frame => players.filter(player => player !== observer).every(player =>
    frame.some(record => record.id === player.id)));
  const sendFirecracker = (client: typeof author, seed: number, east = 154, north = 97) => client.socket.send(JSON.stringify({
    type: "event", kind: "personal-firework", item: "string", seed, east, north, height: 15, yaw: 0,
  }));
  sendFirecracker(indoors, 20, 159, 230);
  assert.equal((await indoors.text.next(message => message.type === "personal-firework-rejected")).reason, "position");
  sendFirecracker(author, 21, 160, 107);
  assert.equal((await author.text.next(message => message.seed === 21)).reason, "position");
  setPose(indoors, 155, 97);
  for (const [pose, seed] of [[5, 23], [2, 24]]) {
    indoors.socket.send(JSON.stringify({ type: "pose", pose }));
    sendFirecracker(indoors, seed, 155, 97);
    assert.equal((await indoors.text.next(message => message.seed === seed)).reason, "position");
  }
  for (const [i, player] of players.entries()) sendFirecracker(player, i, 154 + i);
  const observeBurst = async (client: typeof author) => {
    const events = [];
    for (let i = 0; i < players.length; i++) events.push(await client.text.next(message => message.kind === "personal-firework"));
    assert.equal(new Set(events.map(event => event.from)).size, 10);
    return events.sort((a, b) => a.seed! - b.seed!);
  };
  const [receivedByAuthor, receivedByObserver] = await Promise.all([observeBurst(author), observeBurst(observer)]);
  assert.deepEqual(receivedByAuthor, receivedByObserver);
  assert.ok(receivedByObserver.every(event => Number.isSafeInteger(event.startAt)));
  sendFirecracker(author, 22);
  assert.equal((await author.text.next(message => message.seed === 22)).reason, "cooldown");
  await delay(1050);
  assert.ok(!distant.text.pending().some(message => message.kind === "personal-firework"));
  assert.ok(server.stats().egressBytesPerSecond > 0);
  assert.ok(server.stats().egressBytesPerSecond <= 350_000);
  context.diagnostic(`10 simultaneous firecrackers with 12 peers: ${server.stats().egressBytesPerSecond} bytes/s`);
});

function sendPhotoRequest(socket: WebSocket) {
  socket.send(JSON.stringify({ type: "event", kind: "plaza-photo-request" }));
}

function sendPhotoOptOut(socket: WebSocket, id: number) {
  socket.send(JSON.stringify({ type: "event", kind: "plaza-photo-opt-out", id }));
}

function sendPhotoPose(socket: WebSocket, east: number, sequence = 1) {
  socket.send(encodePose({ ...pose, east: east * 100, north: 16_244, height: 1_235, sequence }));
}

const photoInvite = (message: Control) => message.type === "event" && message.kind === "plaza-photo-invite";
const photoLineup = (message: Control) => message.type === "event" && message.kind === "plaza-photo-lineup";
const photoRejection = (message: Control) => message.type === "plaza-photo-rejected";
const clockReply = (message: Control) => message.type === "clock" && message.sentAt === 1;

test("plaza photo relay rejects an invalid position and an overlapping round, with per-peer request throttling",
  { timeout: 7000 }, async context => {
    const { join } = await fixture(context);
    const host = await join("合影发起人");
    const near = await join("站位参与者");
    const far = await join("远处旁观者");
    sendPhotoPose(far.socket, 250);
    sendPhotoRequest(far.socket);
    assert.equal((await far.text.next(photoRejection)).reason, "position");

    sendPhotoPose(host.socket, 224);
    const before = Date.now();
    sendPhotoRequest(host.socket);
    const invitations = await Promise.all([host, near, far].map(client => client.text.next(photoInvite)));
    assert.deepEqual(invitations[0], invitations[1]);
    assert.deepEqual(invitations[0], invitations[2]);
    const leadTime = plazaPhotoGatherMs + plazaPhotoCountdownMs;
    const captureAt = invitations[0].captureAt!;
    assert.ok(captureAt >= before + leadTime && captureAt <= Date.now() + leadTime);

    sendPhotoPose(near.socket, 225);
    sendPhotoRequest(near.socket);
    sendPhotoRequest(near.socket);
    near.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    assert.equal((await near.text.next(photoRejection)).reason, "busy");
    // A clock echo after the two requests gives the relay a concrete ordering barrier.
    assert.equal((await near.text.next(message => photoRejection(message) || clockReply(message))).type, "clock");
    await delay(510);
    sendPhotoRequest(near.socket);
    assert.equal((await near.text.next(photoRejection)).reason, "busy");
  });

test("plaza photo relay freezes one shared roster, honours a matching opt-out and omits departed peers",
  { timeout: 8000 }, async context => {
    let wallTime = Date.now();
    context.mock.method(Date, "now", () => wallTime);
    const { join } = await fixture(context);
    const host = await join("合影发起人");
    const staying = await join("保留站位");
    const optingOut = await join("退出这一场");
    const leaving = await join("提前离场");
    sendPhotoPose(host.socket, 224);
    sendPhotoRequest(host.socket);
    const invite = await host.text.next(photoInvite);
    assert.ok(Number.isSafeInteger(invite.id) && Number.isSafeInteger(invite.captureAt));
    assert.equal(invite.captureAt, wallTime + plazaPhotoGatherMs + plazaPhotoCountdownMs);

    sendPhotoPose(staying.socket, 225);
    sendPhotoOptOut(staying.socket, invite.id! + 1);
    sendPhotoPose(optingOut.socket, 223);
    sendPhotoOptOut(optingOut.socket, invite.id!);
    for (const client of [staying, optingOut]) client.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    await Promise.all([staying, optingOut].map(client => client.text.next(clockReply)));

    sendPhotoPose(leaving.socket, 222);
    leaving.socket.send(JSON.stringify({ type: "leave" }));
    await host.text.next(message => message.type === "leave" && message.id === leaving.id);

    const lockAt = invite.captureAt! - plazaPhotoLockMs;
    wallTime = lockAt - 1;
    const catchUp = await join("锁定前补进入");
    assert.deepEqual(await catchUp.text.next(photoInvite), invite);
    sendPhotoPose(catchUp.socket, 226);
    catchUp.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    await catchUp.text.next(clockReply);

    await delay(25);
    host.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    assert.equal((await host.text.next(message => photoLineup(message) || clockReply(message))).type, "clock");

    wallTime = lockAt;
    const lineups = await Promise.all([host, staying, optingOut, catchUp].map(client => client.text.next(photoLineup)));
    assert.deepEqual(lineups[0], lineups[1]);
    assert.deepEqual(lineups[0], lineups[2]);
    assert.deepEqual(lineups[0], lineups[3]);
    assert.equal(lineups[0].id, invite.id);
    assert.equal(lineups[0].captureAt, invite.captureAt);
    assert.deepEqual(lineups[0].people, [
      { id: host.id, name: host.name, east: 224, north: 162.44, height: 12.35 },
      { id: staying.id, name: staying.name, east: 225, north: 162.44, height: 12.35 },
      { id: catchUp.id, name: catchUp.name, east: 226, north: 162.44, height: 12.35 },
    ]);

    const late = await join("锁定后进镇");
    sendPhotoPose(late.socket, 226);
    sendPhotoOptOut(host.socket, invite.id!);
    late.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    assert.equal((await late.text.next(message => photoInvite(message) || photoLineup(message) || clockReply(message))).type, "clock");

    // The first hold expires after the shutter.
    wallTime = invite.captureAt! + 1001;
    sendPhotoRequest(late.socket);
    const next = await host.text.next(message => photoInvite(message) || photoLineup(message));
    assert.ok(photoInvite(next));
    assert.notEqual(next.id, invite.id);
  });

test("the existing photo event admits 48 live WebSocket players at the new physical theater", { timeout: 12_000 }, async context => {
  let wallTime = Date.now();
  context.mock.method(Date, "now", () => wallTime);
  const { join } = await fixture(context);
  const clients = await Promise.all(Array.from({ length: 48 }, (_, index) => join(`看台镇民 ${index + 1}`)));
  const expected = clients.map((client, index) => {
    const row = Math.floor(index / 12);
    const east = Math.round((plazaPhotoStand.centreEast + (index % 12 - 5.5) * 1.28) * 100);
    const north = Math.round((plazaPhotoStand.south + (row + .5) * plazaPhotoStand.run) * 100);
    const height = Math.round((plazaPhotoStand.base + plazaPhotoTierRise(row)) * 100);
    client.socket.send(encodePose({ ...pose, east, north, height, sequence: 1 }));
    client.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    return { id: client.id, name: client.name, east: east / 100, north: north / 100, height: height / 100 };
  }).sort((a, b) => a.id - b.id);
  await Promise.all(clients.map(client => client.text.next(clockReply)));

  sendPhotoRequest(clients[0].socket);
  const notices = await Promise.all(clients.map(client => client.text.next(photoInvite)));
  wallTime = notices[0].captureAt! - plazaPhotoLockMs;
  const lineups = await Promise.all([clients[0], clients[47]].map(client => client.text.next(photoLineup)));
  assert.deepEqual(lineups[0], lineups[1]);
  assert.deepEqual(lineups[0].people, expected);
});

test("presence returns a common server epoch to separately connected train riders", { timeout: 7000 }, async context => {
  const { join } = await fixture(context);
  const first = await join("未写镇站");
  const second = await join("温泉站");
  const before = Date.now();
  first.socket.send(JSON.stringify({ type: "clock", sentAt: 100 }));
  second.socket.send(JSON.stringify({ type: "clock", sentAt: 100_100 }));
  const [one, two] = await Promise.all([
    first.text.next(message => message.type === "clock"),
    second.text.next(message => message.type === "clock"),
  ]);
  assert.deepEqual([one.sentAt, two.sentAt], [100, 100_100]);
  for (const sample of [one, two]) assert.ok(sample.epochMs! >= before && sample.epochMs! <= Date.now());
  assert.ok(Math.abs(one.epochMs! - two.epochMs!) < 100);
});

test("presence limits a movement burst and accepts updates after the allowance refills", { timeout: 7000 }, async context => {
  const { join } = await fixture(context);
  const observer = await join("限速观察");
  const sender = await join("连续移动");
  observer.socket.send(encodePose(pose));

  const burstSize = 25;
  for (let sequence = 1; sequence <= burstSize; sequence++) {
    sender.socket.send(encodePose({ ...pose, east: pose.east + sequence, sequence }));
  }
  const limited = await observer.snapshot.next(records => records.some(record => record.id === sender.id));
  const accepted = limited.find(record => record.id === sender.id)!;
  assert.ok(accepted.sequence >= 1 && accepted.sequence < burstSize);
  assert.equal(accepted.east, pose.east + accepted.sequence);

  await new Promise(resolve => setTimeout(resolve, 250));
  const nextSequence = burstSize + 1;
  sender.socket.send(encodePose({ ...pose, east: pose.east + nextSequence, sequence: nextSequence }));
  const recovered = await observer.snapshot.next(records =>
    records.some(record => record.id === sender.id && record.sequence === nextSequence));
  assert.equal(recovered.find(record => record.id === sender.id)?.east, pose.east + nextSequence);
});

test("presence rejects malformed frames and rejects a pose before joining", { timeout: 7000 }, async context => {
  const { connect, join } = await fixture(context);
  const invalidBinary = await join("短帧");
  invalidBinary.socket.send(Buffer.alloc(recordBytes - 1));
  assert.equal(await invalidBinary.closed, 1008);

  const invalidText = await connect();
  invalidText.socket.send('{"type":');
  assert.equal(await invalidText.closed, 1008);

  const beforeJoin = await connect();
  beforeJoin.socket.send(encodePose(pose));
  assert.equal(await beforeJoin.closed, 1008);
});

test("presence assigns identities, validates names and reports departures", { timeout: 8000 }, async context => {
  const { connect, join } = await fixture(context);
  const first = await join("  雪镇🙂  ");
  assert.equal(first.name, "雪镇🙂");
  first.socket.send(encodePose(pose));

  const name = "山🎄".repeat(12);
  const second = await join(name);
  assert.equal(second.name, name);
  assert.notEqual(first.id, second.id);
  second.socket.send(encodePose({ ...pose, east: 2200 }));
  const joined = await first.text.next(message => message.type === "join" && message.id === second.id);
  assert.equal(joined.name, name);
  assert.notEqual(joined.self, true);

  const departure = first.text.next(message => message.type === "leave" && message.id === second.id);
  second.socket.send(JSON.stringify({ type: "leave" }));
  assert.equal((await departure).id, second.id);

  for (const invalid of ["   ", "雪\u0000镇", "雪\u200b镇"]) {
    const client = await connect();
    client.socket.send(JSON.stringify({ type: "join", name: invalid }));
    assert.equal(await client.closed, 1008);
  }
});

test("presence stamps the server id, clamps out-of-bounds coordinates and accepts a legal teleport", { timeout: 7000 }, async context => {
  const { join } = await fixture(context, { width: 64, depth: 56, height: 50 });
  const observer = await join("观察者");
  const player = await join("移动测试");
  observer.socket.send(encodePose({ ...pose, east: 3200, north: 2800 }));

  const overflow: Pose = { east: 65_535, north: 65_535, height: 65_535, yaw: 48_123, sequence: 17 };
  player.socket.send(encodePose(overflow));
  const atBounds = await observer.snapshot.next(frame => frame.some(record => record.id === player.id && record.sequence === 17));
  assert.deepEqual(atBounds.find(record => record.id === player.id),
    { id: player.id, east: 6400, north: 5600, height: 5000, yaw: overflow.yaw, sequence: 17 });

  const teleport: Pose = { east: 100, north: 200, height: 300, yaw: 23, sequence: 18 };
  player.socket.send(encodePose(teleport));
  const moved = await observer.snapshot.next(frame => frame.some(record => record.id === player.id && record.sequence === 18));
  assert.deepEqual(moved.find(record => record.id === player.id), { id: player.id, ...teleport });
});

test("presence interest includes horizontal 80 m exactly and removes a distant member", { timeout: 7000 }, async context => {
  const { join } = await fixture(context, { width: 200, depth: 120, height: 110 });
  const observer = await join("环视");
  const player = await join("远近测试");
  observer.socket.send(encodePose({ ...pose, height: 0 }));
  player.socket.send(encodePose({ ...pose, east: 10_000, height: 10_500, sequence: 10 }));

  const edge = await observer.snapshot.next(frame => frame.some(record => record.id === player.id && record.sequence === 10));
  assert.equal(edge.find(record => record.id === player.id)?.east, 10_000);

  player.socket.send(encodePose({ ...pose, east: 10_001, height: 10_500, sequence: 11 }));
  const beyond = await observer.snapshot.next(frame => !frame.some(record => record.id === player.id));
  assert.ok(beyond.every(record => record.id !== player.id));

  player.socket.send(encodePose({ ...pose, east: 9000, height: 10_500, sequence: 12 }));
  const returned = await observer.snapshot.next(frame => frame.some(record => record.id === player.id && record.sequence === 12));
  assert.equal(returned.find(record => record.id === player.id)?.east, 9000);
});

test("presence switches configured interest tiers as members come and go", { timeout: 9000 }, async context => {
  const { join } = await fixture(context, {
    width: 200,
    tiers: [
      { minOnline: 0, radius: 80, hz: 10 },
      { minOnline: 3, radius: 40, hz: 5 },
      { minOnline: 4, radius: 20, hz: 2 },
    ],
  });
  const observer = await join("档位观察");
  const mover = await join("档位参照");
  observer.socket.send(encodePose(pose));

  const states = [
    { east: 8000, sequence: 10 },
    { east: 5000, sequence: 11 },
    { east: 3500, sequence: 12 },
    { east: 5000, sequence: 13 },
    { east: 8000, sequence: 14 },
  ];
  async function see({ east, sequence }: (typeof states)[number]) {
    mover.socket.send(encodePose({ ...pose, east, sequence }));
    await observer.snapshot.next(records => records.some(record =>
      record.id === mover.id && record.east === east && record.sequence === sequence));
  }
  function hidden() {
    return observer.snapshot.next(records => !records.some(record => record.id === mover.id));
  }

  await see(states[0]);
  const tierOne = await join("触发档位一");
  await hidden();
  await see(states[1]);
  const tierTwo = await join("触发档位二");
  await hidden();
  await see(states[2]);

  tierTwo.socket.send(JSON.stringify({ type: "leave" }));
  await tierTwo.closed;
  await see(states[3]);
  tierOne.socket.send(JSON.stringify({ type: "leave" }));
  await tierOne.closed;
  await see(states[4]);
});

test("presence caps snapshots at 48 records and counts unjoined sockets toward the 64-socket cap", { timeout: 10000 }, async context => {
  const { join, connect, connectRaw } = await fixture(context);
  const observer = await join("容量观察");
  observer.socket.send(encodePose(pose));
  const nearby = await Promise.all(Array.from({ length: 50 }, (_, index) => join("玩家" + index)));
  const sent = new Set(nearby.map(member => member.id));
  nearby.forEach((member, index) => member.socket.send(encodePose({ ...pose, east: pose.east + 100 + index })));
  const cluster = await observer.snapshot.next(records => records.length === 48);
  assert.equal(new Set(cluster.map(record => record.id)).size, 48);
  assert.ok(cluster.every(record => sent.has(record.id) || record.id === observer.id));

  const pending = await Promise.all(Array.from({ length: 13 }, () => connect()));
  const refused = connectRaw();
  const rejection = new Promise<number>((resolve, reject) => {
    refused.socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
      refused.socket.terminate();
    });
    refused.socket.once("open", () => reject(new Error("The 65th socket upgraded")));
    refused.socket.once("error", reject);
  });
  assert.equal(await rejection, 503);

  const freed = pending.at(-1)!;
  freed.socket.close();
  await freed.closed;
  const replacement = await join("填补空位");
  assert.equal(replacement.name, "填补空位");
});

const throwBall = {
  ballId: 0x1234, east: 20, north: 20, height: 6.5, dirX: 1, dirY: 0, dirZ: 0,
};

function pause(ms = 45) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function until(predicate: () => boolean) {
  const end = Date.now() + 2500;
  while (!predicate()) {
    assert.ok(Date.now() < end, "Timed out waiting for server state");
    await pause(10);
  }
}

test("P2b wire preserves frame layouts and decodes aggregated throw and hit messages", () => {
  const shot = encodeSnowballThrow(throwBall);
  assert.equal(Buffer.from(shot).toString("hex"), "ff013412d007d0078a02ff7f00000000");
  assert.deepEqual(decodeSnowballClientEvent(shot), { kind: "throw", ...throwBall });
  const hit = { ballId: throwBall.ballId, throwerId: 258, zone: "head" } as const;
  assert.equal(Buffer.from(encodeSnowballHit(hit)).toString("hex"), "ff02341202010100");
  const thrown = { kind: "throw", throwerId: 258, ...throwBall } as const;
  const accepted = { kind: "hit", confirmerId: 513, ...hit } as const;
  const thrownWire = encodeSnowballRelay(thrown);
  const acceptedWire = encodeSnowballRelay(accepted);
  assert.equal(Buffer.from(thrownWire).toString("hex"), "ff0134120201d007d0078a02ff7f00000000");
  assert.equal(Buffer.from(acceptedWire).toString("hex"), "ff023412020101020100");
  const combined = Buffer.concat([Buffer.from(thrownWire), Buffer.from(acceptedWire)]);
  assert.deepEqual(decodeSnowballEvents(combined), [thrown, accepted]);
  assert.equal(decodeSnowballEvents(combined.subarray(0, -1)), null);
  assert.equal(decodeSnowballEvents(Buffer.concat([combined, Buffer.of(0x01)])), null);
  assert.equal(decodeSnowballClientEvent(encodeSnowballThrow({ ...throwBall, dirX: 0 })), undefined);
});

test("P2b relays only nearby throws and credits the first delivered victim claim exactly once", { timeout: 8000 }, async context => {
  const { join } = await fixture(context, { width: 180 });
  const [shooter, victim, watcher, distant] = await Promise.all([
    join("投手"), join("接球者"), join("观众"), join("远方路人"),
  ]);
  shooter.socket.send(encodePose(pose));
  victim.socket.send(encodePose({ ...pose, east: 2200 }));
  watcher.socket.send(encodePose({ ...pose, east: 2700 }));
  distant.socket.send(encodePose({ ...pose, east: 14_000 }));
  await victim.snapshot.next(records => records.some(record => record.id === shooter.id) &&
    records.some(record => record.id === watcher.id));

  shooter.socket.send(encodeSnowballThrow({ ...throwBall, east: 25 }));
  shooter.socket.send(encodeSnowballThrow(throwBall));
  shooter.socket.send(encodeSnowballThrow(throwBall));
  const expectedThrow: SnowballRelayEvent = { kind: "throw", throwerId: shooter.id, ...throwBall };
  for (const receiver of [victim, watcher]) {
    assert.deepEqual(await receiver.events.next(events => events[0]?.kind === "throw"), [expectedThrow]);
  }
  const check = { ballId: throwBall.ballId, throwerId: shooter.id, zone: "head" } as const;
  distant.socket.send(encodeSnowballHit(check));
  shooter.socket.send(encodeSnowballHit(check));
  victim.socket.send(encodeSnowballHit({ ...check, ballId: check.ballId + 1 }));
  await pause();
  assert.deepEqual(shooter.events.pending(), []);
  assert.deepEqual(victim.events.pending(), []);
  assert.deepEqual(distant.events.pending(), []);

  victim.socket.send(encodeSnowballHit(check));
  const confirmed = { kind: "hit", confirmerId: victim.id, ...check };
  for (const receiver of [shooter, victim, watcher]) {
    assert.deepEqual(await receiver.events.next(events => events[0]?.kind === "hit"), [confirmed]);
  }
  victim.socket.send(encodeSnowballHit(check));
  watcher.socket.send(encodeSnowballHit(check));
  await pause();
  for (const receiver of [shooter, victim, watcher, distant]) assert.deepEqual(receiver.events.pending(), []);
});

test("P2b clamps legal hand origins to bounds and refills a 6-burst, 4/s throw bucket", { timeout: 7000 }, async context => {
  let time = 0;
  const { join } = await fixture(context, { now: () => time, width: 20 });
  const [shooter, receiver] = await Promise.all([join("边界投手"), join("观察")]);
  shooter.socket.send(encodePose(pose));
  receiver.socket.send(encodePose(pose));
  await pause();
  time = 100;
  await receiver.snapshot.next(records => records.some(record => record.id === shooter.id));

  for (let ballId = 1; ballId <= 7; ballId++) {
    shooter.socket.send(encodeSnowballThrow({ ...throwBall, ballId, east: 50 }));
  }
  for (let ballId = 1; ballId <= 6; ballId++) {
    assert.deepEqual(await receiver.events.next(events => events[0]?.ballId === ballId),
      [{ kind: "throw", throwerId: shooter.id, ...throwBall, ballId }]);
  }
  await pause();
  assert.deepEqual(receiver.events.pending(), []);

  time = 350;
  shooter.socket.send(encodeSnowballThrow({ ...throwBall, ballId: 8 }));
  const refill = await receiver.events.next(events => events[0]?.ballId === 8);
  assert.equal(refill[0].kind, "throw");
  time = 3350;
  receiver.socket.send(encodeSnowballHit({ ballId: 8, throwerId: shooter.id, zone: "torso" }));
  await pause();
  assert.deepEqual(shooter.events.pending(), []);
});

test("P2b event egress forces tier 2 from tier 1, then recovers after 30 s below 200 KB/s", { timeout: 12000 }, async context => {
  let time = 0;
  const { join, server } = await fixture(context, {
    now: () => time,
    tiers: [{ minOnline: 0, radius: 80, hz: 10 }, { minOnline: 25, radius: 64, hz: 5 }, { minOnline: 49, radius: 48, hz: 2.5 }],
  });
  const clients = await Promise.all(Array.from({ length: 48 }, (_, i) => join("负载" + i)));
  const observer = clients[0];
  await until(() => server.stats().online === 48 && server.stats().tier === 1);
  time = 5100;
  for (const client of clients) client.socket.send(encodePose(pose));
  await pause();
  time += 200;
  await observer.snapshot.next(records => records.length === 40);
  assert.ok(server.stats().egressBytesPerSecond < 200_000);

  function burst(firstId: number) {
    for (const shooter of clients) {
      for (let ballId = firstId; ballId < firstId + 6; ballId++) {
        shooter.socket.send(encodeSnowballThrow({ ...throwBall, ballId }));
      }
    }
  }

  burst(1);
  await until(() => server.stats().egressBytesPerSecond >= 210_000);
  assert.equal(server.stats().tier, 1);
  time += 1500;
  burst(7);
  await until(() => server.stats().tier === 2);
  const down = await observer.text.next(message => message.type === "tier" && message.tier === 2);
  assert.ok(down.egressBytesPerSecond! > 350_000);
  context.diagnostic("48 clients; tier 2 at " + down.egressBytesPerSecond + " estimated B/s");
  time += 400;
  await observer.snapshot.next(records => records.length === 32);

  time += 5_100;
  await until(() => server.stats().egressBytesPerSecond < 200_000);
  time += 29_999;
  await pause();
  assert.equal(server.stats().tier, 2);
  time++;
  await until(() => server.stats().tier === 1);
});

test("P2b chat relay validates scope and rate, while changed poses replay in a new join roster", { timeout: 8000 }, async context => {
  const { join } = await fixture(context, { width: 180 });
  const [speaker, listener, high, far] = await Promise.all([
    join("发言"), join("近邻"), join("楼上"), join("远方"),
  ]);
  speaker.socket.send(encodePose(pose));
  listener.socket.send(encodePose({ ...pose, east: 2100 }));
  high.socket.send(encodePose({ ...pose, height: 1600 }));
  far.socket.send(encodePose({ ...pose, east: 12_000 }));
  await listener.snapshot.next(records => records.some(record => record.id === high.id));

  speaker.socket.send(JSON.stringify({ type: "chat", scope: "unknown", text: "  雪" + String.fromCharCode(0) + "镇  " }));
  const nearby = await listener.text.next(message => message.type === "chat");
  assert.deepEqual(nearby, { type: "chat", scope: "near", id: speaker.id, name: "发言", text: "雪镇" });
  speaker.socket.send(JSON.stringify({ type: "chat", scope: "town", text: "雪".repeat(101) }));
  speaker.socket.send(JSON.stringify({ type: "chat", scope: "town", text: "全镇广播" }));
  speaker.socket.send(JSON.stringify({ type: "chat", scope: "town", text: "超额" }));
  for (const receiver of [listener, high, far]) {
    assert.equal((await receiver.text.next(message => message.type === "chat")).text, "全镇广播");
  }
  for (const receiver of [speaker, listener, high, far]) {
    assert.equal(receiver.text.pending().some(message => message.type === "chat"), false);
  }

  speaker.socket.send(JSON.stringify({ type: "pose", pose: 4 }));
  const seated = await listener.text.next(message => message.type === "pose");
  assert.deepEqual(seated, { type: "pose", id: speaker.id, pose: 4 });
  speaker.socket.send(JSON.stringify({ type: "pose", pose: 4 }));
  speaker.socket.send(JSON.stringify({ type: "pose", pose: 255 }));
  await pause();
  assert.equal(listener.text.pending().some(message => message.type === "pose"), false);
  assert.equal(far.text.pending().some(message => message.type === "pose"), false);

  const newcomer = await join("花名册");
  const roster = await newcomer.text.next(message => message.type === "join" && message.id === speaker.id);
  assert.equal(roster.pose, 4);
});

test("test fireworks joins five continuously then sends the same scheduled event to all joined sockets", { timeout: 8000 }, async context => {
  let time = 0;
  const { connect, join } = await fixture(context, { now: () => time, testFireworks: true });
  const clients = await Promise.all(Array.from({ length: 4 }, (_, i) => join("看烟花" + i)));
  const unjoined = await connect();
  time = testFireworksDwellMs;
  await pause();
  assert.equal(clients[0].text.pending().some(message => message.type === "event"), false);
  unjoined.socket.close();
  clients.push(await join("第五个"));
  assert.ok(clients.every(client => Number.isSafeInteger(client.epochMs)));

  time = 2 * testFireworksDwellMs - 1;
  await pause();
  assert.equal(clients[0].text.pending().some(message => message.type === "event"), false);
  time++;
  const notice = await Promise.all(clients.map(client => client.text.next(message => message.kind === "announce")));
  assert.ok(notice.every(message => message.message === testFireworksAnnouncement));

  time += testFireworksNoticeMs - testFireworksLeadMs;
  const shows = await Promise.all(clients.map(client => client.text.next(message => message.kind === "test-fireworks")));
  assert.ok(Number.isInteger(shows[0].seed));
  assert.ok(shows[0].startAt! >= clients[4].epochMs!);
  for (const show of shows) assert.deepEqual(show, shows[0]);
  const late = await join("迟到");
  await pause();
  assert.equal(late.text.pending().some(message => message.type === "event"), false);
});

test("test fireworks stays off by default even with five joined and an elapsed dwell", { timeout: 7000 }, async context => {
  let time = 0;
  const { join } = await fixture(context, { now: () => time });
  const clients = await Promise.all(Array.from({ length: 5 }, (_, i) => join("默认关闭" + i)));
  time = testFireworksDwellMs + testFireworksNoticeMs;
  await pause();
  assert.ok(clients.every(client => !client.text.pending().some(message => message.type === "event")));
});

test("presence relays sledding and drifting poses, rejects reserved pose 6, and relays validated grand-prix results", { timeout: 7000 }, async context => {
  const { join } = await fixture(context);
  const [sender, observer] = await Promise.all([join("雪橇手"), join("观赛者")]);
  sender.socket.send(encodePose(pose));
  observer.socket.send(encodePose({ ...pose, east: 2100 }));
  await delay(30);

  const sledPose = observer.text.next(message => message.type === "pose" && message.id === sender.id);
  sender.socket.send(JSON.stringify({ type: "pose", pose: 7 }));
  assert.equal((await sledPose).pose, 7);

  const driftPose = observer.text.next(message => message.type === "pose" && message.id === sender.id);
  sender.socket.send(JSON.stringify({ type: "pose", pose: 8 }));
  assert.equal((await driftPose).pose, 8);
  const late = await join("后来观赛");
  const driftSnapshot = await late.text.next(message => message.type === "join" && message.id === sender.id);
  assert.equal(driftSnapshot.pose, 8);

  sender.socket.send(JSON.stringify({ type: "pose", pose: 6 }));
  await delay(60);
  assert.ok(!observer.text.pending().some(message => message.type === "pose" && message.pose === 6));
  assert.equal(sender.socket.readyState, WebSocket.OPEN);

  const ownEcho = sender.text.next(message => message.type === "event" && message.kind === "grand-prix");
  const relayed = observer.text.next(message => message.type === "event" && message.kind === "grand-prix");
  sender.socket.send(JSON.stringify({ type: "event", kind: "grand-prix", totalMs: 240_000 }));
  const [echo, relay] = await Promise.all([ownEcho, relayed]);
  for (const frame of [echo, relay]) {
    assert.equal(frame.id, sender.id);
    assert.equal(frame.name, "雪橇手");
    assert.equal(frame.totalMs, 240_000);
    assert.equal(typeof frame.at, "number");
  }

  sender.socket.send(JSON.stringify({ type: "event", kind: "grand-prix", totalMs: 10 }));
  sender.socket.send(JSON.stringify({ type: "event", kind: "grand-prix", totalMs: 240_000.5 }));
  await delay(60);
  assert.ok(!observer.text.pending().some(message => message.kind === "grand-prix"));
  assert.equal(sender.socket.readyState, WebSocket.OPEN);
});
