import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { LetterStore } from "../../src/server/letters.js";
import { attachApplication } from "../../src/server/app.js";

function wait(ws: WebSocket, predicate: (message: any) => boolean) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { ws.off("message", receive); reject(Error("Letter reply timeout")); }, 5000);
    function receive(raw: any, binary: boolean) {
      if (binary) return;
      const message = JSON.parse(String(raw));
      if (predicate(message)) { clearTimeout(timer); ws.off("message", receive); resolve(message); }
    }
    ws.on("message", receive);
  });
}
test("letters survive reopening, retry once without duplicates, and fail on storage errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "unwritten-letters-"));
  try {
    const file = join(root, "letters.jsonl"), draft = { id: "first-letter", name: "朋友", text: "给2027：\n继续向前。" };
    const saved = await new LetterStore(file).save(draft);
    assert.deepEqual(await new LetterStore(file).save(draft), saved);
    assert.equal((await readFile(file, "utf8")).trim().split("\n").length, 1);
    await assert.rejects(new LetterStore(file).save({ ...draft, text: "覆盖别人的信" }));
    await writeFile(join(root, "blocked"), "not a directory");
    await assert.rejects(new LetterStore(join(root, "blocked", "letters.jsonl")).save(draft));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("letter saving requires the real postal desk, uses server identity, and replies privately", async () => {
  const root = await mkdtemp(join(tmpdir(), "unwritten-postal-ws-"));
  const server = http.createServer(), app = await attachApplication(server, { dataDirectory: root });
  const sockets: WebSocket[] = [];
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  async function member(code = "") {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/ws`); sockets.push(ws);
    await new Promise<void>(resolve => ws.on("open", resolve));
    const ready = wait(ws, m => m.type === "welcome");
    ws.send(JSON.stringify({ type: "join", code, name: "真正的作者" }));
    return { ws, welcome: await ready };
  }
  try {
    const first = await member(), second = await member(first.welcome.code);
    const otherMessages: any[] = [];
    second.ws.on("message", (raw, binary) => { if (!binary) otherMessages.push(JSON.parse(String(raw))); });
    const draft = { type: "letter", request: "postal-request-123", text: "这是只留给新一年的信", name: "伪造昵称" };
    const far = wait(first.ws, m => m.type === "letter-error"); first.ws.send(JSON.stringify(draft)); await far;
    const room = app.rooms.get(first.welcome.code)!, player = room.sim.players.get(first.welcome.id)!;
    room.sim.restore(player, { ...player.state, x: 17, y: 0.97, z: -3.4 });
    const reply = wait(first.ws, m => m.type === "letter-saved"); first.ws.send(JSON.stringify(draft));
    const receipt = await reply; assert.equal(receipt.receipt.id, draft.request);
    const record = JSON.parse((await readFile(join(root, "letters.jsonl"), "utf8")).trim());
    assert.equal(record.name, "真正的作者"); assert.equal(record.text, draft.text);
    assert.ok(!otherMessages.some(m => m.type.startsWith("letter")));
  } finally {
    for (const ws of sockets) ws.terminate();
    app.dispose(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
