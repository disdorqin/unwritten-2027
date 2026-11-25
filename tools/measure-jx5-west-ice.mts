import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read-only survey. Pass the checkout root containing the pinned game sources and their installed dependencies.
const [checkout] = process.argv.slice(2);
assert.ok(checkout, 'Usage: node --import tsx measure-west-ice.mts TOWN_CHECKOUT');
const root = resolve(checkout);
const source = (name: string) =>
  import(pathToFileURL(resolve(root, 'tools/voxel-tavern/town-blockout', name + '.ts')).href);
const require = createRequire(resolve(root, 'package.json'));
const { Group } = require('three');
const [
  { createTerrainGrid, canEnter }, { createTownRailway }, { readWalkGeometry },
  { buildPineCamp }, { addScenery }, { addDistrictHousing }, { addStreetscape }, { addForestDensity },
  { extensionRoadClearance, extensionStreetClearance }, { createMirrorSouthShorePath, mirrorSouthShorePath },
] = await Promise.all([
  source('terrain'), source('town-railway'), source('landmark-kit'),
  source('town-pine-camp'), source('scenery'), source('district-layout'), source('streetscape'),
  source('forest-density'), source('town-extension'), source('mirror-lake-west-shore'),
]);
const { isMirrorLakeIce, mirrorLake, mirrorLakeIceInset } =
  await import(pathToFileURL(resolve(root, 'src/shared/mirror-lake.ts')).href);
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
const relevant = (box: Box) => box.max[0] > 20 && box.min[0] < 44 && box.min[2] < -163 && box.max[2] > -195;
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

