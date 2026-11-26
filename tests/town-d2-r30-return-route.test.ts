import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMainSummitBlock, mainSummitLayout,
} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { auditTownD2R30ReturnRoute } from '../tools/voxel-tavern/town-blockout/town-d2-r30-return-route';
import {
  resolveTownD2CloudTerraceTransform, townD2CloudTerraceContract,
} from '../tools/voxel-tavern/town-blockout/town-d2-cloud-terrace-transform';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

const report = auditTownD2R30ReturnRoute();

test('D2-R30 canonical summit outbound and return have continuous authoritative support', () => {
  const { route, metrics, checks } = report;
  assert.equal(metrics.unsupportedOutbound, 0);
  assert.equal(metrics.unsupportedReturn, 0);
  assert.equal(metrics.outboundPoints, route.outbound.length);
  assert.equal(metrics.returnPoints, route.return.length);
  assert.equal(metrics.outboundPoints, metrics.returnPoints);
  assert.equal(metrics.walkSamples, metrics.outboundPoints * 2);
  assert.deepEqual(route.return, [...route.outbound].reverse());
  assert.ok(route.outbound.every(point =>
    [point.east, point.north, point.height].every(Number.isFinite) &&
    (point.domain === 'summit' || point.domain === 'front-ridge')));
  assert.ok(checks.arrivalHeightSupported);
  assert.ok(checks.outboundContinuous);
  assert.ok(checks.returnContinuous);
  assert.ok(checks.returnExactlyReversed);
  assert.ok(checks.surfaceDriftFinite);
  assert.ok(metrics.maxSurfaceDrift > 0, 'natural R30 ground drift must be reported, not used as tread support');
  assert.equal(checks.presenceWired, false);
  assert.equal(report.productionReady, false);
});

test('D2-R30 return-route step and grade stay within the canonical trail envelope', () => {
  const block = createMainSummitBlock(mainSummitLayout, townD2CloudTerraceContract.arrivalHeight, 100);
  const trail = createMainSummitTrail(block.heightAt, townD2CloudTerraceContract.arrivalHeight);
  block.dispose();
  let canonicalMaxStep = 0;
  for (let index = 1; index < trail.points.length; index++) {
    const from = trail.points[index - 1]!, to = trail.points[index]!;
    canonicalMaxStep = Math.max(canonicalMaxStep, Math.hypot(
      to.east - from.east, to.north - from.north, to.height - from.height,
    ));
  }
  assert.ok(Number.isFinite(report.metrics.maxStep));
  assert.ok(Number.isFinite(report.metrics.maxGrade));
  assert.ok(report.metrics.maxStep <= 1 + 1e-9);
  assert.ok(report.metrics.maxGrade <= trail.metrics.maxGrade + 1e-9);
  assert.ok(report.checks.stepWithinCanonical);
  assert.ok(report.checks.gradeWithinCanonical);
});

test('D2-R30 seam and return anchors consume the canonical cloud-terrace transform', () => {
  const transform = resolveTownD2CloudTerraceTransform();
  assert.equal(report.route.seam.version, townD2CloudTerraceContract.version);
  assert.equal(report.route.seam.north, townD2CloudTerraceContract.seamNorthLocal);
  assert.equal(report.route.seam.domain, 'domain-swap');
  assert.ok(Number.isFinite(report.route.seam.height));
  assert.ok(report.route.seam.supported);
  assert.ok(report.checks.seamSupported);
  assert.ok(report.checks.transformCanonical);
  assert.deepEqual(
    report.route.anchors.map(anchor => ({ id: anchor.id, domain: anchor.domain, east: anchor.east, north: anchor.north })),
    transform.returnAnchors.map(anchor => ({
      id: anchor.id, domain: anchor.domain, east: anchor.local.east, north: anchor.local.north,
    })),
  );
  assert.ok(report.route.anchors.length > 0);
  assert.ok(report.route.anchors.every(anchor => anchor.supported && Number.isFinite(anchor.height)));
  assert.ok(report.checks.returnAnchorsSupported);
});

test('D2-R30 missing canonical height fails closed instead of inventing support', () => {
  assert.throws(() => auditTownD2R30ReturnRoute({
    heightAt: (east, north) => east === 0 && north === 0
      ? undefined
      : sampleTownD2R30Height(east, north),
  }), RangeError);
});

test('D2-R30 return-route audit releases temporary state and is deterministic', () => {
  const repeated = auditTownD2R30ReturnRoute();
  assert.deepEqual(repeated, report);
  assert.equal(repeated.productionReady, false);
  assert.equal(repeated.checks.presenceWired, false);
});
