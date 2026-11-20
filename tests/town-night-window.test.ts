import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allowsTownNightTransit, createOrdinaryTownNightSchedule, createTownNightWindow,
  townDaylightMs, townDayMs, townLayerOverlapMs, type TownNightSchedule,
} from '../src/shared/town-night-window.js';

const dawnEpoch = Date.parse('2026-12-29T10:00:00+08:00');
const offsets = Array.from({ length: 12 }, (_, day) => 60_000 + day * 100);
const scheduleAt = createOrdinaryTownNightSchedule({ dawnEpoch, beaconOffsetsAfterDusk: offsets, cueFreshnessMs: 2_000 });
const firstNight = scheduleAt(dawnEpoch)!;

test('ordinary days use six daylight minutes, four night minutes and the supplied repeating drift table', () => {
  assert.equal(scheduleAt(dawnEpoch - 1), undefined);
  const input = [...offsets];
  const schedule = createOrdinaryTownNightSchedule({ dawnEpoch, beaconOffsetsAfterDusk: input, cueFreshnessMs: 2_000 });
  input[0] = 170_000;
  for (let day = 0; day <= 12; day++) {
    const dawn = dawnEpoch + day * townDayMs;
    const night = schedule(dawn)!;
    assert.equal(night.duskAt - dawn, townDaylightMs);
    assert.equal(night.morningBellAt - night.duskAt, 4 * 60_000);
    assert.equal(night.beaconAt - night.duskAt, offsets[day % 12]);
    assert.equal(night.cueExpiresAt, night.beaconAt + 2_000);
    assert.deepEqual(schedule(night.morningBellAt - 1), night);
  }
  const broken = [...offsets];
  broken[0] = 4 * 60_000 - townLayerOverlapMs + 1;
  assert.throws(() => createOrdinaryTownNightSchedule({ dawnEpoch, beaconOffsetsAfterDusk: broken, cueFreshnessMs: 2_000 }), RangeError);
  assert.throws(() => createOrdinaryTownNightSchedule({ dawnEpoch, beaconOffsetsAfterDusk: offsets.slice(1), cueFreshnessMs: 2_000 }), RangeError);
});

test('the trusted scheduled cue commits once and changes shift and entry together', () => {
  let now = firstNight.duskAt - 1;
  const writes: number[] = [];
  const world = createTownNightWindow({ now: () => now, scheduleAt, saveBeacon: at => { writes.push(at); } });
  assert.equal(world.snapshot().phase, 'day');
  now = firstNight.duskAt;
  assert.equal(world.snapshot().phase, 'awaiting-beacon');
  assert.equal(world.recordBeacon(firstNight.beaconAt), undefined);
  now = firstNight.beaconAt;
  assert.equal(world.recordBeacon(firstNight.beaconAt - 1), undefined);
  assert.equal(world.snapshot().shift, 'day');
  assert.equal(world.snapshot().canEnterRestricted, false);
  const cue = world.recordBeacon(firstNight.beaconAt);
  assert.deepEqual(cue, {
    kind: 'town-night-beacon', at: firstNight.beaconAt,
    state: {
      phase: 'night-window', shift: 'night', canEnterRestricted: true, layersOverlap: true,
      chapterGatesLocked: true, beaconAt: firstNight.beaconAt, morningBellAt: firstNight.morningBellAt,
    },
  });
  assert.deepEqual(world.snapshot(), cue?.state);
  assert.equal(world.recordBeacon(firstNight.beaconAt), undefined);
  assert.deepEqual(writes, [firstNight.beaconAt]);
});

