import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { test, type TestContext } from "node:test";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../src/presence/server.js";
import { classifyFreeWallSite, classifyWallSite, sledWallImpact, sledWallReportSpeed } from "../../src/presence/snowfight.js";
import {
  decodeSnowfightRelay, encodeSledSmash, encodeWallHit, encodeWallPlace, type SnowfightRelayEvent,
} from "../../src/presence/snowfight-events.js";

const messageTimeout = 3500;

type Control = {
  type: string;
  id?: number;
  name?: string;
  self?: boolean;
  snowfight?: boolean;
  freeSnowWalls?: boolean;
  kind?: string;
  reason?: string;
  phase?: string;
  teams?: [number, number][];
  scores?: [number, number];
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
          reject(new Error("snowfight message timed out"));
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

async function fixture(context: TestContext, options: { ceremonyStartAt?: number; formalSnowfight?: boolean } = {}) {
  const server = await createPresenceServer({ host: "127.0.0.1", port: 0, ...options });
  const address = "127.0.0.1:" + server.address().port;
  const url = `ws://${address}/presence`;
  const sockets: WebSocket[] = [];
  context.after(async () => {
    for (const socket of sockets) socket.terminate();
    await server.close();
  });

  async function join(name: string) {
    const socket = new WebSocket(url);
    socket.on("error", () => undefined);
    sockets.push(socket);
    const text = inbox(socket, false, raw => JSON.parse(raw.toString()) as Control);
    const walls = inbox(socket, true,
      frame => decodeSnowfightRelay(frame) ?? [],
      frame => frame[0] === 0xff && frame[1] >= 5);
    await once(socket, "open");
    const joined = text.next(message => message.type === "join" && message.self === true);
    socket.send(JSON.stringify({ type: "join", name }));
    const self = await joined;
    assert.equal(self.snowfight, true, "join advertises snowfight support");
    assert.equal(self.freeSnowWalls, true);
    return { socket, text, walls, id: self.id!, name };
  }

  function sendPose(socket: WebSocket, east: number, north: number, sequence: number) {
    const bytes = Buffer.alloc(12);
    [0, east * 100, north * 100, 1000, 0, sequence].forEach((value, index) => {
      bytes.writeUInt16LE(value, index * 2);
    });
    socket.send(bytes);
  }

  return { join, sendPose, base: `http://${address}/presence/poll` };
}

test("snowfight: start assigns teams, place validates half and roads, and hits leave the wall intact",
  { timeout: 9000 }, async context => {
    const { join, sendPose } = await fixture(context, { formalSnowfight: true });
    const a = await join("红队甲");
    const b = await join("金队乙");
    sendPose(a.socket, 224, 188, 1);
    sendPose(b.socket, 230, 188, 1);

    const startedA = a.text.next(message => message.type === "snowfight" && message.phase === "build");
    const startedB = b.text.next(message => message.type === "snowfight" && message.phase === "build");
    a.socket.send(JSON.stringify({ type: "event", kind: "snowfight-start" }));
    const [stateA, stateB] = await Promise.all([startedA, startedB]);
    const teamOf = (state: Control, id: number) => state.teams?.find(([peer]) => peer === id)?.[1];
    assert.equal(teamOf(stateA, a.id), 0, "first id takes red");
    assert.equal(teamOf(stateA, b.id), 1);
    assert.deepEqual(stateB.scores, [0, 0]);

    // 合法放墙（西半场空地）：双方都收到 WALL_SET
    const setA = a.walls.next(events => events.some(event => event.kind === "wall-set"));
    const setB = b.walls.next(events => events.some(event => event.kind === "wall-set"));
    a.socket.send(Buffer.from(encodeWallPlace(600, 500)));
    const [relayA, relayB] = await Promise.all([setA, setB]);
    const placed = relayA.find(event => event.kind === "wall-set");
    assert.ok(placed && placed.kind === "wall-set");
    if (placed && placed.kind === "wall-set") {
      assert.equal(placed.hp, 3);
      assert.equal(placed.team, 0);
      assert.equal(placed.ownerId, a.id);
    }
    assert.ok(relayB.some(event => event.kind === "wall-set"));

    // 建造段越半场：拒放 'half'，且不产生 WALL_SET
    const halfReject = a.text.next(message => message.type === "snowfight-rejected" && message.reason === "half");
    a.socket.send(Buffer.from(encodeWallPlace(800, 500)));
    assert.equal((await halfReject).reason, "half");

    // 道路正中：拒放 'road'
    const roadReject = a.text.next(message => message.type === "snowfight-rejected" && message.reason === "road");
    a.socket.send(Buffer.from(encodeWallPlace(367, 407)));
    assert.equal((await roadReject).reason, "road");

    // Legacy clients may still report a hit, but it cannot change wall HP or layers.
    const hit = (ballId: number) =>
      b.socket.send(Buffer.from(encodeWallHit({ gx: 600, gy: 500, layer: 0, ballId, throwerId: b.id })));
    hit(101);
    hit(102);
    hit(103);
    await new Promise(resolve => setTimeout(resolve, 250));
    for (const client of [a, b]) {
      assert.ok(!client.walls.pending().flat().some(event => event.kind === "wall-clear" ||
        event.kind === "wall-set" && event.hp < 3));
    }
    const next = a.walls.next(events => events.some(event =>
      event.kind === "wall-set" && event.gx === 600 && event.gy === 500 && event.layer === 1));
    a.socket.send(Buffer.from(encodeWallPlace(600, 500)));
    await next;
  });

test("snowfight: sled smash clears a one-layer wall for both clients, enforces four speed bands, hard cap and proximity",
  { timeout: 9000 }, async context => {
    const { join, sendPose } = await fixture(context, { formalSnowfight: true });
    const a = await join("红队甲");
    const b = await join("金队乙");
    sendPose(a.socket, 224, 188, 1);
    sendPose(b.socket, 230, 188, 1);
    const startedA = a.text.next(message => message.type === "snowfight" && message.phase === "build");
    const startedB = b.text.next(message => message.type === "snowfight" && message.phase === "build");
    a.socket.send(JSON.stringify({ type: "event", kind: "snowfight-start" }));
    await Promise.all([startedA, startedB]);

    const place = async (gx: number, gy: number, layer: number) => {
      const set = a.walls.next(events => events.some(
        event => event.kind === "wall-set" && event.gx === gx && event.gy === gy && event.layer === layer));
      a.socket.send(Buffer.from(encodeWallPlace(gx, gy)));
      await set;
    };
    const smash = (gx: number, gy: number, speed: number) =>
      b.socket.send(Buffer.from(encodeSledSmash({ gx, gy, speed })));
    const noClear = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      assert.ok(!a.walls.pending().flat().some(event => event.kind === "wall-clear"),
        "no wall-clear broadcast reaches the wall owner");
      assert.ok(!b.walls.pending().flat().some(event => event.kind === "wall-clear"),
        "no wall-clear broadcast reaches the sledder");
    };

    // 正例：B 的位置记录就在墙格 (600,500) 格心 (300.25, 250.25) 边上，
    // 30 m/s 撞穿一层墙——双端都收到同一份 WALL_CLEAR，块按雪墙规则整块销毁。
    await place(600, 500, 0);
    sendPose(b.socket, 300, 250, 2);
    const clearA = a.walls.next(events => events.some(event => event.kind === "wall-clear"));
    const clearB = b.walls.next(events => events.some(event => event.kind === "wall-clear"));
    smash(600, 500, 30);
    const [relayA, relayB] = await Promise.all([clearA, clearB]);
    const clear = relayA.find(event => event.kind === "wall-clear");
    assert.ok(clear && clear.kind === "wall-clear");
    if (clear && clear.kind === "wall-clear") {
      assert.deepEqual(clear.blocks, [{ gx: 600, gy: 500, layer: 0 }]);
    }
    assert.ok(relayB.some(event => event.kind === "wall-clear"), "both clients observe the same clear");

    // 慢速（6 m/s，闸门含等于）不算撞穿：墙还在，无任何 WALL_CLEAR
    await place(600, 500, 0);
    smash(600, 500, 6);
    await noClear();
    smash(600, 500, 47);
    await noClear();

    await place(600, 500, 1);
    await place(600, 500, 2);
    const fourth = a.text.next(message => message.type === "snowfight-rejected" && message.reason === "stack");
    a.socket.send(Buffer.from(encodeWallPlace(600, 500)));
    assert.equal((await fourth).reason, "stack");
    async function clearLayers(speed: number, layers: number[]) {
      const awaits = [a, b].map(client => client.walls.next(events =>
        events.some(event => event.kind === "wall-clear")));
      smash(600, 500, sledWallReportSpeed(speed));
      const expected = [{ kind: "wall-clear", blocks: layers.map(layer => ({ gx: 600, gy: 500, layer })) }];
      for (const received of await Promise.all(awaits)) assert.deepEqual(received, expected);
      console.log("sled wall m/s, layers cleared across both clients", speed, layers);
    }
    smash(600, 500, sledWallReportSpeed(7.99));
    await noClear();
    await clearLayers(8, [2]);
    await clearLayers(15, [0, 1]);
    await place(600, 500, 0);
    await place(600, 500, 1);
    await place(600, 500, 2);
    await clearLayers(22.01, [0, 1, 2]);

    // 远报：B 退回广场（距格心约 94 m），同一报告被位置裁定拒绝；
    // 回到墙边后重报同格（二层列旁的一层新格 602,500）立即生效，作为近距正对照。
    await place(602, 500, 0);
    sendPose(b.socket, 230, 188, 3);
    smash(602, 500, 12);
    await noClear();
    sendPose(b.socket, 301, 250, 4);
    const clearNear = a.walls.next(events => events.some(event => event.kind === "wall-clear" &&
      event.blocks.some(block => block.gx === 602 && block.gy === 500 && block.layer === 0)));
    smash(602, 500, 12);
    await clearNear;
  });

