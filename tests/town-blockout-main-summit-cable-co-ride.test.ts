import assert from 'node:assert/strict';
import test from 'node:test';
import { createMainSummitCable, summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import {
  createSummitCableRideRoster, summitCableRiderPose,
} from '../tools/voxel-tavern/town-blockout/main-summit-cable-ride-roster';
import { createMainSummitCableTravel } from '../tools/voxel-tavern/town-blockout/main-summit-cable-travel';

const epoch = 1_795_000_000_000;
const dwell = 10_000;
const cable = createMainSummitCable(epoch, dwell, 347);
const travel = createMainSummitCableTravel(cable);
const departure = epoch + dwell;
const arrival = epoch + cable.legMs;
const lowerA = cable.ropes[0].dock('cloud-deck');
const upperA = cable.ropes[0].dock('summit');
const upperB = cable.ropes[1].dock('summit');

function assertNear(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `Expected ${expected}, got ${actual}`);
}

test('P-2 co-ride allocates two preview seats per cabin and rejects invalid or duplicate boarding', () => {
  const roster = createSummitCableRideRoster(cable);
  const lastDwell = departure - 1;
  assert.equal(roster.board('too far', lastDwell, 0, { ...lowerA.approach, east: lowerA.approach.east + 3 }), false);
  assert.equal(roster.board('wrong station', lastDwell, 0, upperA.approach), false);
  assert.equal(roster.board('wrong cabin', lastDwell, 1, lowerA.approach), false);
  assert.equal(roster.board('departed', departure, 0, lowerA.approach), false);
  assert.deepEqual(roster.snapshot(), []);

  assert.equal(roster.board('A1', lastDwell, 0, lowerA.approach), true);
  assert.equal(roster.board('A2', lastDwell, 0, lowerA.board), true);
  assert.equal(roster.board('B1', lastDwell, 1, upperB.approach), true);
  assert.equal(roster.board('B2', lastDwell, 1, upperB.board), true);
  const seated = roster.snapshot();

  assert.deepEqual(seated, [
    { id: 'A1', cabinIndex: 0, seat: 0 }, { id: 'A2', cabinIndex: 0, seat: 1 },
    { id: 'B1', cabinIndex: 1, seat: 0 }, { id: 'B2', cabinIndex: 1, seat: 1 },
  ]);
  assert.equal(roster.board('A1', lastDwell, 0, lowerA.approach), false);
  assert.equal(roster.board('A1', lastDwell, 1, upperB.approach), false);
  assert.equal(roster.board('A3', lastDwell, 0, lowerA.approach), false);
  assert.equal(roster.board('B3', lastDwell, 1, upperB.approach), false);
  assert.deepEqual(roster.snapshot(), seated);
});

test('P-2 co-riders keep distinct cabin-relative poses on the same clock, including above the current domain ceiling', () => {
  const roster = createSummitCableRideRoster(cable);
  assert.equal(roster.board('first', epoch, 0, lowerA.approach), true);
  assert.equal(roster.board('second', epoch, 0, lowerA.approach), true);
  const [first, second] = roster.snapshot();
  assert.ok(first && second);
  const inWhiteout = departure + summitCableSpec.whiteoutMs;
  const beforeArrival = arrival - 15_000;

  for (const time of [epoch, inWhiteout, beforeArrival, arrival, arrival + dwell]) {
    const centre = travel.ridePose(time, first);
    const a = summitCableRiderPose(travel, time, first);
    const b = summitCableRiderPose(travel, time, second);
    assert.equal(a.heading, centre.heading);
    assert.equal(b.heading, centre.heading);
    assert.equal(a.phase, centre.phase);
    assert.equal(b.phase, centre.phase);
    assert.equal(a.whiteout, time === inWhiteout);
    assert.equal(b.whiteout, a.whiteout);
    assert.equal(a.feet.height, centre.feet.height);
    assert.equal(b.feet.height, centre.feet.height);
    assertNear((a.feet.east + b.feet.east) / 2, centre.feet.east);
    assertNear((a.feet.north + b.feet.north) / 2, centre.feet.north);
    for (const { feet } of [a, b]) {
      const east = feet.east - centre.feet.east;
      const north = feet.north - centre.feet.north;
      const side = east * Math.cos(centre.heading) - north * Math.sin(centre.heading);
      const forward = east * Math.sin(centre.heading) + north * Math.cos(centre.heading);
      assert.ok(Math.abs(side) < summitCableSpec.cabinHalfWidth);
      assert.ok(Math.abs(forward) < summitCableSpec.cabinHalfLength);
    }
    assert.ok(Math.hypot(a.feet.east - b.feet.east, a.feet.north - b.feet.north) > 1);
  }

  const highPose = summitCableRiderPose(travel, beforeArrival, first);
  assert.equal(highPose.station, null);
  assert.ok(highPose.feet.height > 655.35);
});

test('P-2 co-riders exit independently at the same surveyed dock and disconnected seats can be reused', () => {
  const roster = createSummitCableRideRoster(cable);
  assert.equal(roster.board('first', epoch, 0, lowerA.approach), true);
  assert.equal(roster.board('second', epoch, 0, lowerA.approach), true);
  const seated = roster.snapshot();

  assert.equal(roster.exit('first', departure), undefined);
  assert.equal(roster.exit('second', arrival - 1), undefined);
  assert.equal(roster.board('late rider', arrival - 1, 0, upperA.approach), false);
  assert.deepEqual(roster.snapshot(), seated);

  const summitExit = { station: 'summit', feet: upperA.approach };
  assert.deepEqual(roster.exit('first', arrival), summitExit);
  assert.deepEqual(roster.snapshot(), [seated[1]]);
  assert.equal(roster.exit('first', arrival), undefined);
  assert.deepEqual(roster.exit('second', arrival + dwell - 1), summitExit);
  assert.deepEqual(roster.snapshot(), []);

  assert.equal(roster.board('returning', arrival, 0, upperA.approach), true);
  assert.equal(roster.board('other', arrival, 0, upperA.approach), true);
  assert.equal(roster.disconnect('returning'), true);
  assert.equal(roster.disconnect('returning'), false);
  assert.equal(roster.board('replacement', arrival, 0, upperA.approach), true);
  assert.deepEqual(roster.snapshot(), [
    { id: 'other', cabinIndex: 0, seat: 1 }, { id: 'replacement', cabinIndex: 0, seat: 0 },
  ]);
});
