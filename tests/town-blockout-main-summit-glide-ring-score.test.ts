import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSummitGlideRingScore } from '../tools/voxel-tavern/town-blockout/main-summit-glide-ring-score';
import type { SummitGlideRing } from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';

const ring = (id: string, north: number): SummitGlideRing =>
  ({ id, east: 0, north, height: 500, heading: 0, radius: 6 });
const point = (north: number, east = 0, height = 500) => ({ east, north, height });

test('clean earns two half-points, graze earns one and a miss resets the combo', () => {
  const score = createSummitGlideRingScore([ring('A', 0), ring('B', 5), ring('C', 10)]);
  assert.deepEqual(score.advance(point(-1), point(1), true).map(e => e.grade), ['clean']);
  assert.equal(score.snapshot().scoreHalfPoints, 2);
  assert.equal(score.snapshot().streak, 1);

  const grazed = score.advance(point(4, 5.7), point(6, 5.7), true);
  assert.deepEqual(grazed.map(e => e.grade), ['graze']);
  assert.equal(grazed[0]?.radialMetres, 5.7);
  assert.deepEqual([score.snapshot().scoreHalfPoints, score.snapshot().streak], [3, 2]);

  const missed = score.advance(point(9, 9), point(11, 9), true);
  assert.deepEqual(missed.map(e => e.grade), ['miss']);
  assert.deepEqual([score.snapshot().scoreHalfPoints, score.snapshot().streak], [3, 0]);
  assert.equal(score.snapshot().nextRing, 3);
  assert.deepEqual(score.advance(point(9), point(11), true), [], 'same crossing never credits again');
  assert.equal(score.snapshot().scoreHalfPoints, 3);
});

test('passing a hoop plane wide outside the rim records a miss and permits following hoops', () => {
  const score = createSummitGlideRingScore([ring('A', 0), ring('B', 5)]);
  assert.equal(score.advance(point(-1, 60), point(1, 60), true)[0]?.grade, 'miss');
  const passed = score.advance(point(4), point(6), true);
  assert.equal(passed[0]?.ringId, 'B');
  assert.equal(passed[0]?.grade, 'clean');
  assert.equal(score.snapshot().streak, 1);
});

test('reject reverse passes, unauthorized samples and implausibly long motion without progress', () => {
  const score = createSummitGlideRingScore([ring('A', 0)]);
  assert.deepEqual(score.advance(point(1), point(-1), true), []);
  assert.deepEqual(score.advance(point(-1), point(1), false), []);
  assert.deepEqual(score.advance(point(-10), point(1), true), []);
  assert.deepEqual(score.advance(point(-1, Infinity), point(1), true), []);
  assert.deepEqual(score.advance(point(-1), point(1, NaN), true), []);
  assert.equal(score.snapshot().nextRing, 0);
  assert.equal(score.advance(point(-1), point(1), true)[0]?.grade, 'clean');
});

test('multiple crossings in one accepted frame preserve geometric ordering', () => {
  const score = createSummitGlideRingScore([ring('A', 0), ring('B', 2), ring('C', 4)]);
  const changed = score.advance(point(-1), point(5), true);
  assert.deepEqual(changed.map(e => e.ringId), ['A', 'B', 'C']);
  assert.deepEqual(changed.map(e => e.scoreHalfPoints), [2, 4, 6]);
  assert.equal(score.snapshot().streak, 3);
  const wrongOrder = createSummitGlideRingScore([ring('A', 0), ring('B', 2)]);
  assert.deepEqual(wrongOrder.advance(point(1), point(3), true), [], 'second ring cannot be credited before first');
});

test('course snapshot is independent of weather-shift input and landing error has separate authority', () => {
  const shifted = [ring('A', 0)].map(r => ({ ...r, east: 2 }));
  const score = createSummitGlideRingScore(shifted);
  shifted[0]!.east = 500;
  assert.equal(score.advance(point(-1, 2), point(1, 2), true)[0]?.grade, 'clean');
  assert.equal(score.landingError(point(20, 2, 495), point(20, 0, 495), true)?.horizontalMetres, 2);
  assert.equal(score.landingError(point(20, 2, 495), point(20, 0, 495), false), undefined);
  assert.equal(score.landingError(point(20, NaN), point(20), true), undefined);
  assert.equal(score.snapshot().scoreHalfPoints, 2);
});

test('bad ring layout or scoring thresholds are rejected before any flight begins', () => {
  assert.throws(() => createSummitGlideRingScore([ring('A', 0), ring('A', 10)]));
  assert.throws(() => createSummitGlideRingScore([{ ...ring('A', 0), radius: .1 }]));
  assert.throws(() => createSummitGlideRingScore([ring('A', 0)], { rimBandMetres: -1 }));
  assert.throws(() => createSummitGlideRingScore([ring('A', 0)], { maximumStepMetres: 0 }));
});
