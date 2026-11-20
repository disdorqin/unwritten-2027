import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFloorRadius, meteorCraterRimRadius,
  type MeteorCraterPlan,
} from '../tools/voxel-tavern/town-blockout/meteor-crater.ts';

// Relative fixtures exercise the geometry. They are not approved west-region layout values.
const plan: MeteorCraterPlan = {
  terraces: [
    { outerRadius: 50, innerRadius: 46, depth: 7 },
    { outerRadius: 41, innerRadius: 37, depth: 16 },
    { outerRadius: 32, innerRadius: 27, depth: 26 },
  ],
  mainTrail: { startBearing: .7, turns: 3.5, halfWidth: 1, shoulderWidth: 1, maxGrade: .1 },
};

test('crater fixes the rim, three descending terraces and a flat floor in relative space', () => {
  const crater = createMeteorCrater(plan);
  assert.deepEqual([meteorCraterRimRadius * 2, meteorCraterFloorRadius * 2, meteorCraterDepth], [110, 40, 35]);
  assert.equal(crater.heightOffsetAt(0, 0), -35);
  assert.equal(crater.heightOffsetAt(20, 0), -35);
  assert.equal(crater.heightOffsetAt(0, 55), 0);
  assert.equal(crater.heightOffsetAt(56, 0), undefined);
  assert.equal(crater.heightOffsetAt(NaN, 0), undefined);
  for (const { innerRadius, outerRadius, depth } of plan.terraces) {
    for (const r of [innerRadius, (innerRadius + outerRadius) / 2, outerRadius]) {
      assert.equal(crater.terraceHeightOffsetAt(r), -depth);
    }
  }
  assert.ok(Math.abs(crater.terraceHeightOffsetAt(53)! + 2.8) < 1e-10);
});

test('the clockwise descending path produces a continuous graded and traversable centreline', t => {
  const crater = createMeteorCrater(plan);
  const entry = crater.mainTrailPoint(0);
  const exit = crater.mainTrailPoint(1);
  assert.ok(Math.abs(Math.hypot(entry.east, entry.north) - 55) < 1e-10);
  assert.ok(Math.abs(Math.hypot(exit.east, exit.north) - 20) < 1e-10);
  assert.equal(entry.heightOffset, 0);
  assert.equal(exit.heightOffset, -35);

  const sampleEdges = 1500;
  let longestStep = 0;
  let measuredGrade = 0;
  let heightError = 0;
  let previous = entry;
  for (let i = 0; i <= sampleEdges; i++) {
    const point = crater.mainTrailPoint(i / sampleEdges);
    const surface = crater.heightOffsetAt(point.east, point.north);
    assert.ok(surface !== undefined);
    heightError = Math.max(heightError, Math.abs(surface - point.heightOffset));
    const step = Math.hypot(point.east - previous.east, point.north - previous.north);
    if (i > 0) {
      assert.ok(point.heightOffset < previous.heightOffset);
      assert.ok(point.east * previous.north - point.north * previous.east > 0);
      longestStep = Math.max(longestStep, step);
      measuredGrade = Math.max(measuredGrade, (previous.heightOffset - point.heightOffset) / step);
    }
    previous = point;
  }
  assert.ok(heightError < 1e-10);
  assert.ok(measuredGrade <= plan.mainTrail.maxGrade);
  assert.ok(measuredGrade <= crater.maxMainTrailGrade + 1e-6);
  t.diagnostic(`centreline ${sampleEdges + 1} points, longest step ${longestStep.toFixed(6)} m, ` +
    `sampled max grade ${(100 * measuredGrade).toFixed(6)}%, analytical ${(100 * crater.maxMainTrailGrade).toFixed(6)}%, ` +
    `max surface error ${heightError.toExponential(2)} m`);
});

