import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundEntry,
  type UndergroundEntryOptions,
  type UndergroundEntryPoint,
  type UndergroundEntrySnapshot,
} from '../../src/presence/underground-entry.js';

const firstFallLanding = { east: 3, north: 4, height: -5 };
const above = { ...firstFallLanding, height: 1 };
const atLine = { ...firstFallLanding, height: 0 };
const below = { ...firstFallLanding, height: -1 };

function fixture(overrides: Partial<UndergroundEntryOptions> = {}) {
  const saved: UndergroundEntrySnapshot[] = [];
  const options = {
    depthLine: 0,
    firstFallLanding,
    canUseWinch: (playerId: string) => playerId !== 'remote',
    canBoardCage: (playerId: string) => playerId !== 'remote',
    isDepthLineCrossing: (point: UndergroundEntryPoint) => point.east === 3 && point.north === 4,
    isFirstFallPool: (point: UndergroundEntryPoint) =>
      point.east === firstFallLanding.east && point.north === firstFallLanding.north && point.height === firstFallLanding.height,
    save: (snapshot: UndergroundEntrySnapshot) => { saved.push(snapshot); },
    ...overrides,
  };
  return { entry: createUndergroundEntry(options), saved, options };
}

test('the crater cover and alternate descents stay locked until one authorized opening', () => {
  const { entry, saved } = fixture();
  assert.deepEqual(entry.sceneState(), {
    coverVisible: true, shaftVisible: false, cageAvailable: { down: false, up: false }, unlockedDescents: [],
  });
  assert.equal(entry.requestCageRide('visitor', 'down').kind, 'locked');
  assert.equal(entry.requestCageRide('visitor', 'up').kind, 'locked');
  assert.equal(entry.confirmDepthCrossing('visitor', above, below), undefined);
  assert.deepEqual(entry.openWell('remote'), { kind: 'denied' });
  assert.equal(saved.length, 0);

  assert.deepEqual(entry.openWell('opener'), {
    kind: 'opened',
    firstFall: { kind: 'first-fall', playerId: 'opener', destination: firstFallLanding, fallDamage: 0 },
  });
  assert.deepEqual(entry.openWell('visitor'), { kind: 'already-open' });
  assert.equal(saved.length, 1);
  assert.deepEqual(entry.sceneState(), {
    coverVisible: false, shaftVisible: true, cageAvailable: { down: false, up: false },
    unlockedDescents: ['spiral', 'slide', 'side-door'],
  });
  assert.equal(entry.modeOf('opener'), 'peace');
});

test('a pending first fall survives reload and only its verified pool landing settles at zero damage', () => {
  const { entry, saved, options } = fixture();
  entry.openWell('opener');
  const restored = createUndergroundEntry({ ...options, initial: saved[0] });
  assert.equal(restored.pendingFirstFall('visitor'), undefined);
  assert.deepEqual(restored.pendingFirstFall('opener'), {
    kind: 'first-fall', playerId: 'opener', destination: firstFallLanding, fallDamage: 0,
  });
  assert.equal(restored.requestCageRide('opener', 'down').kind, 'first-fall-required');
  assert.equal(restored.requestCageRide('visitor', 'down').kind, 'first-fall-required');
  assert.equal(restored.confirmFirstFallLanding('opener', firstFallLanding), undefined);
  assert.equal(restored.confirmDepthCrossing('opener', above, below)?.mode, 'survival');
  assert.equal(restored.confirmDepthCrossing('visitor', above, below)?.mode, 'survival');
  assert.equal(restored.confirmFirstFallLanding('visitor', firstFallLanding), undefined);
  assert.equal(restored.requestCageRide('visitor', 'up').kind, 'first-fall-required');
  assert.equal(restored.confirmFirstFallLanding('opener', { ...firstFallLanding, east: 7 }), undefined);
  assert.deepEqual(restored.confirmFirstFallLanding('opener', firstFallLanding), {
    kind: 'first-fall-landed', fallDamage: 0,
  });
  assert.equal(restored.confirmFirstFallLanding('opener', firstFallLanding), undefined);
  assert.equal(restored.pendingFirstFall('opener'), undefined);
  assert.deepEqual(restored.sceneState().cageAvailable, { down: true, up: true });
  assert.deepEqual(restored.requestCageRide('opener', 'up'), { kind: 'ride-cage', direction: 'up' });
});

