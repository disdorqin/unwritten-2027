import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSummitSledReplay, replaySummitSled, summitSledTimeTargetSeconds,
} from '../tools/voxel-tavern/town-blockout/main-summit-sled-replay.ts';
import { sledMaximumSpeed } from '../src/shared/sled-speed.ts';

const fixture = {
  arcs: [
    {
      id: 'above-cloud',
      points: [{ east: 0, north: 0, height: 800 }, { east: 0, north: 2_000, height: 560 }],
    },
    {
      id: 'through-cloud',
      points: [{ east: 0, north: 2_000, height: 560 }, { east: 1_500, north: 2_000, height: 380 }],
    },
    {
      id: 'below-cloud',
      points: [{ east: 1_500, north: 2_000, height: 380 }, { east: 1_500, north: 4_500, height: 18 }],
    },
  ],
} as const;

test('summit replay starts at rest and uses the same tick independent of render frame grouping', () => {
  const first = createSummitSledReplay(fixture);
  const second = createSummitSledReplay(fixture);
  assert.deepEqual(first.snapshot(), {
    east: 0, north: 0, height: 800, elapsedSeconds: 0, distanceMetres: 0, speed: 0,
    stage: 'above-cloud', status: 'running',
  });
  assert.equal(first.advance(0).distanceMetres, 0);
  first.advance(10);
  for (let frame = 0; frame < 1_200; frame++) second.advance(1 / 120);
  assert.deepEqual(second.snapshot(), first.snapshot());
  assert.ok(first.snapshot().distanceMetres > 0);
  assert.throws(() => first.advance(-1), RangeError);
});

test('summit replay reports connected stage crossings, physical length and a surface-sensitive time', () => {
  const packed = replaySummitSled(fixture);
  const deep = replaySummitSled(fixture, ({ stage }) => ({ surface: 0, deepSnow: stage !== 'below-cloud' }));
  assert.equal(packed.status, 'finished');
  assert.equal(deep.status, 'finished');
  assert.equal(packed.height, 18);
  assert.equal(packed.east, 1_500);
  assert.equal(packed.north, 4_500);
  assert.equal(packed.distanceMetres, createSummitSledReplay(fixture).totalDistanceMetres);
  assert.ok(Math.abs(packed.distanceMetres - (Math.hypot(2_000, 240) + Math.hypot(1_500, 180) +
    Math.hypot(2_500, 362))) < 1e-9);
  assert.deepEqual(packed.stages.map(({ id }) => id), ['above-cloud', 'through-cloud', 'below-cloud']);
  for (let index = 1; index < packed.stages.length; index++) {
    assert.equal(packed.stages[index - 1].endSeconds, packed.stages[index].startSeconds);
  }
  assert.ok(packed.maximumSpeed <= sledMaximumSpeed);
  assert.ok(deep.elapsedSeconds > packed.elapsedSeconds);
  assert.equal(packed.meetsTimeTarget, packed.elapsedSeconds < summitSledTimeTargetSeconds);
  assert.ok(packed.trajectory.every(({ elapsedSeconds }, index) =>
    index === 0 || packed.trajectory[index - 1].elapsedSeconds <= elapsedSeconds));
});

test('summit replay distinguishes a partial timed run from a completed descent', () => {
  const result = replaySummitSled(fixture, undefined, 4);
  assert.equal(result.status, 'time-limit');
  assert.equal(result.elapsedSeconds, 4);
  assert.equal(result.meetsTimeTarget, false);
  assert.equal(result.stages.length, 1);
  assert.ok(result.distanceMetres > 0 && result.distanceMetres < 100);
  assert.throws(() => createSummitSledReplay({ arcs: fixture.arcs.slice(1) }), RangeError);
});
