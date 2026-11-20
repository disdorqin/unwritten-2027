import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createPresenceServer } from '../../src/presence/server.js';
import { readTownNightOptions } from '../../src/presence/town-night-config.js';
import type { TownNightWindowState } from '../../src/shared/town-night-window.js';
import {
  isMountainPresenceFoot, mountainPresenceBounds, mountainPresenceNorthOrigin,
} from '../../src/shared/za22-mountain-domain.js';
import { westPresenceBounds } from '../../src/shared/za22-west-domain.js';

type Frame = {
  type: string;
  self?: boolean;
  kind?: string;
  at?: number;
  state?: TownNightWindowState;
  townNightWindow?: TownNightWindowState;
};
type Room = Awaited<ReturnType<typeof createPresenceServer>>;
type WireMessage = { t: string; d: string };

async function waitFor<T>(read: () => T | undefined, refresh = () => Promise.resolve()) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = read();
    if (value !== undefined) return value;
    await refresh();
    await delay(10);
  }
  assert.fail('Presence room did not deliver the expected frame');
}

function selfJoin(frames: Frame[]) {
  return frames.find(frame => frame.type === 'join' && frame.self);
}

function nightUpdate(frames: Frame[], phase: TownNightWindowState['phase']) {
  return frames.find(frame => frame.kind === 'town-night-window' && frame.state?.phase === phase)?.state;
}

test('ZA-22 rooms receive the official night window and single durable cue', { timeout: 8_000 }, async t => {
  const dawnEpoch = 2_000_000;
  const beaconAt = dawnEpoch + 420_000;
  const morningBellAt = dawnEpoch + 600_000;
  let now = beaconAt - 1;
  const config = JSON.stringify({ dawnEpoch, beaconOffsetsAfterDusk: Array(12).fill(60_000), cueFreshnessMs: 2_000 });
  const directory = mkdtempSync(join(tmpdir(), 'za22-night-relay-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const receipt = join(directory, 'beacon.json');
  const options = readTownNightOptions(config, receipt)!;
  const saved: number[] = [];
  const town = await createPresenceServer({
    wallNow: () => now, ceremonyStartAt: 0, connectionLog() {},
    townNight: { ...options, saveBeacon(at) { options.saveBeacon!(at); saved.push(at); } },
  });
  t.after(() => town.close());
  assert.ok(town.townNightFeed);
  const mountain = await createPresenceServer({
    ...mountainPresenceBounds, wallNow: () => now, ceremonyStartAt: 0,
    townNightFeed: town.townNightFeed, connectionLog() {},
  });
  t.after(() => mountain.close());
  const west = await createPresenceServer({
    ...westPresenceBounds, wallNow: () => now, ceremonyStartAt: 0,
    townNightFeed: town.townNightFeed, connectionLog() {},
  });
  t.after(() => west.close());
  assert.equal(mountain.townNightFeed, undefined);
  assert.equal(west.townNightFeed, undefined);

  async function joinWs(room: Room, name: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${room.address().port}/presence`);
    t.after(() => socket.terminate());
    const frames: Frame[] = [];
    socket.on('message', (message, binary) => {
      if (!binary) frames.push(JSON.parse(message.toString()) as Frame);
    });
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'join', name }));
    const joined = await waitFor(() => selfJoin(frames));
    return { frames, joined };
  }

  const westBase = `http://127.0.0.1:${west.address().port}/presence/poll`;
  const westJoin = await fetch(`${westBase}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '西域走查' }),
  });
  assert.equal(westJoin.status, 200);
  const westSession = await westJoin.json() as { session: string; messages: WireMessage[] };
  const westFrames: Frame[] = [];
  function collectWest(messages: WireMessage[]) {
    for (const message of messages) {
      if (message.t === 'text') westFrames.push(JSON.parse(message.d) as Frame);
    }
  }
  collectWest(westSession.messages);
  async function refreshWest() {
    const response = await fetch(westBase, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-presence-session': westSession.session },
      body: '{}',
    });
    assert.equal(response.status, 200);
    collectWest((await response.json() as { messages: WireMessage[] }).messages);
  }

  const [main, high] = await Promise.all([joinWs(town, '镇区走查'), joinWs(mountain, '山门走查')]);
  const waiting = main.joined.townNightWindow;
  assert.equal(waiting?.phase, 'awaiting-beacon');
  assert.equal(waiting?.canEnterRestricted, false);
  assert.deepEqual(high.joined.townNightWindow, waiting);
  assert.deepEqual(selfJoin(westFrames)?.townNightWindow, waiting);
  assert.deepEqual(saved, []);

  now = beaconAt;
  const opened = await Promise.all([
    waitFor(() => nightUpdate(main.frames, 'night-window')),
    waitFor(() => nightUpdate(high.frames, 'night-window')),
    waitFor(() => nightUpdate(westFrames, 'night-window'), refreshWest),
  ]);
  assert.equal(opened[0].canEnterRestricted, true);
  assert.equal(opened[0].chapterGatesLocked, true);
  assert.deepEqual(opened, Array(3).fill(opened[0]));
  assert.deepEqual(saved, [beaconAt]);
  assert.equal(readFileSync(receipt, 'utf8'), String(beaconAt));
  for (const frames of [main.frames, high.frames, westFrames]) {
    assert.deepEqual(frames.filter(frame => frame.kind === 'town-night-beacon'), [{
      type: 'event', kind: 'town-night-beacon', at: beaconAt, expiresAt: beaconAt + 2_000,
    }]);
  }

  now++;
  const late = await joinWs(west, '晚到西域');
  assert.deepEqual(late.joined.townNightWindow, opened[0]);
  now = morningBellAt;
  const closed = await Promise.all([
    waitFor(() => nightUpdate(main.frames, 'day')),
    waitFor(() => nightUpdate(high.frames, 'day')),
    waitFor(() => nightUpdate(westFrames, 'day'), refreshWest),
    waitFor(() => nightUpdate(late.frames, 'day')),
  ]);
  assert.equal(closed[0].canEnterRestricted, false);
  assert.deepEqual(closed, Array(4).fill(closed[0]));
  assert.equal(late.frames.some(frame => frame.kind === 'town-night-beacon'), false);
  assert.deepEqual(saved, [beaconAt]);
});

test('mountain wire admission accepts both surveyed stops and rejects unencodable poses', () => {
  assert.equal(isMountainPresenceFoot(336, 640, 347), true);
  assert.equal(isMountainPresenceFoot(300, 666, 347), true);
  assert.equal(isMountainPresenceFoot(526, mountainPresenceNorthOrigin - .01, 26), false);
  assert.equal(isMountainPresenceFoot(300, 676, 800), false);
});