test("free wall placement keeps doors and traffic approaches clear", () => {
  const sites = [[183.75, 203.75, "road"], [238.25, 140.25, "stage"],
    [473.75, 224.25, "platform"], [226.25, 215.25, "door"]] as const;
  for (const [east, north, before] of sites) {
    assert.equal(classifyWallSite(east, north), before);
    assert.equal(classifyFreeWallSite(east, north), before === "road" || before === "door" ? before : undefined);
  }
  assert.equal(classifyFreeWallSite(291, 197), "river");
  assert.equal(classifyFreeWallSite(297, 71), "river");
  assert.equal(classifyFreeWallSite(478, 224), "rail");
  assert.equal(classifyFreeWallSite(226, 223), "interior");
  assert.equal(classifyFreeWallSite(133.25, 266.25), "interior");
  assert.equal(classifyFreeWallSite(133.25, 272.25), "door");
  assert.equal(classifyFreeWallSite(133.25, 274.25), undefined);
  assert.equal(classifyFreeWallSite(80.25, 416.25), undefined);
  assert.equal(classifyFreeWallSite(82.25, 272.25), "interior");
  assert.equal(classifyFreeWallSite(87.25, 266.25), undefined);
  assert.equal(classifyFreeWallSite(484, 72), "secret");
  assert.equal(classifyFreeWallSite(291, 192), "road");
  assert.equal(classifyFreeWallSite(50, 470), undefined);
  const speeds = [7.99, 8, 14.99, 15, 22, 22.01, 30, 45, 45.2];
  assert.deepEqual(speeds.map(sledWallReportSpeed), [7, 8, 14, 15, 22, 23, 30, 45, 46]);
  assert.deepEqual(speeds.map(speed => sledWallImpact(sledWallReportSpeed(speed)).layers), [0, 1, 1, 2, 2, 4, 4, 4, 4]);
});

