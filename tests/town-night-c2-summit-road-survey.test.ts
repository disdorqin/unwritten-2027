import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import { mountProductionRidge } from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {
  c2RoadSurveySpec, c2RouteSeparation, surveyC2RoadNetwork, surveyC2RoadSegment,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-road-survey';

// One production raster for every case in this file; the ridge build is the
// expensive part and the survey itself is pure measurement (a few ms).
const grid = createTerrainGrid();
const railway = createTownRailway(grid, () => 0);
const branch = buildCraterRailExtension(grid,
  mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north)), railway.route.points);
const ridge = mountProductionRidge(new Group(), grid,
  { loop: railway.route.points, branch: branch.samples });

const ids = ['middle-south-exit', 'middle-east-upper', 'lower-east-service'] as const;
const survey = surveyC2RoadNetwork(ridge.field,
  ridge.roads.map((road, index) => ({ id: ids[index]!, route: road.route })));

test('the three graded centre lines are re-measured on the production raster', () => {
  assert.equal(survey.segments.length, 3);
  const byId = new Map(survey.segments.map(segment => [segment.id, segment]));
  const lower = byId.get('lower-east-service')!;
  assert.ok(Math.abs(lower.length - 701.02) < .05, `lower length ${lower.length}`);
  assert.ok(Math.abs(lower.start.height - 26) < 1e-6);
  assert.ok(Math.abs(lower.end.height - 87.5) < 1e-6);
  assert.equal(lower.start.east, 522);
  assert.equal(lower.start.north, 355);
  assert.equal(lower.end.east, 294);
  assert.equal(lower.end.north, 752);

  const upper = byId.get('middle-east-upper')!;
  assert.ok(Math.abs(upper.length - 384.27) < .05, `upper length ${upper.length}`);
  assert.equal(upper.end.east, 340);
  assert.equal(upper.end.north, 722);
  assert.ok(Math.abs(upper.end.height - 153.88) < .01);

  assert.ok(Math.abs(survey.networkLength - 1_116.09) < .05, `network ${survey.networkLength}`);
});

test('every segment meets the 12% grade and 2.5 m net-width bound in its own right', () => {
  assert.equal(survey.certified, true);
  for (const segment of survey.segments) {
    assert.ok(segment.gradeOk, `${segment.id} grade ${segment.maxGrade}`);
    assert.ok(segment.maxGrade <= c2RoadSurveySpec.maxGrade + 1e-6, `${segment.id} @ ${segment.maxGrade}`);
    assert.ok(segment.widthOk, `${segment.id} width ${segment.minNetWidth}`);
    assert.ok(segment.minNetWidth >= c2RoadSurveySpec.minNetWidth, `${segment.id} @ ${segment.minNetWidth}`);
    assert.equal(segment.unsupported, 0, `${segment.id} leaves the surveyed field`);
    assert.ok(segment.stations > 60);
  }
  assert.ok(survey.minNetWidth >= c2RoadSurveySpec.minNetWidth);
  assert.ok(survey.maxGrade <= c2RoadSurveySpec.maxGrade + 1e-6);
});

test('the chain is reported as disconnected, with the measured gap and drop', () => {
  // 2026-11-27 audit: "三段累计 1116.09 m（并非连续登顶）". The survey must
  // keep saying so until the endpoints actually meet.
  assert.equal(survey.joints.length, 0, 'no endpoint pair coincides yet');
  assert.deepEqual(survey.connectedSegments, []);

  const bridge = survey.gaps.find(gap =>
    [gap.a, gap.b].includes('middle-east-upper') && [gap.a, gap.b].includes('lower-east-service'));
  assert.ok(bridge, 'the upper-to-lower link must be reported as a gap');
  assert.ok(Math.abs(bridge!.distance - 36) < .5, `gap ${bridge!.distance}`);
  assert.ok(bridge!.dropHeight !== undefined && bridge!.dropHeight > 60,
    `the 723 m route ends ${bridge!.dropHeight} m below the upper road`);

  const pad = survey.gaps.find(gap =>
    [gap.a, gap.b].includes('middle-south-exit') && [gap.a, gap.b].includes('middle-east-upper'));
  assert.ok(pad, 'the station pad approach must be reported too');
  assert.ok(pad!.distance <= 20, `pad approach ${pad!.distance}`);
});

test('endpoint probes carry the datum A needs to build its own section', () => {
  assert.equal(survey.endpoints.length, 6);
  for (const probe of survey.endpoints) {
    assert.ok(Number.isFinite(probe.east) && Number.isFinite(probe.north));
    assert.ok(Number.isFinite(probe.height), `${probe.segment}:${probe.role} has no datum`);
    assert.ok(probe.nearest.length >= 2);
  }
  const lowerStart = survey.endpoints.find(p => p.segment === 'lower-east-service' && p.role === 'start')!;
  assert.equal(lowerStart.height, 26);
});

test('the survey refuses degenerate routes instead of inventing a lane', () => {
  assert.throws(() => surveyC2RoadSegment(ridge.field, {
    id: 'degenerate', route: [{ east: 440, north: 516, height: 140, cum: 0 }],
  }), RangeError);
  assert.throws(() => surveyC2RoadSegment(ridge.field, {
    id: 'outside', route: [
      { east: -50, north: -50, height: 0, cum: 0 },
      { east: -60, north: -60, height: 0, cum: 14 },
    ],
  }), RangeError);
});

test('route separation is a real polyline distance, not an endpoint guess', () => {
  const separation = c2RouteSeparation(ridge.field,
    [{ east: 340, north: 722 }],
    [{ east: 340, north: 758 }, { east: 330, north: 758 }]);
  assert.ok(Math.abs(separation.distance - 36) < 1e-6, `distance ${separation.distance}`);
  assert.ok(separation.dropHeight !== undefined && separation.dropHeight > 60);
});