test('overlap stops at its first minute, dawn closes only entry, and a late clock cannot reopen the night', () => {
  let now = firstNight.beaconAt;
  const world = createTownNightWindow({ now: () => now, scheduleAt });
  world.recordBeacon(firstNight.beaconAt);
  for (const [time, overlap] of [[townLayerOverlapMs - 1, true], [townLayerOverlapMs, false]] as const) {
    now = firstNight.beaconAt + time;
    const night = world.snapshot();
    assert.equal(night.layersOverlap, overlap);
    assert.equal(allowsTownNightTransit(night, 'enter'), true);
    assert.equal(night.chapterGatesLocked, true);
  }
  now = firstNight.morningBellAt - 1;
  assert.equal(allowsTownNightTransit(world.snapshot(), 'enter'), true);
  now = firstNight.morningBellAt;
  const morning = world.snapshot();
  assert.equal(morning.shift, 'day');
  assert.equal(morning.layersOverlap, false);
  assert.equal(allowsTownNightTransit(morning, 'enter'), false);
  assert.equal(allowsTownNightTransit(morning, 'stay'), true);
  assert.equal(allowsTownNightTransit(morning, 'exit'), true);
  now = firstNight.beaconAt + 20;
  assert.equal(allowsTownNightTransit(world.snapshot(), 'enter'), false);
  assert.equal(world.recordBeacon(firstNight.beaconAt), undefined);
});

test('reconnect and restart read the committed window without replay, and a fresh night may announce', () => {
  let now = firstNight.beaconAt;
  let saved: number | null = null;
  let world = createTownNightWindow({ now: () => now, scheduleAt, saveBeacon: at => { saved = at; } });
  assert.ok(world.recordBeacon(firstNight.beaconAt));
  now += townLayerOverlapMs;
  world = createTownNightWindow({ now: () => now, scheduleAt }, saved);
  assert.equal(world.snapshot().canEnterRestricted, true);
  assert.equal(world.snapshot().layersOverlap, false);
  assert.equal(world.recordBeacon(firstNight.beaconAt), undefined);
  const latest = scheduleAt(dawnEpoch + townDayMs)!;
  now = latest.beaconAt;
  assert.equal(world.snapshot().canEnterRestricted, false);
  assert.equal(world.recordBeacon(latest.beaconAt)?.at, latest.beaconAt);
});

test('expired cues never open a window, and a persistence failure may retry only within the live window', () => {
  let now = firstNight.cueExpiresAt;
  const expired = createTownNightWindow({ now: () => now, scheduleAt });
  assert.equal(expired.recordBeacon(firstNight.beaconAt), undefined);
  assert.equal(expired.snapshot().canEnterRestricted, false);
  now = firstNight.beaconAt + 1;
  assert.equal(expired.recordBeacon(firstNight.beaconAt), undefined);

  let fail = true;
  const world = createTownNightWindow({ now: () => now, scheduleAt, saveBeacon(at) {
    assert.equal(world.recordBeacon(at), undefined);
    if (fail) throw new Error('receipt write failed');
  } });
  assert.throws(() => world.recordBeacon(firstNight.beaconAt), /receipt write failed/);
  assert.equal(world.snapshot().canEnterRestricted, false);
  fail = false;
  assert.equal(world.recordBeacon(firstNight.beaconAt)?.state.shift, 'night');
});

test('a host-supplied real-time New Year schedule overrides ordinary days without treating the 23:52 cue as the beacon', () => {
  const midnight = Date.parse('2027-01-01T00:00:00+08:00');
  const starPass = Date.parse('2026-12-31T23:52:00+08:00');
  const annual: TownNightSchedule = {
    duskAt: starPass - 5 * 60_000,
    beaconAt: midnight,
    morningBellAt: midnight + 20 * 60_000,
    cueExpiresAt: midnight + 2_000,
  };
  let now = starPass;
  const world = createTownNightWindow({ now: () => now, scheduleAt: time =>
    time >= annual.duskAt && time < annual.morningBellAt ? annual : scheduleAt(time),
  });
  assert.equal(world.snapshot().beaconAt, midnight);
  assert.equal(world.recordBeacon(starPass), undefined);
  assert.equal(world.recordBeacon(midnight), undefined);
  now = midnight;
  assert.equal(world.recordBeacon(midnight)?.state.layersOverlap, true);
  assert.equal(world.snapshot().chapterGatesLocked, true);
});