test('only confirmed movement through the configured depth line changes mode', () => {
  const crossings: [UndergroundEntryPoint, string][] = [];
  const { entry, saved } = fixture({
    isDepthLineCrossing(point, direction) {
      crossings.push([point, direction]);
      return point.east === 3 && point.north === 4;
    },
  });
  entry.openWell('opener');
  // Even a height change across the same level at the crater stairs is outside the shaft footprint.
  assert.equal(entry.confirmDepthCrossing('visitor', { ...above, east: 9 }, { ...below, east: 9 }), undefined);
  assert.equal(entry.confirmDepthCrossing('visitor', above, atLine), undefined);
  assert.equal(entry.confirmDepthCrossing('visitor', above, { ...below, height: Number.NaN }), undefined);
  assert.equal(entry.modeOf('visitor'), 'peace');
  assert.equal(saved.length, 1);

  assert.deepEqual(entry.confirmDepthCrossing('visitor', { ...above, east: 2 }, { ...below, east: 4 }), {
    kind: 'depth-crossing', direction: 'down', mode: 'survival', firstEntry: true,
  });
  assert.deepEqual(crossings.at(-1), [atLine, 'down']);
  assert.equal(entry.confirmDepthCrossing('visitor', above, below), undefined);
  assert.deepEqual(entry.confirmDepthCrossing('visitor', below, atLine), {
    kind: 'depth-crossing', direction: 'up', mode: 'peace', firstEntry: false,
  });
  assert.deepEqual(crossings.at(-1), [atLine, 'up']);
});

test('an opened cage reloads both directions and keeps each visitor’s first entry separate', () => {
  const { entry, options } = fixture();
  entry.openWell('opener');
  entry.confirmDepthCrossing('opener', above, below);
  entry.confirmFirstFallLanding('opener', firstFallLanding);
  const restored = createUndergroundEntry({ ...options, initial: entry.snapshot() });

  assert.deepEqual(restored.sceneState().cageAvailable, { down: true, up: true });
  assert.equal(restored.openWell('visitor').kind, 'already-open');
  assert.equal(restored.pendingFirstFall('opener'), undefined);
  assert.deepEqual(restored.requestCageRide('visitor', 'down'), { kind: 'ride-cage', direction: 'down' });
  assert.equal(restored.requestCageRide('visitor', 'up').kind, 'denied');
  assert.equal(restored.requestCageRide('remote', 'down').kind, 'denied');
  assert.equal(restored.modeOf('visitor'), 'peace');
  assert.equal(restored.confirmDepthCrossing('visitor', above, below)?.firstEntry, true);
  assert.equal(restored.pendingFirstFall('visitor'), undefined);

  const reconnected = createUndergroundEntry({ ...options, initial: restored.snapshot() });
  assert.equal(reconnected.modeOf('visitor'), 'survival');
  assert.deepEqual(reconnected.requestCageRide('visitor', 'up'), { kind: 'ride-cage', direction: 'up' });
  assert.equal(reconnected.confirmDepthCrossing('visitor', below, above)?.mode, 'peace');
  assert.equal(reconnected.confirmDepthCrossing('visitor', above, below)?.firstEntry, false);
  assert.equal(reconnected.confirmDepthCrossing('another', above, below)?.firstEntry, true);
});

test('failed saves publish no state change and allow an authoritative retry', () => {
  let writable = false;
  const { entry } = fixture({
    save() { if (!writable) throw new Error('storage unavailable'); },
  });
  assert.throws(() => entry.openWell('opener'), /storage unavailable/);
  assert.equal(entry.sceneState().coverVisible, true);
  assert.equal(entry.pendingFirstFall('opener'), undefined);
  writable = true;
  assert.equal(entry.openWell('opener').kind, 'opened');
  writable = false;
  assert.throws(() => entry.confirmDepthCrossing('opener', above, below), /storage unavailable/);
  assert.equal(entry.modeOf('opener'), 'peace');
  writable = true;
  assert.equal(entry.confirmDepthCrossing('opener', above, below)?.mode, 'survival');
});

test('saved state copies are isolated and invalid depth configuration fails at startup', () => {
  const { entry, options, saved } = fixture();
  assert.throws(() => createUndergroundEntry({ ...options, depthLine: Number.NaN }), /finite depth line/);
  assert.throws(() => createUndergroundEntry({ ...options, firstFallLanding: atLine }), /below a finite depth line/);
  entry.openWell('opener');
  entry.confirmDepthCrossing('visitor', above, below);
  const restored = createUndergroundEntry({ ...options, initial: saved[1] });
  if (saved[1].well.kind === 'open') saved[1].well.firstFallPending = false;
  saved[1].players[0].mode = 'peace';
  assert.equal(entry.modeOf('visitor'), 'survival');
  assert.equal(restored.modeOf('visitor'), 'survival');
  assert.ok(restored.pendingFirstFall('opener'));
});
