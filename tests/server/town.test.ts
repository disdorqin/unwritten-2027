import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { attachApplication } from "../../src/server/app.js";
import { decodeSnapshot, encodeInputs } from "../../src/shared/protocol.js";

function wait(ws: WebSocket, accept: (message: any) => boolean) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { ws.off("message", receive); reject(Error("Message timeout")); }, 5000);
    function receive(raw: any, binary: boolean) {
      if (binary) return;
      const m = JSON.parse(String(raw));
      if (accept(m)) { clearTimeout(timer); ws.off("message", receive); resolve(m); }
    }
    ws.on("message", receive);
  });
}
test("24 real WebSocket players share town movement and room-scoped chat", async () => {
  const server = http.createServer(), app = await attachApplication(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(server.address() as any).port}/ws`;
  const sockets: WebSocket[] = [];
  async function join(code = "", name = "朋友") {
    const ws = new WebSocket(url); sockets.push(ws);
    await new Promise<void>(resolve => ws.on("open", resolve));
    const welcome = wait(ws, m => m.type === "welcome");
    ws.send(JSON.stringify({ type: "join", code, name }));
    return { ws, welcome: await welcome };
  }
  try {
    const first = await join("", "第一位朋友");
    assert.equal(first.welcome.world, "town");
    for (let i = 1; i < 24; i++) await join(first.welcome.code);
    const room = app.rooms.get(first.welcome.code)!;
    assert.equal(room.members.size, 24);
    assert.equal(room.sim.props.size, 0);
    const other = await join();
    const outsiders: any[] = [];
    other.ws.on("message", (raw, binary) => { if (!binary) outsiders.push(JSON.parse(String(raw))); });
    const received = wait(sockets[1], m => m.type === "chat");
    first.ws.send(JSON.stringify({ type: "chat", name: "冒充他人", text: "明年见！<img src=x>" }));
    const chat = await received;
    assert.equal(chat.message.name, "第一位朋友");
    assert.equal(chat.message.text, "明年见！<img src=x>");
    const rejected = wait(first.ws, m => m.type === "chat-error");
    first.ws.send(JSON.stringify({ type: "chat", text: "过快发送" }));
    await rejected;
    let fullPlayers = 0, ownZ = Infinity;
    first.ws.on("message", (raw, binary) => {
      if (!binary) return;
      const bytes = Uint8Array.from(raw as Uint8Array);
      const snap = decodeSnapshot(bytes.buffer);
      fullPlayers = Math.max(fullPlayers, snap.players.length);
      const self = snap.players.find(p => p.id === first.welcome.id);
      if (self) ownZ = Math.min(ownZ, self.z);
    });
    let seq = 0;
    const interval = setInterval(() => first.ws.send(encodeInputs([1, 2].map(() => ({ seq: ++seq, x: 0, z: 1, yaw: 0, pitch: 0, buttons: 0 })), 0)), 1000 / 30);
    try { await new Promise(resolve => setTimeout(resolve, 1600)); }
    finally { clearInterval(interval); }
    assert.equal(fullPlayers, 24);
    assert.ok(ownZ < 10, "authority movement should reach the client in snapshots");
    assert.ok(!outsiders.some(m => m.type === "chat"));
    const newcomer = await join(first.welcome.code);
    assert.equal(newcomer.welcome.chat.length, 1);
  } finally {
    for (const ws of sockets) ws.terminate();
    app.dispose(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
