import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTownNightBeaconReceiver,
  thirteenthBellCatalogueEntry,
  type TownNightBeaconFrame,
} from '../src/shared/town-night-beacon.js';
import { playTowerBell } from '../tools/voxel-tavern/tower-chime.js';
import { createTownFirstBeacon } from '../tools/voxel-tavern/town-blockout/town-first-beacon.js';
import type { StorageAccess } from '../tools/voxel-tavern/town-blockout/town-text-store.js';

const dayMs = 600_000;
function beacon(at: number): TownNightBeaconFrame {
  return { type: 'event', kind: 'town-night-beacon', at, expiresAt: at + 2_000 };
}
function browserStorage() {
  const items = new Map<string, string>();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
  } satisfies StorageAccess;
}

test('an audible first cue pauses the living together, holds the mascot look briefly and adds one silent row', () => {
  const cue = beacon(dayMs);
  const storage = browserStorage();
  let now = cue.at + 13;
  const joinedAt = cue.at - 1_000;
  let sounds = 0;
  const make = () => createTownFirstBeacon({
    storage, connectedAt: () => joinedAt, serverNow: () => now,
    playAudibleTowerCue() { sounds++; return true; },
  });
  const first = make();
  const receive = createTownNightBeaconReceiver({ ringTower: first.ringTower });
  assert.equal(first.catalogueEntry(), undefined);
  assert.equal(first.sampleScene(), undefined);
  receive(cue, now);
  receive(cue, now);
  assert.equal(sounds, 1);
  assert.deepEqual(first.sampleScene(), { livingPaused: true, mascotLooksAtTower: true });
  assert.equal(first.catalogueEntry(), thirteenthBellCatalogueEntry);
  now += 450;
  assert.deepEqual(first.sampleScene(), { livingPaused: false, mascotLooksAtTower: true });
  now += 1_050;
  assert.equal(first.sampleScene(), undefined);

  const reopened = make();
  assert.equal(reopened.catalogueEntry(), thirteenthBellCatalogueEntry);
  assert.equal(reopened.sampleScene(), undefined);
  now = cue.at + dayMs + 20;
  createTownNightBeaconReceiver({ ringTower: reopened.ringTower })(beacon(cue.at + dayMs), now);
  assert.equal(sounds, 2);
  assert.equal(reopened.sampleScene(), undefined);
  assert.equal(reopened.catalogueEntry(), thirteenthBellCatalogueEntry);
});

test('a suspended audio page leaves the first hearing to a future live cue', () => {
  let now = dayMs;
  let context: AudioContext = { state: 'suspended' } as AudioContext;
  let strikes = 0;
  const first = createTownFirstBeacon({
    storage: browserStorage(), connectedAt: () => 10, serverNow: () => now,
    playAudibleTowerCue: () => playTowerBell(context, 'grand', 20),
  });
  const receive = createTownNightBeaconReceiver({ ringTower: first.ringTower });
  receive(beacon(now), now);
  assert.equal(first.sampleScene(), undefined);
  assert.equal(first.catalogueEntry(), undefined);

  const gain = {
    gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() { return this; }, disconnect() {},
  };
  const filter = { frequency: { value: 0 }, type: '', connect: () => gain };
  context = {
    state: 'running', currentTime: 0, destination: {},
    createBiquadFilter: () => filter, createGain: () => gain,
    createOscillator: () => ({ frequency: { value: 0 }, connect: () => gain, start() { strikes++; }, stop() {} }),
  } as unknown as AudioContext;
  receive(beacon(now), now);
  assert.equal(strikes, 0);
  now += dayMs;
  receive(beacon(now), now);
  assert.ok(strikes > 0);
  assert.equal(first.catalogueEntry(), thirteenthBellCatalogueEntry);
});

