import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { townCeremonyMidnight } from '../src/presence/ceremony-arrival.ts';
import { buildRailwayStation } from '../tools/voxel-tavern/town-blockout/landmark-station.ts';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import {
  createRailOvernightBroadcast, railHallCopy, railOvernightBoardCopy, railOvernightCopy, railPlatformCopy,
} from '../tools/voxel-tavern/town-blockout/town-rail-copy.ts';

const design = readFileSync(new URL('../docs/交流区/Muse/站牌时刻表文案-v1.md', import.meta.url), 'utf-8');
const notice = design.match(/`(跨年夜通宵运行[^\n`]+)`/)?.[1];
const eventDay = Date.parse('2026-12-31T00:00:00+08:00');
const announcement = Date.parse('2026-12-31T23:30:00+08:00');

test('the seven live rail schedule panels append the approved copy only on December 31 Beijing time', () => {
  assert.ok(notice);
  assert.equal(railOvernightCopy, notice);
  assert.equal(railOvernightBoardCopy(eventDay - 1), '');
  assert.equal(railOvernightBoardCopy(eventDay), notice);
  assert.equal(railOvernightBoardCopy(townCeremonyMidnight - 1), notice);
  assert.equal(railOvernightBoardCopy(townCeremonyMidnight), '');

  // Change only the ceremony sample. The train must still use its own real/room clock.
  const train = createTownRailway(createTerrainGrid(), () => eventDay + 3456);
  const readers = [
    ...train.stops.map(stop => (now: number) => railPlatformCopy(train, stop, now)),
    (now: number) => railHallCopy(train, now),
  ];
  for (const read of readers) {
    const regular = read(eventDay - 1);
    assert.match(regular, /每站每圈停靠一次 · 停靠 12 秒/);
    assert.equal(read(eventDay), `${regular}\n${notice}`);
    assert.equal(read(townCeremonyMidnight), regular);
  }
});

test('the station hall has a separate board hidden before the ceremony clock is sampled', () => {
  const station = buildRailwayStation();
  const board = station.getObjectByName('rail-overnight-board');
  assert.equal(board?.visible, false);
  assert.equal(board, station.userData.railOvernightBoard);
});

test('the platform and on-board caption starts at 23:30, once per visit', () => {
  const next = createRailOvernightBroadcast();
  let zoneChecked = 0;
  const atRailway = () => { zoneChecked++; return true; };
  assert.equal(next(announcement - 1, atRailway), '');
  assert.equal(zoneChecked, 0);
  assert.equal(next(announcement, () => false), '');
  assert.equal(next(announcement + 50, atRailway), notice);
  assert.equal(next(announcement + 60, atRailway), '');
  assert.equal(next(announcement + 5, atRailway), '');
  assert.equal(zoneChecked, 1);

  const beforeClosing = createRailOvernightBroadcast();
  assert.equal(beforeClosing(townCeremonyMidnight - 1, atRailway), notice);
  assert.equal(createRailOvernightBroadcast()(townCeremonyMidnight, atRailway), '');
});
