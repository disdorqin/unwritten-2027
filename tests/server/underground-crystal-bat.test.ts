import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndergroundCrystalBat } from '../../src/presence/underground-crystal-bat.js';

const quiet = { belowNestDistance: 3, noise: 'quiet', enteredPool: false, minedAtPool: false } as const;

test('a normal roost reacts only to noise from within the six metre approach', () => {
  const bat = createUndergroundCrystalBat('common');
  assert.equal(bat.observe(quiet, 0), false);
  assert.equal(bat.observe({ ...quiet, belowNestDistance: null, noise: 'mine' }, 10), false);
  assert.equal(bat.observe({ ...quiet, belowNestDistance: 6.001, noise: 'throw' }, 20), false);
  assert.equal(bat.observe({ ...quiet, belowNestDistance: 6, noise: 'sprint' }, 30), true);
  assert.deepEqual(bat.read(), { phase: 'circling', hitsLeft: 1, deadline: 2030 });
});

test('circling telegraphs the dive and a finished dive rests for five seconds', () => {
  const bat = createUndergroundCrystalBat('common');
  bat.observe({ ...quiet, noise: 'mine' }, 0);
  assert.equal(bat.finishDive(1999), false);
  bat.tick(2000);
  assert.equal(bat.read().phase, 'diving');
  assert.equal(bat.finishDive(2400), true);
  bat.tick(7399);
  assert.equal(bat.read().phase, 'resting');
  bat.tick(7400);
  assert.equal(bat.read().phase, 'diving');
});

test('common bats shatter once on one snowball and a pickaxe does not count', () => {
  const bat = createUndergroundCrystalBat('common');
  assert.deepEqual(bat.impact('p1', 'pickaxe', 0), { kind: 'ignored' });
  assert.deepEqual(bat.impact('s1', 'snowball', 5), { kind: 'defeated', effect: 'crystal-dust' });
  assert.deepEqual(bat.impact('s2', 'snowball', 6), { kind: 'ignored' });
  assert.equal(bat.returnToRoost(7), false);
});

test('pool elite ignores generic noise, heals on a living return, and awards a single whole ore', () => {
  const elite = createUndergroundCrystalBat('pool-elite');
  assert.equal(elite.observe({ ...quiet, noise: 'mine' }, 0), false);
  assert.equal(elite.observe({ ...quiet, minedAtPool: true }, 50), true);
  assert.deepEqual(elite.impact('s1', 'snowball', 51), { kind: 'hit', hitsLeft: 2 });
  assert.equal(elite.returnToRoost(52), true);
  assert.equal(elite.read().hitsLeft, 3);
  assert.equal(elite.observe({ ...quiet, enteredPool: true }, 53), true);
  assert.deepEqual(elite.impact('stale', 'snowball', 52), { kind: 'ignored' });
  assert.deepEqual(elite.impact('s1', 'snowball', 53), { kind: 'ignored' });
  assert.deepEqual(elite.impact('s2', 'snowball', 54), { kind: 'hit', hitsLeft: 2 });
  assert.deepEqual(elite.impact('s2', 'snowball', 54), { kind: 'ignored' });
  assert.deepEqual(elite.impact('s3', 'snowball', 55), { kind: 'hit', hitsLeft: 1 });
  assert.deepEqual(elite.impact('s4', 'snowball', 56),
    { kind: 'defeated', effect: 'crystal-dust', loot: 'full-moonstone-ore' });
  assert.deepEqual(elite.impact('s5', 'snowball', 57), { kind: 'ignored' });
});
