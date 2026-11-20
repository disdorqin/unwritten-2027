import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundLiftDomainHandoff } from '../../src/presence/underground-lift-domain-handoff.js';
import { createUndergroundMineLift } from '../../src/presence/underground-mine-lift.js';

function fixture() {
  const domains = { 'crater-floor': 'fixture/crater', mine: 'fixture/mine' };
  let dock: 'crater-floor' | 'mine' | undefined = 'crater-floor';
  let time = 0;
  let foot = { playerId: 'rider', domainId: domains['crater-floor'], east: 4, north: 5, height: -30 };
  const readAcceptedFoot = (player: string) => player === foot.playerId ? foot : undefined;
  const lift = createUndergroundMineLift({
    travelMs: 20_000, riderCapacity: 2, now: () => time, readAcceptedFoot, readDockedStop: () => dock,
    isAtBoardingPlatform: (stop, point) => point.domainId === domains[stop],
    requestCageRide: (_player, direction) => ({ kind: 'ride-cage', direction }),
  });
  const handoff = createUndergroundLiftDomainHandoff({
    lift, domains, readAcceptedFoot,
    isAtAcceptedLanding: (stop, point) => point.east === 4 && point.north === 5 &&
      point.height === (stop === 'mine' ? -90 : -30),
  });
  return {
    handoff, lift,
    setDock(next: typeof dock, nextTime: number) { dock = next; time = nextTime; },
    setFoot(next: Partial<typeof foot>) { foot = { ...foot, ...next }; },
    domains,
  };
}

test('the jolt and wake follow a confirmed ride, physical docking and an accepted same-trip landing', () => {
  const { handoff, lift, setDock, setFoot, domains } = fixture();
  assert.equal(handoff.jolt('rider', 1), undefined);
  assert.equal(lift.board('rider', 'down'), true);
  const trip = lift.depart('rider')!;
  assert.equal(handoff.jolt('spectator', trip.id), undefined);
  assert.deepEqual(handoff.jolt('rider', trip.id), { phase: 'blackout', playerId: 'rider', tripId: trip.id });
  assert.equal(handoff.jolt('rider', trip.id), undefined);
  assert.equal(handoff.wake('rider', trip.id), undefined);
  setDock('mine', 19_999);
  assert.equal(handoff.confirmDock(trip.id), false);
  setDock('crater-floor', 20_000);
  assert.equal(handoff.confirmDock(trip.id), false);
  setDock('mine', 20_000);
  assert.equal(handoff.confirmDock(trip.id + 1), false);
  assert.equal(handoff.confirmDock(trip.id), true);
  assert.equal(handoff.wake('rider', trip.id), undefined);
  setFoot({ domainId: domains.mine, height: -90, east: 9 });
  assert.equal(handoff.wake('rider', trip.id), undefined);
  setFoot({ east: 4 });
  const wake = handoff.wake('rider', trip.id);
  assert.equal(wake?.foot.domainId, domains.mine);
  setFoot({ east: 9 });
  assert.deepEqual(handoff.wake('rider', trip.id), wake);
  assert.equal(handoff.finishWake('rider', trip.id + 1), false);
  assert.equal(handoff.finishWake('rider', trip.id), true);
  assert.equal(handoff.wake('rider', trip.id), undefined);
});

test('discarding a departed rider clears that old cue and an immediate return uses a new trip', () => {
  const { handoff, lift, setDock, setFoot, domains } = fixture();
  lift.board('rider', 'down');
  const down = lift.depart('rider')!;
  handoff.jolt('rider', down.id);
  handoff.forget('rider');
  setDock('mine', 20_000);
  assert.equal(handoff.confirmDock(down.id), true);
  setFoot({ domainId: domains.mine, height: -90 });
  assert.equal(handoff.wake('rider', down.id), undefined);
  assert.equal(lift.board('rider', 'up'), true);
  const up = lift.depart('rider')!;
  assert.equal(handoff.jolt('rider', up.id)?.tripId, up.id);
  setDock('crater-floor', 40_000);
  assert.equal(handoff.confirmDock(up.id), true);
  setFoot({ domainId: domains['crater-floor'], height: -30 });
  assert.equal(handoff.wake('rider', down.id), undefined);
  assert.equal(handoff.wake('rider', up.id)?.foot.domainId, domains['crater-floor']);
});
