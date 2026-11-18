import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iceFishingStations } from '../tools/voxel-tavern/town-blockout/ice-fishing-activity.ts';
import { isLakeSkateIce, lakeSkateGates, lakeSkateStation } from '../tools/voxel-tavern/town-blockout/lake-skate-course.ts';
import { canEnter, createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';

test('the skating route loops back to its station across the rendered ice', () => {
  const grid = createTerrainGrid();
  assert.deepEqual(lakeSkateGates.at(-1), lakeSkateStation);
  assert.notDeepEqual(lakeSkateGates[0], lakeSkateStation);
  const path = [lakeSkateStation, ...lakeSkateGates];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const length = Math.hypot(to.x - from.x, to.n - from.n);
    assert.ok(length > 6, 'consecutive checkpoints do not overlap');
    const steps = Math.ceil(length / .5);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const east = from.x + (to.x - from.x) * t;
      const north = from.n + (to.n - from.n) * t;
      for (const offset of [[0, 0], [3, 0], [0, 3], [-3, 0], [0, -3]]) {
        const x = east + offset[0];
        const n = north + offset[1];
        assert.ok(canEnter(x, n) && isLakeSkateIce(x, n));
        assert.equal(grid.surfaces[Math.round(x) + Math.round(n) * grid.gridWidth], 4);
      }
    }
  }
});

test('the ice skating surface excludes the shore, water inlet and snowball lane', () => {
  assert.equal(isLakeSkateIce(344, 97), false);
  assert.equal(isLakeSkateIce(302, 68.5), false);
  assert.equal(isLakeSkateIce(350, 89), false);
  assert.equal(isLakeSkateIce(lakeSkateStation.x, lakeSkateStation.n), true);
});

test('all three fishing stations are on rendered ice outside the skating corridor', () => {
  const grid = createTerrainGrid();
  const path = [lakeSkateStation, ...lakeSkateGates];
  assert.equal(iceFishingStations.length, 3);
  for (const { x, n } of iceFishingStations) {
    for (const [east, north] of [[x, n], [x - 1.5, n - 1.5], [x - .55, n + .9]]) {
      assert.ok(canEnter(east, north) && isLakeSkateIce(east, north));
      assert.equal(grid.surfaces[Math.round(east) + Math.round(north) * grid.gridWidth], 4);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const dx = b.x - a.x, dn = b.n - a.n;
        const projected = ((east - a.x) * dx + (north - a.n) * dn) / (dx * dx + dn * dn);
        const t = Math.max(0, Math.min(1, projected));
        const distance = Math.hypot(east - a.x - dx * t, north - a.n - dn * t);
        assert.ok(distance >= 4.3, 'all shore-side assets leave room for the skate course');
      }
    }
  }
});
