import assert from 'node:assert/strict';
import test from 'node:test';
import { iceTreasurePickupDelayMs } from '../src/shared/ice-treasure.js';
import {
  createZodiacStarStones, zodiacStarStoneIds, zodiacStarStoneReturnMs,
  type ZodiacStarStoneId,
} from '../src/shared/zodiac-star-stones.js';

const origin = { layer: 'fixture-surface', east: 10, north: 20, height: 3 };
const below = { layer: 'fixture-underground', east: 10, north: 20, height: -90 };
const state = (stones: ReturnType<typeof createZodiacStarStones>, id: ZodiacStarStoneId, now = 0) =>
  stones.snapshot(now).find(stone => stone.id === id)!;

test('one authority owns twelve unique identities and grants the placed stone to just one player', () => {
  const stones = createZodiacStarStones({ origins: { mouse: origin } });
  assert.deepEqual(stones.snapshot(0).map(stone => stone.id), [...zodiacStarStoneIds]);
  assert.equal(new Set(zodiacStarStoneIds).size, 12);
  assert.equal(state(stones, 'goat').phase, 'sealed');
  assert.equal(state(stones, 'ox').phase, 'unplaced');
  assert.equal(stones.pickup('goat', 0, 1, 0), false);
  assert.equal(stones.pickup('ox', 0, 1, 0), false);
  assert.equal(stones.pickup('mouse', 0, 1, 0), true);
  assert.equal(stones.pickup('mouse', 0, 2, 0), false);
  assert.equal(stones.pickup('mouse', 1, 2, 0), false);
  assert.deepEqual(state(stones, 'mouse'), { id: 'mouse', revision: 1, phase: 'carried', player: 1 });
});

test('a death or disconnect drops each held stone at the accepted point and locks it for three seconds', () => {
  const stones = createZodiacStarStones({ origins: { mouse: origin, dog: origin, ox: origin } });
  assert.equal(stones.pickup('mouse', 0, 1, 0), true);
  assert.equal(stones.pickup('dog', 0, 1, 0), true);
  assert.equal(stones.pickup('ox', 0, 2, 0), true);
  assert.deepEqual(stones.dropHeld(1, below, 100), ['mouse', 'dog']);
  assert.deepEqual(stones.dropHeld(1, below, 500), []);
  assert.equal(state(stones, 'ox', 500).phase, 'carried');
  assert.deepEqual(state(stones, 'mouse', 500), {
    id: 'mouse', revision: 2, phase: 'dropped', point: below,
    pickableAt: 3_100, returnsAt: 600_100,
  });
  assert.equal(iceTreasurePickupDelayMs, 3_000);
  assert.equal(stones.pickup('mouse', 2, 1, 3_099), false);
  assert.equal(stones.pickup('mouse', 2, 2, 3_099), false);
  assert.equal(stones.pickup('mouse', 2, 2, 3_100), true);
  assert.equal(stones.pickup('dog', 2, 1, 3_100), true);
});

test('expiry restores the original location and rejects a pickup checked at the old drop', () => {
  const configuredOrigin = { ...origin };
  const droppedAt = { ...below };
  const stones = createZodiacStarStones({ origins: { mouse: configuredOrigin } });
  configuredOrigin.east = 999;
  assert.equal(stones.pickup('mouse', 0, 1, 0), true);
  assert.deepEqual(stones.dropHeld(1, droppedAt, 500), ['mouse']);
  droppedAt.height = -500;
  const atDeadline = 500 + zodiacStarStoneReturnMs;
  const drop = state(stones, 'mouse', atDeadline - 1);
  assert.equal(drop.phase, 'dropped');
  if (drop.phase === 'dropped') assert.deepEqual(drop.point, below);
  assert.equal(stones.pickup('mouse', 2, 1, atDeadline), false);
  assert.deepEqual(state(stones, 'mouse', atDeadline), { id: 'mouse', revision: 3, phase: 'origin', point: origin });
  assert.equal(stones.pickup('mouse', 3, 1, atDeadline), true);
});

test('a confirmed current carrier inlays permanently and may restore the in-ring set on restart', () => {
  const stones = createZodiacStarStones({ origins: { mouse: origin } });
  assert.equal(stones.pickup('mouse', 0, 1, 0), true);
  assert.equal(stones.inlay('mouse', 1, 2), false);
  stones.dropHeld(1, below, 100);
  assert.equal(stones.pickup('mouse', 2, 1, 3_100), true);
  assert.equal(stones.inlay('mouse', 1, 1), false, 'stale ring receipt from before the drop');
  assert.equal(stones.inlay('mouse', 3, 1), true);
  assert.equal(stones.inlay('mouse', 3, 1), false);
  assert.deepEqual(stones.dropHeld(1, below, 4_000), []);
  assert.deepEqual(stones.ringProgress(), { installed: ['mouse'], total: 12 });
  const restarted = createZodiacStarStones({ origins: { mouse: origin }, installed: stones.ringProgress().installed });
  assert.equal(state(restarted, 'mouse', 1_000_000).phase, 'in-ring');
  assert.equal(restarted.pickup('mouse', 0, 2, 1_000_000), false);
});

test('the concealed goat requires all eleven stones, Xiaowei ring passage and the witnessed bell handoff', () => {
  const others = zodiacStarStoneIds.filter(id => id !== 'goat');
  const incomplete = createZodiacStarStones({ origins: {}, installed: others.slice(0, 10) });
  assert.equal(incomplete.recordXiaoweiResonance(true), false);
  assert.equal(incomplete.inlayGoatAtFinale(true, true), false);
  assert.equal(state(incomplete, 'goat').phase, 'sealed');
  const ready = createZodiacStarStones({ origins: {}, installed: others });
  assert.equal(ready.ringProgress().installed.length, 11);
  assert.equal(ready.pickup('goat', 0, 1, 0), false);
  assert.equal(ready.inlayGoatAtFinale(true, true), false);
  assert.equal(ready.recordXiaoweiResonance(false), false);
  assert.equal(ready.recordXiaoweiResonance(true), true);
  assert.equal(ready.recordXiaoweiResonance(true), false);
  assert.equal(ready.inlayGoatAtFinale(), false);
  assert.equal(ready.inlayGoatAtFinale(true, false), false);
  assert.equal(ready.inlayGoatAtFinale(false, true), false);
  assert.equal(ready.inlayGoatAtFinale(true, true), true);
  assert.equal(ready.inlayGoatAtFinale(true, true), false);
  assert.deepEqual(ready.ringProgress().installed, [...zodiacStarStoneIds]);
  const restored = createZodiacStarStones({ origins: {}, installed: ready.ringProgress().installed });
  assert.equal(state(restored, 'goat').phase, 'in-ring');
  assert.throws(() => createZodiacStarStones({ origins: {}, installed: ['goat'] }));
});
