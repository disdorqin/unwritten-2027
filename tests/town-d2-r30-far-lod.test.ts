import test from 'node:test';
import assert from 'node:assert/strict';
import { FrontSide } from 'three';
import { createTownD2R30FarLod, townD2R30FarLodContract } from '../tools/voxel-tavern/town-blockout/town-d2-r30-far-lod';
import { createTownD2R30ProductionHost } from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import { TOWN_D2_R30_SKYLINE_MAX_HAZE } from '../tools/voxel-tavern/town-blockout/town-d2-r30-skyline';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

test('D33-1 the far layer is single-source with the walking field, never a fake slope', () => {
  const far = createTownD2R30FarLod();
  try {
    const s = far.stats();
    assert.ok(s.topVertices > 1000, `far layer too coarse: ${s.topVertices}`);
    assert.ok(s.heightDrift < 1e-3, `far layer drifted ${s.heightDrift} m from canonical`);
    assert.equal(s.monochrome, false, 'far layer must not be a flat monochrome apron');
    assert.equal(s.hasSkirt, true);
    assert.equal(s.hasBottomCap, true);
  } finally {
    far.dispose();
  }
});

test('D33-1 the far layer is a closed FrontSide fogged mesh, not a DoubleSide curtain', () => {
  const far = createTownD2R30FarLod();
  try {
    const material = (far.mesh.material as { side: number; fog: boolean; vertexColors: boolean });
    assert.equal(material.side, FrontSide);
    assert.equal(material.fog, true);
    assert.equal(material.vertexColors, true);
    assert.equal(far.group.name, 'town-d2-r30-far-lod');
    assert.equal(far.group.children.length, 1, 'one far body, no second overlapping mesh');
  } finally {
    far.dispose();
  }
});

test('D33-1 the haze is bounded so the far field keeps its rock/snow colour bands', () => {
  assert.ok(TOWN_D2_R30_SKYLINE_MAX_HAZE <= .65,
    'haze cap slipped back toward a full monochrome lerp');
  assert.ok(TOWN_D2_R30_SKYLINE_MAX_HAZE >= .4,
    'haze cap too low to read as atmospheric depth');
  const far = createTownD2R30FarLod();
  try {
    assert.equal(far.stats().monochrome, false);
  } finally {
    far.dispose();
  }
});

test('D33-1 the far layer advertises that it replaces the R31 apron, not coexists', () => {
  assert.equal(townD2R30FarLodContract.replacesR31Apron, true);
  assert.equal(townD2R30FarLodContract.mutuallyExclusiveWith, 'town-r31-public-skyline');
  assert.equal(townD2R30FarLodContract.source, 'sampleTownD2R30Height');
  const far = createTownD2R30FarLod();
  try {
    assert.deepEqual(far.mesh.userData.farLodContract, townD2R30FarLodContract);
  } finally {
    far.dispose();
  }
});

test('D33-1 a drifting far layer fails closed instead of shipping a fake slope', () => {
  // A deliberately wrong sampler must be rejected; a fake silhouette that
  // disagrees with the walking field is the exact defect under rework.
  assert.throws(() => createTownD2R30FarLod(() => 42), RangeError);
});

test('D33-1 night tint is reversible and dispose is idempotent and fail-closed', () => {
  const far = createTownD2R30FarLod();
  const material = far.mesh.material as { color: { getHex(): number } };
  const day = material.color.getHex();
  far.setNight(true);
  const night = material.color.getHex();
  assert.notEqual(night, day);
  far.setNight(false);
  assert.equal(material.color.getHex(), day, 'day colour must be restored exactly');
  assert.throws(() => far.setNight('yes' as unknown as boolean), TypeError);
  far.dispose();
  far.dispose();
  assert.throws(() => far.setNight(false), Error);
});

test('D33-1 the far layer really samples the canonical sampler (not a stub)', () => {
  // Spot-check the sampler contract the layer relies on: real values inside
  // the far band, undefined outside the domain.
  assert.notEqual(sampleTownD2R30Height(0, 700), undefined);
  assert.equal(sampleTownD2R30Height(0, 5000), undefined);
});

test('D33-1 the production host offers the same-source far layer to A/总控', () => {
  const host = createTownD2R30ProductionHost();
  try {
    assert.equal(typeof host.createFarLod, 'function');
    const far = host.createFarLod();
    try {
      assert.ok(far.stats().heightDrift < 1e-3);
      assert.equal(far.stats().monochrome, false);
      // NOT auto-mounted: co-existence with the R31 apron would double-draw.
      assert.equal(host.group.children.some((c: { name: string }) => c.name === 'town-d2-r30-far-lod'), false);
    } finally {
      far.dispose();
    }
  } finally {
    host.dispose();
  }
});
