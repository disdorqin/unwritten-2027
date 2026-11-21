import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { createSnowWingFlight } from '../src/shared/snow-wing';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { mountSummitGlideCourseDecorations, summitGlideCourseSignText } from '../tools/voxel-tavern/town-blockout/main-summit-glide-course-decorations';
import { shiftSummitGlideCourseWithDailyWind } from '../tools/voxel-tavern/town-blockout/main-summit-glide-day-course';
import { createSummitGlideRingScore } from '../tools/voxel-tavern/town-blockout/main-summit-glide-ring-score';
import { summitGlideNineRingMetres, summitGlideRingBodyLift, surveySummitGlideRings } from '../tools/voxel-tavern/town-blockout/main-summit-glide-rings';
import { createSummitGlideTargetRun, surveySummitGlidePracticeTarget } from '../tools/voxel-tavern/town-blockout/main-summit-glide-target';

const launch = { east: 62.5, north: 975, height: 800, heading: Math.PI, speed: 7.5,
  drop: 800, pathClear: true, claimed: true };

test('ZD-08: 9 full-air gates then one genuine, accepted landing in the same F-1 trajectory', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  assert.equal(rings.length, 9);
  assert.deepEqual(rings.map(r => r.id), Array.from({ length: 9 }, (_, i) => 'ring-' + (i + 1)));
  const target = surveySummitGlidePracticeTarget(launch, groundAt);
  assert.ok(target);
  const flight = createSnowWingFlight(groundAt);
  assert.equal(flight.launch(launch), true);
  const progress = createSummitGlideRingScore(rings);
  const ending = createSummitGlideTargetRun('accepted-flight', target, groundAt);
  let previous = flight.snapshot()!;
  let last;
  for (let i = 0; i < 36_000; i++) {
    const next = flight.advance(1 / 60)!;
    if (next.usesBothHands) {
      progress.advance({ east: previous.east, north: previous.north, height: previous.height + summitGlideRingBodyLift },
        { east: next.east, north: next.north, height: next.height + summitGlideRingBodyLift }, true);
    } else {
      assert.equal(next.phase, 'landed');
      last = ending.settle({ ...next, flightId: 'accepted-flight', accepted: true });
      break;
    }
    previous = next;
  }
  const scored = progress.snapshot();
  assert.equal(scored.nextRing, 9);
  assert.deepEqual(scored.results.map(x => x.grade), Array(9).fill('clean'));
  assert.equal(scored.scoreHalfPoints, 18);
  assert.equal(scored.streak, 9);
  assert.equal(last?.grade, 'bullseye');
  assert.equal(last?.horizontalMetres, 0);
  assert.equal(last?.touchdown, 'soft');
  assert.deepEqual(ending.settle({ ...previous, flightId: 'accepted-flight', accepted: false, phase: 'glide', touchdown: null }), last,
    'A replay may only return the first genuine settlement');
});

test('ZD-08: daily source changes the surveyed art without mutating neutral reference or F-1 physics', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const base = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  const copy = structuredClone(base);
  const first = shiftSummitGlideCourseWithDailyWind(base, {
    dayId: '2026-11-21', eastMetresPerSecond: 0, northMetresPerSecond: 0,
  }, groundAt)!;
  const second = shiftSummitGlideCourseWithDailyWind(base, {
    dayId: '2026-11-22', eastMetresPerSecond: 5, northMetresPerSecond: 1,
  }, groundAt)!;
  assert.equal(first.rings.length, 9);
  assert.equal(second.rings.length, 9);
  assert.ok(second.rings.some((ring, i) => ring.east !== first.rings[i]!.east));
  assert.deepEqual(base, copy);
  assert.ok(second.rings.every(r => Number.isFinite(r.east) && Number.isFinite(r.height)));
});

test('ZD-08: nine-ring furnishings have original prose, readable sign faces, three cloth palettes and true lamps', context => {
  const scene = new Scene();
  const block = createMainSummitBlock(mainSummitLayout, 347, 50);
  context.after(block.dispose);
  const groundAt = (east: number, north: number) => block.heightAt(east, north) ?? 0;
  const rings = surveySummitGlideRings(launch, groundAt, summitGlideNineRingMetres);
  const target = surveySummitGlidePracticeTarget(launch, groundAt)!;
  const art = mountSummitGlideCourseDecorations(scene, rings, target, launch);
  assert.equal(art.group.parent, scene);
  assert.ok(art.drawCount <= 20);
  assert.equal(art.lights.length, 2);
  assert.ok(art.lights.every(lamp => lamp.isPointLight && lamp.intensity > 0));
  assert.ok(art.group.getObjectByName('glide-start-board'));
  assert.ok(art.group.getObjectByName('glide-finish-board'));
  assert.equal(art.group.children.filter(child => child.name.startsWith('nine-ring-ribbon-')).length, 3);
  for (const sign of Object.values(summitGlideCourseSignText)) {
    assert.equal(sign.length, 4);
    assert.ok(sign.every(line => line.length > 0 && !line.includes('待定')));
  }
  art.dispose();
  art.dispose();
  assert.equal(art.group.parent, null);
  assert.equal(scene.children.length, 0);
});
