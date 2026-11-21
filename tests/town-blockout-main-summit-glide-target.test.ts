import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import {
  createSummitGlideTargetRun, surveySummitGlidePracticeTarget,
  summitGlideTargetTerrainIsSafe,
} from '../tools/voxel-tavern/town-blockout/main-summit-glide-target';
import { mountSummitGlideTargetVisual } from '../tools/voxel-tavern/town-blockout/main-summit-glide-target-visual';

const flat = () => 0;
const target = { id: 'zd08-snow-target', east: 20, north: -30, height: 0 };
const receipt = (east: number, north = -30) => ({
  flightId: 'flight-77', accepted: true, phase: 'landed' as const,
  touchdown: 'soft' as const, east, north, height: 0,
});

test('ZD-08 target only accepts a registered flat snowy footprint', () => {
  assert.equal(summitGlideTargetTerrainIsSafe(target, flat), true);
  assert.equal(summitGlideTargetTerrainIsSafe(target, () => undefined), false);
  assert.equal(summitGlideTargetTerrainIsSafe(target, (east) => east > 20 ? 1 : 0), false);
  assert.equal(summitGlideTargetTerrainIsSafe({ ...target, height: .4 }, flat), false);
  assert.throws(() => createSummitGlideTargetRun('', target, flat), RangeError);
  assert.throws(() => createSummitGlideTargetRun('flight-77', target, () => undefined), RangeError);
});

test('ZD-08 precision distinguishes bullseye, inner, outer and outside without invented points', () => {
  for (const [distance, grade] of [[0, 'bullseye'], [2, 'bullseye'],
    [3.5, 'inner'], [7, 'outer'], [8.1, 'outside']] as const) {
    const run = createSummitGlideTargetRun('flight-77', target, flat);
    const got = run.settle(receipt(20 + distance));
    assert.equal(got?.grade, grade);
    assert.ok(Math.abs(got!.horizontalMetres - distance) < 1e-9);
    assert.equal(got?.verticalMetres, 0);
    assert.equal(got?.touchdown, 'soft');
  }
});

test('ZD-08 rejects forged, in-flight and mismatched landings, and settles exactly once', () => {
  const run = createSummitGlideTargetRun('flight-77', target, flat);
  assert.equal(run.settle({ ...receipt(20), accepted: false }), undefined);
  assert.equal(run.settle({ ...receipt(20), flightId: 'flight-other' }), undefined);
  assert.equal(run.settle({ ...receipt(20), phase: 'glide' }), undefined);
  assert.equal(run.settle({ ...receipt(20), touchdown: null }), undefined);
  assert.equal(run.settle({ ...receipt(20), east: Number.NaN }), undefined);
  assert.equal(run.settle({ ...receipt(20), height: 4 }), undefined);
  assert.equal(run.snapshot(), undefined);
  const first = run.settle(receipt(20));
  assert.equal(first?.grade, 'bullseye');
  const retry = run.settle(receipt(500));
  assert.deepEqual(retry, first);
  assert.deepEqual(run.snapshot(), first);
  assert.notEqual(run.snapshot(), first, 'snapshot returns an immutable copy, not internal state');
});

test('ZD-08 demonstration target is surveyed from a real neutral wing touchdown', () => {
  const launch = { east: 62.5, north: 975, height: 800, heading: Math.PI, speed: 7.5,
    drop: 800, pathClear: true, claimed: true };
  const finish = surveySummitGlidePracticeTarget(launch, flat);
  assert.ok(finish, 'glide must touch down before the flight guard ends');
  assert.equal(finish.id, 'practice-finish');
  assert.ok(finish.north < -3000 && finish.north > -4500);
  assert.equal(finish.height, 0);
  assert.equal(surveySummitGlidePracticeTarget({ ...launch, claimed: false }, flat), undefined);
});

test('ZD-08 display has three precision rings, a copper rim and two real lights', () => {
  const scene = new Scene();
  const view = mountSummitGlideTargetVisual(scene, target);
  assert.equal(scene.children.length, 1);
  assert.equal(view.group.position.z, 30);
  assert.equal(view.lights.length, 2);
  assert.ok(view.lights.every(light => light.isPointLight && light.intensity > 0));
  for (const name of ['target-bullseye', 'target-inner', 'target-outer', 'target-rim']) {
    assert.ok(view.group.getObjectByName(name), name);
  }
  view.dispose();
  view.dispose();
  assert.equal(scene.children.length, 0);
});
