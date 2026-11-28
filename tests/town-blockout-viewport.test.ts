import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chatStartsCollapsed, fullscreenApiAvailable, fullscreenButtonVisible, isTouchEnvironment,
} from '../tools/voxel-tavern/town-blockout/town-viewport.ts';

test('touch environment follows the touch-walk rule: coarse pointer or a seen touch', () => {
  assert.equal(isTouchEnvironment(true, false), true);
  assert.equal(isTouchEnvironment(false, true), true);
  assert.equal(isTouchEnvironment(true, true), true);
  assert.equal(isTouchEnvironment(false, false), false);
});

test('chat starts collapsed in the corner menu on touch and desktop', () => {
  assert.equal(chatStartsCollapsed(true), true);
  assert.equal(chatStartsCollapsed(false), true);
});

test('fullscreen API detection accepts the standard and WebKit-prefixed forms only', () => {
  assert.equal(fullscreenApiAvailable({ requestFullscreen() {} }), true);
  assert.equal(fullscreenApiAvailable({ webkitRequestFullscreen() {} }), true);
  assert.equal(fullscreenApiAvailable({ requestFullscreen: undefined }), false);
  assert.equal(fullscreenApiAvailable({}), false);
  assert.equal(fullscreenApiAvailable(null), false);
  assert.equal(fullscreenApiAvailable(undefined), false);
});

test('fullscreen button shows only for touch devices with the API (iPhone Safari stays hidden)', () => {
  assert.equal(fullscreenButtonVisible(true, true), true);
  assert.equal(fullscreenButtonVisible(true, false), false);
  assert.equal(fullscreenButtonVisible(false, true), false);
  assert.equal(fullscreenButtonVisible(false, false), false);
});
