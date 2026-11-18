import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZodiacProgress, sealedGoldenGoatClue, zodiacStorageKey } from '../tools/voxel-tavern/town-blockout/town-zodiac';

test('the first zodiac pickup is personal, persistent and not repeatable', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const one = createZodiacProgress(['mouse'], storage);
  const another = createZodiacProgress(['mouse']);
  assert.equal(one.rows().length, 12);
  assert.equal(one.rows()[0].clue, '夜半信堆沙沙响，小影蹲在邮袋旁。');
  assert.equal(one.rows()[1].clue, '尚未现身');
  assert.equal(one.rows()[7].clue, sealedGoldenGoatClue);
  assert.equal(one.collect('ox'), false);
  assert.equal(one.collect('mouse', new Date(2026, 10, 18)), true);
  assert.equal(one.collect('mouse'), false);
  assert.equal(another.count(), 0);
  assert.equal(createZodiacProgress(['mouse'], storage).rows()[0].date, '2026-11-18');
  assert.equal(data.has(zodiacStorageKey), true);
});

test('even an old save with the other eleven charms stays sealed while the palace is unavailable', () => {
  const ids = ['mouse', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'monkey', 'rooster', 'dog', 'pig'];
  const storage = { getItem: () => JSON.stringify({ collected: Object.fromEntries(ids.map(id => [id, '2026-11-18'])) }),
    setItem: () => { throw new Error('storage is read only'); } };
  const later = createZodiacProgress(['mouse'], storage);
  assert.equal(later.count(), 11);
  assert.equal(later.rows()[7].sealed, true);
  assert.equal(later.collect('goat'), false);
});