function gradeProfile(geometry: Pair[], initial: number, final: number, halfWidth: number, flatSpans: number) {
  const shape = geometry.map(([e, n]): Point => [e, n, initial]);
  const rows = sectionRows(shape, halfWidth);
  const runs = rows.slice(0, -1).map((row, i) => Math.min(...triangleRuns(row, rows[i + 1])));
  assert.ok(runs.every(run => run > 0), 'The strip must have no folded triangles.');
  const governed = runs.map((run, i) => i < flatSpans ? 0 : run);
  const total = governed.reduce((sum, run) => sum + run, 0);
  let walked = 0;
  return shape.map(([e, n], index): Point => {
    if (index) walked += governed[index - 1];
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

const station = gradeProfile([
  [22.5, 177.1], [23.3, 177.1], [26.2, 177.1], [28.2, 177.75], [29.1, 179],
  [28.2, 179.95], [26.2, 180], [25.2, 180.5], [24.5, 181.5], [joinEast, joinNorth],
], berth.ground, join[2], 1, 1);
const gradual = check('gradual south station lip to approved junction', station);
assert.equal(gradual.foldedFaces, 0);
assert.ok(gradual.worstRibbonGrade < .29, 'Check the maximum grade of the entire ribbon, not only its centre.');
assert.ok(gradual.railGap - .1 > 3.5, 'Allow for the maximum step between triangle probes.');
assert.ok(gradual.fishingGap - .1 > 3, 'Keep the continuous ramp footprint outside F6.');
assert.deepEqual(gradual.blocks, {});
const iceApproach = gradeProfile([
  [joinEast, joinNorth], [25.15, 181.55], [26.5, 181.4], [29.6, 181.4], [31.6, 180],
  [32, 177.75], [32, 174], [34, 172.5], [36, 171.5],
], join[2], mirrorLake.height, .5, 1);
const iceSurvey = check('approved junction to strict ice', iceApproach, .5);

type Face = [Point, Point, Point];
function facesOf(path: Point[], halfWidth: number): Face[] {
  const rows = sectionRows(path, halfWidth);
  return rows.slice(0, -1).flatMap(([a, b], i) => {
    const [c, d] = rows[i + 1];
    return [[a, b, c], [d, c, b]] as Face[];
  });
}
const cross = (ax: number, an: number, bx: number, bn: number) => ax * bn - an * bx;
const orient = (a: Pair | Point, b: Pair | Point, p: Pair | Point) =>
  cross(b[0] - a[0], b[1] - a[1], p[0] - a[0], p[1] - a[1]);
function heightOnFace([a, b, c]: Face, point: Pair) {
  const area = orient(a, b, c);
  return (orient(b, c, point) * a[2] + orient(c, a, point) * b[2] + orient(a, b, point) * c[2]) / area;
}
function clipFace(first: Face, second: Face) {
  let polygon = first.map(([x, n]): Pair => [x, n]);
  const winding = Math.sign(orient(...second));
  for (const [i, a] of second.entries()) {
    const b = second[(i + 1) % 3];
    const clipped: Pair[] = [];
    for (const [j, start] of polygon.entries()) {
      const end = polygon[(j + 1) % polygon.length];
      const v0 = winding * orient(a, b, start);
      const v1 = winding * orient(a, b, end);
      if (v0 >= -1e-10) clipped.push(start);
      if ((v0 < -1e-10) !== (v1 < -1e-10)) {
        const scale = v0 / (v0 - v1);
        clipped.push([start[0] + (end[0] - start[0]) * scale, start[1] + (end[1] - start[1]) * scale]);
      }
    }
    polygon = clipped;
  }
  return polygon;
}
function overlapReport(one: Face[], two: Face[]) {
  let pairContacts = 0;
  let maximumHeightGap = 0;
  let at: Pair | undefined;
  const zones: Record<string, { range: number[]; signedGap: number[] }> = {};
  for (const a of one) for (const b of two) {
    const common = clipFace(a, b);
    if (common.length < 3) continue;
    pairContacts++;
    for (const point of common) {
      const signed = heightOnFace(a, point) - heightOnFace(b, point);
      const gap = Math.abs(signed);
      const key = String(Math.floor(point[1]));
      const zone = zones[key] ??= { range: [Infinity, -Infinity], signedGap: [Infinity, -Infinity] };
      zone.range = [Math.min(zone.range[0], point[0]), Math.max(zone.range[1], point[0])];
      zone.signedGap = [Math.min(signed, zone.signedGap[0]), Math.max(signed, zone.signedGap[1])];
      if (gap > maximumHeightGap) {
        maximumHeightGap = gap;
        at = point;
      }
    }
  }
  return { facePairContacts: pairContacts, maximumHeightGap, at, zones };
}

function distanceToFace(face: Face, point: Pair) {
  const sign = Math.sign(orient(...face));
  if (face.every((a, i) => sign * orient(a, face[(i + 1) % 3], point) >= -1e-9)) {
    return { distance: 0, nearest: point };
  }
  let distance = Infinity;
  let nearest: Pair = [Infinity, Infinity];
  for (const [i, a] of face.entries()) {
    const b = face[(i + 1) % 3];
    const dx = b[0] - a[0], dn = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dn) / (dx * dx + dn * dn)));
    const projected: Pair = [a[0] + t * dx, a[1] + t * dn];
    const magnitude = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
    if (magnitude < distance) {
      distance = magnitude;
      nearest = projected;
    }
  }
  return { distance, nearest };
}
function closestCircleProjection(faces: Face[]) {
  return Math.min(...faces.map(face => distanceToFace(face, f6).distance));
}
const stationFaces = facesOf(station, 1);
const iceFaces = facesOf(iceApproach, .5);
const oldShore = createMirrorSouthShorePath(grid.heightAt);
const oldPosition = oldShore.mesh.geometry.attributes.position;
const oldIndex = oldShore.mesh.geometry.index!;
const shoreVertex = (index: number): Point => [
  oldPosition.getX(index), -oldPosition.getZ(index), oldPosition.getY(index),
];
const shoreFaces: Face[] = [];
for (let i = 0; i < oldIndex.count; i += 3) {
  const face = [shoreVertex(oldIndex.getX(i)), shoreVertex(oldIndex.getX(i + 1)),
    shoreVertex(oldIndex.getX(i + 2))] as Face;
  if (face.every(p => p[1] > 165)) shoreFaces.push(face);
}
oldShore.dispose();
const edgeProof = {
  exactFishingBoundaryStation: closestCircleProjection(stationFaces),
  exactFishingBoundaryIce: closestCircleProjection(iceFaces),
  stationToIce: overlapReport(stationFaces, iceFaces),
  stationToShore: overlapReport(stationFaces, shoreFaces),
  shoreToIce: overlapReport(shoreFaces, iceFaces),
};
const crossingStation = gradeProfile([
  [22.5, 177.1], [26.5, 177.1], [27.8, 175.8], [29.85, 176.1], [30.45, 177.3],
  [29.8, 178.65], [27.5, 179.6], [26.5, 179.8], [25.2, 180.5], [24.5, 181.5], [joinEast, joinNorth],
], berth.ground, join[2], 1, 1);
const crossingIce = gradeProfile([
  [joinEast, joinNorth], [25.15, 181.55], [26.5, 181.4], [28.7, 181.4], [31.6, 181.3],
  [33.2, 179.6], [33.4, 176.8], [33.4, 173], [33.9, 170], [36.3, 168.8],
], join[2], mirrorLake.height, .5, 3);
const crossingStationFaces = facesOf(crossingStation, 1);
const crossingIceFaces = facesOf(crossingIce, .5);
const stepHeight = .43;
const viewerHeight = 1.8;
const trialDeckThickness = .08;
const cap = crossingIce.at(-1)!;
const beforeCap = crossingIce.at(-2)!;
const towardIce = mix(beforeCap, cap, 1 + 1.5 / length(beforeCap, cap));
towardIce[2] = mirrorLake.height;
const stationStart: Point = [berth.x, crossingStation[0][1], berth.ground];
const southShoreStart: Point = [24 + (joinEast - 24) * (170 - 160) / 22, 170, 0];
southShoreStart[2] = grid.heightAt(southShoreStart[0], southShoreStart[1]);

