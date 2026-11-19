import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, type Points } from 'three';
import { createCeremonyFireworksDispatch } from '../tools/voxel-tavern/town-blockout/ceremony-fireworks-clock.ts';
import { createFestival, type FireworksTable } from '../tools/voxel-tavern/town-blockout/festival.ts';

const start = Date.parse('2027-01-01T00:00:01+08:00');
// A short synthetic fixture isolates the dispatch timing from the authored ceremony programs.
const table: FireworksTable = {
  duration: 10,
  launchPoints: [{ id: 'test-stand', x: 8, y: 4, z: -5 }],
  bursts: [.85, 3.5, 3.5, 6].map((time, index) => ({
    time, x: index, y: 18, z: -8, radius: 2, shape: 'ring',
    outer: '#ffdd44', inner: '#ffffff', launchId: 'test-stand',
  })),
};

test('late firework entry omits launched shells and keeps authored shot order and absolute clock', () => {
  let clock = start + 1000;
  const run = createCeremonyFireworksDispatch(.8);
  assert.ok(run(table, start, clock, () => clock, (slice, playback) => {
    assert.equal(playback.startAt, start);
    assert.equal(playback.ageSeconds, 1);
    assert.deepEqual(slice.bursts, table.bursts.slice(1));
    assert.equal(slice.launchPoints, table.launchPoints);
    assert.equal(slice.duration, 10);
    clock = start + 2700;
    assert.equal(playback.clockMs(), clock);
    clock = start + 2500;
    assert.equal(playback.clockMs(), start + 2700);
    clock = NaN;
    assert.equal(playback.clockMs(), start + 2700);
    return true;
  }));
  clock = start - 1000;
  assert.equal(run(table, start, clock, () => clock, () => assert.fail('the started score must never repeat')), false);
});

test('an on-time observer retains every authored field and the score can retry when renderer is occupied', () => {
  const now = start - 200;
  const run = createCeremonyFireworksDispatch(.8);
  assert.equal(run(table, start, now, () => now, () => false), false);
  assert.equal(run(table, start, now, () => now, (slice, playback) => {
    assert.deepEqual(slice, table);
    assert.equal(playback.ageSeconds, -.2);
    assert.equal(playback.startAt, start);
    return true;
  }), true);
});

test('expired score cannot revive after clock correction', () => {
  const run = createCeremonyFireworksDispatch(.8);
  const never = () => assert.fail('a fully missed score must not revive');
  assert.equal(run(table, start, start + 10_000, () => start + 10_000, never), false);
  assert.equal(run(table, start, start, () => start, never), false);
});

test('an active authored ceremony skips the old shell and finishes on the authoritative clock', () => {
  let now = start + 500;
  const clock = () => now;
  const scene = new Scene();
  const festival = createFestival(scene);
  const sparks = scene.children[0] as Points;
  assert.equal(festival.launchCeremony('fireworks-main', start, clock), true);
  festival.update(100);
  assert.equal(sparks.visible, false, 'a previously launched shell produces no after-image for the late client');
  now = start + 1_400;
  festival.update(0);
  assert.equal(sparks.visible, true);
  assert.ok(sparks.geometry.drawRange.count > 0);
  now = start + 29_000;
  festival.update(0);
  assert.equal(festival.showActive(), false);
  now = start;
  assert.equal(festival.launchCeremony('fireworks-main', start, clock), false);
});