test("snowfight: approved upper-band reports 45 and 46 clear the entire three-layer column", { timeout: 9000 }, async context => {
  const { join, sendPose } = await fixture(context);
  const a = await join("高档橇甲");
  const b = await join("高档橇乙");
  sendPose(a.socket, 320, 250, 1);
  for (const [author, gx, speed] of [[a, 640, 45], [b, 644, 45.2]] as const) {
    const gy = 500;
    for (let layer = 0; layer < 3; layer++) {
      const set = author.walls.next(events => events.some(event =>
        event.kind === "wall-set" && event.gx === gx && event.gy === gy && event.layer === layer));
      author.socket.send(Buffer.from(encodeWallPlace(gx, gy)));
      await set;
    }
    const frames = [a, b].map(client => client.walls.next(events =>
      events.some(event => event.kind === "wall-clear" && event.blocks.some(block => block.gx === gx))));
    const report = sledWallReportSpeed(speed);
    a.socket.send(Buffer.from(encodeSledSmash({ gx, gy, speed: report })));
    for (const frame of await Promise.all(frames)) {
      assert.deepEqual(frame, [{ kind: "wall-clear", blocks: [0, 1, 2].map(layer => ({ gx, gy, layer })) }]);
    }
    console.log("approved sled speed, wire speed and layers cleared on both clients", speed, report, 3);
  }
});

