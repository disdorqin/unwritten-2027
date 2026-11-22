import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CatmullRomCurve3, Vector3 } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {
  buildCraterRailExtension, craterBranchControlLine,
} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import { buildTownRailRoute } from '../tools/voxel-tavern/town-blockout/town-railway';
import { craterBeltTrackCorridor } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';

const grid = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
const ext = buildCraterRailExtension(grid, road);

test('rail extension: alignment survey is complete and at grade at both stations', () => {
  const { alignment } = ext;
  assert.ok(alignment.length >= 950 && alignment.length <= 1100,
    `branch length ${alignment.length.toFixed(1)} m outside the surveyed band`);
  assert.deepEqual(alignment.divergence, { east: 477, north: 335 });
  assert.deepEqual(alignment.stations.map(s => s.id), ['shankou-station', 'kengkou-station']);
  assert.deepEqual(alignment.boards.map(s => s.id),
    ['shankou-timetable', 'kengkou-timetable', 'kengkou-timetable-wall']);
  assert.deepEqual(alignment.boards[0], { id: 'shankou-timetable', east: 308, north: 506 });
  // Timetable wall (K-14/15) stands at the shelter's west end, mirroring the
  // chalk board at the east end: same dz, 9.8 m apart along the shelter.
  const chalk = alignment.boards[1]!, wall = alignment.boards[2]!;
  assert.ok(Math.abs(Math.hypot(wall.east - chalk.east, wall.north - chalk.north) - 9.8) < 0.5,
    `timetable wall ${wall.east},${wall.north} not opposite the chalk board`);
  assert.deepEqual(alignment.whistlePoints.map(s => s.id), ['shankou-portal', 'kengkou-approach']);
  const shankou = alignment.stations[0];
  assert.ok(Math.abs(shankou.railY - (grid.heightAt(296, 502) + .62)) <= .8,
    `shankou railY ${shankou.railY} not at grade over ground ${grid.heightAt(296, 502)}`);
  const kengkou = alignment.stations[1];
  const kGround = road.heightAt(-44.5, 168)!;
  assert.ok(Math.abs(kengkou.railY - (kGround + .62)) <= .8,
    `kengkou railY ${kengkou.railY} not at grade over ground ${kGround}`);
});

test('rail extension: the divergence meets the loop where the loop is at grade', () => {
  const loop = buildTownRailRoute(grid);
  let nearest = loop.points[0], best = Infinity;
  for (const p of loop.points) {
    const d = (p.x - 477) ** 2 + (-p.z - 335) ** 2;
    if (d < best) { best = d; nearest = p; }
  }
  const rise = nearest.y - grid.heightAt(nearest.x, -nearest.z);
  assert.ok(rise <= 2.5, `loop rise at the divergence is ${rise.toFixed(1)} m — not an at-grade junction`);
});

test('rail extension: profile hugs the ground and curves stay traversable', () => {
  for (const s of ext.samples) {
    const clearance = s.y - s.ground;
    assert.ok(clearance >= .4 && clearance <= 2.6,
      `clearance ${clearance.toFixed(2)} at (${s.east.toFixed(0)},${s.north.toFixed(0)})`);
  }
  const curve = new CatmullRomCurve3(
    craterBranchControlLine.map(([x, n]) => new Vector3(x, 0, -n)), false, 'centripetal');
  curve.arcLengthDivisions = 2400;
  const pts = Array.from({ length: 800 }, (_, i) => curve.getPointAt(i / 799));
  let minR = Infinity;
  for (let i = 8; i < pts.length - 8; i++) {
    const a = pts[i - 8], b = pts[i], c = pts[i + 8];
    const ab = Math.hypot(b.x - a.x, b.z - a.z);
    const bc = Math.hypot(c.x - b.x, c.z - b.z);
    const ac = Math.hypot(c.x - a.x, c.z - a.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    if (area2 < 1e-9) continue;
    minR = Math.min(minR, ab * bc * ac / (2 * area2));
  }
  assert.ok(minR >= 22, `windowed min curve radius ${minR.toFixed(1)} m too tight for the loop's stock`);
});

test('rail extension: narrow gauge reaches the smelter door along the reserved corridor', () => {
  const [b, r] = craterBeltTrackCorridor.at(-1)!;
  const rad = b * Math.PI / 180;
  const door = {
    east: road.anchor.east + r * Math.sin(rad),
    north: road.anchor.north + r * Math.cos(rad),
  };
  const end = ext.narrowSamples.at(-1)!;
  const d = Math.hypot(end.east - door.east, end.north - door.north);
  assert.ok(d <= 1, `narrow-gauge end is ${d.toFixed(2)} m from the corridor end at the smelter door`);
});

test('rail extension: ledger stays inside the mainline-3 budget', () => {
  let draws = 0, tris = 0, lights = 0;
  ext.group.traverse(n => {
    const node = n as { isLight?: boolean; isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number } } } };
    if (node.isLight) lights++;
    if (node.isMesh && node.geometry) {
      draws++;
      tris += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    }
  });
  assert.ok(draws <= 20, `draws ${draws} over the mainline-3 cap`);
  assert.ok(tris <= 60000, `tris ${Math.round(tris)} over the mainline-3 cap`);
  assert.equal(lights, 1, 'exactly one real light (crater-mouth station lamp)');
});
