import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTownD2ReworkAcceptance,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-rework-acceptance';

test('D33-3 the acceptance report aggregates every D2 source contract', () => {
  const report = resolveTownD2ReworkAcceptance();
  assert.equal(report.version, 'd2-rework-acceptance-1.0');
  assert.equal(report.owner, 'D2');
  assert.equal(report.readyForPairReview, true);
  assert.equal(report.domain.sector.areaSquareKm, 0.786);
  assert.deepEqual(report.domain.worldAnchor, { east: 300, north: 676 });
  assert.equal(report.domain.canonicalSpacing, 8);
  assert.equal(report.checks.canonicalFieldShared, true);
  assert.equal(report.checks.seamBandsClean, true);
  assert.equal(report.checks.cloudSwapSupported, true);
  assert.equal(report.checks.roundTripSupported, true);
  assert.equal(report.checks.farLodSameSource, true);
});

test('D33-3 the report never claims the public game is mounted or play-tested', () => {
  const report = resolveTownD2ReworkAcceptance();
  // These belong to A's single-writer files and a real two-client play test.
  // Asserting them false is the honest state, not a pending placeholder.
  assert.equal(report.checks.publicSceneMounted, false);
  assert.equal(report.checks.presenceWired, false);
  assert.equal(report.checks.twoClientVerified, false);
  assert.equal(report.walk.productionReady, false);
  assert.equal(report.walk.checks.presenceWired, false);
});

test('D33-3 the report publishes owner/revision/LOD/dispose support contract', () => {
  const report = resolveTownD2ReworkAcceptance();
  assert.equal(report.lifecycle.groupLifecycle, 'create/dispose per module');
  assert.equal(report.lifecycle.collisionIsSameSource, true);
  assert.equal(report.lifecycle.streamingDefault, 'static');
  assert.deepEqual(report.lod.levels.map(level => level.name), ['near', 'mid', 'far', 'horizon']);
  assert.deepEqual(report.lod.levels.map(level => level.spacing), [8, 16, 32, 64]);
  assert.equal(report.lod.far.replacesR31Apron, true);
  assert.equal(report.terrain.seams.readyForSeamAssembly, true);
});

test('D33-3 the report is immutable and deterministic', () => {
  const a = resolveTownD2ReworkAcceptance();
  const b = resolveTownD2ReworkAcceptance();
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.checks) && Object.isFrozen(a.domain));
  assert.deepEqual(a.checks, b.checks);
  assert.deepEqual(a.domain, b.domain);
  assert.equal(a.terrain.sector.version, b.terrain.sector.version);
  assert.equal(a.walk.metrics.outboundPoints, b.walk.metrics.outboundPoints);
});
