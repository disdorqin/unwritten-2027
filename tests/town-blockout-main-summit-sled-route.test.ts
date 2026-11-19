import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitSledRoute } from '../tools/voxel-tavern/town-blockout/main-summit-sled-route';

const route = createMainSummitSledRoute();

test('P-3 measures one 6 km descent through all four corrected height anchors', () => {
  assert.ok(route.lengthMetres >= 6000);
  assert.deepEqual(route.arcs.map(arc => [arc.startHeight, arc.endHeight]), [[800, 560], [560, 380], [380, 18]]);
  assert.deepEqual(route.arcs.map(arc => arc.id), ['above-cloud', 'through-cloud', 'below-cloud']);
  const limits = [[.12, .16], [.08, .10], [.10, .14]] as const;
  let measuredLength = 0;
  for (const [index, arc] of route.arcs.entries()) {
    const [minimum, maximum] = limits[index]!;
    assert.ok(arc.grade >= minimum && arc.grade <= maximum);
    assert.equal(arc.points[0]!.height, arc.startHeight);
    assert.equal(arc.points.at(-1)!.height, arc.endHeight);
    for (let pointIndex = 1; pointIndex < arc.points.length; pointIndex++) {
      const from = arc.points[pointIndex - 1]!;
      const to = arc.points[pointIndex]!;
      const planarDistance = Math.hypot(to.east - from.east, to.north - from.north);
      const drop = from.height - to.height;
      assert.ok(drop > 0 && to.north <= from.north + 1e-9);
      assert.ok(drop / planarDistance >= minimum - 1e-7 && drop / planarDistance <= maximum + 1e-7);
      measuredLength += Math.hypot(planarDistance, drop);
    }
  }
  // The drawn chords approximate the analytic circular pieces to within a metre.
  assert.ok(Math.abs(measuredLength - route.lengthMetres) < 1);
});

test('P-3 poses have continuous plan tangents and meet at exactly one host boundary', () => {
  const angleDifference = (left: number, right: number) => Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
  for (let metres = 1; metres < route.lengthMetres; metres++) {
    assert.ok(angleDifference(route.headingAtDistance(metres - 1), route.headingAtDistance(metres)) < .013);
  }
  assert.equal(route.minimumPlanBendRadiusMetres, 83);
  const seam = route.hostSeam;
  assert.equal(seam.leaves, 'main-summit');
  assert.equal(seam.enters, 'front-ridge-foot-preview');
  assert.ok(Math.abs(seam.point.north - -10) < 1e-9);
  assert.ok(route.sampleAtDistance(seam.distanceMetres - 1).north > -10);
  assert.ok(route.sampleAtDistance(seam.distanceMetres + 1).north < -10);
  assert.ok(route.points.every(point => point.east >= -1100 && point.east <= 1100 && point.north <= 1790));
  assert.deepEqual(route.sampleAtDistance(-1), route.points[0]);
  assert.deepEqual(route.sampleAtDistance(route.lengthMetres + 1), route.points.at(-1));
  assert.throws(() => route.sampleAtDistance(NaN), RangeError);
});
