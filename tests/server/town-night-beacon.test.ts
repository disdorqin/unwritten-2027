import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { createTownNightBeaconHost, createTownNightWitness, thirteenthBellCatalogueEntry,
  type TownNightWitnessProgress } from '../../src/presence/town-night-beacon.js';
import { createTownNightBeaconReceiver, type TownNightBeaconFrame } from '../../src/shared/town-night-beacon.js';
import { createOrdinaryTownNightSchedule, createTownNightWindow } from '../../src/shared/town-night-window.js';
import { readTownNightOptions } from '../../src/presence/town-night-config.js';

const dawnEpoch = Date.parse('2026-12-29T10:00:00+08:00');
const scheduleAt = createOrdinaryTownNightSchedule({
  dawnEpoch, beaconOffsetsAfterDusk: Array(12).fill(60_000), cueFreshnessMs: 2_000,
});
const schedule = scheduleAt(dawnEpoch)!;

test('the presence startup configuration reloads the last committed signal from its durable receipt', t => {
  const directory = mkdtempSync(join(tmpdir(), 'town-night-receipt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'beacon.json');
  const json = JSON.stringify({ dawnEpoch, beaconOffsetsAfterDusk: Array(12).fill(60_000), cueFreshnessMs: 2_000 });
  assert.equal(readTownNightOptions(undefined, undefined), undefined);
  assert.throws(() => readTownNightOptions(json, undefined), /together/);
  assert.throws(() => readTownNightOptions('{"dawnEpoch":0}', path), /Invalid TOWN_NIGHT_SCHEDULE/);
  const first = readTownNightOptions(json, path)!;
  assert.deepEqual(first.scheduleAt(dawnEpoch), schedule);
  assert.equal(first.restoredBeaconAt, null);
  first.saveBeacon!(schedule.beaconAt);
  assert.equal(readFileSync(path, 'utf8'), String(schedule.beaconAt));
  assert.equal(readTownNightOptions(json, path)?.restoredBeaconAt, schedule.beaconAt);
  writeFileSync(path, '-1');
  assert.throws(() => readTownNightOptions(json, path), /Invalid town night beacon receipt/);
});

test('a single committed cue drives all scene effects with the same server timestamp', () => {
  let now = schedule.beaconAt - 1;
  const writes: number[] = [];
  const frames: TownNightBeaconFrame[] = [];
  const window = createTownNightWindow({ now: () => now, scheduleAt, saveBeacon: at => { writes.push(at); } });
  const host = createTownNightBeaconHost(window, cue => {
    assert.deepEqual(writes, [cue.at]);
    frames.push(cue);
  });
  assert.equal(host.tick().phase, 'awaiting-beacon');
  assert.equal(frames.length, 0);
  now = schedule.beaconAt;
  assert.equal(host.tick().shift, 'night');
  assert.equal(host.snapshot().beaconAt, schedule.beaconAt);
  assert.deepEqual(host.tick(), host.snapshot());
  assert.equal(frames.length, 1);

  const log: [string, number][] = [];
  const mark = (label: string) => (cue: TownNightBeaconFrame) => { log.push([label, cue.at]); };
  const receive = createTownNightBeaconReceiver({
    ringTower: mark('tower'),
    swingPendulum: mark('swing'),
    echo: (site, cue) => mark(`echo-${site}`)(cue),
    glowAtAnchors: mark('glow'),
    stationBroadcast: mark('station'),
    ringMascotBell: mark('mascot'),
  });
  assert.equal(receive(host.snapshot(), now), undefined);
  assert.equal(receive(frames[0], now - .1), undefined);
  assert.equal(receive(frames[0], schedule.cueExpiresAt), undefined);
  assert.equal(receive({ ...frames[0], kind: 'hook-one-hour' }, now), undefined);
  assert.deepEqual(receive(frames[0], now + .1), { cue: frames[0], failures: [] });
  assert.equal(receive(frames[0], now + 1), undefined);
  assert.deepEqual(log, ['tower', 'swing', 'echo-1', 'echo-2', 'echo-3', 'glow', 'station', 'mascot']
    .map(label => [label, schedule.beaconAt]));
});

test('a failed local scene handler cannot block another scene or replay the bell', () => {
  const fault = new Error('scene is reloading');
  let heard = 0;
  const receive = createTownNightBeaconReceiver({
    swingPendulum() { throw fault; },
    stationBroadcast() { heard++; },
  });
  const cue = { type: 'event', kind: 'town-night-beacon', at: schedule.beaconAt, expiresAt: schedule.cueExpiresAt };
  assert.deepEqual(receive(cue, schedule.beaconAt)?.failures, [fault]);
  assert.equal(heard, 1);
  assert.equal(receive(cue, schedule.beaconAt + 1), undefined);
});

test('two live WebSockets receive one broadcast, and a reconnect receives only the current window', { timeout: 5_000 }, async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    if (server.address()) await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `ws://127.0.0.1:${address.port}`;
  let now = schedule.beaconAt - 1;
  let broadcasts = 0;
  const window = createTownNightWindow({ now: () => now, scheduleAt });
  const host = createTownNightBeaconHost(window, cue => {
    broadcasts++;
    for (const connection of server.clients) if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify(cue));
  });
  server.on('connection', connection => connection.send(JSON.stringify({ type: 'snapshot', window: host.snapshot() })));
  async function connect() {
    const client = new WebSocket(url);
    sockets.push(client);
    const [payload] = await once(client, 'message');
    return { client, snapshot: JSON.parse(String(payload)) };
  }
  const [first, second] = await Promise.all([connect(), connect()]);
  assert.equal(first.snapshot.window.canEnterRestricted, false);
  const live = [first, second].map(async ({ client }) => {
    const [payload] = await once(client, 'message');
    return JSON.parse(String(payload));
  });
  now = schedule.beaconAt;
  host.tick();
  host.tick();
  const events = await Promise.all(live);
  assert.deepEqual(events, Array(2).fill({
    type: 'event', kind: 'town-night-beacon', at: schedule.beaconAt, expiresAt: schedule.cueExpiresAt,
  }));
  first.client.terminate();
  now++;
  const resumed = await connect();
  assert.equal(resumed.snapshot.window.canEnterRestricted, true);
  assert.equal(createTownNightBeaconReceiver({})(resumed.snapshot, now), undefined);
  assert.equal(broadcasts, 1);
});

