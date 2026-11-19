import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMainSummitSnowBelt, type SnowBeltKnot } from './voxel-tavern/town-blockout/main-summit-snow-belt';
import { createSummitSnowTransition, runSummitSnowJoinProbe, surveyedSledConnection } from './voxel-tavern/town-blockout/main-summit-snow-transition';
import { probeMainSummitSledRide } from './probe-main-summit-sled-ride';

// The real P-1 height field is supplied by the harness at its audited revision.
const p1Path = './voxel-tavern/town-blockout/main-summit-block.ts';
const { createMainSummitBlock, mainSummitLayout } = await import(p1Path);
const summit = createMainSummitBlock(mainSummitLayout, 347, 120);
const fixture = new URL('./fixtures/main-summit-snow-belt-survey.json', import.meta.url);
const knots: SnowBeltKnot[] = JSON.parse(readFileSync(fixture, 'utf8'));
const entryGrade = -surveyedSledConnection.grade;
const belt = createMainSummitSnowBelt(knots, entryGrade);
const tail = createSummitSnowTransition(surveyedSledConnection);
assert.ok(Math.hypot(belt.exit.east - tail.entry.east, belt.exit.north - tail.entry.north,
  belt.exit.height - tail.entry.height) < 1e-7);
assert.ok(Math.abs(belt.exit.grade + tail.gradeAt(0)) < 1e-8);
assert.ok(Math.abs(belt.exit.headingFromEast + tail.entry.heading - Math.PI / 2) < 1e-8);
assert.equal(tail.heightAt(tail.planMetres), 18);
assert.equal(belt.entrance.height, 800);

const track = [...belt.points, ...tail.samplePolyline().slice(1)];
const packedSurface = () => ({ surface: 0, deepSnow: false });
const surveyedSnow = (east: number, north: number) =>
  ({ surface: 0, deepSnow: (summit.snowDepthAt(east, north, 0.6) ?? 0) >= 0.6 });

function snowHeight(east: number, north: number) {
  const along = tail.along(east, north);
  if (along >= 0 && along < tail.planMetres + 2.1 && Math.abs(tail.lateral(east, north)) <= 2.1) {
    return tail.heightAt(along);
  }
  return belt.sampleSurface(east, north);
}

const packed = probeMainSummitSledRide({ points: track, surface: packedSurface, steering: true, heightAt: snowHeight });
const underlaySnow = probeMainSummitSledRide({ points: track, surface: surveyedSnow, steering: true, heightAt: snowHeight });
const rawGround = probeMainSummitSledRide({ points: belt.points, surface: surveyedSnow, steering: true, heightAt: summit.heightAt });
const smooth = runSummitSnowJoinProbe(tail, 'overlay');
const oldGap = runSummitSnowJoinProbe(tail, 'legacy-drop');
for (const ride of [packed, underlaySnow]) {
  assert.equal(ride.status, 'finished');
  assert.equal(ride.airTicks, 0);
  assert.equal(ride.wallHits, 0);
  assert.ok(ride.plannedLength >= 6000);
  assert.ok(Math.abs(ride.finish.height - 18) < 1e-4);
}
assert.notEqual(rawGround.status, 'finished');
assert.equal(smooth.airTicksNearSeam, 0);
assert.ok(oldGap.airTicksNearSeam > 0);

const upperSegments = belt.bandMetres;
const lowerMetres = packed.plannedLength - belt.totalSurfaceMetres;
console.log(JSON.stringify({
  scope: 'P-1 route with engineered snow; the section after the east seam is a separate R2-unbound fixture',
  upper: { metres: belt.totalSurfaceMetres, bandMetres: upperSegments, entrance: belt.entrance,
    exit: belt.exit, widthMetres: belt.widthMetres, minimumGrade: belt.minimumGrade, maximumGrade: belt.maximumGrade },
  lower: { planMetres: tail.planMetres, surfaceMetres: lowerMetres, end: tail.sample(tail.planMetres),
    dropMetres: tail.entry.height - 18, stages: tail.waypoints },
  segments: [upperSegments[0], upperSegments[1], upperSegments[2]! + lowerMetres],
  dropMetres: belt.entrance.height - 18, packed, underlaySnow, rawGround, smooth, oldGap,
}, null, 2));
summit.dispose();
