import assert from 'node:assert/strict';
import { test } from 'node:test';
import { npcAddedDialogue } from '../tools/voxel-tavern/town-blockout/town-npc-added-dialogue.ts';
import {
  createRegionalCarry, isPineStoryTime, pineStoryLines, regionalCarryKey,
} from '../tools/voxel-tavern/town-blockout/town-pine-camp-fire-activity.ts';

test('ice catch and roasting reserve three carry slots and survive reopening the town', () => {
  let at = 1_000;
  let persisted = '';
  const storage = {
    getItem: () => persisted,
    setItem: (key: string, value: string) => { assert.equal(key, regionalCarryKey); persisted = value; },
  };
  const carry = createRegionalCarry({ storage, now: () => at });
  assert.equal(carry.startRoasting(true), 'empty');
  for (let index = 0; index < 3; index++) assert.equal(carry.collectFish(), true);
  assert.equal(carry.collectFish(), false);
  assert.equal(carry.startRoasting(false), 'unlit');
  assert.equal(carry.startRoasting(true), 'started');
  assert.equal(carry.startRoasting(true), 'busy');
  at = 30_999;
  const resumed = createRegionalCarry({ storage, now: () => at });
  assert.deepEqual(resumed.snapshot(), { used: 3, fresh: 3, roast: 0, roastReadyAt: 31_000 });
  assert.equal(resumed.eatRoast(), false);
  assert.equal(resumed.collectFish(), false);
  at = 31_000;
  assert.deepEqual(resumed.snapshot(), { used: 3, fresh: 2, roast: 1, roastReadyAt: undefined });
  assert.equal(resumed.eatRoast(), true);
  assert.equal(resumed.eatRoast(), false);
  assert.deepEqual(resumed.snapshot(), { used: 2, fresh: 2, roast: 0, roastReadyAt: undefined });
  assert.equal(createRegionalCarry({ storage, now: () => at }).snapshot().roast, 0);
});

test('a corrupt bag retains at most three valid items and keeps roasting without storage', () => {
  const storage = {
    getItem: () => JSON.stringify({ items: ['invalid', 'fresh-fish', 'bamboo', 'lantern', 'ridge-snow'], roastReadyAt: -1 }),
    setItem: () => { throw new Error('quota'); },
  };
  let at = 1_000;
  const carry = createRegionalCarry({ storage, now: () => at });
  assert.deepEqual(carry.snapshot(), { used: 3, fresh: 1, roast: 0, roastReadyAt: undefined });
  assert.equal(carry.startRoasting(true), 'started');
  at += 30_000;
  assert.deepEqual(carry.snapshot(), { used: 3, fresh: 0, roast: 1, roastReadyAt: undefined });
});

test('campfire story uses the Shanghai NPC night segment and existing approved lines', () => {
  const time = (local: string) => Date.parse(`2026-11-19T${local}:00+08:00`);
  assert.equal(isPineStoryTime(time('05:59'), false), true);
  assert.equal(isPineStoryTime(time('06:00'), false), false);
  assert.equal(isPineStoryTime(time('19:59'), false), false);
  assert.equal(isPineStoryTime(time('20:00'), false), true);
  assert.equal(isPineStoryTime(time('20:00'), true), false);
  assert.equal(isPineStoryTime(Date.parse('2026-12-31T22:00:00+08:00'), false), true);
  assert.deepEqual(pineStoryLines, [npcAddedDialogue.樊樵.familiar.再访[1], npcAddedDialogue.樊樵.guides[3]]);
});
