import assert from 'node:assert/strict';
import test from 'node:test';
import {
  c2EastRoadHandoffs, c2EastRoadTerminalGrades, roadHandoffAt,
} from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-road-handoff.ts';
import {
  lowerEastServiceControls, middleEastNorthControls, middleSouthRoadControls,
} from '../tools/voxel-tavern/town-blockout/town-d-r30-upper-roadbed.ts';
import { rearConnectorControls } from '../tools/voxel-tavern/town-blockout/town-d-r30-rear-connector.ts';

test('handoff points are the exact authored endpoints, not a new survey', () => {
  const pairs = [
    [c2EastRoadHandoffs[0]!, middleEastNorthControls],
    [c2EastRoadHandoffs[1]!, lowerEastServiceControls],
    [c2EastRoadHandoffs[2]!, middleSouthRoadControls],
    [c2EastRoadHandoffs[3]!, rearConnectorControls],
  ] as const;
  for (const [segment, controls] of pairs) {
    assert.equal(segment.from.east, controls[0]!.east);
    assert.equal(segment.from.north, controls[0]!.north);
    assert.equal(segment.to.east, controls.at(-1)!.east);
    assert.equal(segment.to.north, controls.at(-1)!.north);
    assert.equal(segment.owner, 'C2');
    assert.equal(segment.status, 'authored-centreline-only');
  }
});

test('each handoff carries unit tangents and the surveyed road envelope', () => {
  for (const segment of c2EastRoadHandoffs) {
    for (const t of [segment.tangentFrom, segment.tangentTo]) {
      assert.ok(Math.abs(Math.hypot(t.east, t.north) - 1) < 1e-12);
    }
    assert.equal(segment.halfWidth, 2.8);
    assert.equal(segment.maxGrade, .12);
    assert.equal(segment.sharedBoundary, 32);
  }
});

test('terminal grades restate the known C2 road datum', () => {
  assert.equal(c2EastRoadTerminalGrades.lowerEastService.startHeight, 26);
  assert.equal(c2EastRoadTerminalGrades.lowerEastService.endHeight, 87.5);
  assert.equal(c2EastRoadTerminalGrades.rearConnectorStart, 87.5);
  assert.equal(c2EastRoadTerminalGrades.rearConnectorEnd, 140);
});

test('lookup finds only seam endpoints and rejects interior points', () => {
  const segment = c2EastRoadHandoffs[1]!;
  assert.equal(roadHandoffAt(segment.from.east, segment.from.north)?.id, segment.id);
  assert.equal(roadHandoffAt(segment.to.east, segment.to.north)?.id, segment.id);
  assert.equal(roadHandoffAt(0, 0), undefined);
  assert.equal(roadHandoffAt(segment.from.east + 5, segment.from.north + 5), undefined);
});

test('contract module draws nothing and grants no authority', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(c2EastRoadHandoffs[0]!, 'group'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(c2EastRoadHandoffs[0]!, 'collider'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(c2EastRoadHandoffs[0]!, 'worldAnchor'), false);
});
