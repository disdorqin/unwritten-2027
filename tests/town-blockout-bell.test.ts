import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyBellTouch, bellHoldMs, bellSpatialParams, bellStandings, bellTitleDue, bellTitleText, bellWinner,
  createBellMatch, defaultBellConfig, dropBell, endBellMatch, readBellEvent, tryBellTouch,
  type BellConfig,
} from '../src/presence/bell-game.ts';

const config: BellConfig = {
  matchMs: 360_000, titleMs: [30_000, 60_000, 90_000],
  stealRadius: 1.3, pickupDelayMs: 1_000, stealGraceMs: 1_000, dropRollMetres: 2,
};
const plaza = { east: 224, north: 188 };

test('title lines are the locked wording', () => {
  assert.equal(bellTitleText('阿明', 0), '阿明 无人能挡');
  assert.equal(bellTitleText('阿明', 1), '阿明 已经无双');
  assert.equal(bellTitleText('阿明', 2), '阿明 已经无敌');
  assert.equal(bellTitleText('阿明', 3), '');
});

test('a new match starts with the bell loose at the plaza emblem and pickable at once', () => {
  const state = createBellMatch(10_000, config);
  assert.equal(state.phase, 'running');
  assert.equal(state.endsAt, 370_000);
  assert.deepEqual(state.loose, { east: 224, north: 188 });
  const touch = tryBellTouch(state, 7, { east: 224.6, north: 188.4 }, null, 10_000, config);
  assert.deepEqual(touch, { ok: true, action: 'pickup', previousHolderId: null });
  assert.deepEqual(tryBellTouch(state, 7, { east: 230, north: 188 }, null, 10_000, config),
    { ok: false, reason: 'range' });
});

test('touch steal needs range and respects the new-holder grace window', () => {
  const state = createBellMatch(0, config);
  applyBellTouch(state, 1, 0);
  const holder = { east: 224, north: 188 };
  // 宽限内不可夺
  assert.deepEqual(tryBellTouch(state, 2, { east: 224.5, north: 188 }, holder, 500, config),
    { ok: false, reason: 'grace' });
  // 持铃人不能夺自己的铃
  assert.deepEqual(tryBellTouch(state, 1, holder, holder, 5_000, config), { ok: false, reason: 'self' });
  // 太远不行
  assert.deepEqual(tryBellTouch(state, 2, { east: 228, north: 188 }, holder, 5_000, config),
    { ok: false, reason: 'range' });
  // 宽限后贴身可夺
  assert.deepEqual(tryBellTouch(state, 2, { east: 225.1, north: 188 }, holder, 5_000, config),
    { ok: true, action: 'steal', previousHolderId: 1 });
  applyBellTouch(state, 2, 5_000);
  assert.equal(state.holderId, 2);
  assert.equal(bellHoldMs(state, 1, 5_000), 5_000);
});

test('a snowball drop rolls the bell two metres and locks pickup for one second', () => {
  const state = createBellMatch(0, config);
  applyBellTouch(state, 1, 0);
  const loose = dropBell(state, plaza, 1, 0, 20_000, config);
  assert.deepEqual(loose, { east: 226, north: 188 });
  assert.equal(state.holderId, null);
  assert.equal(bellHoldMs(state, 1, 20_000), 20_000);
  // 1 秒拾取窗内：站在铃上也拿不到
  assert.deepEqual(tryBellTouch(state, 2, loose, null, 20_999, config), { ok: false, reason: 'early' });
  // 窗口过后可拾
  assert.deepEqual(tryBellTouch(state, 2, loose, null, 21_000, config),
    { ok: true, action: 'pickup', previousHolderId: null });
  // 零方向掉铃原地落下；贴边掉铃夹回场内
  const still = createBellMatch(0, config);
  applyBellTouch(still, 1, 0);
  assert.deepEqual(dropBell(still, plaza, 0, 0, 1_000, config), { east: 224, north: 188 });
  const edge = createBellMatch(0, config);
  applyBellTouch(edge, 1, 0);
  const clamped = dropBell(edge, { east: 250.4, north: 188 }, 1, 0, 1_000, config);
  assert.equal(clamped.east, 250);
});