const candidateFaces = [...crossingStationFaces, ...crossingIceFaces];
function sampleWalk(path: Point[], preserveOldGround: boolean) {
  const issues: Record<string, { count: number; first: Point }> = {};
  const issue = (type: string, point: Point) => { (issues[type] ??= { count: 0, first: point }).count++; };
  let feet = path[0][2];
  let samples = 0, maximumStep = 0, leastOverhead = Infinity, finalNearGround = 0;
  for (const [i, a] of path.slice(0, -1).entries()) {
    const b = path[i + 1];
    const count = Math.ceil(length(a, b) / .04);
    for (let j = 1; j <= count; j++) {
      const p = mix(a, b, j / count);
      const [e, n, intended] = p;
      const pair: Pair = [e, n];
      const graded = candidateFaces.flatMap(face =>
        distanceToFace(face, pair).distance <= 1e-8 ? [heightOnFace(face, pair)] : []);
      const shore = shoreFaces.flatMap(face =>
        distanceToFace(face, pair).distance <= 1e-8 ? [heightOnFace(face, pair) - .045] : []);
      const ordinary = preserveOldGround || !isMirrorLakeIce(e, n) ? grid.heightAt(e, n) : mirrorLake.height;
      const candidates = [...graded, ...shore, ...localFloors.flatMap((box: Box) =>
        overlaps(e, n, box) ? [box.max[1]] : [])].filter(level => level <= feet + stepHeight);
      const next = Math.max(...candidates, ordinary);
      samples++;
      maximumStep = Math.max(maximumStep, Math.abs(next - feet));
      if (Math.abs(next - feet) > stepHeight) issue('stepHeight', [e, n, next]);
      if (Math.abs(next - intended) > stepHeight) issue('routeLevel', [e, n, next]);
      if (!canEnter(e, n)) issue('terrainCanEnter', [e, n, next]);
      if (scenery.blocked(e, n) || scenery.plazaCoverBlocks(e, n, radius)) issue('scenery', [e, n, next]);
      if (districts.blocked(e, n)) issue('district', [e, n, next]);
      if (streets.blocked(e, n)) issue('streetscape', [e, n, next]);
      if (forest.blocked(e, n)) issue('forest', [e, n, next]);
      if (localRail.some((box: Box) => contacts(e, n, next, box))) issue('railCollider', [e, n, next]);
      if (localFloors.some((box: Box) => contacts(e, n, next, box))) issue('railDeck', [e, n, next]);
      for (const face of crossingStationFaces) {
        const { distance, nearest } = distanceToFace(face, pair);
        if (distance >= radius) continue;
        const top = heightOnFace(face, nearest);
        if (top - next <= stepHeight) continue; // Nearby walkable seams are joined in the same layer.
        const headroom = top - next - trialDeckThickness;
        leastOverhead = Math.min(leastOverhead, headroom);
        if (headroom < viewerHeight - epsilon) issue('stationDeckHeadroom', [e, n, next]);
      }
      if (j === count && i === path.length - 2) finalNearGround = Math.abs(next - b[2]);
      feet = Math.abs(next - feet) <= stepHeight ? next : intended;
    }
  }
  return { samples, maximumStep, leastOverhead: Number.isFinite(leastOverhead) ? leastOverhead : undefined,
    finalNearGround, issues };
}
const walkFromDeck = [stationStart, ...crossingStation, ...crossingIce.slice(1), towardIce];
const walkFromShore = [southShoreStart, join, ...crossingIce.slice(1), towardIce];
function offsetShorePath(offset: number) {
  const direction = [joinEast - 24, joinNorth - 160];
  const span = Math.hypot(...direction);
  const along = Array.from({ length: 49 }, (_, i): Point => {
    const fraction = i / 48;
    const side = offset * Math.min(1, (1 - fraction) * 6);
    const baseNorth = 170 + (joinNorth - 170) * fraction;
    const north = baseNorth + direction[0] / span * side;
    const east = 24 + direction[0] * (baseNorth - 160) / direction[1] - direction[1] / span * side;
    return [east, north, grid.heightAt(east, north)];
  });
  return [...along, ...crossingIce.slice(1), towardIce];
}
const oldPathLateral = [-.72, -.36, 0, .36, .72].map(offset => {
  const path = offsetShorePath(offset);
  return { offset, fromShore: sampleWalk(path, false), toShore: sampleWalk(path.toReversed(), false),
    oldTerrainBeforeJoin: sampleWalk(path.slice(0, 49), true) };
});
const alternate = {
  station: check('south lip with flat old-shore crossing', crossingStation),
  ice: check('ice descent skirts station and fishing', crossingIce, .5),
  exactFishingBoundaryStation: closestCircleProjection(crossingStationFaces),
  exactFishingBoundaryIce: closestCircleProjection(crossingIceFaces),
  stationToIce: overlapReport(crossingStationFaces, crossingIceFaces),
  stationToShore: overlapReport(crossingStationFaces, shoreFaces),
  shoreToIce: overlapReport(shoreFaces, crossingIceFaces),
  crossSections: {
    coordinates: '[east, north, elevation] points in source order. A pair lists right, then left viewed along travel.',
    station: sectionRows(crossingStation, 1),
    ice: sectionRows(crossingIce, .5),
  },
  layeredWalk: {
    fromDeck: sampleWalk(walkFromDeck, false),
    toDeck: sampleWalk(walkFromDeck.toReversed(), false),
    fromShore: sampleWalk(walkFromShore, false),
    toShore: sampleWalk(walkFromShore.toReversed(), false),
    oldPathLateral,
    oldTerrainControl: sampleWalk(walkFromDeck, true),
  },
};