test('welcome snapshots, expired cues and a connection established after the live edge consume nothing', () => {
  const firstNight = beacon(dayMs);
  const storage = browserStorage();
  let now = firstNight.at + 100;
  let connectedAt: number | undefined = now;
  let plays = 0;
  function freshScene() {
    const first = createTownFirstBeacon({
      storage, serverNow: () => now, connectedAt: () => connectedAt,
      playAudibleTowerCue() { plays++; return true; },
    });
    return { first, receive: createTownNightBeaconReceiver({ ringTower: first.ringTower }) };
  }
  const { first, receive } = freshScene();
  receive({ type: 'welcome', phase: 'night-window', beaconAt: firstNight.at }, now);
  receive(firstNight, now);
  now = firstNight.expiresAt;
  connectedAt = firstNight.at - 1;
  receive(firstNight, now);
  assert.equal(plays, 0);
  assert.equal(first.sampleScene(), undefined);
  assert.equal(first.catalogueEntry(), undefined);

  const secondNight = beacon(firstNight.at + dayMs);
  now = secondNight.at + 1;
  connectedAt = undefined;
  const disconnected = freshScene();
  disconnected.receive(secondNight, now);
  assert.equal(disconnected.first.catalogueEntry(), undefined);
  assert.equal(plays, 0);
  connectedAt = secondNight.at - 5_000;
  const observing = freshScene();
  observing.receive(secondNight, now);
  assert.equal(plays, 1);
  assert.equal(observing.first.catalogueEntry(), thirteenthBellCatalogueEntry);
});

test('a throwing audio effect preserves other beacon effects and leaves the first hearing open', () => {
  let now = dayMs;
  const fakeAudioFailure = new Error('codec unavailable');
  const first = createTownFirstBeacon({
    storage: browserStorage(), connectedAt: () => 10, serverNow: () => now,
    playAudibleTowerCue() { if (now === dayMs) throw fakeAudioFailure; return true; },
  });
  let stations = 0;
  const receive = createTownNightBeaconReceiver({
    ringTower: first.ringTower,
    stationBroadcast() { stations++; },
  });
  assert.deepEqual(receive(beacon(now), now)?.failures, [fakeAudioFailure]);
  assert.equal(stations, 1);
  assert.equal(first.catalogueEntry(), undefined);
  now += dayMs;
  receive(beacon(now), now);
  assert.equal(stations, 2);
  assert.equal(first.catalogueEntry(), thirteenthBellCatalogueEntry);
});

test('ZB-17: an off-domain listener cannot consume a live first-hear receipt', () => {
  let now = dayMs + 10;
  let inTown = false, sounds = 0;
  const first = createTownFirstBeacon({
    storage: browserStorage(), connectedAt: () => dayMs - 100, serverNow: () => now,
    canHearHere: () => inTown, playAudibleTowerCue() { sounds++; return true; },
  });
  first.ringTower(beacon(dayMs));
  assert.equal(sounds, 0);
  assert.equal(first.catalogueEntry(), undefined);
  inTown = true;
  now += dayMs;
  first.ringTower(beacon(dayMs * 2));
  assert.equal(sounds, 1);
  assert.equal(first.catalogueEntry(), thirteenthBellCatalogueEntry);
  first.ringTower(beacon(dayMs * 2));
  assert.equal(sounds, 1, 'duplicate direct callbacks do not sound twice');
});

test('ZB-17: client clock resync does not replay a synchronized first-hear gesture', () => {
  let server = dayMs + 10, monotonic = 100;
  const first = createTownFirstBeacon({
    storage: browserStorage(), connectedAt: () => dayMs - 100, serverNow: () => server,
    monotonicNow: () => monotonic, playAudibleTowerCue: () => true,
  });
  first.ringTower(beacon(dayMs));
  monotonic += 550;
  server -= 700;
  assert.deepEqual(first.sampleScene(), { livingPaused: false, mascotLooksAtTower: true });
  monotonic += 1_000;
  server += 1_400;
  assert.equal(first.sampleScene(), undefined);
});
