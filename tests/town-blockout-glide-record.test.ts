import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glideAtlasShouldRecord, glideRecordBeats, type GlideRunRecord } from '../tools/voxel-tavern/town-blockout/town-glide-record';

const run = (patch: Partial<GlideRunRecord>): GlideRunRecord => ({
  courseId: 'zd08-nine-ring', halfPoints: 18, ringsPassed: 9, bestCombo: 9,
  landingOffsetM: 1.13, durationMs: 95_000, finishedAtMs: 1, ...patch,
});

test('best ordering: half-points, then landing, then time', () => {
  assert.equal(glideRecordBeats(run({}), undefined), true);
  assert.equal(glideRecordBeats(run({ halfPoints: 17 }), run({})), false);
  assert.equal(glideRecordBeats(run({ landingOffsetM: 0.4 }), run({})), true);
  assert.equal(glideRecordBeats(run({ durationMs: 90_000 }), run({})), true);
  assert.equal(glideRecordBeats(run({ landingOffsetM: null }), run({})), false, 'no landing never beats a settled one at equal points');
});

test('atlas records only finished runs with a settled landing', () => {
  assert.equal(glideAtlasShouldRecord(run({}), 9), true);
  assert.equal(glideAtlasShouldRecord(run({ landingOffsetM: null }), 9), false);
  assert.equal(glideAtlasShouldRecord(run({}), 0), false);
});
