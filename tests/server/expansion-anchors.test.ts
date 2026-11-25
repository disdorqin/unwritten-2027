import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditFirstFallDepths, auditUndergroundDepths, createExpansionAnchorTransform, undergroundDepths,
  type ExpansionAnchorPose,
} from '../../src/presence/expansion-anchors.ts';

function assertPoseNear(actual: ExpansionAnchorPose, expected: ExpansionAnchorPose) {
  for (const key of ['east', 'north', 'height', 'yaw'] as const) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12);
}

test('an explicit survey anchor rotates fixture north toward world east and preserves signed heights', () => {
  // Test-only points exercise a western frame and a rotated survey.
  const fixture = { east: 2, north: 4, height: -35, yaw: 0 };
  const world = { east: -7, north: 32, height: -58, yaw: Math.PI / 2 };
  const transform = createExpansionAnchorTransform(fixture, world);
  assert.deepEqual(transform.toWorld(fixture), world);
  const next = { east: 2, north: 9, height: -90, yaw: 0 };
  assertPoseNear(transform.toWorld(next), { east: -2, north: 32, height: -113, yaw: Math.PI / 2 });
  assertPoseNear(transform.toFixture(transform.toWorld(next)), next);
});

test('non-cardinal surveys round-trip and retain their measured anchor pair if callers later change it', () => {
  const fixture = { east: 18.5, north: -5.3, height: -32, yaw: 1.14 };
  const world = { east: 7.9, north: 203.5, height: -140, yaw: -2.4 };
  const transform = createExpansionAnchorTransform(fixture, world);
  const pose = { east: -3.63, north: 17.8, height: -102.7, yaw: 2.95 };
  const projected = transform.toWorld(pose);
  world.east = 12;
  fixture.north = 7;
  assert.deepEqual(transform.toWorld(pose), projected);
  assertPoseNear(transform.toFixture(projected), pose);
});

test('anchor and probe values must be finite before a transform can be used', () => {
  const pose = { east: 8, north: 7, height: -90, yaw: 0 };
  assert.throws(() => createExpansionAnchorTransform({ ...pose, height: NaN }, pose), RangeError);
  assert.throws(() => createExpansionAnchorTransform(pose, { ...pose, yaw: Infinity }), RangeError);
  assert.throws(() => createExpansionAnchorTransform(pose, pose).toWorld({ ...pose, north: Infinity }), RangeError);
});

test('depth audit preserves all exact absolute levels and reports missing, invalid and displaced surveys', () => {
  assert.deepEqual(undergroundDepths, { mine: -90, crystalCave: -140, warriorCity: -165, vault: -190 });
  assert.deepEqual(auditUndergroundDepths(undergroundDepths), []);
  assert.deepEqual(auditUndergroundDepths({ mine: -90, crystalCave: -141.5, warriorCity: NaN }), [
    { segment: 'crystalCave', expected: -140, reason: 'datum-mismatch', observed: -141.5, difference: -1.5 },
    { segment: 'warriorCity', expected: -165, reason: 'non-finite', observed: NaN },
    { segment: 'vault', expected: -190, reason: 'missing' },
  ]);
});

test('the shaft crossing needs its own surveyed height and the mine landing must be below it', () => {
  assert.deepEqual(auditFirstFallDepths(undefined, -90), [{ field: 'crossing', reason: 'missing' }]);
  assert.deepEqual(auditFirstFallDepths(-58, undefined), [{ field: 'landing', expected: -90, reason: 'missing' }]);
  assert.deepEqual(auditFirstFallDepths(-90, -90), [
    { reason: 'landing-not-below-crossing', crossingHeight: -90, landingHeight: -90 },
  ]);
  assert.deepEqual(auditFirstFallDepths(-58, -88), [
    { field: 'landing', expected: -90, reason: 'datum-mismatch', observed: -88, difference: 2 },
  ]);
  assert.deepEqual(auditFirstFallDepths(-58, -90), []);
});
