import assert from 'node:assert/strict';
import test from 'node:test';
import { auditU1SurfaceApproaches } from './verify-u1-surface-approaches.mjs';

function makeEvidence() {
  const frame = { center: { east: 0, north: 0 }, floorY: -35, floorRadius: 20,
    shaft: { east: 0, north: 0, radius: 1.833333 } };
  function walk(cover, west) {
    const counts = 300;
    const feet = Array.from({ length: counts + 1 }, (_, i) => {
      const y = -35 * i / counts;
      const constriction = west ? undefined : i >= 55 && i <= 58 ? 'west-of-bend' : i >= 170 && i <= 176 ? 'east-of-bend' : undefined;
      return {
        east: (west ? -1 : 1) * (55 - i * 38 / counts), north: 0, y, timeMs: i * 1000 / 60, tick: i,
        supportY: y, renderY: y, cover, mode: 'peace', sweptClear: true, relocated: false,
        support: west && i === counts ? 'dry-surface-gravel' : 'walkway',
        ...(west ? {} : { yaw: 0, left: .33, right: .31, headroom: 1.90, constriction,
          movement: constriction ? 'sidestep' : 'walk' }),
      };
    });
    const finish = feet.at(-1);
    return { feet, ...(west ? { reverseProbe: { attempted: true, accepted: false, from: { ...finish }, to: { ...finish } } }
      : { blastDoor: 'half-open' }) };
  }
  return { frame, routes: { westSlide: { covered: walk('covered', true), opened: walk('opened', true) },
    eastSideCorridor: { covered: walk('covered', false), opened: walk('opened', false) } } };
}
const reasons = evidence => auditU1SurfaceApproaches(evidence).issues.map(({ code }) => code);

test('reads both terrain routes independently of opening the separate well', () => {
  const accepted = auditU1SurfaceApproaches(makeEvidence());
  assert.equal(accepted.acceptanceReady, true);
  assert.equal(accepted.measured.length, 4);
  assert.equal(accepted.measured[0].samples, 301);
  assert.ok(accepted.measured[0].peakGradePercent > 90);
  assert.deepEqual(accepted.measured[2].constrictions, ['west-of-bend', 'east-of-bend']);
  assert.ok(Math.abs(accepted.measured[2].minWidth - .64) < 1e-12);
});

test('rejects a shaft intrusion, survival mode, or a route that depends on opening the lid', () => {
  const evidence = makeEvidence();
  evidence.routes.westSlide.covered.feet[150].east = -1;
  evidence.routes.westSlide.covered.feet[150].mode = 'survival';
  delete evidence.routes.eastSideCorridor.covered;
  const codes = reasons(evidence);
  assert.ok(codes.includes('route-enters-shaft-footprint'));
  assert.ok(codes.includes('underground-or-wrong-well-state'));
  assert.ok(codes.includes('missing-or-invalid-foot-samples'));
});

test('requires actual gravel completion, a downhill trace and a denied reverse attempt in both versions', () => {
  const evidence = makeEvidence();
  const run = evidence.routes.westSlide.opened;
  run.feet[20].y += 1;
  run.feet.at(-1).support = 'pool';
  run.reverseProbe.accepted = true;
  assert.ok(reasons(evidence).includes('slide-ascends'));
  assert.ok(reasons(evidence).includes('wrong-slide-entry-or-gravel-exit'));
  assert.ok(reasons(evidence).includes('one-way-return-not-proven'));
});

test('a side corridor needs both distinct sidesteps, an east outlet, half-open state and positive clearance', () => {
  const evidence = makeEvidence();
  const run = evidence.routes.eastSideCorridor.covered;
  for (const point of run.feet) if (point.constriction === 'west-of-bend') point.movement = 'walk';
  run.feet[173].left = .20;
  run.feet.at(-1).east = -17;
  run.blastDoor = 'locked';
  const codes = reasons(evidence);
  for (const requirement of ['two-distinct-sidesteps-not-proven', 'arrival-not-on-east-side',
    'insufficient-body-clearance', 'half-open-gate-not-observed']) assert.ok(codes.includes(requirement));
});

test('sideways labels do not replace sideways displacement in the two tight parts', () => {
  const evidence = makeEvidence();
  const run = evidence.routes.eastSideCorridor.covered;
  for (const point of run.feet) if (point.constriction === 'west-of-bend') point.yaw = Math.PI / 2;
  assert.ok(reasons(evidence).includes('two-distinct-sidesteps-not-proven'));
});

test('camera relocation, a missing swept check, an unsupported floor and movement cliffs cannot pass', () => {
  const evidence = makeEvidence();
  const route = evidence.routes.eastSideCorridor.opened.feet;
  route[42].relocated = true;
  route[43].sweptClear = false;
  route[44].renderY += 1;
  route[45].tick = 9000;
  route[46].y -= 2;
  route[47].east -= 2;
  const codes = reasons(evidence);
  for (const requirement of ['obstructed-or-relocated', 'unverified-visible-support', 'nonconsecutive-step-clock',
    'corridor-exceeds-native-step', 'corridor-exceeds-native-stride']) assert.ok(codes.includes(requirement));
});