test('the tread has a radial flat and a continuous shoulder, and joins the rim and floor', () => {
  const crater = createMeteorCrater(plan);
  const point = crater.mainTrailPoint(.4);
  const radius = Math.hypot(point.east, point.north);
  const offset = (delta: number) => crater.heightOffsetAt(point.east * (1 + delta / radius), point.north * (1 + delta / radius));
  for (const delta of [-.8, .8]) assert.ok(Math.abs(offset(delta)! - point.heightOffset) < 1e-10);
  const shoulderHeight = offset(1.5)!;
  const platformHeight = crater.terraceHeightOffsetAt(radius + 1.5)!;
  assert.ok(Math.abs(shoulderHeight - (point.heightOffset + platformHeight) / 2) < 1e-10);
  assert.ok(Math.abs(offset(2.2)! - crater.terraceHeightOffsetAt(radius + 2.2)!) < 1e-10);

  for (const [progress, boundary, expected] of [[.015, 55, 0], [.985, 20, -35]]) {
    const near = crater.mainTrailPoint(progress);
    const r = Math.hypot(near.east, near.north);
    const edge = boundary + (boundary === 55 ? -1 : 1) * 1e-7;
    assert.ok(Math.abs(crater.heightOffsetAt(near.east * edge / r, near.north * edge / r)! - expected) < 1e-6);
  }
});

test('invalid terrace and main path plans are rejected instead of silently reshaping the site', () => {
  assert.throws(() => createMeteorCrater({ ...plan, terraces: [plan.terraces[1], plan.terraces[0], plan.terraces[2]] }), /terraces/);
  assert.throws(() => createMeteorCrater({ ...plan, mainTrail: { ...plan.mainTrail, turns: 12 } }), /corridor/);
  assert.throws(() => createMeteorCrater({ ...plan, mainTrail: { ...plan.mainTrail, turns: .5 } }), /grade/);
  assert.throws(() => createMeteorCrater(plan).mainTrailPoint(1.01), /progress/);
});

test('preview triangles cover the crater trail and its standing band through both seams', t => {
  const crater = createMeteorCrater(plan);
  const { positions, indices, heightAt } = crater.buildPreviewSurface(meteorCraterRimRadius / 30);
  assert.equal(heightAt(0, 0), undefined);
  assert.equal(heightAt(0, 10), -meteorCraterDepth);
  assert.equal(heightAt(0, 62), undefined);
  assert.equal(crater.heightOffsetAt(0, 56), undefined);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(index => index * 3);
    const abx = positions[b] - positions[a], acx = positions[c] - positions[a];
    const abz = positions[b + 2] - positions[a + 2], acz = positions[c + 2] - positions[a + 2];
    assert.ok(abz * acx - abx * acz > 0, 'top-face normal must point up');
  }

  const intervals = 1500;
  for (const offset of [0, -.27, .27]) {
    let previous: { east: number; north: number; y: number } | undefined;
    let maxGrade = 0, maxHeightError = 0;
    for (let i = 0; i <= intervals; i++) {
      const { east, north, heightOffset } = crater.mainTrailPoint(i / intervals);
      const scale = 1 + offset / Math.hypot(east, north);
      const pointEast = east * scale, pointNorth = north * scale;
      const y = heightAt(pointEast, pointNorth);
      assert.notEqual(y, undefined, `trail sample ${i} at offset ${offset} m must be on a rendered triangle`);
      if (y === undefined) throw new Error('Trail sample must have a height.');
      if (previous) {
        maxGrade = Math.max(maxGrade, Math.abs(y - previous.y) /
          Math.hypot(pointEast - previous.east, pointNorth - previous.north));
      }
      maxHeightError = Math.max(maxHeightError, Math.abs(y - heightOffset));
      previous = { east: pointEast, north: pointNorth, y };
    }
    assert.ok(maxGrade <= plan.mainTrail.maxGrade, `offset ${offset} m peak ${maxGrade}`);
    assert.ok(maxHeightError < .001, `offset ${offset} m height error ${maxHeightError}`);
    t.diagnostic(`offset ${offset} m: ${intervals + 1}/${intervals + 1}, peak ${(100 * maxGrade).toFixed(6)}%, ` +
      `height error ${maxHeightError.toFixed(9)} m, ${indices.length / 3} triangles`);
  }
});
