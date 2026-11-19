import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIceTreasure, createIceTreasureDelivery, treasureTurnRadius,
} from '../src/shared/ice-treasure.ts';

test('two confirmed hits drop the treasure at the exact second-hit point', context => {
  const game = createIceTreasure('round');
  const fixturePoint = { east: 12.25, north: 45.625 };
  assert.equal(game.pickup(1, 0), true);
  assert.equal(game.snowballHit(2, fixturePoint, 100), undefined);
  assert.equal(game.snowballHit(1, { east: 0, north: 0 }, 110), 'hit');
  assert.deepEqual(game.snapshot().treasure, { phase: 'carried', player: 1, snowballHits: 1 });
  assert.equal(game.snowballHit(1, fixturePoint, 430), 'drop');
  const { treasure: drop } = game.snapshot();
  assert.deepEqual(drop, { phase: 'dropped', point: fixturePoint, pickableAt: 3430 });
  assert.ok(drop.phase === 'dropped');
  assert.notEqual(drop.point, fixturePoint);
  assert.equal(game.snowballHit(1, fixturePoint, 431), undefined);
  assert.equal(game.pickup(1, 3429), false);
  assert.equal(game.pickup(2, 3429), false);
  assert.equal(game.pickup(2, 3430), true);
  assert.deepEqual(game.snapshot().treasure, { phase: 'carried', player: 2, snowballHits: 0 });
  assert.equal(game.snowballHit(2, fixturePoint, 4000), 'hit');
  assert.equal(game.snowballHit(2, fixturePoint, 4100), 'drop');
  assert.equal(game.pickup(2, 7100), true, 'former carrier is eligible again');
  context.diagnostic(`fixture drop=(${drop.point.east},${drop.point.north}); 2999 ms blocked; 3000 ms accepted`);
});

test('round scores only the carrier in their own circle and ends at the third point', context => {
  const game = createIceTreasure<'a' | 'b'>('round');
  assert.equal(game.pickup(1, 0), true);
  assert.equal(game.enterScoreRing(1, undefined, 'a'), undefined);
  assert.equal(game.enterScoreRing(1, 'a', 'b'), undefined);
  assert.equal(game.enterScoreRing(2, 'a', 'a'), undefined);
  const first = game.enterScoreRing(1, 'a', 'a');
  assert.deepEqual(first, { score: 1, winner: undefined });
  assert.equal(game.enterScoreRing(1, 'a', 'a'), undefined, 'standing in the circle cannot score twice');
  assert.equal(game.pickup(1, 20), false);
  assert.equal(game.resetTreasure(), true);

  assert.equal(game.pickup(2, 100), true);
  assert.deepEqual(game.enterScoreRing(2, 'b', 'b'), { score: 1, winner: undefined });
  assert.equal(game.resetTreasure(), true);

  assert.equal(game.pickup(1, 200), true);
  const second = game.enterScoreRing(1, 'a', 'a');
  assert.deepEqual(second, { score: 2, winner: undefined });
  assert.equal(game.resetTreasure(), true);

  assert.equal(game.pickup(1, 300), true);
  const third = game.enterScoreRing(1, 'a', 'a');
  assert.deepEqual(third, { score: 3, winner: 'a' });
  assert.deepEqual([...game.snapshot().scores], [['a', 3], ['b', 1]]);
  assert.equal(game.resetTreasure(), false);
  assert.equal(game.pickup(2, 400), false);
  context.diagnostic(`fixture round threshold ${first?.score}/${second?.score}/${third?.score}, final scores 3/1`);
});

test('free play keeps accumulating points past the round threshold', context => {
  const game = createIceTreasure<'a'>('free');
  const scores = [1, 2, 3, 4].map(point => {
    assert.equal(game.pickup(1, 100 * point), true);
    const result = game.enterScoreRing(1, 'a', 'a');
    assert.deepEqual(result, { score: point, winner: undefined });
    assert.equal(game.resetTreasure(), true);
    return result?.score;
  });
  assert.equal(game.snapshot().scores.get('a'), 4);
  context.diagnostic(`fixture free-play board ${scores.join('/')}`);
});

test('the carrying radius is exactly 1.5 times the same unladen radius', context => {
  const unladen = treasureTurnRadius(6, false);
  const carrying = treasureTurnRadius(6, true);
  assert.equal(unladen, 6);
  assert.equal(carrying, 9);
  context.diagnostic(`fixture turn radius ${unladen}→${carrying}, ratio ${carrying / unladen}`);
});

test('solo transport times one finish after five carried gates in order', context => {
  let now = 1500;
  const delivery = createIceTreasureDelivery(() => now);
  assert.equal(delivery.start(false), false);
  assert.equal(delivery.returnToRing(true), undefined);
  assert.equal(delivery.start(true), true);
  assert.equal(delivery.start(true), false);
  assert.equal(delivery.passGate(2, true), false);
  assert.equal(delivery.passGate(1, false), false);
  assert.equal(delivery.passGate(1, true), true);
  assert.equal(delivery.passGate(1, true), false);
  assert.equal(delivery.passGate(3, true), false);
  assert.equal(delivery.returnToRing(true), undefined);
  for (const gate of [2, 3, 4, 5]) assert.equal(delivery.passGate(gate, true), true);
  assert.equal(delivery.passGate(6, true), false);
  assert.equal(delivery.passedGates(), 5);
  assert.equal(delivery.returnToRing(false), undefined);
  now = 17611;
  const elapsed = delivery.returnToRing(true);
  assert.equal(elapsed, 16111);
  assert.equal(delivery.returnToRing(true), undefined);
  context.diagnostic(`fixture correct gates 1/2/3/4/5, elapsed ${elapsed} ms`);
});

test('cancel discards the partial delivery and lets the next attempt start at the first gate', () => {
  let now = 80;
  const delivery = createIceTreasureDelivery(() => now);
  assert.equal(delivery.start(true), true);
  assert.equal(delivery.passGate(1, true), true);
  delivery.cancel();
  assert.equal(delivery.passedGates(), 0);
  assert.equal(delivery.returnToRing(true), undefined);
  now = 1000;
  assert.equal(delivery.start(true), true);
  assert.equal(delivery.passGate(2, true), false);
  for (const gate of [1, 2, 3, 4, 5]) assert.equal(delivery.passGate(gate, true), true);
  now += 4200;
  assert.equal(delivery.returnToRing(true), 4200);
});
