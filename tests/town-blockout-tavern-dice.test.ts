import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTavernDice } from '../tools/voxel-tavern/town-blockout/tavern-dice.ts';

test('tavern dice compare the sum of three dice on each side', () => {
  assert.equal(compareTavernDice([6, 4, 4], [6, 6, 1], 0), 'win');
  assert.equal(compareTavernDice([4, 4, 4], [4, 4, 5], 2), 'lose');
});

test('two ties trigger a repeat and the third settles the round as a draw', () => {
  const outcomes = [0, 1, 2].map(ties => compareTavernDice([6, 1, 3], [2, 4, 4], ties));
  assert.deepEqual(outcomes, ['retry', 'retry', 'draw']);
});
