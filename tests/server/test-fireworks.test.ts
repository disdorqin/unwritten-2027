import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTestFireworksSchedule, testFireworksAnnouncement, testFireworksDwellMs as dwell,
  testFireworksLeadMs as lead, testFireworksNoticeMs as notice, testFireworksRearmMs as rearm, testFireworksShowMs as show,
} from '../../src/presence/test-fireworks.js';

const epoch = 1794981600000;

function fixture(startEpoch = epoch) {
  const schedule = createTestFireworksSchedule();
  let seeds = 0;
  return {
    seeds: () => seeds,
    tick: (online: number, now: number) => schedule.update(online, now, startEpoch + now, () => ++seeds + 1233),
  };
}

test('the full formal Beijing ceremony window suppresses notices and shows; dwell restarts outside', () => {
  const windowStart = Date.parse('2026-12-31T19:00:00+08:00');
  const windowLength = Date.parse('2027-01-01T01:00:00+08:00') - windowStart;
  const { tick, seeds } = fixture(windowStart);
  for (const elapsed of [0, dwell, dwell + notice, windowLength - 1]) assert.equal(tick(8, elapsed), undefined);
  assert.equal(seeds(), 0);
  assert.equal(tick(8, windowLength), undefined);
  assert.equal(tick(8, windowLength + dwell - 1), undefined);
  assert.equal(tick(8, windowLength + dwell)?.kind, 'announce');
  assert.deepEqual(tick(8, windowLength + dwell + notice - lead), {
    type: 'event', kind: 'test-fireworks', seed: 1234, startAt: windowStart + windowLength + dwell + notice,
  });
});

test('a test show that would overlap the beginning of the ceremony is never announced', () => {
  const windowStart = Date.parse('2026-12-31T19:00:00+08:00');
  const { tick, seeds } = fixture(windowStart - dwell - notice - show + 1);
  assert.equal(tick(5, 0), undefined);
  assert.equal(tick(5, dwell), undefined);
  assert.equal(tick(5, dwell + notice - lead), undefined);
  assert.equal(seeds(), 0);
});

test('five continuous joined peers earn one ten-second notice and one common-start show', () => {
  const { tick, seeds } = fixture();
  assert.equal(tick(4, 0), undefined);
  assert.equal(tick(5, 1), undefined);
  assert.equal(tick(6, dwell), undefined);
  assert.deepEqual(tick(5, dwell + 1), { type: 'event', kind: 'announce', message: testFireworksAnnouncement });
  assert.equal(tick(5, dwell + 1 + notice - lead - 1), undefined);
  assert.deepEqual(tick(5, dwell + 1 + notice - lead), {
    type: 'event', kind: 'test-fireworks', seed: 1234, startAt: epoch + dwell + 1 + notice,
  });
  assert.equal(tick(8, dwell + 1 + notice), undefined);
  assert.equal(seeds(), 1);
});

test('a drop below five resets both accumulated dwell and an undelivered countdown', () => {
  const { tick, seeds } = fixture();
  tick(5, 0);
  tick(4, dwell - 1);
  tick(5, dwell);
  assert.equal(tick(7, dwell * 2 - 1), undefined);
  assert.equal(tick(7, dwell * 2)?.kind, 'announce');
  tick(4, dwell * 2 + notice - lead - 1);
  tick(5, dwell * 2 + notice);
  assert.equal(tick(5, dwell * 2 + notice + 1), undefined);
  assert.equal(tick(5, dwell * 3 + notice)?.kind, 'announce');
  assert.equal(seeds(), 0);
});

test('a completed show never repeats without a rearm and a fresh fifteen-minute window', () => {
  const { tick, seeds } = fixture();
  tick(5, 0);
  tick(5, dwell);
  assert.equal(tick(5, dwell + notice - lead)?.kind, 'test-fireworks');
  const showEnd = dwell + notice + show;
  assert.equal(tick(4, showEnd - 5), undefined);
  assert.equal(tick(6, showEnd), undefined);
  assert.equal(tick(6, showEnd + rearm - 1), undefined);
  assert.equal(tick(6, showEnd + rearm), undefined);
  assert.equal(tick(6, showEnd + rearm + dwell - 1), undefined);
  assert.equal(tick(6, showEnd + rearm + dwell)?.kind, 'announce');
  assert.equal(seeds(), 1);
});

test('dropping below five after a show rearms without waiting thirty minutes', () => {
  const { tick } = fixture();
  tick(5, 0);
  tick(5, dwell);
  tick(5, dwell + notice - lead);
  const showEnd = dwell + notice + show;
  tick(4, showEnd + 1);
  tick(5, showEnd + 100);
  assert.equal(tick(5, showEnd + 100 + dwell - 1), undefined);
  assert.equal(tick(5, showEnd + 100 + dwell)?.kind, 'announce');
});
