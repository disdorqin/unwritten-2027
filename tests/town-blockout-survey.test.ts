import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beaconDriftTableSeconds, createSurveyRubbings, surveyNotesPageText, surveyPlateLines,
  surveyReadingSeconds, surveyRubbingUnlockCount, surveyStationIds,
} from '../tools/voxel-tavern/town-blockout/town-survey.ts';

test('station readings are the beacon drift table, entry for entry', () => {
  assert.deepEqual(beaconDriftTableSeconds, [50, 61, 72, 83, 94, 105, 116, 127, 138, 149, 160, 171]);
  assert.deepEqual(surveyStationIds.map(id => surveyReadingSeconds(id)),
    beaconDriftTableSeconds.slice(0, 7));
});

test('plate lines encode the reading twice and nothing else', () => {
  assert.deepEqual(surveyPlateLines('M1'), ['觇标 M1', '标尺 0.500', '方位 50°00′']);
  assert.deepEqual(surveyPlateLines('M7'), ['觇标 M7', '标尺 1.160', '方位 116°00′']);
  for (const id of surveyStationIds) assert.equal(surveyPlateLines(id).length, 3);
});

test('any five distinct rubbings unlock the notes page; duplicates do not count', () => {
  const rubbings = createSurveyRubbings();
  for (const id of ['M1', 'M2', 'M3', 'M4'] as const) assert.equal(rubbings.record(id), true);
  assert.equal(rubbings.record('M4'), false);
  assert.equal(rubbings.notesUnlocked(), false);
  assert.equal(rubbings.record('M7'), true);
  assert.equal(rubbings.count(), surveyRubbingUnlockCount);
  assert.equal(rubbings.notesUnlocked(), true);
  assert.equal(surveyNotesPageText, '七个站，一条线。他们量的不是地。');
});
