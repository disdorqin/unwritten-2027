import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

// Smooth mountain fixture. The browser survey separately injects P-1's real
// two-shoulder ground, so these standalone tests remain usable before P-1 merges.
function makeGround(deckHeight: number) {
  const outside = (value: number, min: number, max: number) => Math.max(min - value, value - max, 0);
  return (east: number, north: number) => {
    if (east < -1_100 || east > 1_100 || north < -10 || north > 1_790) return undefined;
    const hillDistance = Math.hypot(outside(east, 15, 85) / 1_300, outside(north, 975, 1_025) / 1_375);
    const hill = 150 + 650 * Math.max(0, 1 - hillDistance);
    const deckDistance = Math.hypot(outside(east, -30, 30), outside(north, -10, 40));
    return hill + (deckHeight - hill) * Math.max(0, 1 - deckDistance / 45);
  };
}

test('P-3 trail connects the surveyed gate to the summit with a graded 3 m surface', () => {
  const deckHeight = 347;
  const ground = makeGround(deckHeight);
  const trail = createMainSummitTrail(ground, deckHeight);
  const { metrics, points, sampleSurface } = trail;

  assert.deepEqual(points[0], { east: 0, north: -10, height: deckHeight });
  assert.deepEqual(points.at(-1), { east: 30, north: 982, height: 800 });
  assert.equal(sampleSurface(0, -10), deckHeight);
  assert.equal(sampleSurface(0, -10.01), undefined);
  assert.equal(sampleSurface(30, 982), 800);
  assert.equal(sampleSurface(-5, 0), undefined);
  assert.equal(sampleSurface(NaN, 30), undefined);
  assert.ok(metrics.horizontalMetres >= 5_400);
  assert.ok(metrics.surfaceMetres >= metrics.horizontalMetres);
  assert.ok(metrics.maxGrade <= 0.12);
  assert.ok(metrics.maxCutMetres > 0 && metrics.maxFillMetres > 0);
  for (const point of points) {
    assert.equal(sampleSurface(point.east, point.north), point.height);
  }

  assert.equal(trail.pavilionAnchors.length, 2);
  for (const anchor of trail.pavilionAnchors) {
    assert.ok(anchor.height >= 380 && anchor.height <= 560);
    assert.equal(sampleSurface(anchor.east, anchor.north), anchor.height);
  }
});

test('P-3 hairpin overlaps yield a shared tread and mismatched seam heights are rejected', () => {
  const trail = createMainSummitTrail(makeGround(350), 350);
  assert.ok(trail.turnarounds.length >= 2);
  for (const turn of trail.turnarounds) {
    const west = trail.sampleSurface(turn.east - 1, turn.north);
    const north = trail.sampleSurface(turn.east, turn.north + 1);
    assert.ok(west !== undefined && Math.abs(west - turn.height) < 1e-8);
    assert.ok(north !== undefined && Math.abs(north - turn.height) < 1e-8);
  }
  assert.throws(() => createMainSummitTrail(makeGround(350), 347), /surveyed/);
  assert.throws(() => createMainSummitTrail(() => undefined, 347), /missing ground/);
});
