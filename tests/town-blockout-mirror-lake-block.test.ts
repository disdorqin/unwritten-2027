import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { mirrorLake } from '../src/shared/mirror-lake.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createMirrorSouthShorePath, mirrorSouthShorePath, mirrorSouthShoreSamples, mirrorSouthShoreWidth } from
  '../tools/voxel-tavern/town-blockout/mirror-lake-west-shore.ts';
import { buildMirrorLakeZoneSample, ellipseLoop, surveyMirrorZoneLayout, type MirrorZoneLayout } from
  '../tools/voxel-tavern/town-blockout/mirror-lake-zone-sample.ts';

test('the surveyed two-metre south shore route clears the current west rail', t => {
  const grid = createTerrainGrid();
  const railway = createTownRailway(grid);
  const { points } = railway.route;
  const { colliders, floors } = readWalkGeometry(railway.group);
  const obstacles = [...colliders, ...floors];
  let checked = 0;
  let minimumAxis = Infinity;
  const blocked: [number, number, number][] = [];
  for (const sample of mirrorSouthShoreSamples(.15)) {
    for (const offset of [-mirrorSouthShoreWidth / 2, 0, mirrorSouthShoreWidth / 2]) {
      const east = sample.east + sample.sideEast * offset;
      const north = sample.north + sample.sideNorth * offset;
      const y = grid.heightAt(east, north);
      for (const [i, a] of points.entries()) {
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dn = a.z - b.z;
        const dxToRail = east - a.x;
        const dnToRail = north + a.z;
        const fraction = Math.max(0, Math.min(1, (dxToRail * dx + dnToRail * dn) / (dx * dx + dn * dn)));
        minimumAxis = Math.min(minimumAxis, Math.hypot(dxToRail - dx * fraction, dnToRail - dn * fraction));
      }
      const collides = obstacles.some(({ min, max }) => max[1] > y + .025 && min[1] < y + 1.95 &&
        Math.hypot(Math.max(min[0] - east, east - max[0], 0), Math.max(min[2] + north, -north - max[2], 0)) < .27);
      if (collides) blocked.push([east, north, offset]);
      checked++;
    }
  }
  t.diagnostic(JSON.stringify({ checked, minimumAxis, blocked: blocked.length, firstBlocked: blocked[0], lastBlocked: blocked.at(-1), endpoint: mirrorSouthShorePath.at(-1) }));
  assert.ok(minimumAxis >= 3.5);
  assert.equal(blocked.length, 0);
});

test('four-zone candidate and south shore geometry have independent ownership', t => {
  // Coordinates here are the documented B survey, not an approved gameplay location.
  const probe: MirrorZoneLayout = {
    fishing: [[27,181],[30,160],[30,210]],
    westShorePavilionProbe: [22,207],
    skateLines: [ellipseLoop(mirrorLake.center, [12,40], 96), ellipseLoop(mirrorLake.center, [10,40], 96)],
    scoreCenters: [[68,169],[68,213]],
    prize: [68,191],
    island: { center: [50,207], radius: 6 },
  };
  const survey = surveyMirrorZoneLayout(probe);
  assert.equal(survey.scoreSpacing, 44);
  assert.ok(survey.scoreCenterGaps.every(gap => gap.iceEdge > 2));
  const grid = createTerrainGrid();
  const zones = buildMirrorLakeZoneSample(probe, grid.heightAt);
  const path = createMirrorSouthShorePath(grid.heightAt);
  const scene = new Group();
  scene.add(zones.group, path.mesh);
  assert.equal(scene.children.length, 2);
  assert.equal(zones.group.children.length, 1);
  const pathTriangles = path.mesh.geometry.index!.count / 3;
  t.diagnostic(JSON.stringify({ iceTriangles: zones.triangles, pathTriangles, childrenBeforeDispose: scene.children.length }));
  path.dispose();
  zones.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(zones.group.children.length, 0);
});
