import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundWinchAccess, createUndergroundWinchWinding,
  undergroundWinchTurnMs, undergroundWinchTurnsToOpen,
  type UndergroundWinchAcceptedFoot,
} from '../../src/presence/underground-winch.js';

import { createUndergroundEntry } from '../../src/presence/underground-entry.js';

const usePoint = { domainId: 'test-surface', east: 40, north: -30, height: 20, horizontalReach: 1, verticalReach: .5 };
const foot = { playerId: 'opener', domainId: usePoint.domainId, east: 40, north: -30, height: 20 };

test('winch access reads an authenticated actor’s current movement-authority foot on each attempt', () => {
  const feet = new Map<string, UndergroundWinchAcceptedFoot>();
  const canUseWinch = createUndergroundWinchAccess(usePoint, playerId => feet.get(playerId));

  assert.equal(canUseWinch(''), false);
  assert.equal(canUseWinch(foot.playerId), false);
  feet.set(foot.playerId, foot);
  assert.equal(canUseWinch(foot.playerId), true);
  feet.delete(foot.playerId);
  assert.equal(canUseWinch(foot.playerId), false);
  feet.set(foot.playerId, { ...foot, north: foot.north + 2 });
  assert.equal(canUseWinch(foot.playerId), false);
  feet.set(foot.playerId, { ...foot, east: foot.east + 1, height: foot.height + .5 });
  assert.equal(canUseWinch(foot.playerId), true);
});

test('winch access rejects wrong identity, domain, out-of-range and non-finite accepted feet', () => {
  let accepted: UndergroundWinchAcceptedFoot = foot;
  const canUseWinch = createUndergroundWinchAccess(usePoint, () => accepted);
  for (const changes of [
    { playerId: 'other' },
    { domainId: 'test-mine' },
    { east: foot.east + .8, north: foot.north + .8 },
    { height: foot.height - .51 },
    { height: foot.height + .51 },
    { east: Infinity },
    { north: Number.NaN },
    { height: Infinity },
  ]) {
    accepted = { ...foot, ...changes };
    assert.equal(canUseWinch(foot.playerId), false);
  }
});

test('winch access rejects invalid anchor configuration and captures the approved bounds', () => {
  for (const changes of [
    { domainId: '' },
    { east: Number.NaN },
    { north: Infinity },
    { height: Number.NaN },
    { horizontalReach: Infinity },
    { verticalReach: -.1 },
  ]) {
    assert.throws(() => createUndergroundWinchAccess({ ...usePoint, ...changes }, () => foot), RangeError);
  }

  const placement = { ...usePoint };
  const canUseWinch = createUndergroundWinchAccess(placement, () => foot);
  placement.east += 10;
  assert.equal(canUseWinch(foot.playerId), true);
});

test('the entry authority opens only after one player winds three continuously accepted turns', () => {
  const feet = new Map([[foot.playerId, foot], ['peer', { ...foot, playerId: 'peer' }]]);
  const access = createUndergroundWinchAccess(usePoint, id => feet.get(id));
  let time = 100;
  let failed = true;
  let saves = 0;
  const winding = createUndergroundWinchWinding({ canUseWinch: access, now: () => time, maxSampleGapMs: 150 });
  const entry = createUndergroundEntry({
    depthLine: -55, firstFallLanding: { east: 40, north: -30, height: -90 },
    canUseWinch: winding.canOpenWell,
    canBoardCage: () => false, isDepthLineCrossing: () => false, isFirstFallPool: () => false,
    save() {
      if (failed) throw new Error('well save failed');
      saves++;
      return undefined;
    },
  });

  assert.equal(entry.openWell(foot.playerId).kind, 'denied');
  assert.deepEqual(winding.sample(foot.playerId), { kind: 'winding', turns: 0 });
  for (let elapsed = 100; elapsed < undergroundWinchTurnMs * undergroundWinchTurnsToOpen; elapsed += 100) {
    time += 100;
    assert.equal(winding.sample(foot.playerId).kind, 'winding');
    assert.equal(winding.sample('peer').kind, 'busy');
  }
  assert.equal(entry.openWell(foot.playerId).kind, 'denied');
  time += 100;
  assert.deepEqual(winding.sample(foot.playerId), { kind: 'ready', turns: 3 });
  assert.equal(entry.openWell('peer').kind, 'denied');
  assert.throws(() => entry.openWell(foot.playerId), /well save failed/);
  assert.equal(entry.sceneState().coverVisible, true);
  failed = false;
  assert.equal(entry.openWell(foot.playerId).kind, 'opened');
  assert.equal(entry.openWell(foot.playerId).kind, 'already-open');
  assert.equal(saves, 1);
});

test('release, movement out of reach and stale accepted samples reset the windlass', () => {
  const feet = new Map([[foot.playerId, foot]]);
  let time = 0;
  const winding = createUndergroundWinchWinding({
    canUseWinch: createUndergroundWinchAccess(usePoint, id => feet.get(id)),
    now: () => time, maxSampleGapMs: 150,
  });
  const sample = () => winding.sample(foot.playerId);
  assert.equal(sample().kind, 'winding');
  time = 100;
  assert.deepEqual(sample(), { kind: 'winding', turns: .04 });
  winding.cancel(foot.playerId);
  assert.deepEqual(sample(), { kind: 'winding', turns: 0 });
  time += 100;
  feet.set(foot.playerId, { ...foot, east: foot.east + 2 });
  assert.equal(sample().kind, 'unreachable');
  feet.set(foot.playerId, foot);
  assert.deepEqual(sample(), { kind: 'winding', turns: 0 });
  time += 7_500;
  assert.equal(winding.canOpenWell(foot.playerId), false);
  assert.deepEqual(sample(), { kind: 'winding', turns: 0 });
  time = 50;
  assert.deepEqual(sample(), { kind: 'winding', turns: 0 });
  assert.throws(() => createUndergroundWinchWinding({
    canUseWinch: () => true, now: () => time, maxSampleGapMs: undergroundWinchTurnMs,
  }), RangeError);
});
