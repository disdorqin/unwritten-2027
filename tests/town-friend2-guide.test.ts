import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND2_GUIDE_CATEGORIES,
  FRIEND2_GUIDE_ENTRIES,
  filterFriend2Guide,
  friend2GuideCategoryLabel,
  friend2GuideCounts,
  normalizeFriend2GuideQuery,
} from '../tools/voxel-tavern/town-blockout/town-friend2-guide.js';

test('FR-06 guide covers stable town locations, services and controls', () => {
  assert.ok(FRIEND2_GUIDE_ENTRIES.length >= 12);
  assert.equal(new Set(FRIEND2_GUIDE_ENTRIES.map(entry => entry.id)).size, FRIEND2_GUIDE_ENTRIES.length);
  const categories = new Set(FRIEND2_GUIDE_ENTRIES.map(entry => entry.category));
  assert.deepEqual([...categories].sort(), ['controls', 'landmark', 'service']);
  for (const entry of FRIEND2_GUIDE_ENTRIES) {
    assert.ok(entry.name.length > 0);
    assert.ok(entry.summary.length > 0);
    assert.ok(entry.howTo.length > 0);
    assert.ok(entry.status === 'current' || entry.status === 'planned');
  }
  assert.ok(FRIEND2_GUIDE_ENTRIES.some(entry => entry.status === 'planned'));
  assert.deepEqual(FRIEND2_GUIDE_CATEGORIES.map(category => category.id), ['all', 'landmark', 'service', 'controls']);
});

test('FR-06 filters by keyword across name, summary, how-to and tags', () => {
  assert.equal(filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, '钟楼', 'all').some(entry => entry.id === 'clocktower'), true);
  assert.equal(filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, '调酒', 'all').some(entry => entry.id === 'tavern'), true);
  assert.equal(filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, 'WASD', 'all').some(entry => entry.id === 'move'), true);
  assert.equal(filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, '不存在的词', 'all').length, 0);
  assert.equal(normalizeFriend2GuideQuery('  钟楼  '), '钟楼');
});

test('FR-06 filters by category and keeps planned entries visible', () => {
  const controls = filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, '', 'controls');
  assert.ok(controls.length >= 2);
  assert.ok(controls.every(entry => entry.category === 'controls'));
  const planned = filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, '规划', 'all');
  assert.ok(planned.some(entry => entry.status === 'planned'));
  assert.ok(planned.every(entry => entry.status === 'planned' || entry.tags.includes('规划')));
  assert.equal(filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, '钟楼', 'service').length, 0);
});

test('FR-06 counts current and planned entries honestly', () => {
  const counts = friend2GuideCounts(FRIEND2_GUIDE_ENTRIES);
  assert.equal(counts.total, FRIEND2_GUIDE_ENTRIES.length);
  assert.ok(counts.current > 0);
  assert.ok(counts.planned >= 2);
  assert.equal(counts.current + counts.planned, counts.total);
});

test('FR-06 category labels are present', () => {
  assert.equal(friend2GuideCategoryLabel('landmark'), '镇内地点');
  assert.equal(friend2GuideCategoryLabel('service'), '生活服务');
  assert.equal(friend2GuideCategoryLabel('controls'), '操作指南');
});