import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseQualityTier, particleDensityScale, qualityPixelRatioCap, qualityTier,
  qualityTierKey, qualityTierOrder, qualityTierParams, scaledDrawCount,
  scaledParticleCount, setQualityTier,
} from '../tools/voxel-tavern/town-blockout/town-quality.ts';

test('quality tiers: balanced reproduces the pre-tier behaviour exactly', () => {
  // The renderer cap before M5 was Math.min(devicePixelRatio, 1.5) and every
  // particle system spawned at scale 1 — the default tier must keep both.
  assert.equal(qualityTierParams.balanced.pixelRatioCap, 1.5);
  assert.equal(qualityTierParams.balanced.particleScale, 1);
  assert.equal(qualityTierParams.balanced.label, '均衡');
  assert.equal(qualityTierParams.smooth.label, '流畅');
  assert.equal(qualityTierParams.fine.label, '精美');
  assert.deepEqual([...qualityTierOrder], ['smooth', 'balanced', 'fine']);
});

test('quality tiers: both knobs rise monotonically across the tiers', () => {
  const [smooth, balanced, fine] = qualityTierOrder.map(tier => qualityTierParams[tier]);
  assert.ok(smooth.pixelRatioCap < balanced.pixelRatioCap);
  assert.ok(balanced.pixelRatioCap < fine.pixelRatioCap);
  assert.ok(smooth.particleScale < balanced.particleScale);
  assert.ok(balanced.particleScale < fine.particleScale);
});

test('quality tiers: parsing accepts only the three tier ids', () => {
  assert.equal(parseQualityTier('smooth'), 'smooth');
  assert.equal(parseQualityTier('balanced'), 'balanced');
  assert.equal(parseQualityTier('fine'), 'fine');
  assert.equal(parseQualityTier('ultra'), 'balanced');
  assert.equal(parseQualityTier(''), 'balanced');
  assert.equal(parseQualityTier(undefined), 'balanced');
  assert.equal(parseQualityTier(null), 'balanced');
  assert.equal(parseQualityTier(2), 'balanced');
});

test('quality tiers: spawn counts scale but a live burst never vanishes', () => {
  assert.equal(scaledParticleCount(18, 1), 18);
  assert.equal(scaledParticleCount(18, .5), 9);
  assert.equal(scaledParticleCount(22, 1.25), 28);
  assert.equal(scaledParticleCount(1, .5), 1);
  assert.equal(scaledParticleCount(0, 1), 0);
  assert.equal(scaledParticleCount(18, 0), 0);
});

test('quality tiers: draw counts scale but never pass the buffer cap', () => {
  assert.equal(scaledDrawCount(1580, 1, 3160), 1580);
  assert.equal(scaledDrawCount(1580, .5, 3160), 790);
  assert.equal(scaledDrawCount(3160, 1.25, 3160), 3160);
  assert.equal(scaledDrawCount(0, 1, 3160), 0);
});

test('quality tiers: selection persists under the unwritten.* key and applies at once', () => {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
  const global = globalThis as { localStorage?: unknown };
  const original = global.localStorage;
  global.localStorage = fake;
  try {
    assert.equal(setQualityTier('fine'), 'fine');
    assert.equal(qualityTier(), 'fine');
    assert.equal(store.get(qualityTierKey), 'fine');
    assert.equal(qualityTierKey, 'unwritten.quality.tier.v1');
    assert.equal(qualityPixelRatioCap(), 2);
    assert.equal(particleDensityScale(), 1.25);
    assert.equal(setQualityTier('smooth'), 'smooth');
    assert.equal(qualityPixelRatioCap(), 1);
    assert.equal(particleDensityScale(), .5);
    // An invalid value falls back to the balanced default rather than sticking.
    assert.equal(setQualityTier('bogus'), 'balanced');
    assert.equal(qualityPixelRatioCap(), 1.5);
    assert.equal(particleDensityScale(), 1);
  } finally {
    global.localStorage = original;
    setQualityTier('balanced');
  }
});
