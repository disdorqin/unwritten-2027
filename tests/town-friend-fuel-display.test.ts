import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import {
  FUEL_DISPLAY_CONSTANTS,
  evaluateFuelDisplay,
  fuelSecondsPerStardustOre,
  mountFuelDisplay,
  surveyFuelThreeStates,
} from '../tools/voxel-tavern/town-blockout/town-friend-fuel-display.ts';

test('F-8 evaluates full fuel tank state with correct consumption and ready prompt', () => {
  const snap = evaluateFuelDisplay(600, 'full');
  assert.equal(snap.fuelSeconds, 600);
  assert.equal(snap.canCount, 1);
  assert.equal(snap.percentage, 100);
  assert.equal(snap.status, 'full');
  assert.equal(snap.throttle, 'full');
  assert.equal(snap.burnRate, 1.0);
  assert.equal(snap.estimatedEnduranceSeconds, 600);
  assert.equal(snap.warningLevel, 'none');
  assert.equal(snap.shortWord, '充盈');
  assert.equal(snap.prompt, '星尘充盈 · 动力就绪');
  assert.match(snap.gaugeText, /600\.0s/);
  assert.match(snap.rateText, /1\.0 s\/s \[全推\]/);
});

test('F-8 evaluates half fuel tank state with cruise consumption rate and endurance', () => {
  const snap = evaluateFuelDisplay(300, 'cruise');
  assert.equal(snap.fuelSeconds, 300);
  assert.equal(snap.canCount, 0.5);
  assert.equal(snap.percentage, 50);
  assert.equal(snap.status, 'half');
  assert.equal(snap.throttle, 'cruise');
  assert.equal(snap.burnRate, 0.5);
  // 300s at 0.5 s/s burn rate yields 600 seconds of cruise endurance
  assert.equal(snap.estimatedEnduranceSeconds, 600);
  assert.equal(snap.warningLevel, 'none');
  assert.equal(snap.shortWord, '半余');
  assert.equal(snap.prompt, '余量过半 · 巡航平稳');
  assert.match(snap.gaugeText, /300\.0s/);
  assert.match(snap.rateText, /0\.5 s\/s \[巡航\]/);
});

test('F-8 evaluates low fuel warning with caution level and landing prompt', () => {
  const snap = evaluateFuelDisplay(45, 'full');
  assert.equal(snap.fuelSeconds, 45);
  assert.equal(snap.status, 'low');
  assert.equal(snap.throttle, 'full');
  assert.equal(snap.burnRate, 1.0);
  assert.equal(snap.estimatedEnduranceSeconds, 45);
  assert.equal(snap.warningLevel, 'caution');
  assert.equal(snap.shortWord, '偏低');
  assert.equal(snap.prompt, '星尘偏低 · 准备滑翔');
});

test('F-8 evaluates empty fuel state with glide-only prompt and critical warning', () => {
  const snap = evaluateFuelDisplay(0, 'off');
  assert.equal(snap.fuelSeconds, 0);
  assert.equal(snap.canCount, 0);
  assert.equal(snap.percentage, 0);
  assert.equal(snap.status, 'empty');
  assert.equal(snap.throttle, 'off');
  assert.equal(snap.burnRate, 0);
  assert.equal(snap.estimatedEnduranceSeconds, Infinity);
  assert.equal(snap.warningLevel, 'critical');
  assert.equal(snap.shortWord, '耗尽');
  assert.equal(snap.prompt, '星尘告罄 · 滑翔降落');
  assert.match(snap.gaugeText, /0\.0s/);
  assert.match(snap.rateText, /0\.0 s\/s \[关档\]/);
});

test('F-8 surveyFuelThreeStates generates comprehensive walkthrough evidence', () => {
  const { full, half, low, empty } = surveyFuelThreeStates();
  assert.equal(full.status, 'full');
  assert.equal(half.status, 'half');
  assert.equal(low.status, 'low');
  assert.equal(empty.status, 'empty');
  assert.equal(full.canCount, 1);
  assert.equal(empty.canCount, 0);
});

test('F-8 mountFuelDisplay correctly builds, updates and disposes 3D gauge components', () => {
  const host = new Group();
  const component = mountFuelDisplay(host, {
    maxFuelSeconds: fuelSecondsPerStardustOre,
    initialFuelSeconds: 600,
    initialThrottle: 'full',
  });

  const root = host.getObjectByName('town-friend-fuel-display');
  assert.ok(root instanceof Group);
  assert.ok(root.getObjectByName('fuel-gauge-base'));
  assert.ok(root.getObjectByName('fuel-gauge-frame'));
  assert.ok(root.getObjectByName('fuel-gauge-fill'));
  assert.ok(root.getObjectByName('fuel-gauge-status-lamp'));

  const initialSnap = component.getSnapshot();
  assert.equal(initialSnap.status, 'full');

  // Transition to half
  const halfSnap = component.update(300, 'cruise');
  assert.equal(halfSnap?.status, 'half');
  assert.equal(halfSnap?.shortWord, '半余');

  // Transition to empty
  const emptySnap = component.update(0, 'off');
  assert.equal(emptySnap?.status, 'empty');
  assert.equal(emptySnap?.shortWord, '耗尽');

  // Duplicate mount guard
  assert.throws(() => {
    mountFuelDisplay(host);
  }, RangeError);

  // Disposal
  component.dispose();
  assert.equal(host.children.length, 0);
});