test('only host-confirmed ordered witness steps persist, and catalogue completion survives reconnect', () => {
  const window = createTownNightWindow({ now: () => schedule.beaconAt, scheduleAt });
  window.recordBeacon(schedule.beaconAt);
  const profiles = new Map([['first-connection', 'opaque-one'], ['resume-connection', 'opaque-one'], ['other-connection', 'opaque-two']]);
  const store = new Map<string, TownNightWitnessProgress>();
  const committed: TownNightWitnessProgress[] = [];
  const verifiedEvidence = Symbol();
  let failWrite = false;
  const host = createTownNightWitness<string, unknown>({
    window, profileOf: session => profiles.get(session),
    confirm: (_session, _step, evidence, state) => evidence === verifiedEvidence && state.phase === 'night-window',
    load: profile => store.get(profile),
    save(profile, progress) {
      if (failWrite) throw new Error('write failed');
      store.set(profile, progress);
      committed.push(progress);
    },
  });
  const session = 'first-connection';
  assert.equal(host.record('guest', 'hear', verifiedEvidence), undefined);
  assert.equal(host.record(session, 'hear', { claimed: true }), undefined);
  assert.equal(host.record(session, 'verify', verifiedEvidence), undefined);
  assert.equal(host.record(session, 'hear', verifiedEvidence)?.heard, true);
  assert.equal(host.record(session, 'hear', verifiedEvidence), undefined);
  assert.equal(host.record('resume-connection', 'watch', verifiedEvidence)?.keptWatch, true);
  assert.equal(host.snapshot(session)?.catalogueEntry, null);
  failWrite = true;
  assert.throws(() => host.record(session, 'verify', verifiedEvidence), /write failed/);
  assert.equal(host.snapshot(session)?.verified, false);
  failWrite = false;
  assert.equal(host.record(session, 'verify', verifiedEvidence)?.catalogueEntry, thirteenthBellCatalogueEntry);
  assert.equal(host.record(session, 'verify', verifiedEvidence), undefined);
  assert.deepEqual(host.snapshot('resume-connection'), {
    heard: true, keptWatch: true, verified: true, catalogueEntry: thirteenthBellCatalogueEntry,
  });
  assert.equal(host.snapshot('other-connection')?.catalogueEntry, null);
  assert.deepEqual(committed, [1, 2, 3]);
});
