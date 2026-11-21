import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFloorRadius,
  meteorCraterRimRadius, meteorCraterFixturePlan,
} from '../tools/voxel-tavern/town-blockout/meteor-crater.ts';

/**
 * Window C independent acceptance of A's 2026-11-21 crater area ledger.
 * Analytical annuli and linear frusta intentionally use no mesh triangulation
 * or handwritten slope samples from the A report. Real road reshaping is separate.
 */
const crater = createMeteorCrater(meteorCraterFixturePlan);
const pi = Math.PI;
const radialProfile = [
  { radius: meteorCraterRimRadius, depth: 0 },
  ...meteorCraterFixturePlan.terraces.flatMap(t => [
    { radius: t.outerRadius, depth: t.depth },
    { radius: t.innerRadius, depth: t.depth },
  ]),
  { radius: meteorCraterFloorRadius, depth: meteorCraterDepth },
  { radius: 0, depth: meteorCraterDepth },
];
const area = (outer: number, inner: number) => pi * (outer ** 2 - inner ** 2);
function analyticSurface(outer: number, inner: number) {
  let sum = 0;
  for (let i = 1; i < radialProfile.length; i++) {
    const a = radialProfile[i - 1]!;
    const b = radialProfile[i]!;
    const o = Math.min(outer, a.radius), n = Math.max(inner, b.radius);
    if (o <= n) continue;
    const grade = (b.depth - a.depth) / (a.radius - b.radius);
    sum += area(o, n) * Math.hypot(1, grade);
  }
  return sum;
}
function integrateProfile(outer: number, inner: number, dr = .01) {
  // Independent finite-difference check of the actual exported height function.
  // Integrate at midpoint radii; slope derivative evaluated away from annulus boundaries.
  let surface = 0;
  for (let o = outer; o > inner;) {
    const n = Math.max(inner, o - dr);
    const r = (o + n) / 2;
    const high = Math.min(meteorCraterRimRadius, r + .00001);
    const low = Math.max(0, r - .00001);
    const dz = crater.terraceHeightOffsetAt(high)! -
      crater.terraceHeightOffsetAt(low)!;
    surface += 2 * pi * r * (o - n) * Math.hypot(1, dz / (high - low));
    o = n;
  }
  return surface;
}
const tolerancePercent = (actual: number, expected: number) =>
  100 * Math.abs(actual - expected) / Math.abs(actual);
const table = {
  rimProjected: 1649.3, rimSurface: 2838.0,
  terraceProjected: 6597.3, terraceSurface: 10034.9,
  floorProjected: 1256.6,
  craterProjected: 9503.3, craterSurface: 14129.5,
  outerManagement: 28510.0, totalManaged: 38013.3, rimCircumference: 345.6,
  wellProjected: 10.6,
} as const;

test('ZA pit area C-audit derives terraces from canonical code, not copied table approximations', () => {
  const rim = area(meteorCraterRimRadius, meteorCraterFixturePlan.terraces[0].outerRadius);
  const terrace = area(meteorCraterFixturePlan.terraces[0].outerRadius, meteorCraterFloorRadius);
  const floor = area(meteorCraterFloorRadius, 0);
  const all = area(meteorCraterRimRadius, 0);
  const managed = area(meteorCraterRimRadius * 2, meteorCraterRimRadius);
  assert.ok(tolerancePercent(rim, table.rimProjected) < .1);
  assert.ok(tolerancePercent(terrace, table.terraceProjected) < .1);
  assert.ok(tolerancePercent(floor, table.floorProjected) < .1);
  assert.ok(tolerancePercent(all, table.craterProjected) < .1);
  assert.ok(tolerancePercent(managed, table.outerManagement) < .1);
  assert.ok(tolerancePercent(all + managed, table.totalManaged) < .1);
  assert.equal(Math.round(all * 10) / 10, 9503.3);
  assert.equal(Math.round(2 * pi * meteorCraterRimRadius * 10) / 10, 345.6);
  assert.equal(Math.round(area(meteorCraterRimRadius / 30, 0) * 10) / 10, 10.6);
  assert.equal(meteorCraterRimRadius * 2, 110);
  assert.equal(meteorCraterDepth, 35);
});

test('ZA pit area C-audit analytically integrates actual reviewed terrace faces; accepted <0.1% with precision errata', () => {
  const rim = analyticSurface(55, 50);
  const terrace = analyticSurface(50, 20);
  const floor = analyticSurface(20, 0);
  const whole = rim + terrace + floor;
  assert.ok(tolerancePercent(rim, table.rimSurface) < .1);
  assert.ok(tolerancePercent(terrace, table.terraceSurface) < .1);
  assert.ok(tolerancePercent(whole, table.craterSurface) < .1);
  assert.ok(Math.abs(rim - 2837.625195586752) < .00001);
  assert.ok(Math.abs(terrace - 10034.390582690428) < .00001);
  assert.ok(Math.abs(whole - 14128.652839713097) < .00001);
  // The ledger's one-decimal slope/terrace values are not correctly rounded.
  assert.notEqual(Number(rim.toFixed(1)), table.rimSurface);
  assert.notEqual(Number(terrace.toFixed(1)), table.terraceSurface);
  assert.notEqual(Number(whole.toFixed(1)), table.craterSurface);
});

test('ZA pit area C-audit independently finite-differences the canonical radial terrace, including plateaus', () => {
  for (const [outer, inner] of [[55, 50], [50, 20], [20, 0], [55, 0]]) {
    const exact = analyticSurface(outer, inner);
    const numerical = integrateProfile(outer, inner);
    assert.ok(tolerancePercent(exact, numerical) < .1,
      `surface numerical/analytic mismatch for annulus ${outer}–${inner}: ${numerical} vs ${exact}`);
  }
});

test('ZA pit area is a nominal radial-profile ledger, not a measured trail-carved 3D mesh surface', () => {
  const trail = crater.mainTrailPoint(.25);
  const rad = Math.hypot(trail.east, trail.north);
  const rimProfileHeight = crater.terraceHeightOffsetAt(rad)!;
  const actualHeight = crater.heightOffsetAt(trail.east, trail.north)!;
  assert.ok(Math.abs(actualHeight - rimProfileHeight) > .2,
    'road-carved walking height does not equal bare radial frustum everywhere');
  assert.equal(crater.terraceHeightOffsetAt(0), -35);
  assert.equal(crater.terraceHeightOffsetAt(55), 0);
});

test('ZA pit area does not double-count the 10.6 square-metre capped well as extra crater floor', () => {
  assert.ok(area(55, 0) - area(50, 20) - area(55, 50) - area(20, 0) < 1e-9);
  assert.equal(
    Math.round((area(55, 0) + area(110, 55)) * 10) / 10,
    table.totalManaged,
  );
  // 10.56m² is reported to one decimal. The rounded 10.6 differs by ~0.39%
  // only because this tiny patch has very little area, not because geometry changed.
  assert.equal(Number(area(55 / 30, 0).toFixed(1)), table.wellProjected);
});
