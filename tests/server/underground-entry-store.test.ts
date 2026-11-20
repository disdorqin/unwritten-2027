import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  createUndergroundEntry,
  type UndergroundEntryOptions,
  type UndergroundEntrySnapshot,
} from '../../src/presence/underground-entry.js';
import { createUndergroundEntryStore } from '../../src/presence/underground-entry-store.js';

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'underground-entry-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const file = join(directory, 'well.json');
  const store = createUndergroundEntryStore(file);
  const options = {
    depthLine: -60,
    firstFallLanding: { east: 3, north: 4, height: -90 },
    canUseWinch: id => id === 'opener',
    canBoardCage: () => true,
    isDepthLineCrossing: () => false,
    isFirstFallPool: () => false,
    save: store.save,
  } satisfies UndergroundEntryOptions;
  return { directory, file, store, options };
}

test('the open cover and pending opener survive a new load without creating a second opening', t => {
  const { file, store, options } = fixture(t);
  assert.equal(store.load(), undefined);
  const entry = createUndergroundEntry(options);
  assert.equal(entry.openWell('visitor').kind, 'denied');
  assert.equal(store.load(), undefined);
  assert.equal(entry.openWell('opener').kind, 'opened');
  const bytes = fs.readFileSync(file);

  const reopened = createUndergroundEntryStore(file);
  const restored = createUndergroundEntry({ ...options, initial: reopened.load(), save: reopened.save });
  assert.deepEqual(restored.sceneState(), {
    coverVisible: false, shaftVisible: true, cageAvailable: { down: false, up: false },
  });
  assert.equal(restored.pendingFirstFall('opener')?.playerId, 'opener');
  assert.equal(restored.pendingFirstFall('visitor'), undefined);
  assert.equal(restored.openWell('opener').kind, 'already-open');
  assert.equal(restored.openWell('visitor').kind, 'already-open');
  assert.deepEqual(fs.readFileSync(file), bytes);
});

