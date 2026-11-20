import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMeteorCraterWestChute,
  type MeteorCraterWestChutePlan,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-west-chute.ts';

const plan: MeteorCraterWestChutePlan = {
  entry: { east: -4, north: 0 },
  gravelStart: { east: 0, north: 0 },
  halfWidth: .8,
  gravelLength: 2,
  shaft: { east: 9, north: 0, radius: 1 },
  pondDistanceAt: (east, north) => Math.hypot(east - 1.5, north - 2.4) - 1,
  shoreReach: 2,
  surface: {
    positions: new Float32Array([
      -5, 3.5, 1, -5, 3.5, -1,
       0, 1, 1,    0, 1, -1,
       3, 1, 1,    3, 1, -1,
    ]),
    indices: new Uint32Array([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]),
  },
};

test('both material batches clip the original terrain and expose the same continuous support', () => {
  const chute = createMeteorCraterWestChute(plan);
  assert.deepEqual(chute.origin, plan.entry);
  assert.equal(chute.yaw, -Math.PI / 2);
  assert.equal(chute.slideLength, 4);
  assert.equal(chute.fullLength, 6);
  assert.equal(chute.positions.length, chute.indices.length * 3);
  assert.equal(chute.gravelFirstIndex % 3, 0);
  assert.ok(chute.gravelFirstIndex > 0 && chute.gravelFirstIndex < chute.indices.length);

  for (const north of [-.27, 0, .27]) {
    for (let east = -4; east <= 2; east += .125) {
      const support = chute.supportAt({ east, north });
      assert.ok(support);
      assert.ok(Math.abs(support.height - (1 - Math.min(east, 0) * .5)) < 1e-6);
      assert.equal(support.ground, east < 0 ? 'west-fissure' : 'dry-surface-gravel');
    }
  }
  assert.equal(chute.supportAt({ east: 2.1, north: 0 }), undefined);
  assert.equal(chute.supportAt({ east: -1, north: .81 }), undefined);
  assert.equal(chute.supportAt({ east: -1, north: NaN }), undefined);
});

test('the west corridor accepts a downhill swept foot and refuses the same seam from the gravel', () => {
  const { allowsSweep } = createMeteorCraterWestChute(plan);
  const onChute = { east: -.1, north: .2 };
  const onGravel = { east: .1, north: .2 };
  assert.equal(allowsSweep({ east: -4.1, north: 0 }, { east: -3.9, north: 0 }, .27), true);
  assert.equal(allowsSweep(onChute, onGravel, .27), true);
  assert.equal(allowsSweep(onGravel, onChute, .27), false);
  assert.equal(allowsSweep(onChute, { east: -.2, north: .2 }, .27), false);
  assert.equal(allowsSweep(onChute, { east: -.1, north: .54 }, .27), false);
  assert.equal(allowsSweep({ east: -4.1, north: .85 }, { east: -3.7, north: .2 }, .27), false);
  assert.equal(allowsSweep(onGravel, { east: .05, north: .2 }, .27), true);
  assert.equal(allowsSweep(onChute, onGravel, Infinity), false);
});

test('an intersecting shaft, wet or disconnected pond shore, and missing support are rejected', () => {
  assert.throws(() => createMeteorCraterWestChute({ ...plan, shaft: { ...plan.shaft, east: 1 } }), /shaft/);
  assert.throws(() => createMeteorCraterWestChute({ ...plan, pondDistanceAt: () => 0 }), /dry surface/);
  assert.throws(() => createMeteorCraterWestChute({ ...plan, pondDistanceAt: () => 10 }), /reach the surface/);
  assert.throws(() => createMeteorCraterWestChute({ ...plan, surface: { ...plan.surface, indices: [0, 1, 2] } }),
    /support both sections/);
});
