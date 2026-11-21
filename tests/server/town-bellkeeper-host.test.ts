import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTownBellkeeperHost } from '../../src/presence/town-bellkeeper-host';
import type { TownBellkeeperSchedule } from '../../src/shared/town-bellkeeper-duty';

const night: TownBellkeeperSchedule = {
  nightId: 'server-night-17', duskAt: 50_000, midnightAt: 80_000,
  secondMidnightAt: 110_000, beaconAt: 140_000,
  beaconExpiresAt: 200_000, dawnAt: 230_000,
};
type Session = { id: string; authenticated: boolean; inRoom: boolean; handoff: boolean;
  rope: boolean; gaze: boolean; clientProfile?: string; clientTime?: number };
function fixture() {
  let at = night.duskAt;
  let clockReads = 0;
  const ledger: string[] = [], watch: string[] = [], ring: string[] = [];
  const host = createTownBellkeeperHost<Session>({
    minimumChargeMs: 450, maximumChargeMs: 1500, maxGazeSampleGapMs: 250,
  }, {
    clock: () => { clockReads++; return { at, night }; },
    profileOf: s => s.authenticated ? s.id : null,
    canHandoff: s => s.handoff,
    canUseRope: s => s.rope,
    isLookingAtBell: s => s.gaze,
    inBellRoom: s => s.inRoom,
    recordLedger: (profile, page) => { ledger.push(`${profile}:${page.nightId}`); },
    recordWatch: (profile, page) => { watch.push(`${profile}:${page.nightId}`); },
    ring: (profile, record) => { ring.push(`${profile}:${record.bell}:${record.grade}`); },
  });
  const alice: Session = {
    id: 'alice', authenticated: true, inRoom: true,
    handoff: true, rope: true, gaze: true,
    clientProfile: 'admin', clientTime: 999_999_999,
  };
  return { host, alice, ledger, watch, ring, time: (next: number) => { at = next; },
    reads: () => clockReads };
}

