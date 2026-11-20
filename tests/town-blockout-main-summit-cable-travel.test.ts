import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { createMainSummitCable, summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { mountMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable-scene';
import { createMainSummitCableTravel } from '../tools/voxel-tavern/town-blockout/main-summit-cable-travel';
import { mainSummitCloudSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cloud-layer';
import { createSkyCityReveal } from '../tools/voxel-tavern/town-blockout/sky-city-reveal';

const epoch = 1_795_000_000_000;
const dwell = 10_000;
const cable = createMainSummitCable(epoch, dwell, 347);
const travel = createMainSummitCableTravel(cable);
const surveyedCrossings = [132_844, 133_117] as const;

for (const index of [0, 1] as const) {
  const label = index === 0 ? 'A' : 'B';
  const rope = cable.ropes[index];
  const otherIndex = index === 0 ? 1 : 0;
  const otherRope = cable.ropes[otherIndex];
  const lower = rope.dock('cloud-deck');
  const upper = rope.dock('summit');
  const start = epoch + index * cable.legMs;
  const departure = start + dwell;
  const arrival = start + cable.legMs;

  test(`cabin ${label} accepts its exact surveyed docks and exits only during station dwell`, () => {
    for (const [time, station, dock, wrongStationDock, height] of [
      [start, 'cloud-deck', lower, upper, 347],
      [arrival, 'summit', upper, lower, 800],
    ] as const) {
      const ride = travel.attemptBoard(time + dwell - 1, index, dock.approach);
      assert.ok(ride);
      assert.equal(ride.cabinIndex, index);
      const pose = travel.ridePose(time, ride);
      assert.equal(pose.station, station);
      assert.equal(pose.feet.height, height);
      assert.ok(Math.hypot(pose.feet.east - dock.board.east, pose.feet.north - dock.board.north) < 1e-9);
      assert.deepEqual(travel.attemptBoard(time, index, dock.board), ride);
      assert.deepEqual(travel.exit(time + dwell - 1, ride), dock.approach);

      assert.equal(travel.attemptBoard(time, index, otherRope.dock(station).board), undefined);
      assert.equal(travel.attemptBoard(time, index, otherRope.dock(station).approach), undefined);
      assert.equal(travel.attemptBoard(time, otherIndex, dock.approach), undefined);
      assert.equal(travel.attemptBoard(time, index, wrongStationDock.approach), undefined);
      assert.equal(travel.attemptBoard(time, index, { ...dock.board, height: dock.board.height + .44 }), undefined);
      assert.equal(travel.attemptBoard(time, index, { ...dock.approach, north: dock.approach.north + 1 }), undefined);

      assert.equal(travel.attemptBoard(time + dwell, index, dock.board), undefined);
      assert.equal(travel.exit(time + dwell, ride), undefined);
      assert.equal(travel.exit(time + cable.legMs - 1, ride), undefined);
      assert.deepEqual(travel.exit(time + cable.legMs, ride), wrongStationDock.approach);
    }
  });

  test(`cabin ${label} follows the visible cable and clears the cloud at its surveyed time`, () => {
    const ride = travel.attemptBoard(start, index, lower.approach);
    assert.ok(ride);
    const scene = mountMainSummitCable(new Group(), cable, () => undefined);
    try {
      const crossing = surveyedCrossings[index];
      const reveal = createSkyCityReveal();
      for (const elapsed of [0, summitCableSpec.whiteoutMs, summitCableSpec.emergeMs, crossing - 1, crossing, crossing + 1]) {
        const time = departure + elapsed;
        const visible = scene.update(time)[index];
        const pose = travel.ridePose(time, ride);
        const { east, north, height, heading } = visible.ropePoint;
        assert.deepEqual(pose.feet, { east, north, height: height - summitCableSpec.cabinFloorBelowRope });
        assert.equal(pose.heading, heading);
        assert.equal(pose.phase, visible.phase);
        assert.equal(pose.whiteout, visible.phase === 'whiteout');
        assert.equal(travel.attemptBoard(time, index, pose.feet), undefined);
        assert.equal(travel.exit(time, ride), undefined);
        assert.equal(reveal.sample({ source: 'mountain', height: pose.feet.height, whiteout: pose.whiteout, inView: true }),
          elapsed === crossing);
      }
      assert.equal(reveal.seen(), true);
      assert.ok(travel.ridePose(departure + crossing - 1, ride).feet.height < mainSummitCloudSpec.top);
      assert.ok(travel.ridePose(departure + crossing, ride).feet.height >= mainSummitCloudSpec.top);
      assert.deepEqual(travel.exit(arrival, ride), upper.approach);
    } finally {
      scene.dispose();
    }
  });
}
