import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTownD2R30PresenceHandoff, townD2R30PresenceHandoff,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-presence-handoff';

test('D2-R04 presence handoff keeps the front-ridge room unchanged and publishes exact R30 bounds', () => {
  const report = resolveTownD2R30PresenceHandoff();
  assert.equal(report.status, 'proposal');
  assert.equal(report.owner, 'A/总控');
  assert.equal(report.productionReady, false);
  assert.deepEqual(report.localBounds, {
    west: -1_100, east: 1_100, south: -10, north: 1_790, minimumHeight: 130, maximumHeight: 800,
  });
  assert.deepEqual(report.worldBounds, {
    west: -800, east: 1_400, south: 666, north: 2_466, minimumHeight: 130, maximumHeight: 800,
  });
  assert.equal(report.checks.localAreaMatchesDomain, true);
  assert.equal(report.checks.worldRoundTripExact, true);
  assert.equal(report.checks.summitHeightSupported, true);
  assert.equal(report.checks.gateHeightSupported, true);
  assert.equal(report.checks.frontRidgeUnchanged, true);
});

test('D2-R04 presence handoff refuses an invalid unsigned union and leaves all authority fields with A', () => {
  const report = resolveTownD2R30PresenceHandoff();
  assert.equal(report.checks.directUnionWouldRequireNegativeEast, true);
  assert.deepEqual(report.missingOwnerFields, [
    'presencePath', 'wireOriginEast', 'wireOriginNorth', 'unsignedOrSignedEncoding',
    'interestRadius', 'authoritativeRoomOwner',
  ]);
  assert.deepEqual(townD2R30PresenceHandoff.requiredOwnerFields, report.missingOwnerFields);
  assert.equal(townD2R30PresenceHandoff.frontRidge.bounds.width, 640);
  assert.equal(townD2R30PresenceHandoff.frontRidge.bounds.depth, 260);
  assert.equal(townD2R30PresenceHandoff.seam.worldNorth, 666);
});
