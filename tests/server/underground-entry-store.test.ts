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

test('malformed or unsupported saved data is reported instead of being treated as a covered well', t => {
  const { file, store } = fixture(t);
  fs.writeFileSync(file, '{"version":');
  assert.throws(store.load, /Cannot parse underground entry snapshot/);
  fs.writeFileSync(file, '{"version":2,"snapshot":{"well":{"kind":"covered"},"players":[]}}');
  assert.throws(store.load, /Invalid underground entry snapshot/);
  fs.writeFileSync(file, '{"version":1,"snapshot":{"well":{"kind":"open","openedBy":"opener"},"players":[]}}');
  assert.throws(store.load, /Invalid underground entry snapshot/);
});
