import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIceTreasureRound } from '../../src/presence/ice-treasure-round.ts';

type Team = 'north' | 'south';
type Skater = { east: number; north: number; team: Team };

function fixture(mode: 'round' | 'free' = 'round') {
  let now = 0;
  const accepted = new Map<number, Skater>([
    [1, { east: 0, north: 0, team: 'north' }],
    [2, { east: 0, north: 0, team: 'south' }],
  ]);
  const round = createIceTreasureRound({
    pedestal: { east: 0, north: 0 }, pickupRadius: 1,
    scoreRings: new Map<Team, { east: number; north: number }>([
      ['north', { east: 0, north: 22 }], ['south', { east: 0, north: -22 }],
    ]),
    now: () => now,
    acceptedSkater: id => accepted.get(id),
  }, mode);
  return {
    round,
    setTime(value: number) { now = value; },
    move(id: number, east: number, north: number) {
      const current = accepted.get(id)!;
      accepted.set(id, { ...current, east, north });
      return round.acceptedMove(id);
    },
  };
}

test('only accepted rink participants can pick up the bell and land confirmed hits', () => {
  const { round, move, setTime } = fixture();
  assert.equal(round.requestPickup(3), false, 'outside or unregistered skater');
  move(1, 1.01, 0);
  assert.equal(round.requestPickup(1), false, 'out of pedestal reach');
  move(1, 1, 0);
  assert.equal(round.requestPickup(1), true);
  assert.equal(round.requestPickup(2), false, 'cannot steal from the holder by touch');
  assert.equal(round.confirmedSnowballHit(3, 1), undefined, 'outside participants cannot affect the round');
  assert.equal(round.confirmedSnowballHit(1, 1), undefined, 'no self-hit');
  assert.equal(round.confirmedSnowballHit(2, 1), 'hit');
  move(1, 1.125, 0.75);
  setTime(500);
  assert.equal(round.confirmedSnowballHit(2, 1), 'drop');
  assert.deepEqual(round.snapshot().treasure, {
    phase: 'dropped', point: { east: 1.125, north: .75 }, pickableAt: 3500,
  });
  assert.equal(round.confirmedSnowballHit(2, 1), undefined);
  move(2, 1.125, .75);
  setTime(3499);
  assert.equal(round.requestPickup(2), false);
  setTime(3500);
  assert.equal(round.requestPickup(2), true);
});

test('the carrier must cross their own three-metre circle and the third entry wins', () => {
  const { round, move } = fixture();
  for (const expected of [1, 2, 3]) {
    move(1, 0, 0);
    assert.equal(round.requestPickup(1), true);
    assert.equal(move(2, 0, -22), undefined, 'noncarrier');
    assert.equal(move(1, 0, -22), undefined, 'opponent circle');
    assert.equal(move(1, 0, 18.99), undefined, 'outside the radius');
    assert.deepEqual(move(1, 0, 19), { score: expected, winner: expected === 3 ? 'north' : undefined });
    assert.equal(move(1, 0, 22), undefined, 'no duplicate for the same hold');
    assert.equal(round.resetTreasureAfterScore(), expected !== 3);
  }
  assert.equal(round.snapshot().scores.get('north'), 3);
  assert.equal(round.snapshot().winner, 'north');
  move(2, 0, 0);
  assert.equal(round.requestPickup(2), false, 'cannot play after a round has ended');
});

test('picking up a dropped bell inside a circle does not manufacture an entry', () => {
  const { round, move, setTime } = fixture('free');
  assert.equal(round.requestPickup(1), true);
  move(1, 0, -22);
  move(2, 0, -22);
  assert.equal(round.confirmedSnowballHit(2, 1), 'hit');
  assert.equal(round.confirmedSnowballHit(2, 1), 'drop');
  setTime(3000);
  assert.equal(round.requestPickup(2), true);
  assert.equal(move(2, 0, -21), undefined);
  assert.equal(move(2, 0, -18), undefined);
  assert.deepEqual(move(2, 0, -19), { score: 1, winner: undefined });
  assert.equal(round.resetTreasureAfterScore(), true);
});
