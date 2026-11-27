import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canWireTownD2CloudTerrace, resolveTownD2CloudTerraceTransform,
  townD2CloudTerraceContract, townD2CloudTerraceFootprint,
} from '../tools/voxel-tavern/town-blockout/town-d2-cloud-terrace-transform';
import { supportsCloudTerrace } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { summitAssemblyAnchor } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { northRidgeSummit } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import { townD2R30Spec } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

test('D2→D the cloud terrace contract agrees with both canonical frames', () => {
  const report = resolveTownD2CloudTerraceTransform();
  assert.equal(report.version, townD2CloudTerraceContract.version);
  assert.ok(report.anchor.matchesAssembly,
    'the contract anchor must be the one the canonical summit assembly uses');
  assert.ok(report.anchor.matchesR30,
    'the contract anchor must be the one the R30 domain uses');
  assert.equal(report.anchor.world.east, summitAssemblyAnchor.east);
  assert.equal(report.anchor.world.north, summitAssemblyAnchor.north);
  assert.equal(report.anchor.world.east, townD2R30Spec.worldAnchor.east);
});

test('D2→D the terrace maps onto itself through the world frame', () => {
  const report = resolveTownD2CloudTerraceTransform();
  assert.ok(report.terrace.roundTripExact,
    'the terrace world and local positions must be the same place');
  assert.equal(report.terrace.world.east, northRidgeSummit.east);
  assert.equal(report.terrace.world.north, northRidgeSummit.north);
  assert.equal(report.terrace.local.east, northRidgeSummit.east - summitAssemblyAnchor.east);
  assert.equal(report.terrace.local.north, northRidgeSummit.north - summitAssemblyAnchor.north);
});

test('D2→D the domain swap step stays inside the published arrival band', () => {
  const report = resolveTownD2CloudTerraceTransform();
  assert.equal(report.swap.arrivalHeight, 347);
  assert.ok(report.swap.arrivalStep >= 0 && report.swap.arrivalStep <= 3,
    `the swap step must stay small, got ${report.swap.arrivalStep}`);
  assert.ok(report.swap.stepInsideBand);
  assert.equal(report.swap.seamNorthLocal, -12.75);
});

test('D2→D the contract footprint matches the canonical terrace predicate', () => {
  // The contract ships its own copy of the predicate so window D does not
  // have to import the summit assembly; it must behave identically.
  for (let east = -12; east <= 44; east += 1) {
    for (let north = -44; north <= 4; north += 1) {
      assert.equal(townD2CloudTerraceFootprint(east, north), supportsCloudTerrace(east, north),
        `footprint mismatch at E${east}/N${north}`);
    }
  }
  // The apron in front of the gate must run continuously across the seam.
  assert.ok(resolveTownD2CloudTerraceTransform().footprint.apronContinuous);
});

test('D2→D every published return anchor is supported by real terrain', () => {
  const report = resolveTownD2CloudTerraceTransform();
  assert.ok(report.returnAnchors.length >= 5);
  for (const anchor of report.returnAnchors) {
    assert.ok(anchor.supported, `${anchor.id} has no terrain under it`);
    assert.ok(Number.isFinite(anchor.height), `${anchor.id} has no height`);
    assert.equal(anchor.world.east, anchor.local.east + summitAssemblyAnchor.east);
    assert.equal(anchor.world.north, anchor.local.north + summitAssemblyAnchor.north);
  }
});

test('D2→D the wiring gate only opens when every claim holds', () => {
  assert.ok(canWireTownD2CloudTerrace(),
    'the D2→D cloud terrace handover must be wire-able: every claim in the report must hold');
});
