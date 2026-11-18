import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { test, type TestContext } from "node:test";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../src/presence/server.js";

const recordBytes = 12;
const messageTimeout = 3500;
type Pose = { east: number; north: number; height: number; yaw: number; sequence: number };
type Record = Pose & { id: number };
type Control = { type: string; id?: number; name?: string; self?: boolean };

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
