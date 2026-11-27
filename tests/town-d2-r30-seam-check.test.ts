import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTownD2R30Seam } from '../tools/voxel-tavern/town-blockout/town-d2-r30-seam-check';
import { mainSummitSpec } from '../tools/voxel-tavern/town-blockout/main-summit-block';

test('D2-R04 world transform matches assembly and front-ridge cloud terrace', () => {
  const report = checkTownD2R30Seam();
  assert.deepEqual({ ...report.transform.anchor }, { east: 300, north: 676 });
  assert.equal(report.transform.matchesAssembly, true);
  assert.equal(report.transform.roundTripExact, true);
  assert.equal(report.transform.frontRidgeNearArrival, true);
  // Front ridge (320,650) sits just south of the local origin under the anchor.
  assert.equal(report.transform.frontRidgeLocal.east, 20);
  assert.equal(report.transform.frontRidgeLocal.north, -26);
});

test('D2-R04 all return anchors are supported and map into the world frame', () => {
  const report = checkTownD2R30Seam();
  assert.equal(report.returnAnchors.length, 4);
  assert.ok(report.returnAnchors.every(anchor => anchor.supported));
  assert.ok(report.returnAnchors.every(anchor => Number.isFinite(anchor.height)));
  const byId = new Map(report.returnAnchors.map(anchor => [anchor.id, anchor]));
  assert.deepEqual({ ...byId.get('gate')!.world }, { east: 300, north: 666 });
  assert.equal(byId.get('gate')!.height, 347);
  assert.equal(byId.get('summit')!.height, 800);
  assert.ok(byId.get('south-pass')!.height > 600);
});

test('D2-R04 cloud band elevation and collision coverage match the canonical spec', () => {
  const report = checkTownD2R30Seam();
  assert.equal(report.cloudBand.bottom, mainSummitSpec.cloudBand[0]);
  assert.equal(report.cloudBand.top, mainSummitSpec.cloudBand[1]);
  assert.equal(report.cloudBand.allInsideBand, true);
  assert.equal(report.cloudBand.terrainBands.length, 3);
  assert.ok(report.cloudBand.terrainBands.every(band => band.length > 0));
  assert.equal(report.collision.coveredBounds, true);
  assert.equal(report.collision.chunkCount, 72);
  assert.equal(report.collision.spacing, 8);
});

test('D2-R04 seam report is deterministic', () => {
  assert.deepEqual(checkTownD2R30Seam(), checkTownD2R30Seam());
});
