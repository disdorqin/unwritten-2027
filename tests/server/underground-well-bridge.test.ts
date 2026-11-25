import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundWellBridge } from '../../src/presence/underground-well-bridge.js';
import { resolveUndergroundShaftRegistration } from '../../src/presence/underground-shaft-registration.js';
import type { UndergroundEntrySnapshot } from '../../src/presence/underground-entry.js';
import type { UndergroundWinchAcceptedFoot } from '../../src/presence/underground-winch.js';

type Foot = UndergroundWinchAcceptedFoot;

function fixture() {
  const domain = 'live-west';
  const winch = { playerId: 'opener', domainId: domain, east: -121.0879, north: 181.7391, height: -24.2227 };
  const shaft = { playerId: 'opener', domainId: domain, east: -120, north: 185, height: -24.2227 };
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
  let clock = 100;
  let departed = false;
  let receipt: { playerId: string; departure: Foot; landing: Foot } | undefined;
  let snapshot: UndergroundEntrySnapshot | undefined;
  let writes = 0;
  let failSave = false;
  const options: Parameters<typeof createUndergroundWellBridge>[0] = {
    registration,
    now: () => clock,
    maxSampleGapMs: 150,
    readAcceptedFoot: id => feet.get(id),
    readConfirmedFirstFallTransfer: id => receipt?.playerId === id ? receipt : undefined,
    isFirstFallDeparture: (id, foot) => departed && id === 'opener' &&
      foot.east === shaft.east && foot.north === shaft.north && foot.height === shaft.height,
    isDepthLineCrossing: (point, direction) => direction === 'down' &&
      point.east === shaft.east && point.north === shaft.north && point.height === -73,
    isFirstFallPool: point => point.east === pool.east && point.north === pool.north && point.height === pool.height,
    canBoardCage: () => true,
    load: () => snapshot,
    save(value) {
      if (failSave) throw new Error('world save refused');
      writes++;
      snapshot = value;
      return undefined;
    },
  };
  const bridge = createUndergroundWellBridge(options);
  assert.equal(bridge.kind, 'ready');
  if (bridge.kind !== 'ready') assert.fail('certified shaft must be ready');
  return {
    bridge, options, feet, winch, shaft, pool,
    advance(ms: number) { clock += ms; },
    setDeparture(value: boolean) { departed = value; },
    confirmReceipt(playerId = 'opener', departure: Foot = shaft, landing: Foot = pool) {
      receipt = { playerId, departure: { ...departure }, landing: { ...landing } };
    },
    failSave(value: boolean) { failSave = value; },
    get writes() { return writes; },
    get snapshot() { return snapshot; },
  };
}

function wind(f: ReturnType<typeof fixture>) {
  assert.deepEqual(f.bridge.holdWinch('opener'), { kind: 'winding', turns: 0 });
  for (let elapsed = 100; elapsed < 7_500; elapsed += 100) {
    f.advance(100);
    assert.equal(f.bridge.holdWinch('opener').kind, 'winding');
  }
  f.advance(100);
}

test('no B-01 registered receiving domain means no live winch state or disk activity', () => {
  let touched = 0;
  const bridge = createUndergroundWellBridge({
    registration: { kind: 'unregistered' },
    now: () => { touched++; return 0; }, maxSampleGapMs: 150,
    readAcceptedFoot: () => { touched++; return undefined; },
    readConfirmedFirstFallTransfer: () => undefined,
    isFirstFallDeparture: () => false,
    isDepthLineCrossing: () => false,
    isFirstFallPool: () => false,
    canBoardCage: () => false,
    load: () => { touched++; return undefined; },
    save: () => { touched++; return undefined; },
  });
  assert.deepEqual(bridge, { kind: 'unregistered' });
  assert.equal(touched, 0);
});

