import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildR30TownSkyline, townD2R30SkylineContract,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-skyline';
import {
  buildTownD2R30ChunkGeometry, createTownD2R30Massif,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-massif';
import {
  sampleTownD2R30Height, townD2R30CanonicalSpacing, townD2R30Spec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { auditTownD2R30ReturnRoute } from '../tools/voxel-tavern/town-blockout/town-d2-r30-return-route';

/**
 * Round-3 consistency gate for the D2 central sector: the distant silhouette,
 * the near walkable massif and the return route must all be the same terrain.
 * No other window is involved, so this can run before the four-sector assembly.
 */

test('D2-R3 near and far share one height source in the overlapping north band', () => {
  const far = buildR30TownSkyline();
  try {
    const farPos = far.getAttribute('position');
    const topCount = far.userData.r30TopVertexCount as number;
    let checked = 0, worst = 0;
    for (let i = 0; i < topCount; i++) {
      const east = farPos.getX(i), north = -farPos.getZ(i);
      const near = sampleTownD2R30Height(east, north);
      assert.ok(near !== undefined, `far top E${east}/N${north} is outside the canonical field`);
      worst = Math.max(worst, Math.abs(farPos.getY(i) - near));
      checked++;
    }
    assert.ok(checked > 2000, `far LOD too sparse to compare: ${checked}`);
    assert.ok(worst < 1e-4, `near/far drifted by ${worst}m`);
  } finally {
    far.dispose();
  }
});

test('D2-R3 the far LOD is a coarser sampling of the near mesh, not a different mountain', () => {
  const near = createTownD2R30Massif();
  try {
    assert.equal(near.stats().spacing, townD2R30CanonicalSpacing);
    assert.equal(townD2R30SkylineContract.spacing, townD2R30Spec.farSpacing);
    assert.ok(townD2R30Spec.farSpacing > townD2R30CanonicalSpacing,
      'the far shell must be coarser than the walkable field');
    // The near massif reaches every side of the domain; the far shell covers
    // the north band only and never claims its own height authority.
    assert.ok(near.stats().minTopHeight >= townD2R30Spec.baseHeight - 1e-6);
    assert.ok(near.stats().maxHeight >= townD2R30Spec.summitHeight - 1e-6);
    assert.equal(townD2R30SkylineContract.south, 600);
    assert.equal(townD2R30SkylineContract.north, mainSummitBounds.north);
  } finally {
    near.dispose();
  }
});

test('D2-R3 far-shell vertices in the north band still match a near chunk tile exactly', () => {
  const chunk = buildTownD2R30ChunkGeometry({
    key: 'north-check', row: 0, column: 0,
    west: 0, east: 160, south: 800, north: 960,
    centreEast: 80, centreNorth: 880,
  }, townD2R30CanonicalSpacing);
  try {
    const position = chunk.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const east = position.getX(i), north = -position.getZ(i);
      assert.ok(Math.abs(position.getY(i) - sampleTownD2R30Height(east, north)!) < 1e-4);
      assert.ok(east >= 0 && east <= 160 && north >= 800 && north <= 960);
    }
  } finally {
    chunk.dispose();
  }
});

test('D2-R3 the published return route still enters, summits and returns on real support', () => {
  const report = auditTownD2R30ReturnRoute();
  assert.equal(report.metrics.unsupportedOutbound, 0);
  assert.equal(report.metrics.unsupportedReturn, 0);
  assert.equal(report.checks.returnContinuous, true);
  assert.equal(report.checks.returnExactlyReversed, true);
  assert.equal(report.checks.returnAnchorsSupported, true);
  assert.ok(report.metrics.outboundPoints >= 1000);
  assert.equal(report.metrics.returnPoints, report.metrics.outboundPoints);
});

test('D2-R3 no sub-package may write a second height authority', () => {
  assert.equal(townD2R30CanonicalSpacing, townD2R30Spec.collisionSpacing);
  assert.equal(townD2R30CanonicalSpacing, townD2R30Spec.nearSpacing);
  for (const spacing of [townD2R30Spec.middleSpacing, townD2R30Spec.farSpacing, townD2R30Spec.horizonSpacing]) {
    assert.ok(spacing % townD2R30CanonicalSpacing === 0,
      `LOD spacing ${spacing} is not a multiple of the 8m canonical grid`);
  }
  assert.equal(townD2R30SkylineContract.floorHeight, townD2R30Spec.floorHeight);
  assert.equal(townD2R30SkylineContract.arrivalHeight, 347);
});
