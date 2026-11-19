import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { test, type TestContext } from "node:test";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../src/presence/server.js";
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

async function fixture(context: TestContext, ceremonyStartAt?: number) {
  const server = await createPresenceServer({ host: "127.0.0.1", port: 0, ceremonyStartAt });
  const url = "ws://127.0.0.1:" + server.address().port + "/presence";
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

  return { join, sendPose };
}

test("snowfight: start assigns teams, place validates half and roads, three hits clear a wall",
  { timeout: 9000 }, async context => {
    const { join, sendPose } = await fixture(context);
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

    // 三击塌墙：hp 3→2→1→WALL_CLEAR
    const hit = (ballId: number) =>
      b.socket.send(Buffer.from(encodeWallHit({ gx: 600, gy: 500, layer: 0, ballId, throwerId: b.id })));
    const damaged1 = a.walls.next(events => events.some(
      event => event.kind === "wall-set" && event.hp === 2));
    hit(101);
    await damaged1;
    const damaged2 = a.walls.next(events => events.some(
      event => event.kind === "wall-set" && event.hp === 1));
    hit(102);
    await damaged2;
    const cleared = a.walls.next(events => events.some(event => event.kind === "wall-clear"));
    hit(103);
    const clearEvents = await cleared;
    const clear = clearEvents.find(event => event.kind === "wall-clear");
    assert.ok(clear && clear.kind === "wall-clear");
    if (clear && clear.kind === "wall-clear") {
      assert.deepEqual(clear.blocks, [{ gx: 600, gy: 500, layer: 0 }]);
    }

    // 重复 ballId 的命中报告被去重：不再有后续墙事件
    hit(103);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.ok(!a.walls.pending().flat().some(event => event.kind === "wall-set" && event.hp < 3),
      "duplicate wall-hit report is ignored");
  });

test("snowfight: sled smash clears a one-layer wall for both clients, rejects slow thick and far reports",
  { timeout: 9000 }, async context => {
    const { join, sendPose } = await fixture(context);
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
    smash(600, 500, 31);
    await noClear();

    // 厚墙（同格堆到 2 层）：高速报告也被拒，列高必须恰为 1
    await place(600, 500, 1);
    smash(600, 500, 12);
    await noClear();

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

test("free snow walls relay three authored layers, survive joining, and clear before ceremony arrival",
  { timeout: 9000 }, async context => {
    let epoch = Date.now();
    context.mock.method(Date, "now", () => epoch);
    const startAt = epoch + 20_000;
    const { join } = await fixture(context, startAt);
    const a = await join("雪墙作者");
    const b = await join("雪墙访客");
    const outside = { gx: 600, gy: 500 };
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
