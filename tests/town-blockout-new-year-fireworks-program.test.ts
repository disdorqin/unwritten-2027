import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  makeNewYearFireworksProgram, newYearFireworksDuration, newYearFireworksLeadMs,
} from '../tools/voxel-tavern/town-blockout/new-year-fireworks-program.ts';

const points = [
  ['center', 218, 15, -196], ['east', 262, 12, -176], ['west', 186, 12, -176],
  ['stage', 224, 12, -146], ['tower', 226, 12, -228], ['lanterns', 150, 9, -95],
  ['lake', 344, 7, -66], ['memorial', 373, 28, -264], ['ridge', 209, 12, -306],
].map(([id, x, y, z]) => ({ id: String(id), x: Number(x), y: Number(y), z: Number(z) }));
const show = makeNewYearFireworksProgram(points);
const launchAt = (time: number) => time - .8;
const between = (from: number, to: number) => show.bursts.filter(({ time }) => launchAt(time) >= from && launchAt(time) < to);

test('the Beijing New Year score keeps all five acts within the 102-shot and nine-point budget', () => {
  assert.equal(newYearFireworksLeadMs, 300_000);
  assert.equal(show.duration, newYearFireworksDuration);
  assert.equal(show.duration, 900);
  assert.deepEqual([[0, 240], [300, 320], [360, 540], [540, 720], [720, 900]]
    .map(([from, to]) => between(from, to).length), [12, 18, 16, 44, 12]);
  assert.equal(show.bursts.length, 102);
  assert.deepEqual(new Set(show.bursts.map(burst => burst.launchId)), new Set(points.map(point => point.id)));
  assert.ok(show.bursts.every(burst => ['#ffc26b', '#ff5767', '#eef2ff'].includes(burst.outer)));
  assert.throws(() => makeNewYearFireworksProgram(points.slice(1)), RangeError);
});

test('both midnight waves use all nine points after the bell, while watch-star shots stay small, high and silver', () => {
  const first = between(300, 304);
  const second = between(304, 320);
  assert.deepEqual([first.length, second.length], [9, 9]);
  assert.equal(launchAt(first[0].time), 300.5);
  assert.equal(launchAt(second[0].time), 304.5);
  assert.equal(new Set(first.map(({ launchId }) => launchId)).size, 9);
  assert.deepEqual(first.map(({ launchId }) => launchId), second.map(({ launchId }) => launchId));
  assert.ok(first.every((shot, index) => shot.y < second[index].y));
  assert.ok(between(360, 540).every(shot => shot.grade === 'S' && shot.y >= 95 && shot.outer === '#eef2ff'));
});

test('the rotating peak follows geographic order and leaves the unique largest shell to the gold finale', () => {
  const angle = ({ x, z }: { x: number; z: number }) => (Math.atan2(x - 224, -188 - z) + 2 * Math.PI) % (2 * Math.PI);
  const finale = between(720, 900);
  const rotatingPeak = between(690, 720);
  assert.equal(rotatingPeak.length, 9);
  assert.deepEqual(rotatingPeak.map(angle), rotatingPeak.map(angle).sort((a, b) => a - b));
  const gaps = finale.slice(1).map(({ time }, index) => time - finale[index].time);
  assert.equal(gaps[0], 5);
  assert.equal(gaps.at(-1), 15);
  assert.ok(gaps.every((gap, index) => index === 0 || gap >= gaps[index - 1]));
  const final = finale.at(-1)!;
  assert.equal(final.outer, '#ffc26b');
  assert.equal(final.shape, 'brocade');
  assert.ok(show.bursts.slice(0, -1).every(burst => burst.radius < final.radius));
});