test("free snow wall server rejects occupied homes and accepts dry exterior", { timeout: 9000 }, async context => {
  const { join } = await fixture(context);
  const a = await join("试墙建造");
  const b = await join("试墙见证");
  const rejected = a.text.next(message => message.type === "snowfight-rejected");
  a.socket.send(Buffer.from(encodeWallPlace(266, 532)));
  assert.equal((await rejected).reason, "interior");
  assert.equal(a.walls.pending().length, 0);
  assert.equal(b.walls.pending().length, 0);
  const door = a.text.next(message => message.type === "snowfight-rejected");
  a.socket.send(Buffer.from(encodeWallPlace(266, 544)));
  assert.equal((await door).reason, "door");
  for (const [gx, gy] of [[266, 548], [160, 832]]) {
    const frames = [a, b].map(client => client.walls.next(events =>
      events.some(event => event.kind === "wall-set" && event.gx === gx && event.gy === gy)));
    a.socket.send(Buffer.from(encodeWallPlace(gx, gy)));
    for (const frame of await Promise.all(frames)) {
      assert.deepEqual(frame, [{ kind: "wall-set", gx, gy, layer: 0, hp: 3, ownerId: a.id, team: 2 }]);
    }
  }
});

test("public snow walls stay free under legacy start requests on WebSocket and HTTP polling", { timeout: 9000 }, async context => {
  const { base, join } = await fixture(context);
  const author = await join("自由雪墙甲");
  const observer = await join("自由雪墙乙");
  const legacyStart = JSON.stringify({ type: "event", kind: "snowfight-start" });
  const west = { gx: 626, gy: 500 };
  const east = { gx: 800, gy: 500 };
  const freeWall = (cell: typeof west, ownerId: number) =>
    ({ kind: "wall-set", ...cell, layer: 0, hp: 3, ownerId, team: 2 });
  const isAt = (events: SnowfightRelayEvent[], cell: typeof west) => events.some(event =>
    event.kind === "wall-set" && event.gx === cell.gx && event.gy === cell.gy);

  author.socket.send(legacyStart);
  for (const cell of [west, east]) {
    const frames = [author, observer].map(client => client.walls.next(events => isAt(events, cell)));
    author.socket.send(encodeWallPlace(cell.gx, cell.gy));
    for (const frame of await Promise.all(frames)) assert.deepEqual(frame, [freeWall(cell, author.id)]);
  }
  assert.ok(!author.text.pending().some(message => message.type === "snowfight"));
  assert.ok(!observer.text.pending().some(message => message.type === "snowfight"));
  for (const [gx, gy, reason] of [[266, 544, "door"], [367, 407, "road"]] as const) {
    const rejected = author.text.next(message => message.type === "snowfight-rejected");
    author.socket.send(encodeWallPlace(gx, gy));
    assert.equal((await rejected).reason, reason);
  }
  assert.equal(author.walls.pending().flat().length, 0);
  assert.equal(observer.walls.pending().flat().length, 0);

  type PollMessage = { t: string; d: string };
  const wallsOf = (messages: PollMessage[]) => messages.flatMap(message =>
    message.t === "bin" ? decodeSnowfightRelay(Buffer.from(message.d, "base64")) ?? [] : []);
  const joined = await fetch(`${base}/join`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "晚到轮询" }),
  });
  assert.equal(joined.status, 200);
  const poll = await joined.json() as { id: number; session: string; messages: PollMessage[] };
  assert.deepEqual(wallsOf(poll.messages), [freeWall(west, author.id), freeWall(east, author.id)]);
  const lake = { gx: 790, gy: 132 };
  const broadcasts = [author, observer].map(client => client.walls.next(events => isAt(events, lake)));
  const response = await fetch(base, {
    method: "POST", headers: { "content-type": "application/json", "x-presence-session": poll.session },
    body: JSON.stringify({ events: [
      { t: "text", d: legacyStart },
      { t: "bin", d: Buffer.from(encodeWallPlace(lake.gx, lake.gy)).toString("base64") },
    ] }),
  });
  assert.equal(response.status, 200);
  const placed = await response.json() as { messages: PollMessage[] };
  assert.deepEqual(wallsOf(placed.messages), [freeWall(lake, poll.id)]);
  for (const frame of await Promise.all(broadcasts)) assert.deepEqual(frame, [freeWall(lake, poll.id)]);
  assert.ok(!placed.messages.some(message => message.t === "text" && JSON.parse(message.d).type === "snowfight"));
});

