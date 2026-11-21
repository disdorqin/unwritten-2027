import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { createMainSummitCableTravel } from '../tools/voxel-tavern/town-blockout/main-summit-cable-travel';
import { createSummitRepairBoardingPolicy } from '../tools/voxel-tavern/town-blockout/main-summit-cable-repair-boarding';
import { initialSummitCableRepairState, type SummitCableRepairState } from '../src/shared/main-summit-cable-repair';

const epoch = 1_795_000_000_000;
const cable = createMainSummitCable(epoch, 10_000, 347);
const summit = cable.ropes[1].dock('summit').approach;
const lower = cable.ropes[0].dock('cloud-deck').approach;

test('P-2 repair policy never allows ordinary boarding before the confirmed summit release', () => {
  let record: SummitCableRepairState | undefined = initialSummitCableRepairState();
  const travel = createMainSummitCableTravel(cable, createSummitRepairBoardingPolicy(() => record, () => true));
  assert.equal(travel.attemptBoard(epoch, 0, lower), undefined);
  assert.equal(travel.attemptBoard(epoch, 1, summit), undefined);
  record = { ...record, stage: 'single-trip', singleTripCabin: 1 };
  assert.equal(travel.attemptBoard(epoch, 0, lower), undefined, 'first descent never unlocks uphill boarding');
  assert.deepEqual(travel.attemptBoard(epoch, 1, summit), { cabinIndex: 1 },
    'a confirmed summit foot entrant may release one downhill station');
  assert.equal(travel.attemptBoard(epoch + cable.legMs, 0, summit), undefined,
    'another downhill cabin must never reuse the one-time release');
  record = { ...record, stage: 'halted', singleTripCabin: null };
  assert.equal(travel.attemptBoard(epoch, 1, summit), undefined,
    'authoritative arrival at lower station consumes the one-trip permit');
});

test('P-2 fully repaired line boards both ways by clock during day, never at night', () => {
  let record: SummitCableRepairState | undefined = { ...initialSummitCableRepairState(), stage: 'open' };
  let day = true;
  const travel = createMainSummitCableTravel(cable, createSummitRepairBoardingPolicy(() => record, () => day));
  assert.deepEqual(travel.attemptBoard(epoch, 0, lower), { cabinIndex: 0 });
  assert.deepEqual(travel.attemptBoard(epoch, 1, summit), { cabinIndex: 1 });
  day = false;
  assert.equal(travel.attemptBoard(epoch, 0, lower), undefined);
  assert.equal(travel.attemptBoard(epoch, 1, summit), undefined);
  record = undefined;
  day = true;
  assert.equal(travel.attemptBoard(epoch, 0, lower), undefined, 'missing authority fails closed');
});

test('isolated P-2 review stays backwards compatible without a server policy', () => {
  const travel = createMainSummitCableTravel(cable);
  assert.deepEqual(travel.attemptBoard(epoch, 0, lower), { cabinIndex: 0 });
  assert.deepEqual(travel.attemptBoard(epoch, 1, summit), { cabinIndex: 1 });
  const ride = { cabinIndex: 1 as const };
  assert.equal(travel.ridePose(epoch, ride).direction, 'down');
  assert.equal(travel.exit(epoch, ride)?.height, 800);
});
