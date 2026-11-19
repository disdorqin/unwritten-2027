import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createGrandPrix, grandPrixCheckpoints, grandPrixProgressKey,
} from '../tools/voxel-tavern/town-blockout/town-grand-prix.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    map,
  };
}

const sled = { sledding: true, skating: false };
const skate = { sledding: false, skating: true };
const foot = { sledding: false, skating: false };
const at = (index: number) => {
  const point = grandPrixCheckpoints[index];
  return [point.x, point.n] as const;
};

test('the rehearsal page contains each sled and Grand Prix HUD output', () => {
  const html = readFileSync(new URL('../tools/voxel-tavern/town-blockout.html', import.meta.url), 'utf8');
  for (const id of ['sled-status', 'grand-prix-status', 'grand-prix-board']) {
    assert.equal(html.match(new RegExp(`<output id="${id}"`, 'g'))?.length, 1, id);
  }
});

test('a full run advances only in order and only on the matching leg', () => {
  let clock = 0;
  const race = createGrandPrix(memoryStorage(), () => clock);
  // Standing at the start on foot does not begin the run.
  race.update(...at(0), foot);
  assert.equal(race.running(), false);
  // Skipping ahead while sledding does not advance.
  race.update(...at(0), sled);
  assert.equal(race.running(), true);
  race.update(...at(3), sled);
  assert.deepEqual(race.splits(), [0]);
  // Wrong leg at the skate gates does not advance.
  clock = 60_000;
  race.update(...at(1), sled);
  race.update(...at(2), sled);
  race.update(...at(3), sled);
  race.update(...at(4), foot);
  assert.equal(race.splits().length, 4);
  race.update(...at(4), skate);
  race.update(...at(5), skate);
  race.update(...at(6), skate);
  assert.equal(race.splits().length, 7);
  // Finish requires being on foot at the emblem.
  race.update(...at(7), sled);
  assert.equal(race.running(), true);
  clock = 240_000;
  const status = race.update(...at(7), foot);
  assert.match(status, /完赛 240\.0 秒/);
  assert.equal(race.running(), false);
  assert.equal(race.takeResult(), 240_000);
  assert.equal(race.takeResult(), undefined);
  assert.equal(race.best(), 240_000);
});

test('splits are recorded per checkpoint and the local best persists', () => {
  let clock = 0;
  const storage = memoryStorage();
  const race = createGrandPrix(storage, () => clock);
  race.update(...at(0), sled);
  clock = 30_000;
  race.update(...at(1), sled);
  assert.deepEqual(race.splits(), [0, 30_000]);
  clock = 55_000;
  race.update(...at(2), sled);
  clock = 80_000;
  race.update(...at(3), sled);
  clock = 120_000;
  race.update(...at(4), skate);
  clock = 150_000;
  race.update(...at(5), skate);
  clock = 180_000;
  race.update(...at(6), skate);
  clock = 200_000;
  race.update(...at(7), foot);
  assert.equal(JSON.parse(storage.map.get(grandPrixProgressKey)!).bestMs, 200_000);
  const reloaded = createGrandPrix(storage, () => clock);
  assert.equal(reloaded.best(), 200_000);
  // A slower run does not overwrite the best.
  clock = 0;
  reloaded.update(...at(0), sled);
  for (let i = 1; i <= 3; i++) reloaded.update(...at(i), sled);
  for (let i = 4; i <= 6; i++) reloaded.update(...at(i), skate);
  clock = 300_000;
  reloaded.update(...at(7), foot);
  assert.equal(reloaded.best(), 200_000);
});

test('the town board keeps each player\'s best, sorted, capped at eight, and validates input', () => {
  const race = createGrandPrix(memoryStorage(), () => 0);
  for (let i = 0; i < 10; i++) {
    assert.equal(race.recordResult({ id: `p${i}`, name: `玩家${i}`, totalMs: 100_000 + i * 1000, at: i }), true);
  }
  assert.equal(race.board().length, 8);
  assert.equal(race.board()[0].id, 'p0');
  race.recordResult({ id: 'p9', name: '玩家9', totalMs: 90_000, at: 99 });
  assert.equal(race.board()[0].id, 'p9');
  assert.equal(race.recordResult({ id: 'bad', name: 'x', totalMs: 10, at: 0 }), false);
  assert.equal(race.recordResult({ id: '', name: 'x', totalMs: 100_000, at: 0 }), false);
  assert.equal(race.recordResult(null), false);
});
