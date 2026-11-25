import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPumpOffset, baseLevelForPhase, hydrologySignLines, isWaterGated,
  keyProgressSites, nightOrdinalAt, stoneSinkGuideLine, stoneSinkLongWadeLine,
  waterFormFor, waterPhaseForNight,
} from '../../src/shared/underground-water';
import { createUndergroundWaterState } from '../../src/presence/underground-water-state';
import {
  activeEncounterGroups, encounterTierForNight, type EncounterGroup,
} from '../../src/shared/underground-encounter-rotation';
import { townDayMs } from '../../src/shared/town-night-window';

test('the river runs a three-night cycle off the beacon ordinal', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(waterPhaseForNight),
    ['rise', 'level', 'fall', 'rise', 'level', 'fall']);
  assert.equal(baseLevelForPhase('rise'), 'high');
  assert.equal(baseLevelForPhase('level'), 'mid');
  assert.equal(baseLevelForPhase('fall'), 'low');
  assert.equal(nightOrdinalAt(1_000 + townDayMs * 7, 1_000), 7);
});

test('forms follow the design table for both layers', () => {
  const rise90 = waterFormFor(-90, 'high');
  assert.deepEqual(rise90, { floodedPassages: true, underwaterOre: true, riverbedOpen: false, ferryRunning: false });
  const fall90 = waterFormFor(-90, 'low');
  assert.deepEqual(fall90, { floodedPassages: false, underwaterOre: false, riverbedOpen: true, ferryRunning: false });
  const mid90 = waterFormFor(-90, 'mid');
  assert.deepEqual(mid90, { floodedPassages: false, underwaterOre: false, riverbedOpen: false, ferryRunning: false });
  assert.equal(waterFormFor(-140, 'mid').ferryRunning, true);
  assert.equal(waterFormFor(-140, 'high').ferryRunning, false);
  assert.equal(waterFormFor(-140, 'low').ferryRunning, false);
  assert.equal(waterFormFor(-140, 'low').riverbedOpen, true);
});

test('the progress red line: no key-progress site is water-gated', () => {
  for (const site of keyProgressSites) assert.equal(isWaterGated(site), false, site);
  assert.equal(isWaterGated('ore:underwater'), true);
  assert.equal(isWaterGated('path:riverbed'), true);
});

test('pump shifts clamp at the river ends', () => {
  assert.equal(applyPumpOffset('mid', 1), 'high');
  assert.equal(applyPumpOffset('high', 1), 'high');
  assert.equal(applyPumpOffset('low', -1), 'low');
  assert.equal(applyPumpOffset('low', 2), 'high');
});

test('presence state: the pump offset is tonight-only and dawn resets it', () => {
  let now = 1_000; // night 0: rise / high
  const state = createUndergroundWaterState({ dawnEpoch: 1_000, now: () => now });
  assert.equal(state.tonight().level, 'high');
  assert.equal(state.shiftPump(-1), 'mid');
  assert.equal(state.tonight().pumpOffset, -1);
  assert.equal(state.shiftPump(-1), 'low');
  now += townDayMs; // night 1: level / mid — yesterday's pumping is gone
  const tonight = state.tonight();
  assert.equal(tonight.phase, 'level');
  assert.equal(tonight.pumpOffset, 0);
  assert.equal(tonight.level, 'mid');
});

test('the hydrology sign names tonight and tomorrow', () => {
  assert.deepEqual(hydrologySignLines(0), [
    '暗河水文',
    '今夜水位：涨（高）',
    '明夜预告：平（中）',
    '水涨走上道，水落走河床',
  ]);
  assert.equal(hydrologySignLines(2)[1], '今夜水位：落（低）');
  assert.equal(hydrologySignLines(2)[2], '明夜预告：涨（高）');
});

test('石沉 picks his guide line by tonight\'s water', () => {
  assert.match(stoneSinkGuideLine('rise'), /今夜水涨/);
  assert.match(stoneSinkGuideLine('level'), /今夜水平/);
  assert.match(stoneSinkGuideLine('fall'), /今夜水落/);
  assert.match(stoneSinkLongWadeLine, /往高处走/);
});

test('encounters rotate one tier per night, garrisons always fielded', () => {
  const registry: EncounterGroup[] = [
    { id: 'a', layer: -140, tier: 0 }, { id: 'b', layer: -140, tier: 1 },
    { id: 'c', layer: -140, tier: 2 }, { id: 'keep', layer: -140, tier: 'fixed' },
    { id: 'deep', layer: -165, tier: 0 },
  ];
  const ids = (layer: -140 | -165, night: number) =>
    activeEncounterGroups(registry, layer, night).map((g) => g.id).sort();
  assert.deepEqual(ids(-140, 0), ['a', 'keep']);
  assert.deepEqual(ids(-140, 1), ['b', 'keep']);
  assert.deepEqual(ids(-140, 2), ['c', 'keep']);
  assert.deepEqual(ids(-140, 3), ['a', 'keep']);
  // Layers are one night out of step with each other.
  assert.equal(encounterTierForNight(-165, 0), 1);
  assert.deepEqual(ids(-165, 2), ['deep']);
});
