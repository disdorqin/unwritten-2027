import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTowerLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tower.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { courtyardCollisionSize } from '../tools/voxel-tavern/town-blockout/extension-streets.ts';
import { findNearestLegalSpawn } from '../tools/voxel-tavern/town-blockout/town-spawn.ts';
import { canEnter, createTerrainGrid, layout, riverX } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water.ts';

const grid = createTerrainGrid();
const water = createTownWater(grid);
const towerPlot = layout.plots.find(plot => plot.id === 'clocktower')!;
const tower = buildTowerLandmark(towerPlot);
tower.position.set(towerPlot.origin[0], towerPlot.origin[2], -towerPlot.origin[1]);
const { colliders, floors } = readWalkGeometry(tower);

function legalGround(x: number, n: number) {
  if (!canEnter(x, n) || water.at(x, n)) return undefined;
  const bodyRadius = .27;
  let height = grid.heightAt(x, n);
  const overlaps = ({ min, max }: (typeof colliders)[number]) => {
    const dx = Math.max(min[0] - x, x - max[0], 0);
    const dz = Math.max(min[2] + n, -n - max[2], 0);
    return dx * dx + dz * dz < bodyRadius * bodyRadius;
  };
  const limit = height + .43;
  for (const floor of floors) {
    if (floor.max[1] <= limit && overlaps(floor)) height = Math.max(height, floor.max[1]);
  }
  if (colliders.concat(floors).some(box =>
    height + .025 < box.max[1] && height + 1.8 - .025 > box.min[1] && overlaps(box))) return undefined;
  return height;
}

test('a clocktower wall landing recovers at the nearest accessible paving point', t => {
  // The fourteen-metre wing has moved its actual south wall to N216.
  const blocked = { x: 216, n: 216 };
  assert.equal(legalGround(blocked.x, blocked.n), undefined);
  const spot = findNearestLegalSpawn(blocked, legalGround);
  assert.deepEqual(spot, { x: 216, n: 215.5, ground: 12 });
  assert.equal(legalGround(spot.x, spot.n), spot.ground);
  t.diagnostic('clocktower: E216 N216 at the enlarged south wall → E216 N215.5 on the level apron');
});

test('a landing in the middle of the river recovers on a dry bank and retains a valid bridge spawn', t => {
  const river = { x: riverX(120), n: 120 };
  assert.equal(water.at(river.x, river.n)?.mode, 'swim');
  assert.equal(legalGround(river.x, river.n), undefined);
  const spot = findNearestLegalSpawn(river, legalGround);
  assert.ok(spot);
  assert.equal(legalGround(spot.x, spot.n), spot.ground);
  assert.ok(!water.at(spot.x, spot.n));
  assert.ok(Math.hypot(spot.x - river.x, spot.n - river.n) < 32);
  t.diagnostic(`river: E${river.x.toFixed(2)} N120 → E${spot.x.toFixed(2)} N${spot.n.toFixed(2)} dry at y${spot.ground.toFixed(2)}`);

  const bridge = layout.bridges[0];
  const original = { x: riverX(bridge.north), n: bridge.north };
  assert.deepEqual(findNearestLegalSpawn(original, legalGround), { ...original, ground: bridge.height });
});

test('spawn recovery rejects malformed input and reports no answer for an entirely obstructed search radius', () => {
  assert.equal(findNearestLegalSpawn({ x: NaN, n: 2 }, () => 10), undefined);
  assert.equal(findNearestLegalSpawn({ x: 0, n: 0 }, () => undefined), undefined);
});

test('bench and planter collision enclose every rotated corner at three tested headings', t => {
  for (const [variant, width, depth] of [[0, 2.42, .82], [1, 1.59, 1.23], [2, 2.63, 1.23]]) {
    const diagnostics: string[] = [];
    for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
      const after = courtyardCollisionSize(variant, yaw);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const before = { width: Math.abs(c) * 2.18 + .42, depth: Math.abs(s) * 2.18 + .42 };
      const corners = [-1, 1].flatMap(i => [-1, 1].map(j =>
        [c * i * width / 2 - s * j * depth / 2, s * i * width / 2 + c * j * depth / 2]));
      const extentX = Math.max(...corners.map(([x]) => Math.abs(x)));
      const extentN = Math.max(...corners.map(([, n]) => Math.abs(n)));
      const beforeIntrusion = Math.max(0, extentX - before.width / 2, extentN - before.depth / 2);
      const afterIntrusion = Math.max(0, extentX - after.width / 2, extentN - after.depth / 2);
      assert.ok(beforeIntrusion > 0);
      assert.equal(afterIntrusion, 0);
      assert.ok(Math.abs((after.width / 2 - extentX) - .05) < 1e-9);
      assert.ok(Math.abs((after.depth / 2 - extentN) - .05) < 1e-9);
      diagnostics.push(`${(yaw * 180 / Math.PI).toFixed(0)}° ${beforeIntrusion.toFixed(3)}→0 m`);
    }
    t.diagnostic(`variant ${variant}: ${diagnostics.join(', ')}`);
  }
});
