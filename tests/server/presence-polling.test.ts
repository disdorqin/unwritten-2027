import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../src/presence/server.js";
import { readPersonalFireworkRelay } from "../../src/presence/personal-fireworks.js";
import {
  decodeSnowballEvents, encodeSnowballHit, encodeSnowballThrow, type SnowballRelayEvent,
} from "../../src/presence/snowball-events.js";

type TextFrame = { type?: string; id?: number; name?: string; self?: boolean; text?: string; scope?: string; pose?: number };
type WireMessage = { t: string; d: string };

function makeRecord(east: number, north: number, height: number, seq: number): Buffer {
  const record = Buffer.alloc(12);
  record.writeUInt16LE(Math.round(east * 100), 2);
  record.writeUInt16LE(Math.round(north * 100), 4);
  record.writeUInt16LE(Math.round(height * 100), 6);
  record.writeUInt16LE(seq, 10);
  return record;
}

function snapshotRecords(frame: Buffer) {
  const records: { id: number; east: number; north: number; height: number; seq: number }[] = [];
  for (let i = 0; i < frame[0]!; i++) {
    const offset = 1 + i * 12;
    records.push({
      id: frame.readUInt16LE(offset), east: frame.readUInt16LE(offset + 2) / 100,
      north: frame.readUInt16LE(offset + 4) / 100, height: frame.readUInt16LE(offset + 6) / 100,
      seq: frame.readUInt16LE(offset + 10),
    });
  }
  return records;
}

const stateBody = (east: number, north: number, height: number, seq: number) =>
  ({ state: makeRecord(east, north, height, seq).toString("base64") });
const textEventBody = (frame: unknown) => ({ events: [{ t: "text", d: JSON.stringify(frame) }] });
const binEventBody = (bytes: Uint8Array) => ({ events: [{ t: "bin", d: Buffer.from(bytes).toString("base64") }] });

/** 只走 HTTPS 轮询的无头客户端：从不打开 WebSocket（等价于 WS 被网络阻断）。 */
class PollClient {
  session = "";
  id = 0;
  texts: TextFrame[] = [];
  bins: Buffer[] = [];
  constructor(private base: string) {}
  private collect(messages: WireMessage[] | undefined) {
    for (const message of messages ?? []) {
      if (message.t === "text") this.texts.push(JSON.parse(message.d) as TextFrame);
      else this.bins.push(Buffer.from(message.d, "base64"));
    }
  }
  async join(name: string) {
    const response = await fetch(`${this.base}/presence/poll/join`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    });
    assert.equal(response.status, 200);
    const data = await response.json() as { session: string; id: number; messages: WireMessage[] };
    this.session = data.session;
    this.id = data.id;
    this.collect(data.messages);
    return data;
  }
  async poll(body: unknown = {}) {
    const response = await fetch(`${this.base}/presence/poll`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-presence-session": this.session },
      body: JSON.stringify(body),
    });
    if (response.status === 200) this.collect((await response.json() as { messages: WireMessage[] }).messages);
    return response.status;
  }
  async waitFor(what: string, predicate: () => boolean, timeoutMs = 3500) {
    const start = Date.now();
    for (;;) {
      if (predicate()) return;
      if (Date.now() - start > timeoutMs) throw new Error(`poll client timed out waiting for ${what}`);
      await this.poll();
      if (predicate()) return;
      await delay(40);
    }
  }
  snapshots() { return this.bins.filter(frame => frame[0] !== 0xff).map(snapshotRecords); }
  snowballEvents(): SnowballRelayEvent[] {
    return this.bins.filter(frame => frame[0] === 0xff).flatMap(frame => decodeSnowballEvents(frame) ?? []);
  }
}

async function startServer(t: TestContext, options: Parameters<typeof createPresenceServer>[0] = {}) {
  const server = await createPresenceServer(options);
  t.after(() => server.close());
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test("poll join issues a session and the self join frame; bad names and sessions are refused", async t => {
  const { base } = await startServer(t);
  const client = new PollClient(base);
  const joined = await client.join("轮询甲");
  assert.equal(typeof joined.session, "string");
  assert.ok(joined.session.length >= 16);
  assert.ok(client.texts.some(frame => frame.type === "join" && frame.self === true && frame.id === client.id));

  const badName = await fetch(`${base}/presence/poll/join`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "  " }),
  });
  assert.equal(badName.status, 400);
  const badSession = await fetch(`${base}/presence/poll`, {
    method: "POST", headers: { "content-type": "application/json", "x-presence-session": "deadbeef" }, body: "{}",
  });
  assert.equal(badSession.status, 401);
});

test("S-A1: two poll-only clients see each other's positions, chat and poses without any WebSocket", async t => {
  const { base } = await startServer(t);
  const a = new PollClient(base);
  const b = new PollClient(base);
  await a.join("轮询甲");
  await b.join("轮询乙");
  await a.waitFor("join notice for B", () =>
    a.texts.some(frame => frame.type === "join" && frame.id === b.id && frame.name === "轮询乙"));

  await a.poll(stateBody(100, 100, 10, 1));
  await b.poll(stateBody(102, 100, 10, 1));
  await b.waitFor("snapshot containing A", () =>
    b.snapshots().some(records => records.some(record => record.id === a.id && record.east === 100)));
  await a.waitFor("snapshot containing B", () =>
    a.snapshots().some(records => records.some(record => record.id === b.id && record.east === 102)));

  await a.poll(textEventBody({ type: "chat", scope: "town", text: "轮询通道你好" }));
  await b.waitFor("chat from A", () =>
    b.texts.some(frame => frame.type === "chat" && frame.id === a.id && frame.text === "轮询通道你好"));

  await a.poll(textEventBody({ type: "pose", pose: 3 }));
  await b.waitFor("pose from A", () =>
    b.texts.some(frame => frame.type === "pose" && frame.id === a.id && frame.pose === 3));
});

