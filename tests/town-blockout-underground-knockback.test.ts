import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyUndergroundKnockback } from '../tools/voxel-tavern/town-blockout/underground-knockback';
import { createUndergroundMineLayout } from '../tools/voxel-tavern/town-blockout/underground-mine-layout';

type Foot = { layer: string; east: number; north: number };
const tolerance = 1e-9;

test('each confirmed weight moves directly away from the contact in bounded horizontal steps', () => {
  const start = { layer: 'mine', east: 10, north: -3 };
  const from = { layer: 'mine', east: 7, north: 1 };
  for (const [weight, metres] of [['light', .22], ['medium', .46], ['heavy', .86]] as const) {
    let foot = { ...start };
    let steps = 0;
    const result = applyUndergroundKnockback({
      from, weight, readFoot: () => foot,
      tryMove(next) {
        const east = next.east - foot.east;
        const north = next.north - foot.north;
        assert.equal(next.layer, start.layer);
        assert.ok(east > 0 && north < 0);
        assert.ok(Math.hypot(east, north) <= .05 + tolerance);
        foot = next;
        steps++;
        return true;
      },
    });
    assert.ok(result);
    assert.equal(result.blocked, false);
    assert.ok(Math.abs(result.distance - metres) < tolerance);
    assert.ok(Math.abs(foot.east - (start.east + .6 * metres)) < tolerance);
    assert.ok(Math.abs(foot.north - (start.north - .8 * metres)) < tolerance);
    assert.ok(steps >= Math.ceil(metres / .05));
  }
});

test('a heavy shove stops at the existing mine wall when checked with the player footprint', () => {
  const walker = { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 };
  const mine = createUndergroundMineLayout({
    pool: { length: 4, width: 6, depth: 1.2 },
    shoreLength: 8,
    gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
    collapse: { length: 3, width: 1.2, height: 1.3 },
    camp: { length: 10, side: 'right', extension: 5 },
    walker,
  });
  const start = { layer: 'mine', east: 1.6, north: -18 };
  const passageAt = (position: Foot) =>
    mine.queryPassage(position.east, -position.north, walker.radius, walker.standingHeight);
  const height = passageAt(start)?.floor;
  assert.ok(Number.isFinite(height));
  let foot = { ...start };
  let rejections = 0;
  const result = applyUndergroundKnockback({
    from: { ...start, east: 1.2 }, weight: 'heavy', readFoot: () => foot,
    tryMove(next) {
      assert.equal(rejections, 0);
      if (passageAt(next)?.floor !== height) {
        rejections++;
        return false;
      }
      foot = next;
      return true;
    },
  });
  assert.ok(result);
  assert.equal(result.blocked, true);
  assert.equal(rejections, 1);
  assert.ok(result.distance > 0 && result.distance < .86);
  assert.ok(Math.abs(foot.east - start.east - result.distance) < tolerance);
  assert.equal(foot.north, start.north);
  assert.equal(passageAt(foot)?.floor, height);
  assert.equal(passageAt({ ...foot, east: foot.east + .05 }), undefined);
});

test('no movement is requested for an ineligible target or invalid horizontal contact', () => {
  const foot = { layer: 'mine', east: 8, north: 12 };
  const from = { ...foot, east: 7 };
  const tryMove = () => assert.fail('invalid or unavailable target must not be moved');
  assert.equal(applyUndergroundKnockback({ from, weight: 'heavy', readFoot: () => undefined, tryMove }), undefined);
  assert.equal(applyUndergroundKnockback({
    from: { ...from, layer: 'surface' }, weight: 'heavy', readFoot: () => foot, tryMove,
  }), undefined);
  assert.equal(applyUndergroundKnockback({ from: foot, weight: 'medium', readFoot: () => foot, tryMove }), undefined);
  assert.equal(applyUndergroundKnockback({
    from: { ...from, north: Number.NaN }, weight: 'light', readFoot: () => foot, tryMove,
  }), undefined);
});
