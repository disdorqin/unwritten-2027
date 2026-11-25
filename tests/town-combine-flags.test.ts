import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCombineFlags } from '../src/shared/town-combine-flags';
import { createOrdinaryTownNightSchedule, townDaylightMs } from '../src/shared/town-night-window';

const dawnEpoch = Date.UTC(2026, 0, 1);
const offsets = Array.from({ length: 12 }, (_, i) => (50 + i * 11) * 1000);
const scheduleAt = createOrdinaryTownNightSchedule({ dawnEpoch, beaconOffsetsAfterDusk: offsets, cueFreshnessMs: 60_000 });
const day0Beacon = dawnEpoch + townDaylightMs + 50_000;
const day1Beacon = day0Beacon + 10 * 60_000 + 11_000; // next day: +10 min day, drift +11 s

function flags(key = true) {
  return createCombineFlags({ scheduleAt, hasStoryKey: () => key });
}

test('the hands event fires exactly once: first forge, never again', () => {
  const f = flags();
  assert.equal(f.snapshot(day0Beacon).handsEventPending, false);
  assert.deepEqual(f.forgeCompleted(), { handsEvent: true });
  assert.equal(f.snapshot(day0Beacon).handsEventPending, true);
  assert.deepEqual(f.forgeCompleted(), { handsEvent: false }, 'a second forge report does not re-fire the town event');
});

test('assembly requires a forge; ignition requires assembly, the key, and the beacon minute', () => {
  const f = flags();
  assert.equal(f.assemblyCompleted(), false, 'nothing to assemble before the forge');
  f.forgeCompleted();
  assert.equal(f.ignite(day0Beacon), false, 'not assembled yet');
  assert.equal(f.assemblyCompleted(), true);
  assert.equal(f.ignite(day0Beacon - 1), false, 'one millisecond early is outside the minute');
  assert.equal(f.ignite(day0Beacon + 60_000), false, 'the minute has passed');
  assert.equal(f.snapshot(day0Beacon + 30_000).ignitionOpen, true);
  assert.equal(f.ignite(day0Beacon + 30_000), true);
  const keyless = flags(false);
  keyless.forgeCompleted(); keyless.assemblyCompleted();
  assert.equal(keyless.snapshot(day0Beacon).ignitionOpen, false);
  assert.equal(keyless.ignite(day0Beacon), false, 'no story key, no ignition');
});

test('first ignition flips the form to daily for good; daily openings stay solo and window-bound', () => {
  const f = flags();
  f.forgeCompleted(); f.assemblyCompleted();
  assert.equal(f.snapshot(day0Beacon).mode, 'first');
  assert.equal(f.ignite(day0Beacon), true);
  const after = f.snapshot(day1Beacon);
  assert.equal(after.mode, 'daily');
  assert.equal(after.stage, 'ignited');
  assert.equal(after.handsEventPending, false);
  assert.equal(f.ignite(day1Beacon + 5_000), true, 'daily opening uses the same beacon minute, no procession');
  assert.deepEqual(f.forgeCompleted(), { handsEvent: false }, 're-forging in the daily era never re-fires the event');
});