assert.ok(crossingIceFaces.flat().every(([e, n]) => isMirrorLakeIce(e, n)));
assert.ok(isMirrorLakeIce(towardIce[0], towardIce[1]));
assert.ok(alternate.exactFishingBoundaryStation > 3 && alternate.exactFishingBoundaryIce > 3);
assert.ok(alternate.stationToIce.maximumHeightGap < stepHeight);
for (const test of [alternate.station, alternate.ice]) {
  assert.equal(test.foldedFaces, 0);
  assert.ok(test.worstRibbonGrade < .29);
  assert.ok(test.railGap - .1 > 3.5);
  assert.deepEqual(test.blocks, {});
}
for (const test of [alternate.layeredWalk.fromDeck, alternate.layeredWalk.toDeck,
  alternate.layeredWalk.fromShore, alternate.layeredWalk.toShore]) {
  assert.deepEqual(test.issues, {});
}
for (const { fromShore, toShore, oldTerrainBeforeJoin } of oldPathLateral) {
  assert.ok((fromShore.leastOverhead ?? Infinity) > viewerHeight);
  assert.deepEqual(fromShore.issues, oldTerrainBeforeJoin.issues);
  assert.deepEqual(Object.keys(toShore.issues), Object.keys(oldTerrainBeforeJoin.issues));
  assert.equal(toShore.issues.forest?.count, oldTerrainBeforeJoin.issues.forest?.count);
}
assert.equal(alternate.layeredWalk.fromDeck.finalNearGround, 0);
assert.ok(alternate.layeredWalk.oldTerrainControl.finalNearGround > 4.8);

function westIceRim(north: number) {
  const k = (north - mirrorLake.center[1]) / mirrorLake.radius[1];
  return mirrorLake.center[0] - mirrorLake.radius[0] * Math.sqrt((1 - mirrorLakeIceInset / mirrorLake.radius[1]) ** 2 - k * k);
}
const westPiers = railway.supportIndices.flatMap(i => {
  const a = points[i], b = points[(i + 1) % points.length];
  const center: Point = [(a.x + b.x) / 2, -(a.z + b.z) / 2, (a.y + b.y) / 2];
  if (center[0] > 45 || center[1] < 125 || center[1] > 241) return [];
  const rise = center[2] - grid.heightAt(center[0], center[1]);
  const pad = ((rise >= 13 ? .93 : .63) + .55) / 2;
  const scale = 1.33 / Math.hypot(b.x - a.x, b.z - a.z);
  const footings = [-1, 1].map(side => {
    const east = center[0] + side * (b.z - a.z) * scale;
    const north = center[1] + side * (b.x - a.x) * scale;
    const minWestIceGap = Math.min(westIceRim(north - pad), westIceRim(north + pad)) - east - pad;
    return { east, north, feet: grid.heightAt(east, north), minWestIceGap };
  });
  return [{ i, center, pad, footings }];
});
console.log(JSON.stringify({
  berth: { id: berth.id, x: berth.x, n: berth.n, y: berth.ground }, join,
  gradual, iceSurvey, edgeProof, alternate, westPiers,
}, null, 2));
