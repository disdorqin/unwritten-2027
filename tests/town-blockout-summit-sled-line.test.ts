import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSummitSledRun, segmentSplitMs, summitSledGateCount, summitSledRecordBeats,
  type SledGate,
} from '../tools/voxel-tavern/town-blockout/town-summit-sled-line';

// A straight test descent: gates every 500 m heading north.
const gates: SledGate[] = Array.from({ length: summitSledGateCount }, (_, i) => ({
  east: 0, north: (i + 1) * 500, halfWidth: 6,
}));

test('a full descent scores all 12 gates in order and finishes on time', () => {
  const run = createSummitSledRun(gates);
  run.arm();
  let result;
  for (let north = 0; north <= 6_500; north += 100) {
    result = run.step({ east: 0, north }, north * 10) ?? result;
  }
  assert.equal(result?.status, 'finished');
  assert.equal(result?.gatesPassed, 12);
  assert.equal(result?.splitsMs.length, 12);
  assert.equal(result?.totalMs, 60_000, 'last gate at 6000 m × 10 ms/m');
  assert.equal(segmentSplitMs(result!.splitsMs, 2, 4), 10_000);
});

test('out-of-order and wide crossings do not count; the clock survives a long stop', () => {
  const run = createSummitSledRun(gates);
  run.arm();
  run.step({ east: 0, north: 0 }, 0);
  // Jump straight past gate 2's line before gate 1: no credit for gate 2 later out of order.
  run.step({ east: 0, north: 400 }, 4_000);
  run.step({ east: 20, north: 600 }, 6_000); // crosses gate 1 line 20 m wide of centre: no credit
  assert.equal(run.state().nextGate, 0);
  run.step({ east: 0, north: 400 }, 30_000); // walk back (host feeds only sled steps; a re-mount step)
  run.step({ east: 0, north: 600 }, 34_000); // through gate 1 properly, 30 s after the fall
  assert.equal(run.state().nextGate, 1);
  assert.equal(run.state().splitsMs[0], 34_000, 'the stop cost time, nothing else');
});

test('abandon keeps a partial practice record that can never be a best', () => {
  const run = createSummitSledRun(gates);
  run.arm();
  run.step({ east: 0, north: 0 }, 0);
  run.step({ east: 0, north: 600 }, 6_000);
  const partial = run.abandon(9_000);
  assert.equal(partial?.status, 'abandoned');
  assert.equal(partial?.gatesPassed, 1);
  assert.equal(summitSledRecordBeats(partial!, undefined), false);
  const full = { courseId: 'summit-sled-line', totalMs: 300_000, splitsMs: [], gatesPassed: 12, finishedAtMs: 1 };
  assert.equal(summitSledRecordBeats(full, undefined), true);
  assert.equal(summitSledRecordBeats({ ...full, totalMs: 299_000 }, full), true);
  assert.equal(summitSledRecordBeats({ ...full, totalMs: 301_000 }, full), false);
});

test('the course refuses a gate list that is not the canon 12', () => {
  assert.throws(() => createSummitSledRun(gates.slice(0, 11)), /exactly 12 gates/);
});
