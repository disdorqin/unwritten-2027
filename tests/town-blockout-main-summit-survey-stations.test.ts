import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitIcefall } from '../tools/voxel-tavern/town-blockout/main-summit-icefall';
import { createMainSummitSurveyStations } from '../tools/voxel-tavern/town-blockout/main-summit-survey-stations';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';

test('survey stations M4-M6 stand built, M7 registered unbuilt for alignment', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const trail = createMainSummitTrail(block.heightAt, 347);
  const icefall = createMainSummitIcefall(block.heightAt);
  context.after(() => icefall.dispose());
  const survey = createMainSummitSurveyStations({
    cloudTerrace: { east: 30, north: -30, height: 347 },
    trailPoints: trail.points,
    icefallTop: icefall.topAnchor,
    heightAt: block.heightAt,
  });
  context.after(() => survey.dispose());
  assert.deepEqual(survey.stations.map(station => station.id), ['M4', 'M5', 'M6', 'M7']);
  const [m4, m5, m6, m7] = survey.stations;
  assert.equal(m4!.built, true);
  assert.equal(m4!.height, 347);
  assert.equal(m5!.built, true);
  assert.ok(m5!.height >= 555, 'M5 stands where the trail leaves the cloud band');
  assert.equal(m6!.built, true);
  assert.equal(m6!.north, icefall.topAnchor.north);
  assert.equal(m7!.built, false);
  assert.equal(m7!.height, 800);
  for (const station of survey.stations) assert.equal(station.rubRadius, 1.6);
  assert.ok(survey.blocked(m4!.east, m4!.north, 347, .27, 1.8), 'pillar bases collide');
  assert.equal(survey.group.children.length, 3, 'only M4-M6 are modelled');
});
