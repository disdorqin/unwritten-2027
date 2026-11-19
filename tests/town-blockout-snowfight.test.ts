import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SnowWallField, SnowfightMatch, WALL_DECAY_MS, buildHalfAllows, classifyWallSite, wallCellOf,
} from '../src/presence/snowfight';
import {
  decodeSnowfightClientEvent, decodeSnowfightRelay, encodeWallClear, encodeWallHit, encodeWallPlace, encodeWallSet,
} from '../src/presence/snowfight-events';
import { DigField, MaterialBank } from '../tools/voxel-tavern/town-blockout/town-snowfight';

test('wall site classifier rejects every no-build category and keeps plaza/lake/forecourt open', () => {
  assert.equal(classifyWallSite(183.75, 203.75), 'road');
  assert.equal(classifyWallSite(112.25, 420.25), 'rail');
  assert.equal(classifyWallSite(480.5, 320.25), 'platform');
  assert.equal(classifyWallSite(238.25, 157.25), 'stage');
  assert.equal(classifyWallSite(226.25, 223.25), 'interior');
  assert.equal(classifyWallSite(226.25, 215.25), 'door');
  assert.equal(classifyWallSite(484.25, 70.25), 'secret');
  assert.equal(classifyWallSite(231.75, 363.25), 'river');
  assert.equal(classifyWallSite(-1, 100), 'bounds');
  assert.equal(classifyWallSite(224.25, 188.25), undefined, 'plaza emblem stays buildable');
  assert.equal(classifyWallSite(344.25, 66.25), undefined, 'lake ice is buildable');
  assert.equal(classifyWallSite(484.25, 46.25), undefined, 'castle forecourt is buildable');
  assert.equal(classifyWallSite(300.25, 250.25), undefined);
});

test('build halves split at east 320 by team', () => {
  assert.equal(buildHalfAllows(0, 319.9), true);
  assert.equal(buildHalfAllows(0, 320), false);
  assert.equal(buildHalfAllows(1, 320), true);
  assert.equal(buildHalfAllows(1, 100), false);
});

test('wall field: four states stack, damage cracks, third hit collapses the column above', () => {
  const field = new SnowWallField();
  const gx = wallCellOf(300.25), gy = wallCellOf(250.25);
  for (let layer = 0; layer < 4; layer++) {
    const placed = field.place(gx, gy, 7, 0, 1000 + layer);
    assert.ok('block' in placed);
    if ('block' in placed) assert.equal(placed.block.layer, layer);
  }
  assert.deepEqual(field.place(gx, gy, 7, 0, 2000), { reason: 'stack' });
  assert.equal(field.size, 4);
  const first = field.damage(gx, gy, 0, 3000);
  assert.ok(first && 'damaged' in first && first.damaged.hp === 2);
  const second = field.damage(gx, gy, 0, 3001);
  assert.ok(second && 'damaged' in second && second.damaged.hp === 1);
  const third = field.damage(gx, gy, 0, 3002);
  assert.ok(third && 'destroyed' in third);
  if (third && 'destroyed' in third) assert.equal(third.destroyed.length, 4, 'base destroyed collapses all above');
  assert.equal(field.size, 0);
  assert.equal(field.damage(gx, gy, 0, 3003), undefined);
});

test('wall field: town cap 400 and unmaintained decay with owner refresh', () => {
  const field = new SnowWallField();
  for (let i = 0; i < 400; i++) {
    const placed = field.place(100 + (i % 20), 100 + Math.floor(i / 20), 1, 0, 0);
    assert.ok('block' in placed);
  }
  assert.deepEqual(field.place(500, 500, 1, 0, 0), { reason: 'cap' });

  const decayField = new SnowWallField();
  decayField.place(600, 500, 9, 1, 0);
  decayField.place(700, 500, 8, 0, 0);
  decayField.refreshFor(9, 300.25, 250.25, WALL_DECAY_MS + 1);
  const removed = decayField.decay(WALL_DECAY_MS + 2);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].ownerId, 8, 'only the unmaintained wall decays');
  assert.equal(decayField.size, 1);
});

test('match: teams alternate, build flows to battle, capture needs 5 s and scores 1 per second', () => {
  const match = new SnowfightMatch({ buildMs: 1000, battleMs: 60_000, captureMs: 5000, rotateDelayMs: 100 });
  match.start([3, 1, 2], 0);
  assert.equal(match.teamOf(1), 0);
  assert.equal(match.teamOf(2), 1);
  assert.equal(match.teamOf(3), 0);
  const plaza = new Map([[1, { east: 224, north: 188 }]]);
  match.tick(500, plaza);
  assert.equal(match.phase, 'build');
  const events = match.tick(1000, plaza);
  assert.equal(match.phase, 'battle');
  assert.ok(events.some(event => event.type === 'phase'));
  match.tick(1100, plaza);
  assert.equal(match.activePoint, 0, 'first point lights after battle starts');
  match.tick(5400, plaza);
  assert.equal(match.captureMs, 4900);
  const captured = match.tick(5600, plaza);
  assert.ok(captured.some(event => event.type === 'captured' && event.team === 0));
  assert.equal(match.owners[0], 0);
  match.tick(6600, new Map());
  assert.equal(match.scores[0], 1, 'one second of ownership scores one point');
});

