import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND3_CARD_DIFFICULTIES,
  FRIEND3_CARD_SYMBOLS,
  createFriend3CardGame,
  createFriend3CardRandom,
  formatFriend3CardTime,
  friend3CardDifficulty,
  type Friend3CardSnapshot,
} from '../tools/voxel-tavern/town-blockout/town-friend3-card-game.js';

function pairIndexes(snapshot: Friend3CardSnapshot, symbolId: string): [number, number] {
  const indexes = snapshot.cards.filter(card => card.symbolId === symbolId).map(card => card.index);
  assert.equal(indexes.length, 2);
  return [indexes[0], indexes[1]];
}

test('FR-05 difficulty catalog is bounded by the original ten symbols', () => {
  assert.equal(FRIEND3_CARD_DIFFICULTIES.length, 3);
  const ids = new Set<string>();
  for (const difficulty of FRIEND3_CARD_DIFFICULTIES) {
    assert.ok(!ids.has(difficulty.id));
    ids.add(difficulty.id);
    assert.equal(difficulty.columns, 4);
    assert.equal(difficulty.columns * difficulty.rows, difficulty.pairs * 2);
    assert.ok(difficulty.pairs <= FRIEND3_CARD_SYMBOLS.length);
    assert.ok(difficulty.mismatchDelayMs >= 500);
  }
  assert.equal(new Set(FRIEND3_CARD_SYMBOLS.map(symbol => symbol.id)).size, FRIEND3_CARD_SYMBOLS.length);
  assert.equal(new Set(FRIEND3_CARD_SYMBOLS.map(symbol => symbol.label)).size, FRIEND3_CARD_SYMBOLS.length);
});

test('FR-05 deterministic shuffle is stable for a seed and changes for another', () => {
  const first = createFriend3CardGame({ seed: 2027 });
  const second = createFriend3CardGame({ seed: 2027 });
  const third = createFriend3CardGame({ seed: 2028 });
  assert.equal(first.start('winter', 2027), true);
  assert.equal(second.start('winter', 2027), true);
  assert.equal(third.start('winter', 2028), true);
  assert.deepEqual(
    first.snapshot().cards.map(card => card.symbolId),
    second.snapshot().cards.map(card => card.symbolId),
  );
  assert.notDeepEqual(
    first.snapshot().cards.map(card => card.symbolId),
    third.snapshot().cards.map(card => card.symbolId),
  );
});

test('FR-05 every difficulty builds exactly two copies of each symbol', () => {
  for (const difficulty of FRIEND3_CARD_DIFFICULTIES) {
    const game = createFriend3CardGame({ seed: 17 });
    assert.equal(game.start(difficulty.id, 17), true);
    const snapshot = game.snapshot();
    assert.equal(snapshot.status, 'playing');
    assert.equal(snapshot.cards.length, difficulty.pairs * 2);
    assert.equal(snapshot.pairsFound, 0);
    assert.equal(snapshot.attempts, 0);
    assert.equal(snapshot.flips, 0);
    assert.equal(snapshot.elapsedMs, 0);
    assert.equal(snapshot.pendingMismatch, false);
    assert.deepEqual(snapshot.flipped, []);
    for (const card of snapshot.cards) {
      assert.equal(card.faceUp, false);
      assert.equal(card.matched, false);
    }
    const counts = new Map<string, number>();
    for (const card of snapshot.cards) counts.set(card.symbolId, (counts.get(card.symbolId) ?? 0) + 1);
    assert.equal(counts.size, difficulty.pairs);
    for (const count of counts.values()) assert.equal(count, 2);
  }
});

test('FR-05 first flip, duplicate flip and ignored indexes', () => {
  const game = createFriend3CardGame({ seed: 3 });
  assert.equal(game.start('cozy', 3), true);
  const [first] = game.snapshot().cards;
  const result = game.flip(first.index);
  assert.equal(result.kind, 'first');
  if (result.kind !== 'first') assert.fail('expected first flip');
  assert.equal(result.symbolId, first.symbolId);
  assert.equal(game.snapshot().cards[first.index].faceUp, true);
  assert.equal(game.snapshot().flips, 1);
  assert.equal(game.snapshot().attempts, 0);

  for (const index of [-1, 99, 1.5, Number.NaN]) {
    assert.deepEqual(game.flip(index), { kind: 'ignored', reason: 'index' });
  }
  assert.deepEqual(game.flip(first.index), { kind: 'ignored', reason: 'face-up' });
});

