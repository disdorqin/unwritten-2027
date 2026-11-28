import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTownD2SectorAudit, townD2SectorAt, townD2SectorContract,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-audit';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';

test('D2-R3 four-sector ownership puts the central massif in D2, seams read-only', () => {
  assert.equal(townD2SectorAt(0, 100), 'A');
  assert.equal(townD2SectorAt(-500, 700), 'B');
  assert.equal(townD2SectorAt(500, 700), 'C2');
  assert.equal(townD2SectorAt(50, 1000), 'D2');
  assert.equal(townD2SectorAt(0, 1400), 'D2');
  // The 32 m overlap sits on the seams, never down D2's spine.
  for (const [east, north] of [[0, 480], [0, 495], [-300, 700], [-285, 700],
    [300, 700], [315, 700]] as const) {
    assert.equal(townD2SectorAt(east, north), 'overlap', `E${east}/N${north} must be a read-only seam`);
  }
  assert.equal(townD2SectorAt(0, 600), 'D2');
  assert.equal(townD2SectorAt(0, 1600), 'D2');
});

test('D2-R3 the published sector bounds match the rebalance order', () => {
  const { world, d2 } = townD2SectorContract;
  assert.equal(world.west, mainSummitBounds.west);
  assert.equal(world.east, mainSummitBounds.east);
  assert.equal(world.north, mainSummitBounds.north);
  assert.equal(world.splitNorth, 480);
  assert.equal(world.splitEast, 300);
  assert.equal(world.overlapWidth, 32);
  assert.deepEqual(
    { west: d2.west, east: d2.east, south: d2.south, north: d2.north },
    { west: -300, east: 300, south: 480, north: mainSummitBounds.north },
  );
  assert.equal(d2.areaSquareKm, 0.786);
});

test('D2-R3 all host checks pass so total control can mount the four sectors', () => {
  const report = resolveTownD2SectorAudit();
  assert.equal(report.version, 'd2-sector-audit-1.0');
  for (const [name, passed] of Object.entries(report.checks)) {
    assert.equal(passed, true, `host check ${name} failed`);
  }
  assert.equal(report.readyForAssembly, true);
  assert.ok(report.measurements.farTopVertices > 2000);
  assert.ok(report.measurements.nearFarMaxDrift < 1e-4);
  assert.ok(report.measurements.returnPoints >= 1000);
  assert.equal(report.measurements.unsupportedReturn, 0);
  assert.equal(report.measurements.skylineMinimumY, 130);
});

test('D2-R3 the audit is a frozen report, not a live mount', () => {
  const report = resolveTownD2SectorAudit();
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.checks));
  assert.equal(report.readyForAssembly, resolveTownD2SectorAudit().readyForAssembly);
});
