import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { createPresenceServer, type PresenceConnectionLog } from "../../src/presence/server.js";
import { POLL_SESSION_TIMEOUT_MS } from "../../src/presence/protocol.js";

type ConnEvent = {
  ts: string;
  transport: "ws" | "poll" | "-";
  peer: number | "-";
  step: "attempt" | "session" | "join" | "drop";
  result: string;
};

function collectLogs() {
  const lines: string[] = [];
  const logger: PresenceConnectionLog = (line) => lines.push(line);
  const events = () => lines.map((line) => JSON.parse(line) as ConnEvent);
  const find = (step: ConnEvent["step"], result?: string) =>
    events().find((event) => event.step === step && (result === undefined || event.result === result));
  return { lines, logger, events, find };
}

async function waitFor(what: string, predicate: () => boolean, timeoutMs = 4000) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitSelfJoin(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no self join frame")), 4000);
    socket.on("message", (data) => {
      try {
        const frame = JSON.parse(data.toString()) as { type?: string; self?: boolean };
        if (frame.type === "join" && frame.self) {
          clearTimeout(timer);
          resolve();
        }
      } catch { /* binary frames are not JSON; ignore */ }
    });
  });
}

test("S2 ws lifecycle logs attempt/session/join/drop and never leaks names or chat text", async (t) => {
  const logs = collectLogs();
  const server = await createPresenceServer({ connectionLog: logs.logger });
  t.after(() => server.close());
  const { port } = server.address();

  const socket = await connectWs(`ws://127.0.0.1:${port}/presence`);
  const joined = waitSelfJoin(socket);
  socket.send(JSON.stringify({ type: "join", name: "LogProbeOne" }));
  await joined;
  socket.send(JSON.stringify({ type: "chat", text: "SECRET_CHAT_TEXT_42", scope: "town" }));
  await delay(60);
  socket.close();
  await waitFor("drop log", () => logs.find("drop") !== undefined);

  const attempt = logs.find("attempt", "accepted");
  assert.ok(attempt, "attempt/accepted line exists");
  assert.equal(attempt.transport, "ws");
  assert.equal(attempt.peer, "-");

  const session = logs.find("session", "ok");
  assert.ok(session, "session/ok line exists");
  assert.equal(typeof session.peer, "number");

  const join = logs.find("join", "ok");
  assert.ok(join, "join/ok line exists");
  assert.equal(join.peer, session.peer);
  assert.equal(join.transport, "ws");

  const drop = logs.find("drop");
  assert.ok(drop, "drop line exists");
  assert.equal(drop.peer, session.peer);
  assert.equal(drop.result, "closed");

  // Privacy contract: fixed key whitelist, valid ISO timestamps, no user content anywhere.
  for (const line of logs.lines) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), ["peer", "result", "step", "transport", "ts"]);
    assert.ok(!Number.isNaN(Date.parse(parsed.ts as string)), "ts is an ISO timestamp");
    assert.ok(!line.includes("LogProbeOne"), "log must not contain the player name");
    assert.ok(!line.includes("SECRET_CHAT_TEXT_42"), "log must not contain chat text");
  }
});

test("S2 ws upgrade to a wrong path logs attempt/path", async (t) => {
  const logs = collectLogs();
  const server = await createPresenceServer({ connectionLog: logs.logger });
  t.after(() => server.close());
  const { port } = server.address();

  const socket = new WebSocket(`ws://127.0.0.1:${port}/not-the-town`);
  await new Promise<void>((resolve) => {
    socket.once("error", () => resolve());
    socket.once("close", () => resolve());
    setTimeout(() => resolve(), 3000);
  });
  await waitFor("attempt/path log", () => logs.find("attempt", "path") !== undefined);
  const attempt = logs.find("attempt", "path")!;
  assert.equal(attempt.transport, "ws");
  assert.equal(attempt.peer, "-");
  assert.equal(logs.find("session"), undefined, "no session is established for a refused upgrade");
});

test("S2 ws peer that never joins logs join/timeout and then drops", async (t) => {
  const logs = collectLogs();
  const server = await createPresenceServer({ connectionLog: logs.logger });
  t.after(() => server.close());
  const { port } = server.address();

  const socket = await connectWs(`ws://127.0.0.1:${port}/presence`);
  await waitFor("session log", () => logs.find("session", "ok") !== undefined);
  // The server closes unjoined sockets after 5 s; wait for that verdict line.
  await waitFor("join/timeout log", () => logs.find("join", "timeout") !== undefined, 9000);
  await waitFor("drop log", () => logs.find("drop") !== undefined);
  const timeout = logs.find("join", "timeout")!;
  assert.equal(timeout.transport, "ws");
  assert.equal(logs.find("join", "ok"), undefined, "no join/ok for a peer that never joined");
  socket.close();
});

test("S2 poll lifecycle logs attempt/session/join, reap logs drop/poll-timeout, dead session logs session/unknown", async (t) => {
  const logs = collectLogs();
  let fake = 5_000_000;
  const server = await createPresenceServer({ now: () => fake, connectionLog: logs.logger });
  t.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const joinResponse = await fetch(`${base}/presence/poll/join`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "PollProbe" }),
  });
  assert.equal(joinResponse.status, 200);
  const { session } = await joinResponse.json() as { session: string };

  assert.ok(logs.find("attempt", "accepted"), "poll attempt/accepted exists");
  const sessionEvent = logs.find("session", "ok");
  assert.ok(sessionEvent, "poll session/ok exists");
  assert.equal(sessionEvent.transport, "poll");
  const join = logs.find("join", "ok");
  assert.ok(join, "poll join/ok exists");
  assert.equal(join.peer, sessionEvent.peer);

  // Advance the injected clock past the poll session timeout; the tick reaps the peer.
  fake += POLL_SESSION_TIMEOUT_MS + 1000;
  await waitFor("drop/poll-timeout log", () => logs.find("drop", "poll-timeout") !== undefined);

  // The reaped session token is now unknown to the server.
  const stale = await fetch(`${base}/presence/poll`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-presence-session": session },
    body: "{}",
  });
  assert.equal(stale.status, 401);
  assert.ok(logs.find("session", "unknown"), "session/unknown logged for the reaped token");

  for (const line of logs.lines) assert.ok(!line.includes("PollProbe"), "log must not contain the player name");
});

test("S2 poll join with an invalid name logs session but no join, and drops as invalid-name", async (t) => {
  const logs = collectLogs();
  const server = await createPresenceServer({ connectionLog: logs.logger });
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/presence/poll/join`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "" }),
  });
  assert.equal(response.status, 400);
  assert.ok(logs.find("attempt", "accepted"), "attempt was accepted at transport level");
  assert.ok(logs.find("session", "ok"), "a session was created before the name check");
  assert.equal(logs.find("join", "ok"), undefined, "no join/ok for an invalid name");
  const drop = logs.find("drop", "invalid-name");
  assert.ok(drop, "drop/invalid-name logged");
  assert.equal(drop.transport, "poll");
});
