/**
 * FR-15 R3: the small per-frame link between the regional weather field and
 * the existing snowfall emitter. It only writes the public snowfall knobs;
 * it never schedules weather, never touches the authoritative state and never
 * allocates per frame.
 *
 * Two performance rules are encoded here:
 * - particle draw budget follows storm/visibility load (and stays inside the
 *   quality tier the player chose), with a smooth 0.45 s approach so a zone
 *   crossing does not pop;
 * - wind uniforms are pushed at 10 Hz and eased over 0.7 s, which is visually
 *   indistinguishable from per-frame pushes but removes most uniform churn.
 */

export type TownWeatherVisualSample = {
  intensity: number;
  visibilityMeters: number;
  windEast: number;
  windNorth: number;
  windStrength: number;
};

export type SnowfallHandle = {
  setIntensity(intensity: number): void;
  setOutdoorWind(east: number, north: number, strength: number, exposure?: number): void;
  setDensityScale(scale: number): void;
};

export type TownWeatherVisualDriverOptions = {
  /** Current quality tier particle scale (usually particleDensityScale()). */
  qualityScale?: () => number;
  /** How often the wind uniform may be pushed, in milliseconds. */
  windIntervalMs?: number;
  /** Seconds for density to approach its target. */
  densityTau?: number;
  /** Seconds for the wind vector to approach its target. */
  windTau?: number;
};

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/**
 * 0 = calm clear weather, 1 = full storm or near-zero visibility. The two
 * inputs are not added: either condition is enough to justify thinning the
 * draw budget.
 */
export function townWeatherParticleLoad(
  sample: Pick<TownWeatherVisualSample, 'intensity' | 'visibilityMeters'>,
): number {
  const storm = clamp01((finite(sample.intensity) - 1.2) / 4.6);
  const whiteout = clamp01((90 - finite(sample.visibilityMeters, 90)) / 80) * .9;
  return Math.max(storm, whiteout);
}

/**
 * Multiplier for the existing fixed particle buffer. `qualityScale` is the
 * player's own tier choice; this function only trims the heaviest situations
 * (down to 76% at full load) and never replaces the quality setting.
 */
export function townWeatherParticleScale(
  sample: Pick<TownWeatherVisualSample, 'intensity' | 'visibilityMeters'>,
  qualityScale = 1,
): number {
  const quality = clamp(finite(qualityScale, 1), .4, 1.3);
  return clamp(quality * (1 - .24 * townWeatherParticleLoad(sample)), .4, 1.3);
}

export function createTownWeatherVisualDriver(
  snowfall: SnowfallHandle,
  options: TownWeatherVisualDriverOptions = {},
) {
  const windIntervalMs = Math.max(0, finite(options.windIntervalMs ?? 100, 100));
  const densityTau = Math.max(.01, finite(options.densityTau ?? .45, .45));
  const windTau = Math.max(.01, finite(options.windTau ?? .7, .7));
  let density = 1;
  let appliedDensity = -1;
  let windEast = 0;
  let windNorth = 0;
  let windStrength = 0;
  let lastWindAt = -Infinity;
  let lastIntensity = Number.NaN;

  const approach = (current: number, target: number, dt: number, tau: number) =>
    current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));

  return {
    update(sample: TownWeatherVisualSample, dt: number, nowMs: number, exposure = 1): void {
      if (!sample || !Number.isFinite(sample.intensity)) return;
      if (sample.intensity !== lastIntensity) {
        lastIntensity = sample.intensity;
        snowfall.setIntensity(sample.intensity);
      }

      const quality = options.qualityScale?.() ?? 1;
      const targetDensity = townWeatherParticleScale(sample, quality);
      density = approach(density, targetDensity, dt, densityTau);
      const quantized = Math.round(density * 32) / 32;
      if (quantized !== appliedDensity) {
        appliedDensity = quantized;
        snowfall.setDensityScale(quantized);
      }

      windEast = approach(windEast, finite(sample.windEast), dt, windTau);
      windNorth = approach(windNorth, finite(sample.windNorth), dt, windTau);
      windStrength = approach(windStrength, clamp01(finite(sample.windStrength)), dt, windTau);

      const now = finite(nowMs);
      if (now - lastWindAt >= windIntervalMs) {
        lastWindAt = now;
        const length = Math.hypot(windEast, windNorth);
        if (length < 1e-4) snowfall.setOutdoorWind(0, 0, windStrength, exposure);
        else snowfall.setOutdoorWind(windEast / length, windNorth / length, windStrength, exposure);
      }
    },
    /** Current eased values, for HUDs and tests. */
    current() {
      return { density, windEast, windNorth, windStrength };
    },
    reset() {
      density = 1;
      appliedDensity = -1;
      windEast = 0;
      windNorth = 0;
      windStrength = 0;
      lastWindAt = -Infinity;
      lastIntensity = Number.NaN;
    },
  };
}
