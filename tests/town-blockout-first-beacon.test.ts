import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTownNightBeaconReceiver, thirteenthBellCatalogueEntry, type TownNightBeaconFrame } from '../src/shared/town-night-beacon.js';
import { createTownFirstBeacon } from '../tools/voxel-tavern/town-blockout/town-first-beacon.js';
import type { StorageAccess } from '../tools/voxel-tavern/town-blockout/town-text-store.js';

function beacon(at: number): TownNightBeaconFrame {
  return { type: 'event', kind: 'town-night-beacon', at, expiresAt: at + 2_000 };
}

function memoryStorage(): StorageAccess {
  const rows = new Map<string, string>();
  return {
    getItem(key: string) { return rows.get(key) ?? null; },
    setItem(key: string, value: string) { rows.set(key, value); },
  };
}

test('first audible live cue is one receipt, with 450ms shared pause and 1.5s mascot look', () => {
  const storage = memoryStorage();
  let server = 600_100, clock = 50, audible = 0;
  const deps = {
    storage, serverNow: () => server, connectedAt: () => 599_000,
    canHearHere: () => true, monotonicNow: () => clock,
    playAudibleTowerCue() { audible++; return true; },
  };
  const first = createTownFirstBeacon(deps);
  const receive = createTownNightBeaconReceiver({ ringTower: first.ringTower });
  assert.equal(first.catalogueEntry(), undefined);
  receive(beacon(600_000), server);
  receive(beacon(600_000), server);
  assert.equal(audible, 1);
  assert.deepEqual(first.sampleScene(), { livingPaused: true, mascotLooksAtTower: true });
  assert.deepEqual(first.catalogueEntry(), thirteenthBellCatalogueEntry);
  clock += 450;
  assert.deepEqual(first.sampleScene(), { livingPaused: false, mascotLooksAtTower: true });
  clock += 1_050;
  assert.equal(first.sampleScene(), undefined);
  const reopened = createTownFirstBeacon(deps);
  assert.deepEqual(reopened.catalogueEntry(), thirteenthBellCatalogueEntry);
  assert.equal(reopened.sampleScene(), undefined);
  server += 600_000;
  receive(beacon(1_200_000), server);
  assert.equal(audible, 2);
  assert.equal(reopened.sampleScene(), undefined);
});

test('late joins, expired cues, disconnected and other-domain listeners do not mark a hearing', () => {
  let server = 600_050;
  let joined: number | undefined = 600_050;
  let inTown = true, sounds = 0;
  const first = createTownFirstBeacon({
    storage: memoryStorage(), serverNow: () => server, connectedAt: () => joined,
    canHearHere: () => inTown, monotonicNow: () => 0,
    playAudibleTowerCue() { sounds++; return true; },
  });
  assert.equal(first.ringTower(beacon(600_000)), false);
  joined = 599_000;
  inTown = false;
  assert.equal(first.ringTower(beacon(600_000)), false);
  inTown = true;
  server = 602_000;
  assert.equal(first.ringTower(beacon(600_000)), false);
  joined = undefined;
  server = 1_200_010;
  assert.equal(first.ringTower(beacon(1_200_000)), false);
  assert.equal(sounds, 0);
  assert.equal(first.catalogueEntry(), undefined);
});

test('a locked or failed audio context leaves the first encounter available on another night', () => {
  let server = 600_010, clock = 100, audible = false, attempts = 0;
  const first = createTownFirstBeacon({
    storage: memoryStorage(), connectedAt: () => 100, serverNow: () => server,
    canHearHere: () => true, monotonicNow: () => clock,
    playAudibleTowerCue() { attempts++; return audible; },
  });
  assert.equal(first.ringTower(beacon(600_000)), false);
  assert.equal(first.catalogueEntry(), undefined);
  server = 1_200_010;
  clock += 10;
  audible = true;
  assert.equal(first.ringTower(beacon(1_200_000)), true);
  assert.equal(attempts, 2);
  assert.deepEqual(first.catalogueEntry(), thirteenthBellCatalogueEntry);
});

test('server clock resynchronization never replays the first living pause', () => {
  let server = 600_005, clock = 100;
  const first = createTownFirstBeacon({
    storage: memoryStorage(), connectedAt: () => 10, serverNow: () => server,
    canHearHere: () => true, monotonicNow: () => clock,
    playAudibleTowerCue: () => true,
  });
  assert.equal(first.ringTower(beacon(600_000)), true);
  clock += 900;
  server -= 500;
  assert.deepEqual(first.sampleScene(), { livingPaused: false, mascotLooksAtTower: true });
  clock += 700;
  server += 900;
  assert.equal(first.sampleScene(), undefined);
  assert.equal(first.ringTower(beacon(600_000)), false);
});

test('unavailable local storage does not crash the scene or re-play its first receipt', () => {
  const storage: StorageAccess = {
    getItem() { throw new Error('read denied'); },
    setItem() { throw new Error('write denied'); },
  };
  let server = 600_001;
  const first = createTownFirstBeacon({
    storage, connectedAt: () => 5, serverNow: () => server,
    canHearHere: () => true, monotonicNow: () => 10,
    playAudibleTowerCue: () => true,
  });
  assert.equal(first.ringTower(beacon(600_000)), true);
  assert.deepEqual(first.catalogueEntry(), thirteenthBellCatalogueEntry);
  server = 1_200_001;
  assert.equal(first.ringTower(beacon(1_200_000)), true);
  assert.deepEqual(first.sampleScene(), { livingPaused: true, mascotLooksAtTower: true });
});
