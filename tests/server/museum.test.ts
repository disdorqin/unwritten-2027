import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { attachApplication } from "../../src/server/app.js";
import { decodeSnapshot, encodeInputs } from "../../src/shared/protocol.js";

test("two real clients receive authoritative movement inside the same museum", async () => {
  const server = http.createServer(), app = await attachApplication(server);
  const sockets: WebSocket[] = [];
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${(server.address() as any).port}/ws`;
  async function join(code = "") {
    const ws = new WebSocket(url); sockets.push(ws);
    await new Promise<void>(resolve => ws.once("open", resolve));
    const welcome = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("welcome timeout")), 5000);
      ws.on("message", (raw, binary) => {
        if (!binary) { const message = JSON.parse(String(raw)); if (message.type === "welcome") { clearTimeout(timeout); resolve(message); } }
      });
    });
    ws.send(JSON.stringify({ type: "join", code, name: "参观者" }));
    return { ws, welcome: await welcome };
  }
  let interval: ReturnType<typeof setInterval> | undefined;
  try {
    const first = await join(), second = await join(first.welcome.code);
    const room = app.rooms.get(first.welcome.code)!;
    const player = room.sim.players.get(first.welcome.id)!;
    // Start the authority outside the doorway; all following movement is real input.
    room.sim.restore(player, { ...player.state, x: -18, y: 1, z: 2 });
    const inside = [false, false];
    for (const [i, socket] of [first.ws, second.ws].entries()) socket.on("message", (raw, binary) => {
      if (!binary) return;
      const bytes = Uint8Array.from(raw as Uint8Array);
      const snap = decodeSnapshot(bytes.buffer);
      const remote = snap.players.find(p => p.id === first.welcome.id);
      if (remote && remote.x < -17 && remote.x > -19 && remote.z < -2 && snap.players.length === 2) inside[i] = true;
    });
    let seq = 0;
    interval = setInterval(() => first.ws.send(encodeInputs([1, 2].map(() => ({ seq: ++seq, x: 0, z: 1, yaw: 0, pitch: 0, buttons: 0 })), 0)), 1000 / 30);
    await new Promise(resolve => setTimeout(resolve, 1800));
    assert.deepEqual(inside, [true, true]);
    assert.equal(app.rooms.size, 1, "entering the museum must not create an isolated room");
  } finally {
    clearInterval(interval);
    for (const socket of sockets) socket.terminate();
    app.dispose(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
