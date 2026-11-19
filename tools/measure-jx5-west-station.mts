import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read-only survey. Pass the checkout root containing the pinned game sources and their installed dependencies.
const [checkout] = process.argv.slice(2);
assert.ok(checkout, 'Usage: node --import tsx tools/measure-jx5-west-station.mts TOWN_CHECKOUT');
const root = resolve(checkout);
const source = (name: string) =>
  import(pathToFileURL(resolve(root, 'tools/voxel-tavern/town-blockout', name + '.ts')).href);
const require = createRequire(resolve(root, 'package.json'));
const { Group } = require('three');
const [
  { createTerrainGrid, canEnter }, { createTownRailway }, { readWalkGeometry },
  { buildPineCamp }, { addScenery }, { addDistrictHousing }, { addStreetscape }, { addForestDensity },
  { extensionRoadClearance, extensionStreetClearance }, { mirrorSouthShorePath },
] = await Promise.all([
  source('terrain'), source('town-railway'), source('landmark-kit'),
  source('town-pine-camp'), source('scenery'), source('district-layout'), source('streetscape'),
  source('forest-density'), source('town-extension'), source('mirror-lake-west-shore'),
]);
const { isMirrorLakeIce } = await import(pathToFileURL(resolve(root, 'src/shared/mirror-lake.ts')).href);
const grid = createTerrainGrid();
const railway = createTownRailway(grid, () => 0);
const { colliders, floors } = readWalkGeometry(railway.group);
const { points } = railway.route;
const landscape = new Group();
const pine = buildPineCamp(grid);
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
  }) }),
} });
let scenery;
try {
  scenery = addScenery(landscape, grid, pine.keepClear);
} finally {
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
}
const districts = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
const streets = addStreetscape(landscape, grid, (e, n, r) =>
  districts.keepClear(e, n, r) || extensionRoadClearance(e, n, r) || pine.keepClear(e, n, r));
const forest = addForestDensity(landscape, grid,
  (e, n, r) => districts.keepClear(e, n, r) || streets.occupied(e, n, r) || pine.keepClear(e, n, r),
  (e, n, r) => extensionRoadClearance(e, n, r) || railway.keepClear(e, n, r) || extensionStreetClearance(e, n, r));

