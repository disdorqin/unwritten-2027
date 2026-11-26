import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND2_PHOTO_DEFAULT_SETTINGS,
  FRIEND2_PHOTO_FRAMES,
  computeFriend2PhotoLayout,
  formatFriend2PhotoDate,
  friend2PhotoWatermark,
  normalizeFriend2PhotoSettings,
  photoFrameById,
} from '../tools/voxel-tavern/town-blockout/town-friend2-photo.js';

test('FR-04 exposes three original frames with distinct mats and borders', () => {
  assert.equal(FRIEND2_PHOTO_FRAMES.length, 3);
  assert.equal(new Set(FRIEND2_PHOTO_FRAMES.map(frame => frame.id)).size, 3);
  for (const frame of FRIEND2_PHOTO_FRAMES) {
    assert.ok(frame.label.length > 0);
    assert.ok(frame.note.length > 0);
    assert.match(frame.matColor, /^#[0-9a-f]{6}$/i);
    assert.match(frame.borderColor, /^#[0-9a-f]{6}$/i);
    assert.ok(frame.borderRatio > 0 && frame.borderRatio < 0.1);
  }
  assert.equal(photoFrameById('missing' as never).id, 'warm-wood');
});

test('FR-04 settings normalize defaults, frame, nickname, date and toggles', () => {
  const today = new Date(2026, 10, 26);
  assert.deepEqual(normalizeFriend2PhotoSettings(undefined, today), {
    ...FRIEND2_PHOTO_DEFAULT_SETTINGS,
    dateText: '2026.11.26',
  });
  const custom = normalizeFriend2PhotoSettings(
    {
      frameId: 'snow-night',
      showDate: false,
      showNickname: true,
      nickname: '  雪夜归人  ',
      dateText: '2026.12.31',
    },
    today,
  );
  assert.deepEqual(custom, {
    frameId: 'snow-night',
    showDate: false,
    showNickname: true,
    nickname: '雪夜归人',
    dateText: '2026.12.31',
  });
  assert.equal(normalizeFriend2PhotoSettings({ frameId: 'bad' as never }).frameId, 'warm-wood');
  assert.equal(normalizeFriend2PhotoSettings({ nickname: '   ' }, today).nickname, '未写镇旅人');
  assert.equal(normalizeFriend2PhotoSettings({ nickname: 'x'.repeat(40) }).nickname.length, 20);
});

test('FR-04 cover layout fills and centers landscape, square and portrait sources', () => {
  const frame = photoFrameById('warm-wood');
  const landscape = computeFriend2PhotoLayout(1600, 900, 1200, 800, frame);
  assert.ok(landscape.drawWidth >= landscape.innerWidth);
  assert.ok(landscape.drawHeight >= landscape.innerHeight);
  assert.ok(landscape.drawX <= landscape.innerX);
  assert.ok(landscape.drawY <= landscape.innerY);
  assert.equal(landscape.innerX, Math.round(800 * frame.borderRatio));

  const square = computeFriend2PhotoLayout(1000, 1000, 1200, 800, frame);
  assert.ok(square.drawWidth >= square.innerWidth);
  assert.ok(square.drawHeight >= square.innerHeight);

  const portrait = computeFriend2PhotoLayout(600, 1200, 1200, 800, frame);
  assert.ok(portrait.drawWidth >= portrait.innerWidth);
  assert.ok(portrait.drawHeight >= portrait.innerHeight);
  assert.ok(Math.abs((portrait.drawX + portrait.drawWidth / 2) - (portrait.innerX + portrait.innerWidth / 2)) < 1e-6);
});

test('FR-04 watermark respects date and nickname toggles', () => {
  const settings = normalizeFriend2PhotoSettings({ dateText: '2026.11.26', nickname: '阿雪' });
  assert.deepEqual(friend2PhotoWatermark(settings), { date: '2026.11.26', nickname: '阿雪' });
  assert.deepEqual(friend2PhotoWatermark({ ...settings, showDate: false }), { date: '', nickname: '阿雪' });
  assert.deepEqual(friend2PhotoWatermark({ ...settings, showNickname: false }), { date: '2026.11.26', nickname: '' });
  assert.deepEqual(friend2PhotoWatermark({ ...settings, showDate: false, showNickname: false }), {
    date: '',
    nickname: '',
  });
});

test('FR-04 date formatting is stable', () => {
  assert.equal(formatFriend2PhotoDate(new Date(2026, 0, 1)), '2026.01.01');
  assert.equal(formatFriend2PhotoDate(new Date(2026, 10, 26)), '2026.11.26');
  assert.equal(formatFriend2PhotoDate(new Date(2027, 11, 31)), '2027.12.31');
});