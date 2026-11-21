import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { createUndergroundLiftTripIdStore } from '../../src/presence/underground-lift-trip-id-store.js';
import { createUndergroundMineLift } from '../../src/presence/underground-mine-lift.js';

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'underground-lift-trip-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const file = join(directory, 'lift-trip.json');
  return { directory, file, store: createUndergroundLiftTripIdStore(file) };
}

test('a durable counter survives a new authority and never reuses a published trip ID', t => {
  const { file, store } = fixture(t);
  assert.equal(store.load(), 0);
  assert.equal(store.allocateTripId(), 1);
  assert.equal(store.allocateTripId(), 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 1, lastIssuedTripId: 2 });
  const reopened = createUndergroundLiftTripIdStore(file);
  assert.equal(reopened.load(), 2);
  assert.equal(reopened.allocateTripId(), 3);
  assert.equal(store.allocateTripId(), 4); // The old instance reads the newest disk state.
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 1, lastIssuedTripId: 4 });
});

test('invalid or unsupported snapshots cannot silently reset the trip sequence', t => {
  const { file, store } = fixture(t);
  for (const contents of [
    '{broken',
    '{"version":2,"lastIssuedTripId":12}',
    '{"version":1,"lastIssuedTripId":-1}',
    '{"version":1,"lastIssuedTripId":1.2}',
    '{"version":1,"lastIssuedTripId":null}',
    '{"version":1,"lastIssuedTripId":9007199254740992}',
  ]) {
    fs.writeFileSync(file, contents);
    assert.throws(() => store.load(), /lift trip counter/);
    assert.throws(() => store.allocateTripId(), /lift trip counter/);
    assert.equal(fs.readFileSync(file, 'utf8'), contents);
  }
  fs.writeFileSync(file, JSON.stringify({ version: 1, lastIssuedTripId: Number.MAX_SAFE_INTEGER }));
  assert.throws(() => store.allocateTripId(), /exhausted/);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).lastIssuedTripId, Number.MAX_SAFE_INTEGER);
});

test('replacement failure preserves the published ID and leaves no temporary file', t => {
  const { directory, file, store } = fixture(t);
  assert.equal(store.allocateTripId(), 1);
  const saved = fs.readFileSync(file);
  const replace = t.mock.method(fs, 'renameSync', () => { throw new Error('counter replacement failed'); });
  syncBuiltinESMExports();
  try {
    assert.throws(() => store.allocateTripId(), /counter replacement failed/);
    assert.equal(replace.mock.callCount(), 1);
    assert.deepEqual(fs.readFileSync(file), saved);
    assert.deepEqual(fs.readdirSync(directory), ['lift-trip.json']);
  } finally {
    replace.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(store.allocateTripId(), 2);
  assert.equal(createUndergroundLiftTripIdStore(file).allocateTripId(), 3);
});

test('failure before the first allocation never creates an optimistic trip ID', t => {
  const { directory, file, store } = fixture(t);
  const replace = t.mock.method(fs, 'renameSync', () => { throw new Error('first write refused'); });
  syncBuiltinESMExports();
  try {
    assert.throws(() => store.allocateTripId(), /first write refused/);
    assert.equal(store.load(), 0);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally {
    replace.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(store.allocateTripId(), 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).lastIssuedTripId, 1);
});

test('lift reboot resumes from the physical mine dock using a different persisted trip ID', t => {
  const { file, store } = fixture(t);
  let now = 10;
  let dock: 'crater-floor' | 'mine' = 'crater-floor';
  let foot = { playerId: 'miner', domainId: 'crater-floor', east: 0, north: 0, height: -35 };
  const options = {
    travelMs: 20_000, riderCapacity: 2, now: () => now,
    allocateTripId: store.allocateTripId,
    readDockedStop: () => dock,
    readAcceptedFoot: () => foot,
    isAtBoardingPlatform: (stop: 'crater-floor' | 'mine', point: typeof foot) => point.domainId === stop,
    requestCageRide: (_id: string, direction: 'up' | 'down') => ({ kind: 'ride-cage', direction }),
  };
  const first = createUndergroundMineLift(options);
  assert.equal(first.board('miner', 'down'), true);
  const oldTrip = first.depart('miner')!;
  assert.equal(oldTrip.id, 1);
  now += 20_000;
  dock = 'mine';
  assert.equal(first.confirmArrival(oldTrip.id), true);

  // Reboot the world authority but keep its published counter on disk.
  const reopened = createUndergroundLiftTripIdStore(file);
  const restored = createUndergroundMineLift({ ...options, allocateTripId: reopened.allocateTripId });
  foot = { ...foot, domainId: 'mine', height: -90 };
  assert.equal(restored.state().stop, 'mine');
  assert.equal(restored.board('miner', 'up'), true);
  const current = restored.depart('miner')!;
  assert.equal(current.id, 2);
  assert.equal(restored.confirmArrival(oldTrip.id), false);
  assert.equal(reopened.load(), 2);
  now += 20_000;
  dock = 'crater-floor';
  assert.equal(restored.confirmArrival(current.id), true);
});
