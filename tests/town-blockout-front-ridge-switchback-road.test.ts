import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSwitchbackCenterline, createFrontRidgeSwitchbackRoad,
} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

test('switchback centreline meets the surveyed spec: >=2.75 km, grade <=12%', () => {
  const line = buildSwitchbackCenterline();
  const total = line.at(-1)!.cum;
  assert.ok(total >= 2750, `total length ${total.toFixed(0)} m must be >= 2750 m`);
  let maxGrade = 0;
  for (let i = 1; i < line.length; i++) {
    const plan = Math.hypot(line[i]!.east - line[i - 1]!.east, line[i]!.north - line[i - 1]!.north);
    if (plan < 0.5) continue;
    maxGrade = Math.max(maxGrade, Math.abs(line[i]!.height - line[i - 1]!.height) / plan);
  }
  assert.ok(maxGrade <= 0.12, `max grade ${(maxGrade * 100).toFixed(1)}% must be <= 12%`);
  // Anchors: base H18, mid terrace H140, cloud terrace H347.
  const near = (east: number, north: number) => line.reduce((best, point) =>
    Math.hypot(point.east - east, point.north - north) < Math.hypot(best.east - east, best.north - north) ? point : best);
  assert.ok(Math.abs(near(526, 329).height - 18) < 1.5);
  assert.ok(Math.abs(near(440, 520).height - 140) < 1.5);
  assert.ok(Math.abs(near(336, 640).height - 347) < 1.5);
});

test('switchback road overlay: height layer, lamps, signs, dispose', () => {
  const road = createFrontRidgeSwitchbackRoad();
  // Toe start sits on the terrain; terrace end meets the cloud terrace.
  const start = road.heightAt(290, 300);
  assert.ok(start !== undefined && Math.abs(start - sampleNorthRidge350(290, 300) - 0.06) < 0.6);
  const top = road.heightAt(336, 640);
  assert.ok(top !== undefined && Math.abs(top - 347.06) < 0.75);
  // Off-corridor ground is not the overlay's business.
  assert.equal(road.heightAt(100, 100), undefined);
  const names = road.group.children.map(child => child.name);
  assert.ok(names.includes('switchback-road-ribbon'));
  assert.ok(names.includes('switchback-fog-lamp-posts'));
  const lamps = road.group.children.filter(child => child.name === 'switchback-fog-lamp');
  assert.ok(lamps.length >= 30, `fog lamp chain has ${lamps.length} lamps`);
  road.setNight(true);
  road.setNight(false);
  road.dispose();
  road.dispose();
});
