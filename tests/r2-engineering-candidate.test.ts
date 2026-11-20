import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createR2EngineeringCandidate } from '../tools/voxel-tavern/r2-engineering/candidate';
import {
  reverseR2EngineeringGate, reverseR2EngineeringTerrain, rollR2EngineeringCandidate, surveyR2EngineeringCandidate,
} from '../tools/voxel-tavern/r2-engineering/survey';
import { sledRadius } from '../tools/voxel-tavern/town-blockout/sled-motion';

const candidate = createR2EngineeringCandidate();

test('R2 engineering line joins its surveyed anchors on a continuously descending, collision-bounded snowbed', () => {
  const result = surveyR2EngineeringCandidate(candidate);
  const { entrance, finish, finishTieIn, grade, width } = result;
  assert.deepEqual([entrance.east, entrance.north, entrance.height], [440, 520, 140]);
  assert.deepEqual([finish.east, finish.north], [320, 270]);
  assert.ok(Math.abs(finish.height - 18) < 1e-9);
  assert.ok(result.horizontalMetres >= 900 && result.surfaceMetres >= result.horizontalMetres);
  assert.ok(result.greatestSampleRise < 0);
  assert.ok(grade.minimum > 0 && grade.maximum > .25 && grade.maximum < .43 / 1.5);
  assert.ok(width.minimumNetWidth > 3.499 && width.maximumNetWidth <= width.deck - sledRadius * 2 + 1e-9);
  assert.ok(result.minimumAreaSeparation > width.deck);
  assert.deepEqual(finishTieIn.map(sample => sample.north), [275, 274, 273, 272, 271, 270]);
  assert.ok(finishTieIn.slice(1).every((sample, index) => sample.height < finishTieIn[index]!.height));
  assert.ok(Math.abs(result.gate.captureOffsets[0]! + 1.75) < .001);
  assert.ok(Math.abs(result.gate.captureOffsets[1]! - 1.75) < .001);
});

test('stock sled controls reach the N270 plane after passing the gate without breaking contact', () => {
  const result = rollR2EngineeringCandidate(candidate);
  assert.ok(result.active);
  assert.ok(result.gateCrossingFrame && result.gateCrossingFrame < result.frames);
  assert.equal(result.blockingGateContacts, 0);
  assert.equal(result.airborneFrames, 0);
  assert.equal(result.greatestRise, 0);
  assert.ok(result.finish.north < 270);
  assert.ok(result.travelledMetres >= 900 && result.finishPosition!.metres > candidate.track.exit.metres);
  assert.ok(result.maxOffset < candidate.track.widthMetres / 2 - sledRadius);
  assert.ok(result.trace.every((sample, index) => sample.frame === index));
});

test('uphill physics stalls before the top of the steep section even with the hinge disabled', () => {
  const result = reverseR2EngineeringTerrain(candidate);
  assert.equal(result.hingedGate, false);
  assert.ok(result.active);
  assert.equal(result.airborneFrames, 0);
  assert.ok(result.smallestChainage < candidate.steepSection.end);
  assert.ok(result.smallestChainage > candidate.steepSection.start);
  assert.ok(result.finishChainage > result.smallestChainage);
});

test('swept reverse attempts near both physical rails and center strike the hinge while an open hinge passes', () => {
  for (const offset of [-1.74, 0, 1.74]) {
    const result = reverseR2EngineeringGate(candidate, offset);
    assert.ok(result.active);
    assert.equal(result.airborneFrames, 0);
    assert.ok(result.contacts > 0);
    assert.ok(result.firstContact && result.firstContact.speed > 1);
    assert.ok(Math.abs(result.firstContact.lateral - offset) < .001);
    assert.ok(result.smallestChainage >= candidate.gate.metres + sledRadius);
    assert.ok(result.smallestChainage < candidate.gate.metres + sledRadius + .01);
  }
  const open = reverseR2EngineeringGate(candidate, 0, false);
  assert.equal(open.contacts, 0);
  assert.ok(open.smallestChainage < candidate.gate.metres);
});