type Point = [east: number, north: number, elevation: number];
type Pair = [number, number];
type Box = { min: [number, number, number]; max: [number, number, number] };
const berth = railway.stops.find((s: { id: string }) => s.id === 'mirror-lake-station');
assert.ok(berth);
const [joinEast, joinNorth] = mirrorSouthShorePath.at(-1)!;
const join: Point = [joinEast, joinNorth, grid.heightAt(joinEast, joinNorth)];
const radius = .27;
const epsilon = .025;
const height = 1.95; // Same conservative vertical envelope as the A-03 survey.
const f6: Pair = [26.35, 185]; // Exclusion only. The fishing circle's acceptance is not re-run here.
const segments = points.map((a: { x: number; z: number }, i: number) => {
  const b = points[(i + 1) % points.length];
  return { a, dx: b.x - a.x, dn: a.z - b.z };
});
const overlaps = (e: number, n: number, { min, max }: Box) =>
  Math.hypot(Math.max(min[0] - e, e - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < radius;
const contacts = (e: number, n: number, y: number, box: Box) =>
  y + epsilon < box.max[1] && y + height > box.min[1] && overlaps(e, n, box);
const relevant = (box: Box) => box.max[0] > 20 && box.min[0] < 42 && box.min[2] < -172 && box.max[2] > -195;
const localRail = colliders.filter(relevant);
const localFloors = floors.filter(relevant);

function axisDistance(e: number, n: number) {
  let nearest = Infinity;
  for (const { a, dx, dn } of segments) {
    const qx = e - a.x;
    const qn = n + a.z;
    const t = Math.max(0, Math.min(1, (qx * dx + qn * dn) / (dx * dx + dn * dn)));
    nearest = Math.min(nearest, Math.hypot(qx - dx * t, qn - dn * t));
  }
  return nearest;
}

const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a: Point, b: Point, fraction: number): Point => [
  a[0] + (b[0] - a[0]) * fraction,
  a[1] + (b[1] - a[1]) * fraction,
  a[2] + (b[2] - a[2]) * fraction,
];
function sectionRows(path: Point[], halfWidth: number) {
  const normals: Pair[] = path.slice(0, -1).map((a, i) => {
    const b = path[i + 1];
    const d = length(a, b);
    return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  });
  return path.map((p, i) => {
    const prev = normals[Math.max(0, i - 1)];
    const next = normals[Math.min(i, normals.length - 1)];
    const scale = halfWidth / (1 + prev[0] * next[0] + prev[1] * next[1]);
    const [dx, dn] = [scale * (prev[0] + next[0]), scale * (prev[1] + next[1])];
    return [[p[0] - dx, p[1] - dn, p[2]], [p[0] + dx, p[1] + dn, p[2]]] as [Point, Point];
  });
}

function triangleRuns([a, b]: readonly Point[], [c, d]: readonly Point[]) {
  return [[a, b, c], [d, c, b]].map(([p, q, r]) =>
    -((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / length(p, q));
}

function gradeProfile(geometry: Pair[], initial: number, final: number) {
  const shape = geometry.map(([e, n]): Point => [e, n, initial]);
  const rows = sectionRows(shape, 1);
  const runs = rows.slice(0, -1).map((row, i) => Math.min(...triangleRuns(row, rows[i + 1])));
  assert.ok(runs.every(run => run > 0), 'The strip must have no folded triangles.');
  const governed = runs.slice(1); // Keep the first span flat to clear the existing floor overlap.
  const total = governed.reduce((sum, run) => sum + run, 0);
  let walked = 0;
  return shape.map(([e, n], index): Point => {
    if (index >= 2) walked += governed[index - 2];
    return [e, n, index === shape.length - 1 ? final : initial + (final - initial) * walked / total];
  });
}

function check(name: string, path: Point[], halfWidth = 1) {
  const rows = sectionRows(path, halfWidth);
  const blocks: Record<string, { samples: number; first: Point }> = {};
  const hit = (id: string, p: Point) => { (blocks[id] ??= { samples: 0, first: p }).samples++; };
  let centerline = 0, centerGrade = 0, worstRibbonGrade = 0, railGap = Infinity, fishingGap = Infinity;
  let minimumHeightDelta = Infinity, maximumHeightDelta = -Infinity, strictIceSamples = 0, samples = 0;
  let steepestSpan: number | undefined, foldedFaces = 0;
  for (const [i, center] of path.slice(0, -1).entries()) {
    const next = path[i + 1], distance = length(center, next), rise = Math.abs(next[2] - center[2]);
    centerline += distance;
    centerGrade = Math.max(centerGrade, rise / distance);
    const [a, b] = rows[i], [c, d] = rows[i + 1];
    // Given a height difference perpendicular to the cross-section, this is each actual triangle's grade.
    for (const run of triangleRuns(rows[i], rows[i + 1])) {
      if (run <= 0) foldedFaces++;
      if (rise / Math.abs(run) > worstRibbonGrade) {
        worstRibbonGrade = rise / Math.abs(run);
        steepestSpan = i;
      }
    }
    for (const [o, u, v] of [[a, b, c], [d, c, b]]) {
      const divisions = Math.ceil(Math.max(length(o, u), length(o, v), length(u, v)) / .1);
      for (let row = 0; row <= divisions; row++) for (let column = 0; column <= divisions - row; column++) {
        const along = mix(o, u, row / divisions);
        const p = along.map((value, index) => value + (v[index] - o[index]) * column / divisions) as Point;
        const [e, n, y] = p;
        samples++;
        railGap = Math.min(railGap, axisDistance(e, n));
        fishingGap = Math.min(fishingGap, Math.hypot(e - f6[0], n - f6[1]));
        minimumHeightDelta = Math.min(minimumHeightDelta, y - grid.heightAt(e, n));
        maximumHeightDelta = Math.max(maximumHeightDelta, y - grid.heightAt(e, n));
        if (isMirrorLakeIce(e, n)) strictIceSamples++;
        if (!canEnter(e, n)) hit('terrainCanEnter', p);
        if (scenery.blocked(e, n) || scenery.plazaCoverBlocks(e, n, radius)) hit('scenery', p);
        if (districts.blocked(e, n)) hit('district', p);
        if (streets.blocked(e, n)) hit('streetscape', p);
        if (forest.blocked(e, n)) hit('forest', p);
        if (localRail.some((box: Box) => contacts(e, n, y, box))) hit('railCollider', p);
        if (localFloors.some((box: Box) => contacts(e, n, y, box))) hit('railDeck', p);
        if (Math.hypot(e - f6[0], n - f6[1]) < 3 && y > 10 + epsilon) hit('fishingF6', p);
      }
    }
  }
  return {
    name, path, width: 2 * halfWidth, samples, centerline, centerGrade, worstRibbonGrade, steepestSpan,
    riseAtTenthMetreBound: .1 * worstRibbonGrade, railGap, fishingGap, strictIceSamples,
    minimumHeightDelta, maximumHeightDelta, foldedFaces, blocks,
  };
}

const gradeProbe = check('existing straight lip to approved junction',
  [[22.8, joinNorth, berth.ground], join]);
const south = check('south station lip to approved junction', [
  [22.5, 176.9, berth.ground], [23.2, 176.9, berth.ground],
  [25.4, 176.9, 15.95], [26.55, 178.15, 15.50], [24.5, 181, 14.68], join,
]);
const north = check('north station lip to approved junction', [
  [22.5, 191.5, berth.ground], [24.3, 191.5, berth.ground],
  [25.7, 188.8, 15.82], join,
]);
const gradual = check('gradual south station lip to approved junction', gradeProfile([
  [22.5, 177.1], [23.3, 177.1], [26.2, 177.1], [28.2, 177.75], [29.1, 179],
  [28.2, 179.95], [26.2, 180], [25.2, 180.5], [24.5, 181.5], [joinEast, joinNorth],
], berth.ground, join[2]));
assert.equal(gradual.foldedFaces, 0);
assert.ok(gradual.worstRibbonGrade < .29, 'Check the maximum grade of the entire ribbon, not only its centre.');
assert.ok(gradual.railGap - .1 > 3.5, 'Allow for the maximum step between triangle probes.');
assert.ok(gradual.fishingGap - .1 > 3, 'Keep the continuous ramp footprint outside F6.');
assert.deepEqual(gradual.blocks, {});
console.log(JSON.stringify({
  berth: { id: berth.id, x: berth.x, n: berth.n, y: berth.ground }, join,
  gradeProbe, south, north, gradual,
}, null, 2));
