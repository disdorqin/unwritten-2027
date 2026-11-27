// Graphics quality tiers (3.0 M5): three tiers trade render resolution and
// particle density only. Scene content, effect kinds and every verified
// gameplay number stay untouched — a lower tier draws the same town with
// fewer pixels and fewer flakes, never a different town.
// 'balanced' reproduces the pre-tier behaviour exactly (pixel-ratio cap 1.5,
// particle scale 1), so the default path is byte-for-byte the old one.
export type QualityTier = 'smooth' | 'balanced' | 'fine';

export const qualityTierKey = 'unwritten.quality.tier.v1';
export const qualityTierDefault: QualityTier = 'balanced';

export interface QualityTierParams {
  label: string;
  /** Upper bound handed to renderer.setPixelRatio (min with devicePixelRatio). */
  pixelRatioCap: number;
  /** Multiplier on particle spawn counts (snowfall, bursts, sled mist). */
  particleScale: number;
}

export const qualityTierParams: Record<QualityTier, QualityTierParams> = {
  smooth: { label: '流畅', pixelRatioCap: 1, particleScale: .5 },
  balanced: { label: '均衡', pixelRatioCap: 1.5, particleScale: 1 },
  fine: { label: '精美', pixelRatioCap: 2, particleScale: 1.25 },
};

export const qualityTierOrder: readonly QualityTier[] = ['smooth', 'balanced', 'fine'];

export function parseQualityTier(value: unknown): QualityTier {
  return value === 'smooth' || value === 'balanced' || value === 'fine' ? value : qualityTierDefault;
}

// On a first visit from a touch-first mobile device, prefer the lower GPU budget.
// Explicit saved choices always win; desktop keeps the existing default.
export function initialQualityTier(stored: unknown, mobile: boolean): QualityTier {
  return stored === null || stored === undefined ? (mobile ? 'smooth' : qualityTierDefault) : parseQualityTier(stored);
}

let current: QualityTier = qualityTierDefault;
let loaded = false;

export function qualityTier(): QualityTier {
  if (!loaded) {
    loaded = true;
    const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    current = initialQualityTier(undefined, mobile);
    try {
      current = initialQualityTier(globalThis.localStorage?.getItem(qualityTierKey), mobile);
    } catch { /* Storage is optional; the session value still applies. */ }
  }
  return current;
}

export function setQualityTier(value: unknown): QualityTier {
  loaded = true;
  current = parseQualityTier(value);
  try {
    globalThis.localStorage?.setItem(qualityTierKey, current);
  } catch { /* Keep this session's choice. */ }
  return current;
}

export function qualityPixelRatioCap(): number {
  return qualityTierParams[qualityTier()].pixelRatioCap;
}

export function particleDensityScale(): number {
  return qualityTierParams[qualityTier()].particleScale;
}

// Spawn-count scaling for particle emitters: a positive base never drops to
// zero, so a burst or a puff still reads as itself on the lowest tier.
export function scaledParticleCount(base: number, scale: number): number {
  if (!(base > 0) || !(scale > 0)) return 0;
  return Math.max(1, Math.round(base * scale));
}

// Draw-range scaling for fixed particle buffers: scale the wanted count but
// never past the allocated buffer.
export function scaledDrawCount(wanted: number, scale: number, hardCap: number): number {
  if (!(wanted > 0) || !(scale > 0)) return 0;
  return Math.min(hardCap, Math.round(wanted * scale));
}
