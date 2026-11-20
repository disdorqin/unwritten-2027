import type { CeremonyState } from './town-ceremony';
import {
  townOutdoorWeatherEffects, townOutdoorWhiteoutFirePoolMeters, type TownOutdoorWeather,
} from '../../../src/shared/town-outdoor-weather';
import { townWeatherExposureFor, type TownWeatherArea } from './town-weather-exposure';

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
const outdoorSnowTiers: Record<TownOutdoorWeather, TownSnowTier> = {
  'clear-snow': 'light', wind: 'medium', whiteout: 'heavy',
};
const firePoolRadius = townOutdoorWhiteoutFirePoolMeters;

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

export function townSnowWeatherForOutdoorState(
  state: TownOutdoorWeather,
  area: TownWeatherArea,
  nightFogFar = Infinity,
  litFireDistance = Infinity,
) {
  const tier = outdoorSnowTiers[state];
  const snow = sampleProfile(tier, tier, 0);
  const visibility = townOutdoorWeatherEffects[state].visibilityMeters;
  const fogLimit = Math.min(snow.fogFar, nightFogFar);
  if (visibility === null) {
    return { ...snow, fogNear: Math.min(snow.fogNear, fogLimit * .95), fogFar: fogLimit, skyColor: undefined };
  }
  // Built-in scene fog can keep the foreground clear around a lit fire in
  // one draw. Let the near plane recede at the edge of its eight-metre pool.
  const fireNear = firePoolRadius * Math.min(1, Math.max(0, (firePoolRadius - litFireDistance) / 2));
  return {
    ...snow, fogNear: fireNear, fogFar: Math.max(fireNear + .1, Math.min(fogLimit, visibility / townWeatherExposureFor(area))),
    skyColor: '#d8e2e9',
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

/** Accumulation sent only to the terrain renderer. */
export function createTownWeatherCover() {
  let cover = 0;
  return {
    update(seconds: number, weather: Pick<TownSnowWeather, 'pilingRate' | 'targetCover'>) {
      if (Number.isFinite(seconds) && seconds > 0) {
        if (cover < weather.targetCover) {
          cover = Math.min(weather.targetCover, cover + seconds * weather.pilingRate / 55);
        } else {
          cover = Math.max(weather.targetCover, cover - seconds / 150);
        }
      }
      return cover;
    },
  };
}
