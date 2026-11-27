import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND2_A11Y_DEFAULT_SETTINGS,
  FRIEND2_A11Y_TEXT_SCALES,
  FRIEND2_A11Y_THEMES,
  FRIEND2_A11Y_TOUCH_SIZES,
  friend2A11yAttributes,
  friend2A11yCssVars,
  friend2A11yTouchPx,
  normalizeFriend2A11ySettings,
} from '../tools/voxel-tavern/town-blockout/town-friend2-accessibility.js';

test('FR-09 exposes three themes, four text scales and three touch sizes', () => {
  assert.deepEqual(FRIEND2_A11Y_THEMES.map(item => item.id), ['night', 'day', 'contrast']);
  assert.deepEqual(FRIEND2_A11Y_TEXT_SCALES.map(item => item.value), [1, 1.15, 1.3, 1.5]);
  assert.deepEqual(FRIEND2_A11Y_TOUCH_SIZES.map(item => item.px), [44, 52, 60]);
});

test('FR-09 settings normalize malformed and unknown values', () => {
  assert.deepEqual(normalizeFriend2A11ySettings(undefined), FRIEND2_A11Y_DEFAULT_SETTINGS);
  assert.deepEqual(normalizeFriend2A11ySettings({ theme: 'day', textScale: 1.3, touchSize: 'xlarge' }), {
    theme: 'day',
    textScale: 1.3,
    touchSize: 'xlarge',
  });
  assert.equal(normalizeFriend2A11ySettings({ theme: 'neon' as never }).theme, 'night');
  assert.equal(normalizeFriend2A11ySettings({ textScale: 2 as never }).textScale, 1);
  assert.equal(normalizeFriend2A11ySettings({ touchSize: 'huge' as never }).touchSize, 'normal');
});

test('FR-09 CSS vars change theme, font size and touch target', () => {
  const night = friend2A11yCssVars(normalizeFriend2A11ySettings({ theme: 'night', textScale: 1, touchSize: 'normal' }));
  const day = friend2A11yCssVars(normalizeFriend2A11ySettings({ theme: 'day', textScale: 1.5, touchSize: 'xlarge' }));
  assert.equal(night['--a11y-bg'], '#0a141f');
  assert.equal(night['--a11y-font-size'], '14px');
  assert.equal(night['--a11y-touch'], '44px');
  assert.equal(day['--a11y-bg'], '#f2ede3');
  assert.equal(day['--a11y-font-size'], '21px');
  assert.equal(day['--a11y-touch'], '60px');
  assert.equal(friend2A11yTouchPx({ ...normalizeFriend2A11ySettings({}), touchSize: 'large' }), 52);
});

test('FR-09 data attributes are stable for UI styling', () => {
  assert.deepEqual(friend2A11yAttributes({ theme: 'contrast', textScale: 1.15, touchSize: 'large' }), {
    'data-theme': 'contrast',
    'data-text': '1.15',
    'data-touch': 'large',
  });
});