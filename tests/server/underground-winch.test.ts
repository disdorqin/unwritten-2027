import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundWinchAccess,
  type UndergroundWinchAcceptedFoot,
} from '../../src/presence/underground-winch.js';

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