test('untrusted claimed profile and client time never become server identity or clock', () => {
  const f = fixture();
  assert.equal(f.host.handoff(f.alice), true);
  assert.equal(f.host.snapshot(f.alice)?.nightId, night.nightId);
  assert.equal(f.host.snapshot({ ...f.alice, authenticated: false }), null);
  assert.equal(f.host.snapshot({ ...f.alice, id: 'bob', authenticated: true }), null);
  assert.equal(f.reads(), 1);
});
test('cannot begin shift without verified Qi Gengsheng handoff', () => {
  const f = fixture();
  assert.equal(f.host.handoff({ ...f.alice, handoff: false }), false);
  assert.equal(f.host.snapshot(f.alice), null);
  assert.equal(f.host.handoff(f.alice), true);
});
test('server-side rope collision and position gate the manual bell', () => {
  const f = fixture();
  assert.ok(f.host.handoff(f.alice));
  assert.equal(f.host.press({ ...f.alice, rope: false }, 'dusk'), false);
  assert.equal(f.host.press({ ...f.alice, inRoom: false }, 'dusk'), false);
  f.time(night.duskAt + 100);
  assert.equal(f.host.press(f.alice, 'dusk'), true);
  f.time(night.duskAt + 800);
  assert.equal(f.host.release({ ...f.alice, inRoom: false }), null);
  // Release gate rejects a remote click: no broadcast and no grade awarded.
  assert.deepEqual(f.ring, []);
});
test('walking away during E charge releases the rope without ringing or softlock', () => {
  const f = fixture();
  assert.equal(f.host.handoff(f.alice), true);
  assert.equal(f.host.press(f.alice, 'dusk'), true);
  f.time(night.duskAt + 150);
  assert.equal(f.host.release({ ...f.alice, inRoom: false }), null);
  assert.equal(f.host.snapshot(f.alice)?.charging, null);
  assert.deepEqual(f.ring, []);
  f.time(night.duskAt + 200);
  assert.equal(f.host.press(f.alice, 'dusk'), true);
  f.time(night.duskAt + 900);
  assert.equal(f.host.release(f.alice)?.grade, 'accurate');
  assert.deepEqual(f.ring, ['alice:dusk:accurate']);
});
test('disconnect or scene transfer cleans only the authenticated player grip', () => {
  const f = fixture();
  const bob = { ...f.alice, id: 'bob' };
  assert.equal(f.host.handoff(f.alice), true);
  assert.equal(f.host.handoff(bob), true);
  assert.equal(f.host.press(f.alice, 'dusk'), true);
  assert.equal(f.host.press(bob, 'dusk'), true);
  f.time(night.duskAt + 100);
  assert.equal(f.host.leaveBellRoom({ ...f.alice, authenticated: false }), false);
  assert.equal(f.host.leaveBellRoom(f.alice), true);
  assert.equal(f.host.snapshot(f.alice)?.charging, null);
  assert.equal(f.host.snapshot(bob)?.charging, 'dusk');
  assert.deepEqual(f.ring, []);
});
test('a valid press-release sends exactly one authoritative bell result', () => {
  const f = fixture();
  assert.ok(f.host.handoff(f.alice));
  assert.equal(f.host.press(f.alice, 'dusk'), true);
  f.time(night.duskAt + 650);
  assert.equal(f.host.release(f.alice)?.grade, 'accurate');
  assert.equal(f.host.release(f.alice), null);
  assert.deepEqual(f.ring, ['alice:dusk:accurate']);
});
test('host gaze uses scene raycast, not a forged client-side claim', () => {
  const f = fixture();
  assert.ok(f.host.handoff(f.alice));
  for (let at = night.beaconAt; at <= night.beaconExpiresAt; at += 100) {
    f.time(at);
    f.host.observe({ ...f.alice, gaze: false });
  }
  f.time(night.dawnAt);
  assert.equal(f.host.closeAtDawn(f.alice)?.witnessed, false);
  assert.deepEqual(f.watch, []);
});
test('server-side first-person gaze makes a single ledger and witness callback', () => {
  const f = fixture();
  assert.ok(f.host.handoff(f.alice));
  for (let at = night.beaconAt; at <= night.beaconExpiresAt; at += 100) {
    f.time(at);
    f.host.observe(f.alice);
  }
  f.time(night.dawnAt);
  assert.equal(f.host.closeAtDawn(f.alice)?.witnessed, true);
  assert.equal(f.host.closeAtDawn(f.alice)?.witnessed, true);
  assert.deepEqual(f.ledger, ['alice:server-night-17']);
  assert.deepEqual(f.watch, ['alice:server-night-17']);
  assert.equal(f.host.ledger(f.alice).length, 1);
});
test('a mid-beacon E attempt aborts watch even if no valid bell is reachable', () => {
  const f = fixture();
  assert.ok(f.host.handoff(f.alice));
  for (let at = night.beaconAt; at <= night.beaconExpiresAt; at += 100) {
    f.time(at);
    f.host.observe(f.alice);
    if (at === night.beaconAt + 3000) {
      assert.equal(f.host.press({ ...f.alice, rope: false }, 'second-midnight'), false);
    }
  }
  f.time(night.dawnAt);
  assert.equal(f.host.closeAtDawn(f.alice)?.interrupted, true);
  assert.deepEqual(f.watch, []);
});
test('two authenticated players retain separate watches and separate records', () => {
  const f = fixture();
  const bob = { ...f.alice, id: 'bob', gaze: false };
  assert.ok(f.host.handoff(f.alice));
  assert.ok(f.host.handoff(bob));
  for (let at = night.beaconAt; at <= night.beaconExpiresAt; at += 100) {
    f.time(at);
    f.host.observe(f.alice);
    f.host.observe(bob);
  }
  f.time(night.dawnAt);
  assert.equal(f.host.closeAtDawn(f.alice)?.witnessed, true);
  assert.equal(f.host.closeAtDawn(bob)?.witnessed, false);
  assert.deepEqual(f.watch, ['alice:server-night-17']);
  assert.deepEqual(f.ledger, ['alice:server-night-17', 'bob:server-night-17']);
});
