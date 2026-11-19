import assert from 'node:assert/strict';
import test from 'node:test';
import { createIceThroneAuthority, type IceThroneChange } from '../../src/presence/ice-throne-authority.js';

function session() {
  const announcements: IceThroneChange[] = [];
  const throne = createIceThroneAuthority(change => announcements.push(change));
  return { throne, announcements };
}

test('two contenders cannot crown at once and a fresh claim starts after the throne clears', () => {
  const { throne, announcements } = session();
  throne.observe(0, 2, '甲', true);
  throne.observe(100, 1, '乙', true);
  throne.tick(2_999);
  assert.equal(throne.ownerId(), null);
  throne.tick(3_000);
  assert.equal(throne.ownerId(), 2);
  throne.tick(50_000);
  assert.deepEqual(announcements, [{ ownerId: 2, message: '甲 登临冰雪王座' }]);

  throne.confirmedHit(50_400, 2, 1, 1);
  throne.confirmedHit(50_800, 2, 1, 2);
  throne.confirmedHit(51_200, 2, 1, 3);
  throne.tick(54_199);
  assert.equal(throne.ownerId(), null);
  throne.tick(54_200);
  assert.deepEqual(announcements, [
    { ownerId: 2, message: '甲 登临冰雪王座' },
    { ownerId: null, message: '冰雪之主退位，王座空悬' },
    { ownerId: 1, message: '乙 登临冰雪王座' },
  ]);
});

test('same-tick contenders are ordered by peer id', () => {
  const { throne } = session();
  throne.observe(100, 8, '甲', true);
  throne.observe(100, 3, '乙', true);
  throne.tick(3_100);
  assert.equal(throne.ownerId(), 3);
});

test('standing up before three seconds resets the acquisition timer', () => {
  const { throne } = session();
  throne.observe(0, 8, '甲', true);
  throne.observe(2_999, 8, '甲', false);
  throne.observe(3_000, 8, '甲', true);
  throne.tick(5_999);
  assert.equal(throne.ownerId(), null);
  throne.tick(6_000);
  assert.equal(throne.ownerId(), 8);
});

test('a single occupant retires at five minutes and can claim again after reseating', () => {
  const { throne, announcements } = session();
  throne.observe(0, 4, '甲', true);
  throne.tick(3_000);
  throne.tick(302_999);
  assert.equal(throne.ownerId(), 4);
  throne.tick(303_000);
  throne.tick(310_000);
  assert.equal(throne.ownerId(), null);
  assert.equal(announcements.length, 2);
  throne.observe(311_000, 4, '甲', false);
  throne.observe(312_000, 4, '甲', true);
  throne.tick(315_000);
  assert.equal(throne.ownerId(), 4);
});

test('may return at exactly ten seconds and retires when seat absence exceeds ten seconds', () => {
  const { throne } = session();
  throne.observe(0, 4, '甲', true);
  throne.tick(3_000);
  throne.observe(4_000, 4, '甲', false);
  throne.observe(14_000, 4, '甲', true);
  assert.equal(throne.ownerId(), 4);
  throne.observe(18_000, 4, '甲', false);
  throne.tick(28_000);
  assert.equal(throne.ownerId(), 4);
  throne.tick(28_001);
  assert.equal(throne.ownerId(), null);
});

test('disconnection uses the same absence grace and a disconnected candidate cannot win', () => {
  const { throne } = session();
  throne.observe(0, 5, '甲', true);
  throne.remove(2_999, 5);
  throne.tick(3_500);
  assert.equal(throne.ownerId(), null);
  throne.observe(4_000, 8, '乙', true);
  throne.tick(7_000);
  throne.remove(8_000, 8);
  throne.observe(8_100, 9, '丙', true);
  throne.tick(18_000);
  assert.equal(throne.ownerId(), 8);
  throne.tick(18_001);
  assert.equal(throne.ownerId(), null);
  throne.tick(21_001);
  assert.equal(throne.ownerId(), 9);
});

test('only distinct confirmed shots against the current crown count', () => {
  const { throne, announcements } = session();
  throne.confirmedHit(0, 4, 2, 1);
  throne.observe(100, 4, '甲', true);
  throne.tick(3_100);
  throne.confirmedHit(3_200, 4, 4, 1);
  throne.confirmedHit(3_300, 5, 2, 1);
  throne.confirmedHit(3_400, 4, 2, 1);
  throne.confirmedHit(3_500, 4, 2, 1);
  throne.confirmedHit(3_600, 4, 3, 1);
  assert.equal(throne.ownerId(), 4);
  throne.confirmedHit(3_700, 4, 2, 2);
  throne.confirmedHit(3_800, 4, 2, 3);
  assert.equal(throne.ownerId(), null);
  assert.equal(announcements.length, 2);
});
