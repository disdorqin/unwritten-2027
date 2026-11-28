import assert from 'node:assert/strict';
import test from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
import {
  c2BlocksTrail, c2CanonicalTrailPoints, c2EastWalkingStations,
  c2TrailClearance, c2TrailDistance,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-trail-corridor.ts';
import { mountC2EastLandform } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-landform.ts';
import { mountC2EastCamp } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-camp.ts';
import { mountC2EastVegetation } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-vegetation.ts';
import { mountC2EastSled } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-sled.ts';
import { mountC2EastBench } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-bench.ts';
import { mountC2EastSwitchback } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-switchback.ts';
import { mountC2EastCliffWalkway } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-east-cliff-walkway.ts';

const heightAt = createMainSummitBlock(mainSummitLayout, 348, 8).heightAt;

test('the corridor is derived from the same survey and the same clipped stations as the east trail', () => {
  assert.equal(c2CanonicalTrailPoints().length, 5528, 'canonical survey must stay read-only');
  const walking = c2EastWalkingStations();
  assert.equal(walking.length, 1692);
  assert.ok(walking.every(p => p.east >= 300 && p.north >= 480), 'walking stations must stay in the C2 sector');
  assert.equal(c2EastWalkingStations(), walking, 'stations must be cached, not rebuilt');
});

test('clearance is measured to the segment, including the clipped out-of-sector chord', () => {
  // The raw survey has no vertex within 64 m of this rail post. The east
  // trail bridges out-of-sector survey points with a 356.9 m chord; the post
  // stands 0.15 m from that chord, so a vertex-only test used to miss it.
  const e = 508.6259184866228, n = 525.9277841543233;
  assert.ok(c2TrailDistance(e, n) < 1, `expected the clipped chord, got ${c2TrailDistance(e, n)}`);
  assert.equal(c2BlocksTrail(e, n, 2.8), true);
  assert.equal(c2BlocksTrail(e, n, 0), c2TrailDistance(e, n) < c2TrailClearance);
  assert.ok(c2TrailDistance(10000, 10000) > 1000, 'far-away bodies must not be filtered');
});

test('no C2 east package blocks any of the 1692 walking stations', () => {
  const assets = [
    ['landform', mountC2EastLandform(heightAt)],
    ['camp', mountC2EastCamp(heightAt)],
    ['vegetation', mountC2EastVegetation(heightAt)],
    ['sled', mountC2EastSled(heightAt)],
    ['bench', mountC2EastBench(heightAt)],
    ['switchback', mountC2EastSwitchback(heightAt)],
    ['cliff', mountC2EastCliffWalkway(heightAt)],
  ] as const;
  try {
    const blocked = new Map<string, number>();
    for (const station of c2EastWalkingStations()) {
      for (const [name, asset] of assets) {
        if (typeof asset.blocked !== 'function') continue;
        if (asset.blocked(station.east, station.north, station.height + .05)) {
          blocked.set(name, (blocked.get(name) ?? 0) + 1);
        }
      }
    }
    assert.equal([...blocked.values()].reduce((a, b) => a + b, 0), 0,
      `C2 east packages block the walking lane: ${JSON.stringify([...blocked])}`);
  } finally {
    for (const [, asset] of assets) asset.dispose();
  }
});
