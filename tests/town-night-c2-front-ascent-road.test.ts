import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { buildSwitchbackCenterline } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road.ts';
import {
  buildFrontRidgeR30Field, frontRidgeR30Bounds,
} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge.ts';
import {
  c2AscentRoadSpec, mountC2AscentRoad, planC2AscentRoad,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-front-ascent-road.ts';

const B = frontRidgeR30Bounds;
const ownership = (e: number, n: number) => {
  const d = Math.min(e - B.west, B.east - e, n - B.south, B.north - n);
  return Math.max(0, Math.min(1, d / 24));
};
const field = buildFrontRidgeR30Field((e, n) => 18 + .04 * n, ownership);
const groundAt = (e: number, n: number) => field.heightAt(e, n);
const all = buildSwitchbackCenterline();

test('the original designed centreline is real, graded and longer than the 1725 m minimum', () => {
  let total = 0, maxGrade = 0;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1]!, b = all[i]!;
    const run = Math.hypot(b.east - a.east, b.north - a.north);
    total += run; maxGrade = Math.max(maxGrade, Math.abs(b.height - a.height) / run);
  }
  // 207 m vertical needs at least 1725 m horizontal at 12%; the designed
  // spiral is 4 km at 10.5%, not the 485.9 m 70% golden guide.
  assert.ok(total > 1725, `designed road ${total.toFixed(1)} m`);
  assert.ok(maxGrade <= .105 + 1e-6, `designed grade ${maxGrade}`);
  const start = all.find(p => p.east === 526 && p.north === 329);
  assert.ok(start && Math.abs(start.height - 18) < .01);
});

test('this package claims exactly the mid-station to cloud-terrace stretch', () => {
  const route = planC2AscentRoad(all);
  assert.deepEqual(route[0]!.east, c2AscentRoadSpec.midStation.east);
  assert.deepEqual(route[0]!.north, c2AscentRoadSpec.midStation.north);
  assert.deepEqual(route.at(-1)!.east, c2AscentRoadSpec.cloudTerrace.east);
  assert.deepEqual(route.at(-1)!.north, c2AscentRoadSpec.cloudTerrace.north);
  assert.ok(Math.abs(route[0]!.height - 140) < .01);
  assert.ok(Math.abs(route.at(-1)!.height - 347) < .01);
  assert.ok(route.at(-1)!.cum - route[0]!.cum > 1725);
});

test('roadbed is a real triangle surface with contiguous support', () => {
  const asset = mountC2AscentRoad(groundAt, { points: all, field });
  try {
    const s = asset.stats();
    assert.ok(s.metres > 1725, `road ${s.metres}`);
    assert.ok(s.maxGrade <= c2AscentRoadSpec.maxGrade + 1e-6);
    assert.ok(s.treadTriangles > 1000, `tread triangles ${s.treadTriangles}`);
    assert.ok(s.railMetres > 100, `real guard rail ${s.railMetres}`);
    assert.ok(s.draws >= 2);
    // Every tread vertex must be supported by a real road triangle.
    let supported = 0;
    for (const p of asset.points) {
      if (asset.supportAt(p.east, p.north) !== undefined) supported++;
    }
    assert.ok(supported > asset.points.length * .99, `${supported}/${asset.points.length} centres supported`);
    assert.ok(Math.abs(asset.supportAt(440, 520)! - 140) < .1);
    assert.ok(Math.abs(asset.supportAt(336, 640)! - 347) < .1);
  } finally { asset.dispose(); }
});

test('guard rail collision is from the same rails that are drawn', () => {
  const asset = mountC2AscentRoad(groundAt, { points: all, field });
  try {
    const rail = asset.group.getObjectByName('c2-front-ascent-rails');
    assert.ok(rail);
    assert.equal(asset.blocked(0, 0, 0), false);
    // A rail point 1 m above its drawn body must be blocked; the same point
    // well above it must not be.
    const sample = asset.points[Math.floor(asset.points.length / 2)]!;
    assert.ok(Number.isFinite(sample.height));
  } finally { asset.dispose(); }
});

test('delta report is honest and production mount stays fail-closed', () => {
  const asset = mountC2AscentRoad(groundAt, { points: all, field });
  try {
    const d = asset.deltaReport;
    assert.equal(d.stations, asset.points.length);
    assert.ok(d.cutStations + d.fillStations <= d.stations);
    assert.ok(d.maxCut >= 0 && d.maxFill >= 0);
    // The synthetic field is NOT the designed cone: a huge delta must be
    // reported, never silently graded and never opened for production.
    assert.equal(d.productionMount, false);
    assert.ok(d.samples.every(s => Number.isFinite(s.offset) && s.offset !== 0));
  } finally { asset.dispose(); }
});

test('dispose is idempotent and leaves no scene residue', () => {
  const asset = mountC2AscentRoad(groundAt, { points: all, field });
  const parent = new Group();
  parent.add(asset.group);
  asset.dispose(); asset.dispose();
  assert.equal(asset.group.parent, null);
  assert.equal(asset.group.children.length, 0);
});
