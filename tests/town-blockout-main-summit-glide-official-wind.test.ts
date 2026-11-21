import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnowWingFlight } from '../src/shared/snow-wing';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createSummitGlideHostRun } from '../tools/voxel-tavern/town-blockout/main-summit-glide-host-run';
import { surveySummitGlidePracticeTarget } from '../tools/voxel-tavern/town-blockout/main-summit-glide-target';
import { surveySummitGlideRings, summitGlideNineRingMetres } from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';
import {
  createSummitOfficialDayCourseGate, parseSummitGlideWindReceipt,
} from '../tools/voxel-tavern/town-blockout/main-summit-glide-official-wind';

const launch = { east: 62.5, north: 975, height: 800, heading: Math.PI,
  speed: 7.5, drop: 800, pathClear: true, claimed: true };
const receipt = {
  kind: 'summit-glide-day-wind', source: 'G-09', unit: 'm/s',
  dayId: 'race-day-a', revision: 1,
  issuedAtMs: 1_000_100, effectiveAtMs: 1_000_000, expiresAtMs: 2_000_000,
  eastMetresPerSecond: 4, northMetresPerSecond: 1,
};

test('ZD-08 official wind gate only parses explicit physical m/s receipts, never G-09 normalized winds', () => {
  assert.deepEqual(parseSummitGlideWindReceipt(receipt), receipt);
  assert.equal(parseSummitGlideWindReceipt(null), undefined);
  assert.equal(parseSummitGlideWindReceipt([]), undefined);
  assert.equal(parseSummitGlideWindReceipt({
    weather: 'wind', startedAt: 0, nextChangeAt: 500_000, windEast: .6, windNorth: .8,
    windStrength: .5,
  }), undefined, 'The actual G-09 state does not contain velocity units');
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, unit: 'm/s²' }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, windStrength: .5 }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, accelerationEast: .2 }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, source: 'snowball' }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, revision: -1 }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, dayId: ' day a ' }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, eastMetresPerSecond: NaN }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, eastMetresPerSecond: 36 }), undefined);
  assert.equal(parseSummitGlideWindReceipt({ ...receipt, expiresAtMs: 900_000 }), undefined);
});

test('ZD-08 host wind gate publishes one measured day course only inside signed-off time window', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  const copy = structuredClone(rings);
  let now = 1_000_200;
  let inbound: unknown = receipt;
  const gate = createSummitOfficialDayCourseGate(rings, {
    nowMs: () => now, receive: () => inbound, groundAt,
  });
  const first = gate.atServerNow()!;
  assert.ok(first);
  assert.equal(first.course.dayId, 'race-day-a');
  assert.equal(first.course.rings.length, 9);
  assert.ok(first.course.rings[0]!.east !== rings[0]!.east);
  assert.deepEqual(rings, copy, 'Host cannot rewrite the approved baseline survey');
  assert.equal(gate.atServerNow(), first, 'Same revision returns same frozen course');
  inbound = null;
  assert.equal(gate.atServerNow(), first, 'Within its valid window the last trusted receipt remains valid');
  now = receipt.expiresAtMs;
  assert.equal(gate.atServerNow(), undefined, 'Expired physical wind must not leak to the next day');
});

test('ZD-08 host wind gate refuses stale rewinds, conflicting same-revision wind and future issued receipts', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  let now = 1_000_200;
  let inbound: unknown = receipt;
  const gate = createSummitOfficialDayCourseGate(rings, {
    nowMs: () => now, receive: () => inbound, groundAt,
  });
  const first = gate.atServerNow()!;
  inbound = { ...receipt, northMetresPerSecond: 3 };
  assert.equal(gate.atServerNow(), undefined, 'Conflicting same-revision velocity must not quietly change the course');
  inbound = { ...receipt, revision: 2, dayId: 'race-day-b', eastMetresPerSecond: -5 };
  const second = gate.atServerNow()!;
  assert.ok(second);
  assert.notDeepEqual(second.course.rings, first.course.rings);
  inbound = receipt;
  assert.equal(gate.atServerNow(), undefined, 'Stale replay cannot roll back a published official course');
  inbound = { ...receipt, revision: 3, issuedAtMs: now + 1 };
  assert.equal(gate.atServerNow(), undefined, 'Future-issued snapshot must not be accepted');
  inbound = { ...receipt, revision: 3, effectiveAtMs: now + 1 };
  assert.equal(gate.atServerNow(), undefined, 'Future effective window must not be accepted');
  now = Number.NaN;
  assert.equal(gate.atServerNow(), undefined, 'Broken host clock never falls back to local Date.now()');
});

test('ZD-08: mid-flight official day revision does not relocate a live player\'s certified nine-ring race', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  const target = surveySummitGlidePracticeTarget(launch, groundAt)!;
  let now = 1_000_200;
  let published: unknown = receipt;
  const gate = createSummitOfficialDayCourseGate(rings, {
    nowMs: () => now, receive: () => published, groundAt,
  });
  const first = gate.atServerNow()!;
  const run = createSummitGlideHostRun({ flightId: 'race-locked', playerId: 'visitor-1',
    dayId: first.course.dayId, startedAtMs: now, launch, rings: first.course.rings,
    target, groundAt });
  const wing = createSnowWingFlight(groundAt);
  assert.ok(wing.launch(launch));
  let changed = false;
  for (let i = 1; i < 36_000; i++) {
    const next = wing.advance(1 / 60)!;
    const frame = {
      flightId: 'race-locked', playerId: 'visitor-1', dayId: 'race-day-a',
      frame: i, atMs: 1_000_200 + Math.round(i * 1_000 / 60), accepted: true,
      point: { east: next.east, north: next.north, height: next.height },
      phase: next.phase === 'landed' ? 'landed' as const : 'airborne' as const,
      touchdown: next.touchdown,
    };
    if (i === 800) {
      const before = run.snapshot();
      now += 5_000;
      published = { ...receipt, revision: 2, dayId: 'race-day-b', eastMetresPerSecond: -4 };
      const updated = gate.atServerNow()!;
      assert.notDeepEqual(updated.course.rings, first.course.rings);
      assert.deepEqual(run.consume({ ...frame, dayId: updated.course.dayId }),
        { accepted: false, reason: 'identity' }, 'A weather update must not steal this flight or reset progress');
      assert.equal(run.snapshot().nextRing, before.nextRing);
      changed = true;
    }
    const decision = run.consume(frame);
    assert.equal(decision.accepted, true, JSON.stringify({ i, decision }));
    if (next.phase === 'landed') break;
  }
  assert.ok(changed);
  const finished = run.snapshot();
  assert.equal(finished.finalized, true);
  assert.equal(finished.dayId, 'race-day-a');
  assert.equal(finished.nextRing, 9);
  assert.equal(finished.scoreHalfPoints, 18);
  assert.equal(finished.target?.grade, 'bullseye');
});

test('ZD-08 host wind gate refuses unmeasured input and malformed course at construction', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  assert.throws(() => createSummitOfficialDayCourseGate([], {
    nowMs: () => 1_000_200, receive: () => receipt, groundAt,
  }), RangeError);
  const gate = createSummitOfficialDayCourseGate(rings, {
    nowMs: () => 1_000_200,
    receive: () => ({
      weather: 'wind', windStrength: 0.5, windEast: 1, windNorth: 0,
    }),
    groundAt,
  });
  assert.equal(gate.atServerNow(), undefined,
    'Current G-09 normalized strength must block the race rather than counterfeit physical speed');
});