test("free snow walls relay three authored layers, survive joining, and clear before ceremony arrival",
  { timeout: 9000 }, async context => {
    let epoch = Date.now();
    context.mock.method(Date, "now", () => epoch);
    const startAt = epoch + 20_000;
    const { join } = await fixture(context, { ceremonyStartAt: startAt });
    const a = await join("雪墙作者");
    const b = await join("雪墙访客");
    const outside = { gx: 640, gy: 500 };
    const landing = { gx: 448, gy: 376 };

    for (const [site, layers] of [[outside, 3], [landing, 1]] as const) {
      for (let layer = 0; layer < layers; layer++) {
        const atLayer = (events: SnowfightRelayEvent[]) => events.some(event =>
          event.kind === "wall-set" && event.gx === site.gx && event.gy === site.gy && event.layer === layer);
        const frames = [a.walls.next(atLayer), b.walls.next(atLayer)];
        a.socket.send(Buffer.from(encodeWallPlace(site.gx, site.gy)));
        for (const events of await Promise.all(frames)) {
          assert.deepEqual(events, [{ kind: "wall-set", ...site, layer, hp: 3, ownerId: a.id, team: 2 }]);
        }
      }
    }

    const late = await join("迟到端");
    const snapshot = await late.walls.next(events => events.length === 4);
    assert.deepEqual(snapshot.flatMap(e => e.kind === "wall-set" && e.gx === outside.gx ? [e.layer] : []), [0, 1, 2]);

    const order: string[] = [];
    b.socket.on("message", (raw, binary) => {
      if (binary) {
        if (Buffer.isBuffer(raw) && decodeSnowfightRelay(raw)?.some(e => e.kind === "wall-clear")) order.push("clear");
      } else if (JSON.parse(raw.toString()).kind === "ceremony-arrival") order.push("arrival");
    });
    const arrival = b.text.next(message => message.kind === "ceremony-arrival");
    const removed = b.walls.next(events => events.some(e => e.kind === "wall-clear"));
    epoch = startAt - 10_000;
    assert.deepEqual(await removed, [{ kind: "wall-clear", blocks: [{ ...landing, layer: 0 }] }]);
    await arrival;
    assert.deepEqual(order, ["clear", "arrival"]);

    const blocked = a.text.next(message => message.type === "snowfight-rejected" && message.reason === "phase");
    a.socket.send(Buffer.from(encodeWallPlace(landing.gx, landing.gy)));
    await blocked;
    const after = await join("仪式访客");
    const remaining = await after.walls.next(events => events.some(e => e.kind === "wall-set"));
    assert.equal(remaining.length, 3);
    assert.ok(remaining.every(e => e.kind === "wall-set" && e.gx === outside.gx));
  });