test('FR-05 mismatch holds two cards busy until resolved', () => {
  const game = createFriend3CardGame({ seed: 11 });
  assert.equal(game.start('cozy', 11), true);
  const snapshot = game.snapshot();
  const first = snapshot.cards[0];
  const second = snapshot.cards.find(card => card.symbolId !== first.symbolId);
  assert.ok(second);
  assert.equal(game.flip(first.index).kind, 'first');
  const mismatch = game.flip(second.index);
  assert.equal(mismatch.kind, 'mismatch');
  if (mismatch.kind !== 'mismatch') assert.fail('expected mismatch');
  assert.deepEqual(mismatch.indexes, [first.index, second.index]);
  assert.equal(game.snapshot().pendingMismatch, true);
  assert.equal(game.snapshot().attempts, 1);
  assert.deepEqual(game.flip(2), { kind: 'ignored', reason: 'busy' });
  assert.equal(game.resolveMismatch(), true);
  const after = game.snapshot();
  assert.equal(after.pendingMismatch, false);
  assert.equal(after.cards[first.index].faceUp, false);
  assert.equal(after.cards[second.index].faceUp, false);
  assert.equal(game.resolveMismatch(), false);
});

test('FR-05 matching a pair marks both cards and blocks repeat flips', () => {
  const game = createFriend3CardGame({ seed: 5 });
  assert.equal(game.start('winter', 5), true);
  const snapshot = game.snapshot();
  const [left, right] = pairIndexes(snapshot, snapshot.cards[0].symbolId);
  assert.equal(game.flip(left).kind, 'first');
  const match = game.flip(right);
  assert.equal(match.kind, 'match');
  if (match.kind !== 'match') assert.fail('expected match');
  assert.equal(match.pairsFound, 1);
  assert.equal(match.totalPairs, 8);
  assert.equal(match.won, false);
  const after = game.snapshot();
  assert.equal(after.cards[left].matched, true);
  assert.equal(after.cards[right].matched, true);
  assert.equal(after.pairsFound, 1);
  assert.equal(after.attempts, 1);
  assert.deepEqual(after.flipped, []);
  assert.deepEqual(game.flip(left), { kind: 'ignored', reason: 'matched' });
});

test('FR-05 completing all pairs wins and freezes the clock', () => {
  const game = createFriend3CardGame({ seed: 42 });
  assert.equal(game.start('cozy', 42), true);
  const symbols = [...new Set(game.snapshot().cards.map(card => card.symbolId))];
  let finalResult: ReturnType<typeof game.flip> | undefined;
  for (const symbol of symbols) {
    const [left, right] = pairIndexes(game.snapshot(), symbol);
    assert.equal(game.flip(left).kind, 'first');
    finalResult = game.flip(right);
    assert.equal(finalResult.kind, 'match');
  }
  assert.ok(finalResult && finalResult.kind === 'match');
  assert.equal(finalResult.won, true);
  assert.equal(game.snapshot().status, 'won');
  assert.equal(game.snapshot().pairsFound, 6);
  const frozen = game.snapshot().elapsedMs;
  assert.equal(game.tick(5000), frozen);
  assert.deepEqual(game.flip(0), { kind: 'ignored', reason: 'won' });
});

test('FR-05 restart resets the same difficulty and exit clears the table', () => {
  const game = createFriend3CardGame({ seed: 8 });
  assert.equal(game.start('blizzard', 8), true);
  game.tick(2500);
  const [left, right] = pairIndexes(game.snapshot(), game.snapshot().cards[0].symbolId);
  game.flip(left);
  game.flip(right);
  assert.equal(game.restart(9), true);
  const restarted = game.snapshot();
  assert.equal(restarted.difficulty.id, 'blizzard');
  assert.equal(restarted.status, 'playing');
  assert.equal(restarted.cards.length, 20);
  assert.equal(restarted.pairsFound, 0);
  assert.equal(restarted.attempts, 0);
  assert.equal(restarted.flips, 0);
  assert.equal(restarted.elapsedMs, 0);
  assert.equal(restarted.pendingMismatch, false);

  game.exit();
  const exited = game.snapshot();
  assert.equal(exited.status, 'idle');
  assert.equal(exited.cards.length, 0);
  assert.equal(exited.elapsedMs, 0);
  assert.deepEqual(game.flip(0), { kind: 'ignored', reason: 'idle' });
  assert.equal(game.tick(1000), 0);
});

test('FR-05 clock rejects negative and non-finite ticks', () => {
  const game = createFriend3CardGame({ seed: 1 });
  assert.equal(game.start('cozy', 1), true);
  assert.equal(game.tick(1500), 1500);
  assert.equal(game.tick(-500), 1500);
  assert.equal(game.tick(Number.NaN), 1500);
  assert.equal(game.tick(Number.POSITIVE_INFINITY), 1500);
  assert.equal(game.tick(250.9), 1750);
});

test('FR-05 time formatting and difficulty fallback', () => {
  assert.equal(formatFriend3CardTime(0), '00:00');
  assert.equal(formatFriend3CardTime(65_000), '01:05');
  assert.equal(formatFriend3CardTime(1_500), '00:01');
  assert.equal(formatFriend3CardTime(522), '00:00');
  assert.equal(formatFriend3CardTime(3_599_000), '59:59');
  assert.equal(formatFriend3CardTime(-1), '00:00');
  assert.equal(formatFriend3CardTime(Number.NaN), '00:00');
  assert.equal(friend3CardDifficulty('missing' as never).id, 'winter');
  const random = createFriend3CardRandom(0);
  assert.ok(random() >= 0 && random() < 1);
});