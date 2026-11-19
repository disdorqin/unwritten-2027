import assert from 'node:assert/strict';
import { createMainSummitSledRoute } from './voxel-tavern/town-blockout/main-summit-sled-route';
import { replaySummitSled } from './voxel-tavern/town-blockout/main-summit-sled-replay';
import { createMainSummitTrail } from './voxel-tavern/town-blockout/main-summit-trail';

// P-1 is composed from the reviewed branch during the isolated verification.
const p1Fixture = './voxel-tavern/town-blockout/main-summit-block.ts';
const { createMainSummitBlock, mainSummitLayout } = await import(p1Fixture);
const floor = 347;
const summit = createMainSummitBlock(mainSummitLayout, floor, 120);
const trail = createMainSummitTrail(summit.heightAt, floor);
const route = createMainSummitSledRoute();

let maxNaturalCutMetres = 0;
let maxNaturalFillMetres = 0;
let routeProbeCount = 0;
for (let along = 0; along <= route.hostSeam.distanceMetres; along += 1) {
  const point = route.sampleAtDistance(along);
  const ground = summit.heightAt(point.east, point.north);
  assert.notEqual(ground, undefined, `P-1 route footprint at ${along} m`);
  const delta = point.height - ground!;
  maxNaturalCutMetres = Math.max(maxNaturalCutMetres, -delta);
  maxNaturalFillMetres = Math.max(maxNaturalFillMetres, delta);
  routeProbeCount++;
}
const packed = replaySummitSled(route);
const existingDepth = replaySummitSled(route, ({ east, north }) => ({
  surface: 0, deepSnow: (summit.snowDepthAt(east, north, 0.6) ?? 0) >= 0.6,
}));
for (const replay of [packed, existingDepth]) {
  assert.equal(replay.status, 'finished');
  assert.equal(replay.height, 18);
}
assert.ok(trail.metrics.horizontalMetres >= 5400);
assert.ok(trail.metrics.maxGrade <= 0.12);
assert.ok(route.lengthMetres >= 6000);

console.log(JSON.stringify({
  trail: { ...trail.metrics, turnarounds: trail.turnarounds.length, pavilionAnchors: trail.pavilionAnchors },
  route: {
    lengthMetres: route.lengthMetres,
    hostSeam: route.hostSeam,
    stages: route.arcs.map(({ id, lengthMetres, startHeight, endHeight, grade }) => ({
      id, lengthMetres, startHeight, endHeight, grade,
    })),
    routeProbeCount, maxNaturalCutMetres, maxNaturalFillMetres,
  },
  packed: { elapsedSeconds: packed.elapsedSeconds, peak: packed.maximumSpeed, stages: packed.stages },
  existingDepth: { elapsedSeconds: existingDepth.elapsedSeconds, peak: existingDepth.maximumSpeed,
    stages: existingDepth.stages },
}, null, 2));
summit.dispose();
