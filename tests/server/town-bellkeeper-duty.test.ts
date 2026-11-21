import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTownBellkeeperDuty, townBellkeeperWaterClock,
  type TownBellkeeperSchedule,
} from '../../src/shared/town-bellkeeper-duty';

const schedule: TownBellkeeperSchedule = Object.freeze({
  nightId: 'night-7',
  duskAt: 100_000,
  midnightAt: 130_000,
  secondMidnightAt: 160_000,
  beaconAt: 190_000,
  beaconExpiresAt: 250_000,
  dawnAt: 280_000,
});
const tuning = {
  minimumChargeMs: 450,
  maximumChargeMs: 1500,
  maxGazeSampleGapMs: 250,
};
function create() { return createTownBellkeeperDuty(tuning); }
function ring(
  duty: ReturnType<typeof create>,
  profile: string,
  bell: 'dusk' | 'midnight' | 'second-midnight',
  at: number, chargeMs = 700,
) {
  assert.equal(duty.pressRope(profile, bell, at - chargeMs), true);
  const result = duty.releaseRope(profile, at);
  assert.equal(result?.bell, bell);
  return result;
}
function gaze(
  duty: ReturnType<typeof create>, profile: string,
  start: number, end: number, looking = true, delta = 100,
) {
  for (let now = start; now <= end; now += delta) {
    assert.equal(duty.observe(profile, now, looking), true);
  }
}
test('rejects fabricated, unordered, nonintegral ZB-17 clock boundaries and tuning', () => {
  const duty = create();
  assert.throws(() => duty.beginDuty('alice', { ...schedule, dawnAt: schedule.beaconAt }, 100000), RangeError);
  assert.throws(() => duty.beginDuty('alice', { ...schedule, duskAt: NaN }, 100000), RangeError);
  assert.throws(() => duty.beginDuty('alice', { ...schedule, nightId: '' }, 100000), RangeError);
  assert.throws(() => duty.beginDuty('alice', { ...schedule, beaconExpiresAt: schedule.beaconAt + 5000 }, 100000), RangeError);
  assert.throws(() => createTownBellkeeperDuty({ ...tuning, maximumChargeMs: 300 }), RangeError);
  assert.throws(() => createTownBellkeeperDuty({ ...tuning, maxGazeSampleGapMs: 10_000 }), RangeError);
});
test('shift starts only at night and cannot be cloned or restarted mid-shift', () => {
  const duty = create();
  assert.equal(duty.beginDuty('', schedule, schedule.duskAt), false);
  assert.equal(duty.beginDuty('alice', schedule, schedule.duskAt - 7000), false);
  assert.equal(duty.beginDuty('alice', schedule, schedule.dawnAt), false);
  assert.equal(duty.beginDuty('alice', schedule, schedule.duskAt), true);
  assert.equal(duty.beginDuty('alice', schedule, schedule.duskAt + 100), false);
  assert.equal(duty.beginDuty('bob', schedule, schedule.duskAt), true);
  assert.equal(duty.snapshot('alice')?.onDuty, true);
  assert.equal(duty.snapshot('bob')?.onDuty, true);
});
test('three manual bells are graded separately, dawn is always automatic', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(ring(duty, 'alice', 'dusk', schedule.duskAt + 700)?.grade, 'accurate');
  assert.equal(ring(duty, 'alice', 'midnight', schedule.midnightAt + 600, 200)?.grade, 'missed');
  assert.equal(ring(duty, 'alice', 'second-midnight', schedule.secondMidnightAt + 800, 1700)?.grade, 'over');
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.deepEqual(page?.records.map(r => [r.bell, r.grade]), [
    ['dusk', 'accurate'], ['midnight', 'missed'],
    ['second-midnight', 'over'], ['dawn', 'automatic'],
  ]);
  assert.equal(duty.snapshot('alice')?.completed, true);
  assert.equal(duty.ledger('alice').length, 1);
});
test('skipping a bell does not make later shifts impossible: misses stay soft', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(ring(duty, 'alice', 'midnight', schedule.midnightAt + 700)?.grade, 'accurate');
  assert.equal(duty.snapshot('alice')?.records[0].grade, 'missed');
  assert.equal(ring(duty, 'alice', 'second-midnight', schedule.secondMidnightAt + 700)?.grade, 'accurate');
});
test('time window misses early / over late, and no rope can be struck after dawn', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(ring(duty, 'alice', 'midnight', schedule.midnightAt - 6100)?.grade, 'missed');
  assert.equal(ring(duty, 'alice', 'second-midnight', schedule.secondMidnightAt + 6200)?.grade, 'over');
  assert.equal(duty.pressRope('alice', 'second-midnight', schedule.dawnAt + 200), false);
});
test('cannot ring duplicate or out-of-order future bell', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(duty.pressRope('alice', 'second-midnight', schedule.duskAt + 300), false);
  ring(duty, 'alice', 'dusk', schedule.duskAt + 700);
  assert.equal(duty.pressRope('alice', 'dusk', schedule.duskAt + 1000), false);
  assert.equal(duty.releaseRope('alice', schedule.duskAt + 1000), null);
});
test('successful gaze is at least 80% of the authoritative beacon interval', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  gaze(duty, 'alice', schedule.beaconAt, schedule.beaconExpiresAt);
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.equal(page?.observedMs, 60_000);
  assert.equal(page?.requiredMs, 48_000);
  assert.equal(page?.witnessed, true);
});
test('looking away for more than one fifth fails without a penalty popup', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  gaze(duty, 'alice', schedule.beaconAt, schedule.beaconAt + 40_000);
  gaze(duty, 'alice', schedule.beaconAt + 40_100, schedule.beaconExpiresAt, false);
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.equal(page?.witnessed, false);
  assert.equal(page?.interrupted, false);
});
test('attempted interaction inside the thirteenth-bell window invalidates gaze', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  gaze(duty, 'alice', schedule.beaconAt, schedule.beaconAt + 30_000);
  assert.equal(duty.interact('alice', schedule.beaconAt + 30_100), true);
  gaze(duty, 'alice', schedule.beaconAt + 30_200, schedule.beaconExpiresAt);
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.equal(page?.interrupted, true);
  assert.equal(page?.witnessed, false);
});
test('holding an un-released rope across the apparition minute breaks hands-off watch', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(duty.pressRope('alice', 'second-midnight', schedule.secondMidnightAt), true);
  gaze(duty, 'alice', schedule.beaconAt, schedule.beaconExpiresAt);
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.equal(page?.interrupted, true);
  assert.equal(page?.witnessed, false);
});
test('intermittent or disconnected client cannot obtain 80% gaze with a stale sample', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(duty.observe('alice', schedule.beaconAt, true), true);
  assert.equal(duty.observe('alice', schedule.beaconExpiresAt, true), true);
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.equal(page?.observedMs, 0);
  assert.equal(page?.witnessed, false);
});
test('second player gaze cannot contribute to first player watch', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.ok(duty.beginDuty('bob', schedule, schedule.duskAt));
  gaze(duty, 'bob', schedule.beaconAt, schedule.beaconExpiresAt);
  const alice = duty.finishDawn('alice', schedule.dawnAt);
  const bob = duty.finishDawn('bob', schedule.dawnAt);
  assert.equal(alice?.witnessed, false);
  assert.equal(bob?.witnessed, true);
});
test('dawn close is idempotent and the generated maintenance ledger is stable', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(duty.finishDawn('alice', schedule.dawnAt - 1), null);
  const first = duty.finishDawn('alice', schedule.dawnAt);
  const second = duty.finishDawn('alice', schedule.dawnAt + 1);
  assert.deepEqual(second, first);
  assert.equal(duty.ledger('alice').length, 1);
  assert.equal(duty.beginDuty('alice', { ...schedule, nightId: 'night-8',
    duskAt: 400_000, midnightAt: 430_000, secondMidnightAt: 460_000,
    beaconAt: 490_000, beaconExpiresAt: 550_000, dawnAt: 580_000 }, 400_000), true);
});
test('abandoned rope has no phantom bell and permits a retry before the mark', () => {
  const duty = create();
  assert.equal(duty.beginDuty('alice', schedule, schedule.duskAt), true);
  assert.equal(duty.pressRope('alice', 'dusk', schedule.duskAt), true);
  assert.equal(duty.abandonRope('alice', schedule.duskAt + 100), true);
  assert.equal(duty.snapshot('alice')?.charging, null);
  assert.equal(duty.abandonRope('alice', schedule.duskAt + 101), false);
  assert.equal(ring(duty, 'alice', 'dusk', schedule.duskAt + 1200)?.grade, 'accurate');
  const page = duty.finishDawn('alice', schedule.dawnAt);
  assert.equal(page?.records[0].grade, 'accurate');
});
test('rope held across the apparition minute spoils watch even with no samples', () => {
  const duty = create();
  assert.equal(duty.beginDuty('alice', schedule, schedule.duskAt), true);
  assert.equal(duty.pressRope('alice', 'second-midnight', schedule.secondMidnightAt), true);
  assert.equal(duty.abandonRope('alice', schedule.beaconExpiresAt + 1), true);
  // No gaze samples at all: rope occupancy across the witness interval
  // must still be registered as an interrupted watch.
  assert.equal(duty.finishDawn('alice', schedule.dawnAt)?.interrupted, true);
  assert.equal(duty.ledger('alice')[0]?.witnessed, false);
});
test('abandon rope requires monotonic server time and valid active duty', () => {
  const duty = create();
  assert.equal(duty.abandonRope('alice', schedule.duskAt), false);
  assert.equal(duty.beginDuty('alice', schedule, schedule.duskAt), true);
  assert.equal(duty.pressRope('alice', 'dusk', schedule.duskAt + 5), true);
  assert.equal(duty.abandonRope('alice', schedule.duskAt), false);
  assert.equal(duty.snapshot('alice')?.charging, 'dusk');
  assert.equal(duty.abandonRope('alice', schedule.duskAt + 9), true);
  assert.equal(duty.abandonRope('alice', schedule.duskAt + 10), false);
});
test('untrusted backwards timestamp is rejected for state changes', () => {
  const duty = create();
  assert.ok(duty.beginDuty('alice', schedule, schedule.duskAt));
  assert.equal(duty.observe('alice', schedule.duskAt + 100, true), true);
  assert.equal(duty.observe('alice', schedule.duskAt + 50, true), false);
  assert.equal(duty.pressRope('alice', 'dusk', schedule.duskAt), false);
});
test('water clock gives no map arrow and only derived next mark / liquid level', () => {
  const cue = townBellkeeperWaterClock(schedule, schedule.midnightAt - 500);
  assert.equal(cue?.bell, 'midnight');
  assert.equal(cue?.withinMark, true);
  assert.ok((cue?.liquidLevel ?? 0) > .9);
  assert.equal(townBellkeeperWaterClock(schedule, schedule.dawnAt + 1), null);
  assert.equal(townBellkeeperWaterClock(schedule, Number.NaN), null);
});
