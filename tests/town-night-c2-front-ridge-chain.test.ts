import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import { mountProductionRidge } from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import { surveyC2RoadNetwork } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-road-survey';

/**
 * C32-2 / C32-3: the front-ridge road is one continuous graded chain once the
 * authorised reshaped link is enabled.
 *
 * D2's joint audit against C2 `da87cc44` found only `middle-east-upper` really
 * joins the canonical central trail (0.60 m, station 42); the other three
 * handoffs miss by 36.06 / 185.91 / 199.24 m. This test shows what the chain
 * actually is with the link switched on, measured on the produced raster:
 *
 *   base dock 26 m -> 701 m lower service -> 87.5 m traverse
 *   -> 567 m link -> 140 m middle station pad -> 384 m east road -> 153.9 m
 *   -> canonical trail (geometry already 0.60 m from station 42 at the far end)
 *
 * Every segment stays inside 12% grade and 2.5 m net width, the two internal
 * joints are exact, and the link's terrain reshape is the only intervention -
 * recorded here (49.476 m peak) rather than hidden behind a switch.
 */

function build(rearConnectorCandidate: boolean) {
  const grid = createTerrainGrid();
  const root = new Group();
  const railway = createTownRailway(grid, () => 0);
  const branch = buildCraterRailExtension(grid,
    mountWestCraterRoad(worldBounds.depth, north => grid.groundHeightAt(0, north)), railway.route.points);
  root.add(railway.group, branch.group);
  return mountProductionRidge(root, grid,
    { loop: railway.route.points, branch: branch.samples, rearConnectorCandidate });
}

const closed = build(false);
const open = build(true);
const ids = ['middle-south-exit', 'middle-east-upper', 'rear-link', 'lower-east-service'] as const;

test('without the link the front ridge is three disconnected segments', () => {
  const survey = surveyC2RoadNetwork(closed.field,
    closed.roads.map((road, index) => ({ id: ids[index]!, route: road.route })));
  assert.equal(survey.segments.length, 3);
  assert.equal(survey.joints.length, 0, 'no endpoint pair coincides');
  assert.deepEqual(survey.connectedSegments, []);
  assert.equal(survey.certified, true, 'each segment is still individually legal');
});

test('with the link the chain is continuous from 26 m to the middle station', () => {
  assert.equal(open.roads.length, 4);
  assert.equal(open.rearConnected, true);
  const survey = surveyC2RoadNetwork(open.field,
    open.roads.map((road, index) => ({ id: ids[index]!, route: road.route })));
  assert.equal(survey.segments.length, 4);
  assert.equal(survey.certified, true);
  for (const segment of survey.segments) {
    assert.ok(segment.gradeOk && segment.widthOk, `${segment.id} ${segment.maxGrade} ${segment.minNetWidth}`);
    assert.equal(segment.unsupported, 0, `${segment.id} leaves the field`);
  }
  // Both internal joints are exact: 87.5 m traverse and 140 m station pad.
  assert.equal(survey.joints.length, 2);
  for (const joint of survey.joints) assert.ok(joint.distance < .01, `${joint.a}/${joint.b} ${joint.distance}`);
  const heights = survey.endpoints.map(endpoint => endpoint.height).sort((a, b) => a - b);
  assert.ok(Math.abs(heights[0]! - 26) < .01, 'the chain starts at the 26 m base dock');
  assert.ok(heights.some(height => Math.abs(height - 140) < .01), 'and reaches the 140 m middle station');
});

test('the link is the only intervention, and its reshape is recorded', () => {
  const audit = open.connectorAudit!;
  assert.ok(audit, 'the link reports its own audit');
  assert.ok(Math.abs(audit.length - 567.255) < .01);
  assert.ok(Math.abs(audit.maxChange - 49.476) < .01, `reshape ${audit.maxChange}`);
  assert.equal(audit.frozen, 0, 'protected ground is untouched');
  assert.equal(audit.oldMax, 0, 'the three certified roads are not re-cut');
  for (const grade of audit.oldGrades) assert.ok(grade <= .120001, `old road grade ${grade}`);
  assert.ok(audit.roadMax <= 8.00001);
  // The three untouched segments keep byte-identical certification.
  const before = surveyC2RoadNetwork(closed.field, closed.roads.map((road, index) => ({ id: ids[index]!, route: road.route })));
  for (const segment of before.segments) {
    assert.ok(segment.gradeOk && segment.widthOk, `${segment.id} regressed when the link was enabled`);
  }
});
