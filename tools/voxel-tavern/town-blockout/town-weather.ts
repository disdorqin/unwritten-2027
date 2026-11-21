import type { CeremonyState } from './town-ceremony';
import {
  townOutdoorWeatherEffects, townOutdoorWhiteoutFirePoolMeters,
  type TownOutdoorWeather, type TownOutdoorWeatherState,
} from '../../../src/shared/town-outdoor-weather';

const minuteMs = 60_000;
const weatherSlotCount = 64;
export const townWeatherEpoch = Date.UTC(2026, 0, 1);

export type TownSnowTier = 'light' | 'medium' | 'heavy';
export type TownSnowWeather = {
  tier: TownSnowTier;
  nextTier: TownSnowTier;
  progress: number;
  intensity: number;
  fogNear: number;
  fogFar: number;
  pilingRate: number;
  targetCover: number;
};
const profiles = {
  light: { intensity: 1, fogNear: 360, fogFar: 1300, pilingRate: .25, targetCover: .18 },
  medium: { intensity: 2.45, fogNear: 200, fogFar: 890, pilingRate: .65, targetCover: .64 },
  heavy: { intensity: 4, fogNear: 112, fogFar: 620, pilingRate: 1.25, targetCover: 1 },
};
const weights = [['light', 47], ['medium', 42], ['heavy', 11]] as const;

function makeSchedule() {
  let seed = 0x20270101;
  const slots: { tier: TownSnowTier; start: number; end: number; transition: number }[] = [];
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  for (let i = 0; i < weatherSlotCount; i++) {
    const previous = slots.at(-1);
    const first = i === weatherSlotCount - 1 ? slots[0].tier : undefined;
    const candidates = weights.filter(([tier]) => tier !== previous?.tier && tier !== first);
    let draw = random() * candidates.reduce((sum, [, weight]) => sum + weight, 0);
    const tier = candidates.find(([, weight]) => (draw -= weight) < 0)?.[0] ?? candidates.at(-1)![0];
    const start = previous?.end ?? 0;
    const end = start + (4 + random() * 5) * minuteMs;
    const transition = 20_000 + random() * 10_000;
    slots.push({ tier, start, end, transition });
  }
  return slots;
}

const slots = makeSchedule();
const period = slots.at(-1)!.end;

export function townSnowWeatherAt(sharedTime: number, ceremonyOverride?: TownSnowTier): TownSnowWeather {
  const phase = Number.isFinite(sharedTime) ? ((sharedTime - townWeatherEpoch) % period + period) % period : 0;
  const index = slots.findIndex(slot => phase < slot.end);
  const slot = slots[index];
  const next = slots[(index + 1) % slots.length].tier;
  const t = Math.max(0, 1 - (slot.end - phase) / slot.transition);
  const progress = t * t * (3 - 2 * t);
  if (ceremonyOverride) return sampleProfile(ceremonyOverride, ceremonyOverride, 0);
  return sampleProfile(slot.tier, next, progress);
}

const outdoorSnowTiers: Readonly<Record<TownOutdoorWeather, TownSnowTier>> = {
  'clear-snow': 'light', wind: 'medium', whiteout: 'heavy',
};

/**
 * G-09 renders the *authoritative* Presence weather, rather than choosing a
 * second client-local 64-slot schedule. The old ceremony curve is unchanged.
 */
export function townSnowWeatherForOutdoorState(
  state: TownOutdoorWeatherState, areaExposure = 1,
  nightFogFar = Infinity, litFireDistance = Infinity,
) {
  const tier = outdoorSnowTiers[state.weather];
  const snow = sampleProfile(tier, tier, 0);
  const weatherVisibility = townOutdoorWeatherEffects[state.weather].visibilityMeters;
  const limit = Number.isFinite(nightFogFar) && nightFogFar > 0 ? Math.min(snow.fogFar, nightFogFar) : snow.fogFar;
  if (weatherVisibility === null) return { ...snow, fogNear: Math.min(snow.fogNear, limit * .95), fogFar: limit, skyColor: undefined };
  // The G-09 approved exposure table varies the whiteout range from ~12 m
  // in open ground to 30 m in the sheltered plaza, no new draw passes.
  const exposure = Number.isFinite(areaExposure) ? Math.max(.25, Math.min(1, areaExposure)) : 1;
  const fireRadius = townOutdoorWhiteoutFirePoolMeters;
  const fireNear = Number.isFinite(litFireDistance)
    ? fireRadius * Math.max(0, Math.min(1, (fireRadius - litFireDistance) / 2)) : 0;
  return {
    ...snow,
    fogNear: fireNear,
    fogFar: Math.max(fireNear + .1, Math.min(limit, weatherVisibility / exposure)),
    skyColor: '#d8e2e9',
  };
}

export function advanceWeatherCover(
  cover: number, seconds: number, weather: Pick<TownSnowWeather, 'pilingRate' | 'targetCover'>,
) {
  if (!Number.isFinite(seconds) || seconds <= 0) return cover;
  return cover < weather.targetCover
    ? Math.min(weather.targetCover, cover + seconds * weather.pilingRate / 55)
    : Math.max(weather.targetCover, cover - seconds / 150);
}

function sampleProfile(tier: TownSnowTier, nextTier: TownSnowTier, progress: number): TownSnowWeather {
  const from = profiles[tier], to = profiles[nextTier];
  const interpolate = (a: number, b: number) => a + (b - a) * progress;
  return {
    tier, nextTier, progress,
    intensity: interpolate(from.intensity, to.intensity),
    fogNear: interpolate(from.fogNear, to.fogNear), fogFar: interpolate(from.fogFar, to.fogFar),
    pilingRate: interpolate(from.pilingRate, to.pilingRate), targetCover: interpolate(from.targetCover, to.targetCover),
  };
}

export function townSnowWeatherForFrame(
  state: Pick<CeremonyState, 'now' | 'phase' | 'snowIntensity'>,
): TownSnowWeather {
  if (state.phase === 'ordinary') return townSnowWeatherAt(state.now);
  const level = state.snowIntensity;
  if (level <= profiles.light.intensity) return sampleProfile('light', 'light', 0);
  if (level >= profiles.heavy.intensity) return sampleProfile('heavy', 'heavy', 0);
  const [tier, next] = level < profiles.medium.intensity ? ['light', 'medium'] as const : ['medium', 'heavy'] as const;
  const progress = (level - profiles[tier].intensity) / (profiles[next].intensity - profiles[tier].intensity);
  return { ...sampleProfile(tier, next, progress), intensity: level };
}
