import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../src/presence/server.js";
import { plazaPhotoCountdownMs, plazaPhotoGatherMs, plazaPhotoLockMs, type PlazaPhotoPerson } from "../../src/presence/plaza-photo.js";

const recordBytes = 12;
const messageTimeout = 3500;
type Pose = { east: number; north: number; height: number; yaw: number; sequence: number };
type Record = Pose & { id: number };
type Control = {
  type: string; id?: number; name?: string; self?: boolean; epochMs?: number; sentAt?: number;
  kind?: string; from?: number; seed?: number; theme?: string; startAt?: number; reason?: string; waitMs?: number;
  captureAt?: number; people?: PlazaPhotoPerson[];
};

function inbox<T>(socket: WebSocket, binary: boolean, decode: (frame: Buffer) => T) {
  const ready = new EventEmitter();
  const frames: Buffer[] = [];
  socket.on("message", (raw, isBinary) => {
    if (isBinary !== binary) return;
    if (Buffer.isBuffer(raw)) frames.push(raw);
    else if (Array.isArray(raw)) frames.push(Buffer.concat(raw));
    else frames.push(Buffer.from(raw));
    ready.emit("message");
  });
  return {
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

function encodePose({ east, north, height, yaw, sequence }: Pose) {
  const bytes = Buffer.alloc(recordBytes);
  const clientId = 65_534;
  [clientId, east, north, height, yaw, sequence].forEach((value, index) => {
    bytes.writeUInt16LE(value, index * 2);
  });
  return bytes;
}

type Config = Omit<NonNullable<Parameters<typeof createPresenceServer>[0]>, "host" | "port">;

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
    const snapshot = inbox(socket, true, decodeSnapshot);
    const closed = new Promise<number>(resolve => socket.once("close", resolve));
    return { socket, text, snapshot, closed };
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
    return { ...client, id: self.id!, name: self.name };
  }

  return { connect, connectRaw, join };
}

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

function sendPhotoRequest(socket: WebSocket) {
  socket.send(JSON.stringify({ type: "event", kind: "plaza-photo-request" }));
}

function sendPhotoOptOut(socket: WebSocket, id: number) {
  socket.send(JSON.stringify({ type: "event", kind: "plaza-photo-opt-out", id }));
}

function sendPhotoPose(socket: WebSocket, east: number, sequence = 1) {
  socket.send(encodePose({ ...pose, east: east * 100, north: 18_300, height: 1_200, sequence }));
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
    await delay(25);
    host.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    assert.equal((await host.text.next(message => photoLineup(message) || clockReply(message))).type, "clock");

    wallTime = lockAt;
    const lineups = await Promise.all([host, staying, optingOut].map(client => client.text.next(photoLineup)));
    assert.deepEqual(lineups[0], lineups[1]);
    assert.deepEqual(lineups[0], lineups[2]);
    assert.equal(lineups[0].id, invite.id);
    assert.equal(lineups[0].captureAt, invite.captureAt);
    assert.deepEqual(lineups[0].people, [
      { id: host.id, name: host.name, east: 224, north: 183, height: 12 },
      { id: staying.id, name: staying.name, east: 225, north: 183, height: 12 },
    ]);

    const late = await join("锁定后进镇");
    sendPhotoPose(late.socket, 226);
    sendPhotoOptOut(host.socket, invite.id!);
    late.socket.send(JSON.stringify({ type: "clock", sentAt: 1 }));
    assert.equal((await late.text.next(message => photoInvite(message) || photoLineup(message) || clockReply(message))).type, "clock");

    // The first hold expires after the shutter, and all valid players can enter another frame.
    wallTime = invite.captureAt! + 1001;
    sendPhotoRequest(late.socket);
    const next = await host.text.next(message => photoInvite(message) || photoLineup(message));
    assert.ok(photoInvite(next));
    assert.notEqual(next.id, invite.id);
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
