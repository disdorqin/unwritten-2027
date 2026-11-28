import assert from 'node:assert/strict';
import test from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {
  c2EastSector, createC2EastCanonicalGround,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-canonical';
import {
  c2EastTrailSpec, clipC2EastTrail, mountC2EastTrail, planC2EastTrail,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-trail';

/**
 * C32-P1: C2's physical share of the canonical 5.4 km summit trail.
 *
 * The canonical survey is 5528 points / 5590.1 m on the coarse 100 m block.
 * Its east-sector share is measured here, and so is the reason it cannot
 * simply be draped: on the rendered 8 m triangles it drifts up to 37.21 m and
 * most of its intervals are steeper than 12%. The physical path therefore
 * carries stone steps wherever the ground is steeper than the trail bound, and
 * those steps are counted rather than hidden.
 */

const block = createMainSummitBlock(mainSummitLayout, 347, 100);
const trail = createMainSummitTrail(block.heightAt, 347);
const ground = createC2EastCanonicalGround();
const clipped = clipC2EastTrail(trail.points);

test('the canonical trail is a real 5.4 km survey, and C2 owns 1243.9 m of it', () => {
  assert.equal(trail.points.length, 5528);
  assert.ok(Math.abs(trail.metrics.horizontalMetres - 5590.0965) < .01);
  assert.ok(trail.metrics.horizontalMetres >= 5_400, 'the original 5.4 km target is met by the survey');
  assert.ok(Math.abs(trail.metrics.maxGrade - .1194247) < 1e-6);
  assert.ok(Math.abs(clipped[0]!.east - 688.376) < .01, `entry east ${clipped[0]!.east}`);
  assert.ok(Math.abs(clipped[0]!.north - 480.494) < .01);
  assert.ok(Math.abs(clipped.at(-1)!.east - 300.329) < .01, `exit east ${clipped.at(-1)!.east}`);
  let metres = 0;
  for (let i = 1; i < clipped.length; i++) {
    metres += Math.hypot(clipped[i]!.east - clipped[i - 1]!.east, clipped[i]!.north - clipped[i - 1]!.north);
  }
  assert.ok(Math.abs(metres - 1243.9) < .5, `east share ${metres}`);
});

test('the coarse survey does not drape onto the rendered faces, and that is recorded', () => {
  let drift = 0, overBound = 0;
  for (let i = 0; i < clipped.length; i++) {
    const point = clipped[i]!;
    const face = ground.heightAt(point.east, point.north);
    if (face === undefined) continue;
    drift = Math.max(drift, Math.abs(face - point.height));
    if (i === 0) continue;
    const previous = clipped[i - 1]!;
    const run = Math.hypot(point.east - previous.east, point.north - previous.north);
    const previousFace = ground.heightAt(previous.east, previous.north);
    if (run > 1e-6 && previousFace !== undefined &&
        Math.abs(face - previousFace) / run > c2EastTrailSpec.maxGrade) overBound++;
  }
  assert.ok(Math.abs(drift - 43.81) < .05, `drift `);
  assert.ok(overBound > 480, `intervals over 12%: ${overBound}`);
});

test('the physical path seats every piece on the rendered faces inside the sector', () => {
  const plan = planC2EastTrail((e, n) => ground.heightAt(e, n), trail.points);
  assert.ok(plan.stations > 1_600, `stations `);
  assert.ok(Math.abs(plan.metres - 1243.9) < .5, `metres ${plan.metres}`);
  assert.ok(plan.pieces.length > 3_000, `pieces `);
  assert.ok(plan.treads > 1_200, `treads `);
  assert.ok(plan.steps > 1_000, `stone steps `);
  assert.ok(plan.rails > 200, `rail posts `);
  for (const piece of plan.pieces) {
    assert.ok(piece.east >= c2EastSector.west, `west leak ${piece.east}`);
    assert.ok(piece.north >= c2EastSector.south, `south leak ${piece.north}`);
    assert.ok(piece.east - c2EastSector.west >= c2EastTrailSpec.boundary - 1e-9, `seam ${piece.east}`);
    assert.ok(piece.north - c2EastSector.south >= c2EastTrailSpec.boundary - 1e-9, `seam ${piece.north}`);
    const face = ground.heightAt(piece.east, piece.north);
    assert.equal(face !== undefined, true, `no ground at ${piece.east},${piece.north}`);
    if (piece.family === 'tread') assert.ok(Math.abs(piece.y - face!) < 1e-9, 'treads sit on the face');
  }
});

test('every steep interval becomes counted stone steps instead of a false ramp', () => {
  const plan = planC2EastTrail((e, n) => ground.heightAt(e, n), trail.points);
  // One riser block at minimum per steep interval, never more than six.
  const steep = clipped.reduce((count, point, index) => {
    if (index === 0) return count;
    const previous = clipped[index - 1]!;
    const run = Math.hypot(point.east - previous.east, point.north - previous.north);
    const a = ground.heightAt(previous.east, previous.north);
    const b = ground.heightAt(point.east, point.north);
    return run > 1e-6 && a !== undefined && b !== undefined && (b - a) / run > c2EastTrailSpec.maxGrade + 1e-9
      ? count + 1 : count;
  }, 0);
  assert.ok(steep > 0);
  assert.ok(plan.steps >= steep, 'at least one riser per steep interval');
  assert.ok(plan.steps <= steep * 6, 'no interval is over-stepped');
});

test('the mounted batch, colliders and stats agree with the plan', () => {
  const asset = mountC2EastTrail((e, n) => ground.heightAt(e, n), trail.points);
  try {
    assert.equal(asset.mesh.count, asset.plan.pieces.length);
    const stats = asset.stats();
    assert.equal(stats.batches, 1);
    assert.equal(stats.lights, 0);
    assert.equal(stats.stations, asset.plan.stations);
    assert.ok(asset.colliders.length > 0, 'rails and markers are solid, treads are walkable');
    assert.equal(asset.blocked(0, 0, 0), false, 'outside the sector nothing is blocked');
    const rail = asset.plan.pieces.find(piece => piece.family === 'post')!;
    assert.equal(asset.blocked(rail.east, rail.north, rail.y + .5), true, 'a rail post blocks');
  } finally {
    asset.dispose();
    ground.dispose();
  }
});