test("snowball throw and hit confirmation travel over the polling channel", async t => {
  const { base } = await startServer(t);
  const a = new PollClient(base);
  const b = new PollClient(base);
  await a.join("掷雪甲");
  await b.join("掷雪乙");
  await a.poll(stateBody(100, 100, 10, 1));
  await b.poll(stateBody(102, 100, 10, 1));
  await b.waitFor("snapshot containing A", () =>
    b.snapshots().some(records => records.some(record => record.id === a.id)));

  await a.poll(binEventBody(encodeSnowballThrow({
    ballId: 7, east: 100, north: 100, height: 11.5, dirX: 1, dirY: 0, dirZ: 0,
  })));
  await b.waitFor("throw relay", () =>
    b.snowballEvents().some(event => event.kind === "throw" && event.throwerId === a.id && event.ballId === 7));

  await b.poll(binEventBody(encodeSnowballHit({ ballId: 7, throwerId: a.id, zone: "torso" })));
  await a.waitFor("hit relay", () =>
    a.snowballEvents().some(event => event.kind === "hit" && event.confirmerId === b.id && event.ballId === 7));
});

test("poll and WebSocket clients share one world state", async t => {
  const { server, base } = await startServer(t);
  const pollClient = new PollClient(base);
  await pollClient.join("轮询丙");

  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/presence`);
  t.after(() => socket.close());
  const wsTexts: TextFrame[] = [];
  const wsBins: Buffer[] = [];
  socket.on("message", (raw, isBinary) => {
    const frame = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    if (isBinary) wsBins.push(frame);
    else wsTexts.push(JSON.parse(frame.toString("utf8")) as TextFrame);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "join", name: "长连接丙" }));
  const start = Date.now();
  while (!wsTexts.some(frame => frame.type === "join" && frame.self)) {
    if (Date.now() - start > 3500) throw new Error("ws join timed out");
    await delay(20);
  }
  const wsId = wsTexts.find(frame => frame.type === "join" && frame.self)!.id!;

  socket.send(makeRecord(104, 100, 10, 1));
  await pollClient.poll(stateBody(100, 100, 10, 1));
  await pollClient.waitFor("snapshot containing the ws peer", () =>
    pollClient.snapshots().some(records => records.some(record => record.id === wsId && record.east === 104)));

  const wsStart = Date.now();
  for (;;) {
    if (wsBins.some(frame => frame[0] !== 0xff &&
        snapshotRecords(frame).some(record => record.id === pollClient.id && record.east === 100))) break;
    if (Date.now() - wsStart > 3500) throw new Error("ws snapshot containing the poll peer timed out");
    await delay(40);
  }

  const relayFor = (frames: TextFrame[], seed: number) => frames
    .map(readPersonalFireworkRelay)
    .find(event => event?.seed === seed);
  await pollClient.poll(textEventBody({
    type: "event", kind: "personal-firework", item: "sparkler",
    seed: 17, east: 100, north: 100, height: 11.28, yaw: 0,
  }));
  await pollClient.waitFor("one matching firecracker on each transport", () =>
    Boolean(relayFor(pollClient.texts, 17) && relayFor(wsTexts, 17)));
  const fromPoll = relayFor(pollClient.texts, 17)!;
  assert.equal(fromPoll.from, pollClient.id);
  assert.deepEqual(relayFor(wsTexts, 17), fromPoll);

  socket.send(JSON.stringify({
    type: "event", kind: "personal-firework", item: "rocket",
    seed: 18, east: 104, north: 100, height: 11.28, yaw: 0,
  }));
  await pollClient.waitFor("a WebSocket firecracker on both transports", () =>
    Boolean(relayFor(pollClient.texts, 18) && relayFor(wsTexts, 18)));
  const fromSocket = relayFor(wsTexts, 18)!;
  assert.equal(fromSocket.from, wsId);
  assert.deepEqual(relayFor(pollClient.texts, 18), fromSocket);
});

test("queued snapshots coalesce to the latest frame for slow pollers", async t => {
  const { base } = await startServer(t);
  const a = new PollClient(base);
  const b = new PollClient(base);
  await a.join("移动甲");
  await b.join("旁观乙");
  await b.poll(stateBody(102, 100, 10, 1));
  for (let seq = 1; seq <= 5; seq++) {
    await a.poll(stateBody(100 + seq, 100, 10, seq));
    await delay(150);
  }
  await b.poll();
  const frames = b.bins.filter(frame => frame[0] !== 0xff);
  assert.equal(frames.length, 1);
  assert.ok(snapshotRecords(frames[0]!).some(record => record.id === a.id && record.east === 105));
});

test("poll sessions expire after the timeout and leave notifies the other client", async t => {
  let fakeNow = 1_000_000;
  const { base } = await startServer(t, { now: () => fakeNow });
  const a = new PollClient(base);
  const b = new PollClient(base);
  await a.join("先来甲");
  await b.join("后来乙");
  assert.equal(await b.poll(), 200);

  fakeNow += 11_000;
  await delay(150);
  assert.equal(await b.poll(), 401);

  const leaver = new PollClient(base);
  await leaver.join("要走丙");
  const watcher = new PollClient(base);
  await watcher.join("目送丁");
  const leave = await fetch(`${base}/presence/poll/leave`, {
    method: "POST", headers: { "x-presence-session": leaver.session }, body: "{}",
  });
  assert.equal(leave.status, 200);
  await watcher.waitFor("leave notice", () =>
    watcher.texts.some(frame => frame.type === "leave" && frame.id === leaver.id));
});
