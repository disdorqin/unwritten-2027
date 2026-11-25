import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundWellBridge } from '../../src/presence/underground-well-bridge.js';
import { resolveUndergroundShaftRegistration } from '../../src/presence/underground-shaft-registration.js';
import type { UndergroundWinchAcceptedFoot } from '../../src/presence/underground-winch.js';

type Foot = UndergroundWinchAcceptedFoot;

// External-completion path (winch 乙案): a host feel model paces the crank;
// the bridge/entry still issue the opening, under the same stream discipline.
function fixture() {
  const domain = 'live-west';
  const winch = { playerId: 'opener', domainId: domain, east: -121.0879, north: 181.7391, height: -24.2227 };
  const pool = { playerId: 'opener', domainId: 'registered-mine', east: -120, north: 185, height: -90 };
  const registration = resolveUndergroundShaftRegistration({
    crater: {
      domainId: domain,
      fixtureRim: { east: 0, north: 0, height: 0, yaw: 0 },
      liveRim: { east: -120, north: 185, rimHeight: 10.7773, yaw: 0 },
    },
    fixtureShaftFoot: { east: 0, north: 0, height: -35, yaw: 0 },
    liveWinchFoot: { ...winch, horizontalReach: .7, verticalReach: .3 },
    mineLanding: pool,
    depthLine: -73,
  }, { supportsFoot: () => true, acceptsShaftHandoff: () => true });
  assert.equal(registration.kind, 'ready');
  const feet = new Map<string, Foot>([
    ['opener', { ...winch }],
    ['peer', { ...winch, playerId: 'peer' }],
  ]);
  let clock = 1_000;
  const feel = { progress: 0, complete: false };
  const bridge = createUndergroundWellBridge({
    registration,
    now: () => clock,
    maxSampleGapMs: 200,
    readAcceptedFoot: id => feet.get(id),
    readConfirmedFirstFallTransfer: () => undefined,
    isFirstFallDeparture: () => false,
    isDepthLineCrossing: () => false,
    isFirstFallPool: () => false,
    canBoardCage: () => true,
    load: () => undefined,
    save: () => undefined,
    winchExternal: {
      isComplete: () => feel.complete,
      progress: () => feel.progress,
    },
  });
  assert.equal(bridge.kind, 'ready');
  if (bridge.kind !== 'ready') assert.fail('bridge must be ready');
  return {
    bridge, feel, feet, winch,
    advance(ms: number) { clock += ms; },
  };
}

test('external completion opens the well only through a live held stream at the handle', () => {
  const { bridge, feel, advance } = fixture();
  feel.progress = 0.5;
  const mid = bridge.holdWinchExternal('opener');
  assert.equal(mid.kind, 'winding');
  if (mid.kind === 'winding') assert.ok(Math.abs((mid.turns ?? 0) - 1.5) < 1e-9);
  assert.equal(bridge.sceneState().coverVisible, true);
  feel.progress = 1;
  feel.complete = true;
  advance(100);
  assert.deepEqual(bridge.holdWinchExternal('opener'), { kind: 'opened', turns: 3 });
  assert.equal(bridge.sceneState().coverVisible, false);
  assert.deepEqual(bridge.holdWinchExternal('opener'), { kind: 'already-open' });
});

test('an attestor alone never opens: no stream, no credential', () => {
  const { bridge, feel, advance } = fixture();
  feel.progress = 1;
  feel.complete = true;
  advance(10_000);
  // Nobody streamed: the cover must still be shut, and a stale first call
  // after releaseWinch cannot resurrect a session.
  bridge.releaseWinch('opener');
  assert.equal(bridge.sceneState().coverVisible, true);
});

test('external stream keeps the one-operator discipline across both paths', () => {
  const { bridge, advance } = fixture();
  assert.equal(bridge.holdWinch('opener').kind, 'winding');
  assert.deepEqual(bridge.holdWinchExternal('peer'), { kind: 'busy' });
  bridge.releaseWinch('opener');
  advance(50);
  assert.equal(bridge.holdWinchExternal('peer').kind, 'winding');
  assert.deepEqual(bridge.holdWinch('opener'), { kind: 'busy' });
});

test('external stream refuses an operator away from the handle', () => {
  const { bridge, feel, feet } = fixture();
  feel.progress = 1;
  feel.complete = true;
  feet.set('opener', { playerId: 'opener', domainId: 'live-west', east: -100, north: 150, height: -24 });
  assert.deepEqual(bridge.holdWinchExternal('opener'), { kind: 'unreachable' });
  assert.equal(bridge.sceneState().coverVisible, true);
});