test('the real surveyed handle only opens the cover after 3 continuous E turns, never starts the fall', () => {
  const f = fixture();
  assert.equal(f.bridge.requestFirstFall('opener'), undefined);
  assert.equal(f.bridge.requestCageRide('opener', 'down').kind, 'locked');
  assert.equal(f.bridge.holdWinch('spectator').kind, 'unreachable');
  wind(f);
  assert.equal(f.bridge.holdWinch('peer').kind, 'busy');
  assert.equal(f.bridge.sceneState().coverVisible, true);
  assert.deepEqual(f.bridge.holdWinch('opener'), { kind: 'opened', turns: 3 });
  assert.equal(f.writes, 1);
  assert.equal(f.bridge.sceneState().shaftVisible, true);
  assert.equal(f.bridge.sceneState().cageAvailable.down, false);
  assert.equal(f.bridge.requestFirstFall('opener'), undefined);
  assert.equal(f.bridge.holdWinch('peer').kind, 'already-open');

  f.feet.set('opener', { ...f.shaft });
  assert.equal(f.bridge.requestFirstFall('opener'), undefined);
  f.setDeparture(true);
  assert.deepEqual(f.bridge.requestFirstFall('opener'), {
    kind: 'first-fall', playerId: 'opener',
    destination: { east: f.pool.east, north: f.pool.north, height: f.pool.height },
    fallDamage: 0,
  });
  assert.equal(f.writes, 1, 'the departure order is read-only until a verified pool receipt');
});

test('only an accepted shaft departure AND mine-domain pool landing clears the pending first fall', () => {
  const f = fixture();
  wind(f);
  assert.equal(f.bridge.holdWinch('opener').kind, 'opened');
  f.feet.set('opener', { ...f.shaft });
  f.setDeparture(true);

  assert.equal(f.bridge.confirmFirstFall('opener'), undefined);
  f.confirmReceipt('other');
  assert.equal(f.bridge.confirmFirstFall('opener'), undefined);
  f.confirmReceipt('opener', { ...f.shaft, domainId: 'other' });
  assert.equal(f.bridge.confirmFirstFall('opener'), undefined);
  f.confirmReceipt('opener', f.shaft, { ...f.pool, domainId: 'live-west' });
  assert.equal(f.bridge.confirmFirstFall('opener'), undefined);
  f.confirmReceipt('opener', { ...f.winch }, f.pool);
  assert.equal(f.bridge.confirmFirstFall('opener'), undefined);
  f.confirmReceipt();
  assert.deepEqual(f.bridge.confirmFirstFall('opener'), { kind: 'first-fall-landed', fallDamage: 0 });
  assert.equal(f.bridge.modeOf('opener'), 'survival');
  assert.equal(f.bridge.sceneState().cageAvailable.down, true);
  assert.equal(f.bridge.sceneState().cageAvailable.up, true);
  assert.equal(f.bridge.requestCageRide('opener', 'up').kind, 'ride-cage');
  assert.equal(f.bridge.confirmFirstFall('opener'), undefined);
  assert.equal(f.writes, 2, 'one save opens the well, one atomic save lands the player');
});

test('release, out-of-reach feet and stale input samples do not carry winding progress', () => {
  const f = fixture();
  assert.deepEqual(f.bridge.holdWinch('opener'), { kind: 'winding', turns: 0 });
  f.advance(300);
  assert.deepEqual(f.bridge.holdWinch('opener'), { kind: 'winding', turns: 0 });
  f.advance(100);
  f.feet.set('opener', { ...f.winch, east: f.winch.east + 1 });
  assert.equal(f.bridge.holdWinch('opener').kind, 'unreachable');
  f.feet.set('opener', { ...f.winch });
  assert.deepEqual(f.bridge.holdWinch('opener'), { kind: 'winding', turns: 0 });
  f.advance(100);
  f.bridge.releaseWinch('opener');
  assert.deepEqual(f.bridge.holdWinch('opener'), { kind: 'winding', turns: 0 });
  assert.equal(f.writes, 0);
});

test('failed open-save is retryable and a restored opener still must walk into the shaft', () => {
  const f = fixture();
  wind(f);
  f.failSave(true);
  assert.throws(() => f.bridge.holdWinch('opener'), /world save refused/);
  assert.equal(f.bridge.sceneState().coverVisible, true);
  assert.equal(f.writes, 0);
  f.failSave(false);
  f.advance(100);
  assert.equal(f.bridge.holdWinch('opener').kind, 'opened');
  assert.equal(f.writes, 1);

  const restored = createUndergroundWellBridge(f.options);
  assert.equal(restored.kind, 'ready');
  if (restored.kind !== 'ready') assert.fail('restored well must be ready');
  assert.equal(restored.sceneState().coverVisible, false);
  assert.equal(restored.holdWinch('opener').kind, 'already-open');
  assert.equal(restored.requestFirstFall('opener'), undefined);
  f.feet.set('opener', { ...f.shaft });
  f.setDeparture(true);
  assert.equal(restored.requestFirstFall('opener')?.kind, 'first-fall');
  f.confirmReceipt();
  assert.equal(restored.confirmFirstFall('opener')?.fallDamage, 0);
  assert.equal(f.writes, 2);
});
