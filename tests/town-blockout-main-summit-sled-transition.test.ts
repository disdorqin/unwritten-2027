import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSummitSnowTransition, runSummitSnowJoinProbe, surveyedSledConnection,
} from '../tools/voxel-tavern/town-blockout/main-summit-snow-transition';

function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected} ± ${tolerance}, measured ${actual}`);
}

test('snow overlay meets the surveyed tangent and uses a C1 lower descent to 18 m', () => {
  const transition = createSummitSnowTransition();
  const { heightAt, gradeAt, sample, planMetres, waypoints, legacyAt } = transition;
  const { east, north, height, heading, grade } = surveyedSledConnection;
  const advance = sample(1);
  assert.deepEqual(sample(0), { east, north, height });
  close(Math.atan2(advance.east - east, advance.north - north), heading);
  close(gradeAt(0), grade);
  assert.equal(heightAt(planMetres), 18);
  assert.equal(gradeAt(planMetres), 0);
  close(heightAt(0) - legacyAt(0), 7.630983295650992);
  assert.equal(heightAt(waypoints.legacyFeatherMetres), legacyAt(waypoints.legacyFeatherMetres));
  const delta = .0001;
  for (const anchor of [0, waypoints.startFeatherMetres, waypoints.finalFeatherAt, planMetres]) {
    close((heightAt(anchor) - heightAt(anchor - delta)) / delta, gradeAt(anchor), 1e-6);
    close((heightAt(anchor + delta) - heightAt(anchor)) / delta, gradeAt(anchor), 1e-6);
  }
  for (let sample = 0; sample <= planMetres; sample += .25) {
    assert.ok(gradeAt(sample) >= -.14 && gradeAt(sample) <= 0);
    assert.ok(heightAt(sample) >= legacyAt(sample));
  }
});

test('stock sled physics crosses the snow overlay without an airborne tick', t => {
  const transition = createSummitSnowTransition();
  for (const deep of [false, true]) {
    const ride = runSummitSnowJoinProbe(transition, 'overlay', deep);
    assert.equal(ride.crash, false);
    assert.equal(ride.wallHits, 0);
    assert.equal(ride.airborneTicks, 0);
    assert.equal(ride.maximumVerticalSeparation, 0);
    assert.ok(ride.seamSpeed! >= 18);
    assert.ok(ride.maximumAdjacentSurfaceHeightChangeNearSeam < .05);
    assert.ok(ride.lowerSeconds! > 40 && ride.lowerSeconds! < 50);
    assert.equal(ride.finishHeight, 18);
    assert.ok(ride.finishSpeed > 20);
    t.diagnostic(JSON.stringify(ride));
  }
});

test('the same unmodified sled launches from the uncorrected 7.63 m discontinuity', t => {
  const legacyRide = runSummitSnowJoinProbe(createSummitSnowTransition(), 'legacy-drop');
  assert.ok(legacyRide.maximumAdjacentSurfaceHeightChangeNearSeam > 7.63);
  assert.ok(legacyRide.maximumVerticalSeparation > 7.5);
  assert.ok(legacyRide.airTicksNearSeam > 0);
  t.diagnostic(JSON.stringify(legacyRide));
});
