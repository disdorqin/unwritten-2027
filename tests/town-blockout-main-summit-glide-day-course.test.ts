import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  summitGlideNineRingMetres, surveySummitGlideRings, summitGlideRingTerrainClears,
} from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';
import { shiftSummitGlideCourseWithDailyWind } from '../tools/voxel-tavern/town-blockout/main-summit-glide-day-course';

function course(t: { after(fn: () => void): void }) {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  t.after(block.dispose);
  const launch = { east: 62.5, north: 975, height: 800, heading: Math.PI, speed: 7.5,
    drop: 800 - block.heightAt(62.5, 935)!, pathClear: true, claimed: true };
  const rings = surveySummitGlideRings(launch, block.heightAt, summitGlideNineRingMetres);
  assert.equal(rings.length, 9, 'official F-1 snow-wing flight must cover nine survey points');
  return { block, launch, rings };
}

test('ZD-08 nine rings survey from the accepted F-1 flight with safe terrain clearance', t => {
  const { block, rings, launch } = course(t);
  assert.deepEqual(rings.map(ring => ring.id), Array.from({ length: 9 }, (_, i) => `ring-${i + 1}`));
  assert.ok(rings.every(ring => summitGlideRingTerrainClears(ring, block.heightAt)));
  assert.ok(rings.every((ring, i) => ring.north < launch.north - summitGlideNineRingMetres[i]! + .01 &&
    ring.north > launch.north - summitGlideNineRingMetres[i]! - .01));
  assert.deepEqual(surveySummitGlideRings(launch, block.heightAt).map(ring => ring.id),
    ['ring-1', 'ring-2', 'ring-3'], 'old review stays at three rings');
});

test('ZD-08 wind takes one host-supplied daily observation, preserving exactly the same day layout', t => {
  const { block, rings } = course(t);
  const original = rings.map(ring => ({ ...ring }));
  const gust = { dayId: 'game-day-204', eastMetresPerSecond: 4, northMetresPerSecond: 3 };
  const a = shiftSummitGlideCourseWithDailyWind(rings, gust, block.heightAt);
  const b = shiftSummitGlideCourseWithDailyWind(rings, { ...gust }, block.heightAt);
  assert.ok(a && b);
  assert.deepEqual(a, b, 'same official weather observation => identical ring layout');
  assert.equal(a.rings.length, 9);
  assert.ok(a.rings.some((ring, i) => Math.abs(ring.east - rings[i]!.east) > .01));
  assert.ok(a.rings.every(ring => summitGlideRingTerrainClears(ring, block.heightAt)));
  assert.deepEqual(rings, original, 'host wind must never mutate the historic surveyed geometry');
});

test('ZD-08 another official day wind changes the visible lineup; headwind lowers rings', t => {
  const { block, rings } = course(t);
  const northHeadwind = shiftSummitGlideCourseWithDailyWind(rings,
    { dayId: 'day-A', eastMetresPerSecond: 0, northMetresPerSecond: 6 }, block.heightAt);
  const next = shiftSummitGlideCourseWithDailyWind(rings,
    { dayId: 'day-B', eastMetresPerSecond: 5, northMetresPerSecond: 0 }, block.heightAt);
  assert.ok(northHeadwind && next);
  assert.notDeepEqual(northHeadwind.rings, next.rings);
  assert.ok(northHeadwind.rings.every((ring, i) => ring.height < rings[i]!.height));
  assert.ok(next.rings.every((ring, i) => Math.abs(ring.east - rings[i]!.east) <= 3));
});

test('ZD-08 rejects manufactured wind, untrusted date stamps and geometrically unsafe daily lines', t => {
  const { block, rings } = course(t);
  for (const value of [NaN, Infinity, 50]) {
    assert.equal(shiftSummitGlideCourseWithDailyWind(rings,
      { dayId: 'day-1', eastMetresPerSecond: value, northMetresPerSecond: 0 }, block.heightAt), undefined);
  }
  assert.equal(shiftSummitGlideCourseWithDailyWind(rings,
    { dayId: '', eastMetresPerSecond: 1, northMetresPerSecond: 0 }, block.heightAt), undefined);
  assert.equal(shiftSummitGlideCourseWithDailyWind(rings.slice(0, 3),
    { dayId: 'day-1', eastMetresPerSecond: 1, northMetresPerSecond: 0 }, block.heightAt), undefined);
  assert.equal(shiftSummitGlideCourseWithDailyWind(rings,
    { dayId: 'day-1', eastMetresPerSecond: 1, northMetresPerSecond: 0 },
    () => 900), undefined, 'unsafe shifted rings cannot silently publish');
});

test('ZD-08 refuses malformed station targets instead of building a bogus course', t => {
  const { block, launch } = course(t);
  for (const values of [[], [60, 60], [70, 60], [NaN], [1_201],
    Array.from({ length: 11 }, (_, i) => i + 1)]) {
    assert.throws(() => surveySummitGlideRings(launch, block.heightAt, values), RangeError);
  }
});