test('match: a hit on the capturing player inside the circle zeroes capture progress', () => {
  const match = new SnowfightMatch({ buildMs: 100, battleMs: 60_000, captureMs: 5000, rotateDelayMs: 100 });
  match.start([1, 2], 0);
  const plaza = new Map([[1, { east: 224, north: 188 }]]);
  match.tick(100, plaza);
  match.tick(200, plaza);
  match.tick(3000, plaza);
  assert.equal(match.captureMs, 3000);
  const events = match.onHit(1, 2, { east: 224, north: 188 });
  assert.equal(match.captureMs, 0, 'hit interrupts and zeroes');
  assert.ok(events.some(event => event.type === 'capture-reset'));
  match.tick(4000, plaza);
  assert.equal(match.captureMs, 1000, 'capture restarts from zero');
  const outside = match.onHit(1, 2, { east: 100, north: 100 });
  assert.ok(!outside.some(event => event.type === 'capture-reset'), 'hits outside the circle do not reset');
});

test('match: three-hit streak event and finish winner', () => {
  const match = new SnowfightMatch({ buildMs: 100, battleMs: 10_000, captureMs: 500, rotateDelayMs: 100 });
  match.start([1, 2], 0);
  match.onHit(2, 1);
  match.onHit(2, 1);
  const third = match.onHit(2, 1);
  assert.ok(third.some(event => event.type === 'streak' && event.streak === 3));
  const plaza = new Map([[1, { east: 224, north: 188 }]]);
  match.tick(100, plaza);
  match.tick(200, plaza);
  match.tick(600, plaza);
  assert.equal(match.owners[0], 0);
  match.tick(1600, new Map());
  assert.equal(match.scores[0], 1);
  const finished = match.tick(10_200, new Map());
  assert.equal(match.phase, 'done');
  const finish = finished.find(event => event.type === 'finished');
  assert.ok(finish && finish.type === 'finished' && finish.winner === 0);
});

test('snowfight codec round-trips and rejects garbage', () => {
  const place = decodeSnowfightClientEvent(encodeWallPlace(600, 500));
  assert.deepEqual(place, { kind: 'place', gx: 600, gy: 500 });
  const hit = decodeSnowfightClientEvent(encodeWallHit({ gx: 600, gy: 500, layer: 2, ballId: 42, throwerId: 7 }));
  assert.deepEqual(hit, { kind: 'wall-hit', gx: 600, gy: 500, layer: 2, ballId: 42, throwerId: 7 });
  const block = { gx: 600, gy: 500, layer: 1, hp: 2, ownerId: 7, team: 1 as const, placedAt: 0, touchedAt: 0 };
  assert.deepEqual(decodeSnowfightRelay(encodeWallSet(block)), [
    { kind: 'wall-set', gx: 600, gy: 500, layer: 1, hp: 2, ownerId: 7, team: 1 },
  ]);
  const cleared = encodeWallClear([block, { ...block, layer: 2 }]);
  assert.equal(cleared.length, 1);
  assert.deepEqual(decodeSnowfightRelay(cleared[0]), [
    { kind: 'wall-clear', blocks: [{ gx: 600, gy: 500, layer: 1 }, { gx: 600, gy: 500, layer: 2 }] },
  ]);
  assert.equal(decodeSnowfightClientEvent(new Uint8Array([0xff, 99, 0, 0])), undefined);
  assert.equal(decodeSnowfightRelay(new Uint8Array([0xff, 5, 1, 2])), null);
  assert.equal(decodeSnowfightRelay(encodeWallPlace(1, 1)), null, 'client frames are not relay frames');
});

test('material bank caps and dig field deepens pits with a cap', () => {
  const bank = new MaterialBank(5);
  assert.equal(bank.add(3), 3);
  assert.equal(bank.add(10), 2, 'cap clamps the gain');
  assert.equal(bank.take(2), true);
  assert.equal(bank.amount, 3);
  assert.equal(bank.take(4), false);
  const digs = new DigField(2);
  digs.dig(300, 250);
  const pit = digs.dig(300.2, 250.1);
  assert.equal(pit.depth, .08);
  digs.dig(310, 250);
  digs.dig(320, 250);
  assert.equal(digs.size, 2, 'oldest pit is evicted at the cap');
});
