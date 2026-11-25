import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { createFrontRidgeSwitchbackRoad } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';

// T5 seam package (分支窗 A): the walking fold wires
// createFrontRidgeSwitchbackRoad().heightAt into the viewer's
// outdoorSurfaceAt ahead of the water/grid fallback. These are the
// fold-level invariants the wiring relies on, measured at fold time
// (2026-11-22):
//  - the corridor answers everywhere on its own centrelines (no holes
//    left from the pre-D-6 build, whose toe was ~73% undefined);
//  - at a centreline sample the answer is exactly that sample's road
//    profile (+0.06 standing offset);
//  - the entry approach meets the main corridor at the junction with
//    no step, and the pass start matches the 山口 teleport landing.
// NOT asserted: between-sample continuity. heightAt picks the
// horizontally nearest sample, so where switchback passes stack within
// ~3 m the surface can flip to a neighbouring pass between samples
// (measured: ~6% of toe samples, ~8% of summit-spiral samples deviate
// > stepHeight from the local profile at 0.25 m steps). That defect
// belongs to the corridor module (D) and is reported with the seam
// package; when it is fixed, a continuity assertion belongs here.

type RoadPoint = { east: number; north: number; height: number; cum: number };

test('fold surface: heightAt is exact at every centreline and entry sample', () => {
  const road = createFrontRidgeSwitchbackRoad();
  const lines = [road.centreline, road.entryCentreline] as RoadPoint[][];
  let checked = 0;
  for (const line of lines) {
    for (const point of line) {
      const h = road.heightAt(point.east, point.north);
      assert.ok(h !== undefined, `heightAt undefined at centreline sample (${point.east}, ${point.north})`);
      assert.ok(Math.abs(h - (point.height + 0.06)) <= 0.02,
        `heightAt ${h.toFixed(3)} != profile ${(point.height + 0.06).toFixed(3)} at (${point.east.toFixed(1)}, ${point.north.toFixed(1)})`);
      checked++;
    }
  }
  assert.ok(checked > 1000, `expected the full corridor, checked ${checked}`);
});

test('fold surface: no undefined holes along either polyline at 0.5 m steps', () => {
  const road = createFrontRidgeSwitchbackRoad();
  const lines = [road.centreline, road.entryCentreline] as RoadPoint[][];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!, b = line[i + 1]!;
      const segLen = Math.hypot(b.east - a.east, b.north - a.north);
      const steps = Math.max(1, Math.round(segLen / 0.5));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const h = road.heightAt(a.east + (b.east - a.east) * t, a.north + (b.north - a.north) * t);
        assert.ok(h !== undefined, `hole between (${a.east.toFixed(1)}, ${a.north.toFixed(1)}) and (${b.east.toFixed(1)}, ${b.north.toFixed(1)})`);
      }
    }
  }
});

test('fold surface: entry meets the junction flush and the pass start meets the teleport landing', () => {
  const road = createFrontRidgeSwitchbackRoad();
  const grid = createTerrainGrid();
  const junction = road.heightAt(270, 460);
  assert.ok(junction !== undefined);
  const entry = road.entryCentreline as RoadPoint[];
  const entryEnd = entry[entry.length - 1]!;
  const entryEndH = road.heightAt(entryEnd.east, entryEnd.north);
  assert.ok(entryEndH !== undefined);
  assert.ok(Math.abs(entryEndH - junction) <= 0.02,
    `entry end ${entryEndH.toFixed(3)} vs junction ${junction.toFixed(3)}`);
  const start = road.heightAt(290, 300);
  assert.ok(start !== undefined);
  assert.ok(Math.abs(start - 12.86) <= 0.05, `pass start ${start.toFixed(3)} (D-6 measured profile 12.86)`);
  assert.ok(Math.abs(start - (grid.heightAt(290, 300) + 0.06)) <= 0.05,
    `pass start should ride the grid landing + road offset, got ${start.toFixed(3)} vs grid ${grid.heightAt(290, 300).toFixed(3)}`);
});
