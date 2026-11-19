import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { createMainSummitCable, summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { mountMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable-scene';

const epoch = 1_795_000_000_000;
const dwell = 10_000;
const cable = createMainSummitCable(epoch, dwell, 347);

test('P-2 measures an approximately 1900 m route and runs two opposite terminal-to-terminal trips', () => {
  for (const rope of cable.ropes) assert.ok(rope.totalMetres > 1_850 && rope.totalMetres < 1_950);
  assert.ok(cable.rideMs > 235_000 && cable.rideMs < 245_000);
  for (const [leg, stations] of [[0, ['cloud-deck', 'summit']], [1, ['summit', 'cloud-deck']]] as const) {
    const start = epoch + leg * cable.legMs;
    assert.deepEqual(cable.cabinsAt(start).map(car => car.station), stations);
    assert.deepEqual(cable.cabinsAt(start + dwell - 1).map(car => car.canBoardOrExit), [true, true]);
    assert.deepEqual(cable.cabinsAt(start + dwell).map(car => car.station), [null, null]);
    assert.deepEqual(cable.cabinsAt(start + cable.legMs - 1).map(car => car.station), [null, null]);
    assert.deepEqual(cable.cabinsAt(start + cable.legMs).map(car => car.station), [...stations].reverse());
  }
});

test('P-2 keeps both directions on the same four-act timetable', () => {
  for (const [elapsed, phase] of [[0, 'departure'], [69_999, 'departure'], [70_000, 'enter-cloud'],
    [99_999, 'enter-cloud'], [100_000, 'whiteout'], [129_999, 'whiteout'], [130_000, 'arrival']] as const) {
    const states = cable.cabinsAt(epoch + dwell + elapsed);
    assert.deepEqual(states.map(car => car.phase), [phase, phase]);
    assert.deepEqual(states.map(car => car.showRouteHints), [phase !== 'whiteout', phase !== 'whiteout']);
    assert.deepEqual(states.map(car => car.canBoardOrExit), [false, false]);
  }
});

test('P-2 has speed-capped endpoint easing, clear pass-by and deterministic clock wrap', () => {
  let leastSeparation = Infinity;
  for (let elapsed = 0; elapsed + 100 < cable.rideMs; elapsed += 100) {
    const time = epoch + dwell + elapsed;
    const [up, down] = cable.cabinsAt(time);
    const [nextUp, nextDown] = cable.cabinsAt(time + 100);
    const maxStep = summitCableSpec.speedMetresPerSecond * 0.1 + 1e-8;
    assert.ok(nextUp.distanceMetres - up.distanceMetres <= maxStep);
    assert.ok(down.distanceMetres - nextDown.distanceMetres <= maxStep);
    leastSeparation = Math.min(leastSeparation, Math.hypot(up.ropePoint.east - down.ropePoint.east,
      up.ropePoint.north - down.ropePoint.north, up.ropePoint.height - down.ropePoint.height));
  }
  assert.ok(leastSeparation > 5.9, `pass-by separation ${leastSeparation}`);
  const start = cable.cabinsAt(epoch + dwell)[0].distanceMetres;
  const afterHalfSecond = cable.cabinsAt(epoch + dwell + 500)[0].distanceMetres;
  assert.ok(afterHalfSecond - start < 0.5);
  assert.deepEqual(cable.cabinsAt(epoch - 1), cable.cabinsAt(epoch + cable.cycleMs - 1));
  assert.deepEqual(cable.cabinsAt(epoch + 109_321), cable.cabinsAt(epoch + cable.cycleMs + 109_321));
  assert.throws(() => createMainSummitCable(epoch, 0, 347), RangeError);
  assert.throws(() => createMainSummitCable(epoch, dwell, 346), RangeError);
  assert.throws(() => cable.cabinsAt(NaN), RangeError);
  assert.equal(cable.cabinsAt(epoch + dwell + 15.5)[0].elapsedMs, 15.5);
});

test('P-2 places four flat boarding approaches and mounts and releases independent scene resources', () => {
  for (const rope of cable.ropes) {
    for (const [station, expectedHeight] of [['cloud-deck', 347], ['summit', 800]] as const) {
      const { board, approach } = rope.dock(station);
      assert.equal(board.height, expectedHeight);
      assert.equal(approach.height, expectedHeight);
      assert.ok(Math.abs(Math.hypot(board.east - approach.east, board.north - approach.north) - 3.2) < 1e-8);
    }
  }
  const domain = new Group();
  const scene = mountMainSummitCable(domain, cable, () => 150);
  assert.equal(domain.children.length, 1);
  assert.deepEqual(scene.update(epoch + dwell + 105_000), cable.cabinsAt(epoch + dwell + 105_000));
  scene.dispose();
  assert.equal(domain.children.length, 0);
});
