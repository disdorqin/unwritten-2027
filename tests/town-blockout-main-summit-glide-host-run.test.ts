import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnowWingFlight } from '../src/shared/snow-wing';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createSummitGlideHostRun } from '../tools/voxel-tavern/town-blockout/main-summit-glide-host-run';
import { summitGlideNineRingMetres, surveySummitGlideRings } from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';
import { surveySummitGlidePracticeTarget } from '../tools/voxel-tavern/town-blockout/main-summit-glide-target';

const launch = { east: 62.5, north: 975, height: 800, heading: Math.PI, speed: 7.5,
  drop: 800, pathClear: true, claimed: true };

function setup(context: { after: (action: () => void) => void }) {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(() => block.dispose());
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  const target = surveySummitGlidePracticeTarget(launch, groundAt)!;
  const run = createSummitGlideHostRun({
    flightId: 'flight-9', playerId: 'test-player', dayId: 'official-day-0',
    startedAtMs: 100_000, launch, rings, target, groundAt,
  });
  const flight = createSnowWingFlight(groundAt);
  assert.ok(flight.launch(launch));
  return { run, flight, rings, target, groundAt };
}

function frame(point: { east: number; north: number; height: number }, index = 1) {
  return {
    flightId: 'flight-9', playerId: 'test-player', dayId: 'official-day-0',
    frame: index, atMs: 100_000 + Math.round(index * 1000 / 60), accepted: true,
    point: { east: point.east, north: point.north, height: point.height },
    phase: 'airborne' as const, touchdown: null,
  };
}

test('ZD-08 host: one authoritative full nine-ring accepted-frame run then landing finalizes', context => {
  const { run, flight } = setup(context);
  let receipt;
  for (let index = 1; index <= 36_000; index++) {
    const next = flight.advance(1 / 60)!;
    const tick = frame(next, index);
    const accepted = run.consume(next.phase === 'landed'
      ? { ...tick, phase: 'landed', touchdown: next.touchdown } : tick);
    assert.equal(accepted.accepted, true, JSON.stringify({ index, accepted }));
    if (next.phase === 'landed') {
      receipt = next;
      break;
    }
  }
  assert.ok(receipt, 'must encounter the registered touchdown');
  const settled = run.snapshot();
  assert.equal(settled.finalized, true);
  assert.equal(settled.ringCount, 9);
  assert.equal(settled.nextRing, 9);
  assert.equal(settled.scoreHalfPoints, 18);
  assert.equal(settled.streak, 9);
  assert.deepEqual(settled.results.map(r => r.grade), Array(9).fill('clean'));
  assert.equal(settled.target?.grade, 'bullseye');
  assert.equal(settled.target?.horizontalMetres, 0);
  assert.deepEqual(run.consume({ ...frame(receipt, settled.lastFrame + 1),
    phase: 'landed', touchdown: receipt.touchdown }), { accepted: false, reason: 'completed' });
});

test('ZD-08 host: unauthorized player/day, false accepted receipt, stale frame and teleport never mutate scores', context => {
  const { run, flight } = setup(context);
  const next = flight.advance(1 / 60)!;
  const good = frame(next);
  assert.deepEqual(run.consume({ ...good, playerId: 'somebody-else' }), { accepted: false, reason: 'identity' });
  assert.deepEqual(run.consume({ ...good, dayId: 'unknown-day' }), { accepted: false, reason: 'identity' });
  assert.deepEqual(run.consume({ ...good, accepted: false }), { accepted: false, reason: 'unauthorized' });
  assert.deepEqual(run.consume({ ...good, point: { east: 500, north: 1000, height: 400 } }),
    { accepted: false, reason: 'unsafe-step' });
  assert.deepEqual(run.consume({ ...good, atMs: 100_000 }),
    { accepted: false, reason: 'stale-frame' });
  assert.equal(run.snapshot().nextRing, 0);
  assert.equal(run.snapshot().lastFrame, 0);
  assert.equal(run.consume(good).accepted, true);
  const after = run.snapshot();
  assert.deepEqual(run.consume(good), { accepted: false, reason: 'stale-frame' });
  assert.equal(run.snapshot().lastFrame, 1);
  assert.equal(run.snapshot().scoreHalfPoints, after.scoreHalfPoints);
});

test('ZD-08 host: premature landing and unregistered ground never settle or freeze the course', context => {
  const { run, flight, target } = setup(context);
  const first = flight.advance(1 / 60)!;
  const good = frame(first, 1);
  assert.equal(run.consume(good).accepted, true);
  const suspicious = { ...frame({ ...first, height: first.height - 100 }, 2),
    phase: 'landed' as const, touchdown: 'soft' as const };
  assert.deepEqual(run.consume(suspicious), { accepted: false, reason: 'unsafe-step' });
  assert.equal(run.snapshot().finalized, false);
  assert.equal(run.snapshot().target, undefined);
  assert.deepEqual(run.consume({ ...frame({ ...target }, 3), phase: 'landed', touchdown: 'soft' }),
    { accepted: false, reason: 'unsafe-step' }, 'instant teleport to the real target is not an accepted flight');
  assert.equal(run.snapshot().lastFrame, 1);
});

test('ZD-08 host: malformed session or unregistered/empty ring authority refuses to start', context => {
  const { rings, groundAt, target } = setup(context);
  const args = { flightId: 'flight-9', playerId: 'test-player', dayId: 'official-day-0',
    startedAtMs: 100_000, launch, rings, target, groundAt };
  assert.throws(() => createSummitGlideHostRun({ ...args, flightId: ' ' }), RangeError);
  assert.throws(() => createSummitGlideHostRun({ ...args, dayId: '' }), RangeError);
  assert.throws(() => createSummitGlideHostRun({ ...args, rings: [] }), RangeError);
  assert.throws(() => createSummitGlideHostRun({ ...args, launch: { ...launch, east: NaN } }), RangeError);
});