test('a new process restores both cage directions from an already-completed snapshot', t => {
  const { file, store, options } = fixture(t);
  store.save({
    well: { kind: 'open', openedBy: 'opener', firstFallPending: false },
    players: [{ playerId: 'opener', mode: 'survival', hasEntered: true }],
  });
  const bytes = fs.readFileSync(file);
  const entryModule = new URL('../../src/presence/underground-entry.ts', import.meta.url).href;
  const storeModule = new URL('../../src/presence/underground-entry-store.ts', import.meta.url).href;
  const script = `
    import { createUndergroundEntry } from ${JSON.stringify(entryModule)};
    import { createUndergroundEntryStore } from ${JSON.stringify(storeModule)};
    const store = createUndergroundEntryStore(process.argv[1]);
    const restored = createUndergroundEntry({
      depthLine: ${JSON.stringify(options.depthLine)},
      firstFallLanding: ${JSON.stringify(options.firstFallLanding)},
      canUseWinch: () => true,
      canBoardCage: () => true,
      isDepthLineCrossing: () => false,
      isFirstFallPool: () => false,
      initial: store.load(),
      save: store.save,
    });
    console.log(JSON.stringify({
      cageAvailable: restored.sceneState().cageAvailable,
      up: restored.requestCageRide('opener', 'up').kind,
      down: restored.requestCageRide('visitor', 'down').kind,
      duplicate: restored.openWell('opener').kind,
    }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script, file], {
    encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    cageAvailable: { down: true, up: true }, down: 'ride-cage', up: 'ride-cage', duplicate: 'already-open',
  });
  assert.deepEqual(fs.readFileSync(file), bytes);
});

test('a failed file replacement preserves the last snapshot on disk and in memory, then permits retry', t => {
  const { directory, file, store, options } = fixture(t);
  const covered: UndergroundEntrySnapshot = { well: { kind: 'covered' }, players: [] };
  store.save(covered);
  const bytes = fs.readFileSync(file);
  const entry = createUndergroundEntry({ ...options, initial: store.load() });

  const replace = t.mock.method(fs, 'renameSync', () => { throw new Error('replacement failed'); });
  syncBuiltinESMExports();
  try {
    assert.throws(() => entry.openWell('opener'), /replacement failed/);
    assert.equal(replace.mock.callCount(), 1);
    assert.deepEqual(entry.snapshot(), covered);
    assert.deepEqual(store.load(), covered);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.deepEqual(fs.readdirSync(directory), ['well.json']);
  } finally {
    replace.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(entry.openWell('opener').kind, 'opened');
  assert.deepEqual(store.load(), entry.snapshot());
  assert.deepEqual(fs.readdirSync(directory), ['well.json']);
});

test('a restored pending first fall changes mode and opens the cage in one successful save after a failed attempt', t => {
  const { file, directory, store, options } = fixture(t);
  const pool = options.firstFallLanding;
  const departure = { ...pool, height: -30 };
  const entry = createUndergroundEntry(options);
  assert.equal(entry.openWell('opener').kind, 'opened');
  const bytes = fs.readFileSync(file);
  const initial = store.load();
  let saves = 0;
  const restored = createUndergroundEntry({
    ...options, initial,
    isFirstFallDeparture: (id, point) => id === 'opener' && point.east === departure.east &&
      point.north === departure.north && point.height === departure.height,
    isDepthLineCrossing: (point, direction) => direction === 'down' && point.east === pool.east &&
      point.north === pool.north && point.height === options.depthLine,
    isFirstFallPool: point => point.east === pool.east && point.north === pool.north && point.height === pool.height,
    save(snapshot) {
      saves++;
      return store.save(snapshot);
    },
  });

  assert.equal(restored.pendingFirstFall('opener')?.playerId, 'opener');
  assert.equal(restored.requestCageRide('opener', 'down').kind, 'first-fall-required');
  assert.equal(restored.confirmFirstFallTransfer('visitor', departure, pool), undefined);
  assert.equal(restored.confirmFirstFallTransfer('opener', departure, { ...pool, height: -91 }), undefined);
  assert.equal(saves, 0);

  const replace = t.mock.method(fs, 'renameSync', () => { throw new Error('replacement failed'); });
  syncBuiltinESMExports();
  try {
    assert.throws(() => restored.confirmFirstFallTransfer('opener', departure, pool), /replacement failed/);
    assert.equal(saves, 1);
    assert.equal(replace.mock.callCount(), 1);
    assert.equal(restored.modeOf('opener'), 'peace');
    assert.deepEqual(restored.snapshot(), initial);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.deepEqual(fs.readdirSync(directory), ['well.json']);
  } finally {
    replace.mock.restore();
    syncBuiltinESMExports();
  }

  assert.deepEqual(restored.confirmFirstFallTransfer('opener', departure, pool), {
    kind: 'first-fall-landed', fallDamage: 0,
  });
  assert.equal(saves, 2);
  assert.deepEqual(store.load(), {
    well: { kind: 'open', openedBy: 'opener', firstFallPending: false },
    players: [{ playerId: 'opener', mode: 'survival', hasEntered: true }],
  });
  assert.equal(restored.requestCageRide('opener', 'up').kind, 'ride-cage');
  assert.equal(restored.pendingFirstFall('opener'), undefined);
  assert.equal(restored.confirmFirstFallTransfer('opener', departure, pool), undefined);
  assert.equal(saves, 2);
});

test('the atomic path can settle a saved legacy first fall whose crossing was already committed', t => {
  const { store, options } = fixture(t);
  store.save({
    well: { kind: 'open', openedBy: 'opener', firstFallPending: true },
    players: [{ playerId: 'opener', mode: 'survival', hasEntered: true }],
  });
  const pool = options.firstFallLanding;
  const restored = createUndergroundEntry({
    ...options, initial: store.load(),
    isFirstFallDeparture: (id, point) => id === 'opener' && point.east === pool.east && point.north === pool.north,
    isDepthLineCrossing: (point, direction) => direction === 'down' && point.east === pool.east,
    isFirstFallPool: point => point.height === pool.height,
  });
  assert.equal(restored.confirmFirstFallTransfer('opener', { ...pool, east: pool.east + 3, height: -30 }, pool), undefined);
  assert.equal(restored.pendingFirstFall('opener')?.playerId, 'opener');
  assert.deepEqual(restored.confirmFirstFallTransfer('opener', { ...pool, height: -30 }, pool), {
    kind: 'first-fall-landed', fallDamage: 0,
  });
  const final = store.load();
  assert.equal(final?.well.kind === 'open' && final.well.firstFallPending, false);
  assert.equal(final?.players[0]?.mode, 'survival');
});

test('an interpolated depth hit from the operation foot cannot substitute for accepted shaft departure', t => {
  const { options, store } = fixture(t);
  const pool = options.firstFallLanding;
  const shaft = { ...pool, height: -30 };
  const winch = { ...shaft, east: shaft.east + 3.44 };
  const acceptedFloor = { ...shaft };
  let committedDeparture = false;
  let crossingChecks = 0;
  const entry = createUndergroundEntry({
    ...options,
    isFirstFallDeparture: (id, point) => committedDeparture && id === 'opener' &&
      point.east === acceptedFloor.east && point.north === acceptedFloor.north && point.height === acceptedFloor.height,
    isDepthLineCrossing: (point, direction) => {
      crossingChecks++;
      return direction === 'down' && Math.abs(point.east - shaft.east) < 3;
    },
    isFirstFallPool: point => point.height === pool.height,
  });
  assert.equal(entry.requestFirstFallFromShaft('opener', shaft), undefined);
  assert.equal(entry.openWell('opener').kind, 'opened');
  assert.equal(entry.requestFirstFallFromShaft('opener', shaft), undefined);
  assert.equal(entry.confirmFirstFallTransfer('opener', shaft, pool), undefined);
  committedDeparture = true;
  const beforeRequest = store.load();
  assert.equal(entry.requestFirstFallFromShaft('opener', winch), undefined);
  assert.equal(entry.requestFirstFallFromShaft('next-player', shaft), undefined);
  assert.deepEqual(entry.requestFirstFallFromShaft('opener', shaft), {
    kind: 'first-fall', playerId: 'opener', destination: pool, fallDamage: 0,
  });
  assert.deepEqual(store.load(), beforeRequest);
  assert.equal(entry.confirmFirstFallTransfer('opener', winch, pool), undefined);
  assert.equal(entry.confirmFirstFallTransfer('next-player', shaft, pool), undefined);
  assert.equal(crossingChecks, 0);
  assert.equal(store.load()?.well.kind === 'open' && entry.pendingFirstFall('opener')?.playerId, 'opener');
  assert.equal(entry.confirmFirstFallTransfer('opener', shaft, pool)?.fallDamage, 0);
  assert.equal(crossingChecks, 1);
});

test('malformed or unsupported saved data is reported instead of being treated as a covered well', t => {
  const { file, store } = fixture(t);
  fs.writeFileSync(file, '{"version":');
  assert.throws(store.load, /Cannot parse underground entry snapshot/);
  fs.writeFileSync(file, '{"version":2,"snapshot":{"well":{"kind":"covered"},"players":[]}}');
  assert.throws(store.load, /Invalid underground entry snapshot/);
  fs.writeFileSync(file, '{"version":1,"snapshot":{"well":{"kind":"open","openedBy":"opener"},"players":[]}}');
  assert.throws(store.load, /Invalid underground entry snapshot/);
});
