import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { townRiddleBank } from '../tools/voxel-tavern/town-blockout/riddle-bank.ts';
import {
  createRiddleGame, localRiddleDate, riddleStorageKey, selectRiddles, type RiddleSave,
} from '../tools/voxel-tavern/town-blockout/town-riddle-state.ts';

const answers = new Map(townRiddleBank.map(([id, , answer]) => [id, answer]));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    snapshot() { return JSON.parse(values.get(riddleStorageKey) ?? 'null') as RiddleSave; },
  };
}

test('all 60 lantern riddles match the authoritative question, answer and topic byte for byte', () => {
  const source = readFileSync(new URL('../docs/交流区/Claude/2026-11-18-灯谜题库-v1.md', import.meta.url), 'utf8');
  const rows = [...source.replaceAll('\r\n', '\n').matchAll(/^\|\s*(L\d{2})\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/gm)]
    .map(record => record.slice(1));
  assert.equal(rows.length, 60);
  assert.deepEqual(townRiddleBank, rows);
});

test('daily rotation is keyed to the local date, has exact tier counts and avoids the preceding three ordinary days', () => {
  const start = new Date(2026, 10, 18, 12);
  const expected = selectRiddles(start);
  assert.deepEqual(selectRiddles(new Date(2026, 10, 18, 23, 59, 59)), expected);
  assert.equal(localRiddleDate(start), '2026-11-18');
  const history: ReturnType<typeof selectRiddles>[] = [];
  for (let offset = 0; offset < 36; offset++) {
    const date = new Date(2026, 10, 18 + offset, 12);
    const group = selectRiddles(date);
    const tiers = group.map(id => parseInt(id.slice(1), 10));
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    assert.equal(new Set(group).size, 6);
    assert.equal(tiers.filter(id => id <= 30).length, weekend ? 3 : 4);
    assert.equal(tiers.filter(id => id > 30 && id <= 50).length, 2);
    assert.equal(tiers.filter(id => id > 50).length, weekend ? 1 : 0);
    assert.ok(history.slice(-3).every(recent => group.every(id => !recent.includes(id))));
    history.push(group);
  }
  assert.deepEqual(selectRiddles(new Date(2026, 11, 31)), townRiddleBank.slice(50).map(([id]) => id));
  const newYear = selectRiddles(new Date(2027, 0, 1));
  assert.equal(newYear.length, 6);
  assert.equal(newYear.filter(id => Number(id.slice(1)) > 50).length, 1);
});

test('answers lock on the third failure, retain progress on reload and reset daily without clearing totals', () => {
  let now = new Date(2026, 10, 18, 18);
  const storage = memoryStorage();
  let game = createRiddleGame(storage, () => now);
  const first = game.view(0)!;
  assert.equal(first.options?.length, 3);
  assert.equal(new Set(first.options).size, 3);
  assert.ok(first.options?.includes(answers.get(first.id)!));
  assert.equal(game.view(4)?.options, undefined);
  assert.deepEqual(game.answer(0, '胡说', first), { kind: 'wrong', attempts: 1 });
  assert.equal(game.view(0)?.hint, undefined);
  assert.deepEqual(game.answer(0, '胡说', first), { kind: 'wrong', attempts: 2 });
  assert.ok(game.view(0)?.hint);
  assert.deepEqual(game.answer(0, '', first), { kind: 'empty' });
  assert.deepEqual(game.answer(0, '胡说', first), { kind: 'wrong', attempts: 3 });
  assert.deepEqual(game.answer(0, answers.get(first.id)!, first), { kind: 'locked' });
  assert.equal(game.view(0)?.solvedAnswer, undefined);

  const second = game.view(1)!;
  assert.deepEqual(game.answer(1, answers.get(second.id)!, second), {
    kind: 'solved', fullLight: false,
    event: { type: 'riddle.solve', actor: 'player:local', target: 'lantern-workshop.wall',
      payload: { riddleId: second.id }, t: now.getTime() },
  });
  game = createRiddleGame(storage, () => now);
  assert.equal(game.view(0)?.attempts, 3);
  assert.equal(game.view(1)?.solvedAnswer, answers.get(second.id));
  assert.deepEqual(game.answer(1, answers.get(second.id)!, second), { kind: 'already-solved' });
  now = new Date(2026, 10, 19, 0, 0, 1);
  assert.deepEqual(game.answer(1, answers.get(second.id)!, second), { kind: 'stale' });
  assert.equal(game.view(0)?.attempts, 0);
  assert.equal(game.getProgress().totalSolved, 1);
  assert.equal(storage.snapshot().date, '2026-11-19');
  assert.deepEqual(storage.snapshot().attempts, {});
});

test('daily complete event and passport counters advance exactly once, even after reload', () => {
  let now = new Date(2026, 11, 31, 21);
  const storage = memoryStorage();
  let game = createRiddleGame(storage, () => now);
  const fullLight: boolean[] = [];
  for (let slot = 0; slot < 10; slot++) {
    const item = game.view(slot)!;
    assert.equal(item.options, undefined);
    const result = game.answer(slot, answers.get(item.id)!, item);
    if (result.kind === 'solved') fullLight.push(result.fullLight);
  }
  assert.deepEqual(fullLight, [...new Array(9).fill(false), true]);
  assert.deepEqual(game.getProgress(), { totalSolved: 10, fullLightDays: ['2026-12-31'], fullLightToday: true });
  game = createRiddleGame(storage, () => now);
  const last = game.view(9)!;
  assert.deepEqual(game.answer(9, answers.get(last.id)!, last), { kind: 'already-solved' });
  now = new Date(2027, 0, 1, 0, 0, 1);
  assert.deepEqual(game.getProgress(), { totalSolved: 10, fullLightDays: ['2026-12-31'], fullLightToday: false });
});
