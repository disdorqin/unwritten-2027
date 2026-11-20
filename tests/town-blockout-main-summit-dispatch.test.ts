import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable';

const epoch = 25_000;
const dwellMs = 10_000;
const cable = createMainSummitCable(epoch, dwellMs, 347);
const { rideMs, legMs, cycleMs } = cable;

test('P-2 dispatch switches from the docked cabin to the next cabin at departure for either terminal', () => {
  for (const [station, initialIndex, nextIndex] of [['cloud-deck', 0, 1], ['summit', 1, 0]] as const) {
    const samples = [
      [0, initialIndex, true, 0, dwellMs],
      [dwellMs - .5, initialIndex, true, 0, .5],
      [dwellMs, nextIndex, false, rideMs, legMs],
      [legMs - 1, nextIndex, false, 1, dwellMs + 1],
      [legMs, nextIndex, true, 0, dwellMs],
      [legMs + dwellMs, initialIndex, false, rideMs, legMs],
      [cycleMs, initialIndex, true, 0, dwellMs],
    ] as const;

    for (const [elapsedMs, cabinIndex, boarding, untilBoardingMs, untilDepartureMs] of samples) {
      const nowMs = epoch + elapsedMs;
      const timetable = cable.timetableAt(nowMs, station);
      assert.deepEqual(timetable, { cabinIndex, boarding, untilBoardingMs, untilDepartureMs, rideMs });
      const cabin = cable.cabinsAt(nowMs + untilBoardingMs)[cabinIndex];
      assert.equal(cabin.station, station);
      assert.equal(cabin.canBoardOrExit, true);
      assert.equal(cable.cabinsAt(nowMs + untilDepartureMs)[cabinIndex].station, null);
    }
  }
});

test('P-2 dispatch is deterministic through negative elapsed time and full cycle wraps', () => {
  for (const station of ['cloud-deck', 'summit'] as const) {
    assert.deepEqual(cable.timetableAt(epoch - 1, station), cable.timetableAt(epoch + cycleMs - 1, station));
    assert.deepEqual(cable.timetableAt(epoch - cycleMs, station), cable.timetableAt(epoch, station));
    assert.deepEqual(cable.timetableAt(epoch + 124_321, station), cable.timetableAt(epoch + cycleMs + 124_321, station));
    assert.throws(() => cable.timetableAt(NaN, station), RangeError);
    assert.throws(() => cable.timetableAt(Infinity, station), RangeError);
  }
});
