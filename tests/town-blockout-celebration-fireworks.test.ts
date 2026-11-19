import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, type Points } from 'three';
import {
  burstEnd, ceremonyCueOffsets, coverageCells, makeCeremonyScores, scorePeak, showPointLimit, type CeremonyFireworksCue,
} from '../tools/voxel-tavern/town-blockout/celebration-fireworks-score.ts';
import { createFestival, makeTestFireworksTable } from '../tools/voxel-tavern/town-blockout/festival.ts';
import { showSoundDelay } from '../tools/voxel-tavern/town-blockout/celebration-fireworks-audio.ts';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';

test('formal score keeps the locked cue envelope and covers the climax from the plaza', () => {
  const grid = createTerrainGrid();
  const { prelude, scores } = makeCeremonyScores(grid.heightAt);
  const cues = Object.keys(scores) as CeremonyFireworksCue[];
  const bursts = cues.flatMap(cue => scores[cue].bursts.map(burst => ({ ...burst, time: burst.time + ceremonyCueOffsets[cue] })));
  const peak = scorePeak(bursts);
  const coverage = coverageCells(bursts);
  const high = coverageCells(bursts.filter(({ time }) => time >= 9 && time <= 14));
  assert.deepEqual(cues.map(cue => scores[cue].bursts.length), [54, 28, 20]);
  assert.equal(prelude.bursts.length, 12);
  assert.ok(prelude.bursts.every(burst => burst.grade === 'S' && burstEnd(burst) < 590));
  assert.equal(new Set(bursts.map(({ launchId }) => launchId)).size, 9);
  assert.equal(new Set(bursts.map(({ shape }) => shape)).size, 6);
  assert.ok(cues.every(cue => scores[cue].bursts.every(burst => burst.time >= .8 - 1e-8)));
  assert.ok(coverage.cells >= 30);
  assert.ok(high.cells >= 20 && high.azimuthSpan >= 270);
  assert.ok(peak.points <= showPointLimit && peak.blooms >= 15 && peak.blooms <= 20);
  assert.equal(bursts.filter(({ time }) => time < 2).length, 2);
  assert.equal(bursts.find(({ time }) => time === 2)?.launchId, 'lanterns');
  assert.equal(new Set(bursts.filter(({ time }) => time === 27.5).map(({ launchId }) => launchId)).size, 5);
  assert.ok(bursts.every(({ time }) => time <= 30));
  const audition = makeTestFireworksTable(514, grid.heightAt);
  assert.equal(audition.duration, 36);
  assert.equal(audition.bursts.length, 45);
  assert.ok(audition.bursts.every(({ grade }) => grade !== 'XL'));
  assert.deepEqual([showSoundDelay(0), showSoundDelay(171.5), showSoundDelay(343)], [0, .5, .9]);
});

test('formal full frame mesh keeps one draw pool and is dark by the locked close', () => {
  let seconds = -601;
  const clock = () => Math.round((seconds + 700) * 1000);
  const scene = new Scene();
  const festival = createFestival(scene);
  const points = scene.children[0] as Points;
  assert.equal(festival.launchOverture(100_000, clock), true);
  seconds = -9;
  festival.update(0);
  assert.equal(points.visible, false);
  let maxParticles = 0;
  for (let frame = 0; frame <= 31 * 60; frame++) {
    seconds = frame / 60;
    for (const [cue, at] of Object.entries(ceremonyCueOffsets)) {
      if (frame === at * 60) assert.equal(festival.launchCeremony(cue as CeremonyFireworksCue, clock(), clock), true);
    }
    festival.update(1 / 60);
    maxParticles = Math.max(maxParticles, points.geometry.drawRange.count);
  }
  assert.equal(scene.children.length, 1);
  assert.ok(maxParticles > 4_000 && maxParticles <= showPointLimit);
  assert.equal(points.visible, false);
  assert.equal(points.geometry.drawRange.count, 0);
});