test('title ladder fires at 30/60/90 seconds of one continuous hold, once per tier per player', () => {
  const state = createBellMatch(0, config);
  applyBellTouch(state, 3, 0);
  const announced = new Set<string>();
  assert.equal(bellTitleDue(state, 29_999, announced, config), null);
  const first = bellTitleDue(state, 30_000, announced, config);
  assert.deepEqual(first, { id: 3, tier: 0, key: '3:0' });
  announced.add(first!.key);
  assert.equal(bellTitleDue(state, 45_000, announced, config), null);
  const second = bellTitleDue(state, 60_000, announced, config);
  assert.equal(second?.tier, 1);
  announced.add(second!.key);
  const third = bellTitleDue(state, 90_000, announced, config);
  assert.equal(third?.tier, 2);
  announced.add(third!.key);
  assert.equal(bellTitleDue(state, 120_000, announced, config), null);
  // 易地后连续计时清零，新持铃人从第一档重新爬
  applyBellTouch(state, 4, 120_000);
  assert.equal(bellTitleDue(state, 149_999, announced, config), null);
  assert.equal(bellTitleDue(state, 150_000, announced, config)?.tier, 0);
});

test('totals accumulate across holds and the winner breaks ties by earliest first hold', () => {
  const state = createBellMatch(0, config);
  applyBellTouch(state, 1, 0);
  applyBellTouch(state, 2, 10_000);
  applyBellTouch(state, 1, 25_000);
  endBellMatch(state, 40_000);
  assert.equal(bellHoldMs(state, 1, 40_000), 25_000);
  assert.equal(bellHoldMs(state, 2, 40_000), 15_000);
  assert.deepEqual(bellWinner(state, 40_000), { id: 1, ms: 25_000 });
  assert.deepEqual(bellStandings(state, 40_000).map(entry => entry.id), [1, 2]);

  const tied = createBellMatch(0, config);
  applyBellTouch(tied, 9, 0);
  applyBellTouch(tied, 5, 10_000);
  endBellMatch(tied, 20_000);
  assert.deepEqual(bellWinner(tied, 20_000), { id: 9, ms: 10_000 });
});

test('bell state events round-trip through the wire validator and reject garbage', () => {
  const event = {
    type: 'event', kind: 'bell-state', phase: 'running', endsAt: 370_000, holderSince: 5_000,
    holder: { id: 2, name: '阿明', east: 224, north: 188, height: 12 },
    loose: null, pickableAt: 0, totals: [[2, 4_000]],
  };
  assert.deepEqual(readBellEvent(event), event);
  assert.equal(readBellEvent({ ...event, holder: { id: 0 } }), undefined);
  assert.equal(readBellEvent({ ...event, totals: [[2, -1]] }), undefined);
  assert.equal(readBellEvent({ type: 'event', kind: 'bell-title', id: 2, name: '阿明', tier: 2 })?.kind, 'bell-title');
  assert.equal(readBellEvent({ type: 'event', kind: 'bell-title', id: 2, name: '阿明', tier: 3 }), undefined);
  assert.equal(readBellEvent({ type: 'event', kind: 'bell-end', winner: null, standings: [] })?.kind, 'bell-end');
  assert.equal(readBellEvent(null), undefined);
  assert.equal(readBellEvent('bell-state'), undefined);
});

test('spatial bell params fade and muffle with distance and pan with azimuth', () => {
  const near = bellSpatialParams(2, 0);
  const mid = bellSpatialParams(55, Math.PI / 2);
  const far = bellSpatialParams(300, -Math.PI / 2);
  assert.ok(near.gain > mid.gain && mid.gain > far.gain);
  assert.ok(far.gain >= .04, '全场保底可闻');
  assert.ok(near.cutoff > mid.cutoff && mid.cutoff > far.cutoff);
  assert.equal(bellSpatialParams(10, 0).pan, 0);
  assert.equal(mid.pan, 1);
  assert.equal(far.pan, -1);
});

test('default config carries the spec numbers', () => {
  assert.equal(defaultBellConfig.matchMs, 360_000);
  assert.deepEqual(defaultBellConfig.titleMs, [30_000, 60_000, 90_000]);
  assert.equal(defaultBellConfig.pickupDelayMs, 1_000);
  assert.equal(defaultBellConfig.dropRollMetres, 2);
});
