import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLandingFeedback, landingFeedback } from '../tools/voxel-tavern/town-blockout/landing-feedback.ts';

test('landing uses the height difference and snow reduces the outcome one tier', () => {
  assert.equal(landingFeedback(2.99, false), 'none');
  assert.equal(landingFeedback(3, false), 'compress');
  assert.equal(landingFeedback(6, false), 'compress');
  assert.equal(landingFeedback(6.01, false), 'prone');
  assert.equal(landingFeedback(4, true), 'none');
  assert.equal(landingFeedback(8, true), 'compress');
});

test('prone landing pauses, then recovers at 70 percent speed before walking normally', () => {
  const fall = createLandingFeedback();
  fall.begin(20);
  assert.equal(fall.land(12, false), 'prone');
  assert.equal(fall.pose(), 'prone');
  assert.equal(fall.walkingScale(), 0);
  fall.update(1.2);
  assert.equal(fall.pose(), 'none');
  assert.equal(fall.walkingScale(), .7);
  fall.update(2);
  assert.equal(fall.walkingScale(), 1);
  assert.equal(fall.land(12, false), 'none');
});

test('moderate landing compression uses the 0.3 second pause and resets cleanly', () => {
  const fall = createLandingFeedback();
  fall.begin(16);
  assert.equal(fall.land(12, false), 'compress');
  assert.equal(fall.compression(), 1);
  fall.update(.15);
  assert.equal(fall.compression(), .5);
  fall.update(.15);
  assert.equal(fall.walkingScale(), 1);
  fall.begin(20);
  assert.equal(fall.land(12, false), 'prone');
  fall.reset();
  assert.equal(fall.pose(), 'none');
  assert.equal(fall.walkingScale(), 1);
});
