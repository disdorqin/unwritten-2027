import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createRailApproachReminder } from '../tools/voxel-tavern/town-blockout/town-rail-copy.ts';
import { createRailTimetable } from '../tools/voxel-tavern/town-blockout/town-rail-timetable.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';

const epoch = Date.UTC(2026, 0, 1);

test('all six rail approaches use their existing braking segment without touching the shared train phase', () => {
  let now = epoch;
  const train = createTownRailway(createTerrainGrid(), () => now);
  const timetable = createRailTimetable(train.stops, train.route.length);
  const phase = { leg: 0, distance: 0, stopped: false, secondsLeft: 0 };
  const dwell = train.dwellSeconds;

  for (const leg of timetable.legs) {
    const arrivalMs = epoch + (leg.offset + dwell + leg.travelSeconds) * 1000;
    const rampMs = leg.rampSeconds * 1000;
    now = Math.floor(arrivalMs - rampMs) - 1;
    train.update(1 / 60);
    assert.equal(train.approachingStop, undefined);

    now = Math.ceil(arrivalMs - rampMs) + 1;
    train.update(1 / 60);
    assert.equal(train.approachingStop, leg.to);
    const expected = timetable.sample(now, phase);
    assert.ok(Math.abs(train.timetable(leg.to.id).seconds - expected.secondsLeft) < .001);
    assert.equal(train.currentStop, undefined);
    assert.equal(train.dwellSeconds, 12);

    now = Math.ceil(arrivalMs) + 1;
    train.update(1 / 60);
    assert.equal(train.approachingStop, undefined);
    assert.equal(train.currentStop, leg.to);
  }
  assert.equal(train.cycleSeconds, timetable.cycleSeconds);
});

test('the exact rail copy is emitted once per approach, with no repeated notice on clock correction', () => {
  const design = readFileSync(new URL('../docs/交流区/Muse/站牌时刻表文案-v1.md', import.meta.url), 'utf8');
  const template = design.match(/`(列车即将到[^\n`]+)`/)?.[1];
  assert.ok(template);
  const stop = { id: 'forest-station', label: '森林木屋站' } as const;
  const next = { id: 'lake-station', label: '湖南岸站' } as const;
  const reminder = createRailApproachReminder();
  assert.equal(reminder.update(undefined), '');
  assert.equal(reminder.update(stop), template.replace('{预约站名}', stop.label));
  assert.equal(reminder.update(stop), '');
  assert.equal(reminder.update(undefined), '');
  assert.equal(reminder.update(stop), '');
  const nextLine = template.replace('{预约站名}', next.label);
  assert.equal(reminder.update(next), nextLine);
  assert.equal(reminder.clear(), nextLine);
  assert.equal(reminder.clear(), '');
  assert.equal(reminder.update(next), nextLine);
});
