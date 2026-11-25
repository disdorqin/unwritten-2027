import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFrontRidgeSwitchbackRoad,
} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';

/**
 * 甲案 acceptance (总控裁定 2026-11-24): the viewer walking step now
 * threads the player's current support height into the corridor
 * heightAt call (surfaceAt -> outdoorSurfaceAt -> heightAt with hint),
 * the hint chain D's repair expects. This test re-draws the two named
 * points' band walks through exactly that chain — hint = previous
 * sample's height, as tryMove threads `ground` — and asserts the named
 * discs are flip-free, with a no-hint control proving the test sees
 * the defect the wiring closes.
 */
const TOE_CROSS = { east: 422.9, north: 461.3 };
const BASE_LEG = { east: 528.8, north: 365.2 };
const DISC_RADIUS = 8;

function walk(road: ReturnType<typeof createFrontRidgeSwitchbackRoad>, offset: number, useHint: boolean) {
  let toeFlips = 0, baseFlips = 0, centreFlips = 0, samples = 0;
  let hint: number | undefined;
  const points = road.centreline;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const segLen = b.cum - a.cum;
    const steps = Math.max(1, Math.round(segLen / 0.25));
    let dirE = b.east - a.east, dirN = b.north - a.north;
    const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
    for (let sIdx = (i === 0 ? 0 : 1); sIdx <= steps; sIdx++) {
      const t = sIdx / steps;
      const e = a.east + (b.east - a.east) * t - dirN * offset;
      const n = a.north + (b.north - a.north) * t + dirE * offset;
      // tryMove threads ground (the previous step's surface) as hint;
      // landings keep the no-hint call — this is the control mode.
      const h = road.heightAt(e, n, useHint ? hint : undefined);
      assert.notEqual(h, undefined, `hole at (${e.toFixed(1)}, ${n.toFixed(1)})`);
      if (hint !== undefined && useHint) {
        if (Math.abs(h! - hint) > 0.43) {
          if (offset === 0) centreFlips++;
          if (Math.hypot(e - TOE_CROSS.east, n - TOE_CROSS.north) < DISC_RADIUS) toeFlips++;
          if (Math.hypot(e - BASE_LEG.east, n - BASE_LEG.north) < DISC_RADIUS) baseFlips++;
        }
      }
      hint = h;
      samples++;
    }
  }
  return { toeFlips, baseFlips, centreFlips, samples };
}

test('甲案: viewer hint chain clears the two named stacked points on the band walks', () => {
  const road = createFrontRidgeSwitchbackRoad();
  for (const offset of [-1.2, 0, 1.2]) {
    const { toeFlips, baseFlips, centreFlips } = walk(road, offset, true);
    assert.equal(toeFlips, 0, `toe crossing (422.9,461.3) still flips at offset ${offset}`);
    assert.equal(baseFlips, 0, `E530 leg (528.8,365.2) still flips at offset ${offset}`);
    assert.equal(centreFlips, 0, `centreline still flips at offset ${offset}`);
  }
  road.dispose();
});

test('甲案 control: the same walk without the hint still flips at the toe crossing', () => {
  const road = createFrontRidgeSwitchbackRoad();
  // The control replays the walk with hint = undefined at every sample
  // (the pre-甲案 viewer call). It must see the known defect, or the
  // test above could not prove the wiring closes anything.
  let controlFlips = 0;
  const points = road.centreline;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const segLen = b.cum - a.cum;
    const steps = Math.max(1, Math.round(segLen / 0.25));
    let dirE = b.east - a.east, dirN = b.north - a.north;
    const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
    for (const offset of [-1.2, 1.2]) {
      let localPrev: number | undefined;
      for (let sIdx = (i === 0 ? 0 : 1); sIdx <= steps; sIdx++) {
        const t = sIdx / steps;
        const e = a.east + (b.east - a.east) * t - dirN * offset;
        const n = a.north + (b.north - a.north) * t + dirE * offset;
        const h = road.heightAt(e, n);
        if (h === undefined) continue;
        if (localPrev !== undefined && Math.abs(h - localPrev) > 0.43 &&
          Math.hypot(e - TOE_CROSS.east, n - TOE_CROSS.north) < DISC_RADIUS) controlFlips++;
        localPrev = h;
      }
    }
  }
  assert.ok(controlFlips >= 1, `control walk should flip at the toe crossing, got ${controlFlips}`);
  road.dispose();
});
