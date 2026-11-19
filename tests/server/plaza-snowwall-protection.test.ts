import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyWallSite } from '../../src/presence/snowfight.js';

test('expanded plaza roads and theater entrances retain the old snow-wall exclusion', () => {
  assert.equal(classifyWallSite(161.25, 202.25), 'road');
  assert.equal(classifyWallSite(163.25, 183.25), 'road');
  assert.equal(classifyWallSite(238.25, 141.25), 'stage');
  assert.equal(classifyWallSite(238.25, 147.25), 'stage');
  assert.equal(classifyWallSite(238.25, 157.25), 'stage');
});
