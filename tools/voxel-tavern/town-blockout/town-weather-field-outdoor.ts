import type { TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather.js';
import { townOutdoorWeatherEffects } from '../../../src/shared/town-outdoor-weather.js';
import {
  townWeatherFieldAt, type TownWeatherFieldPosition, type TownWeatherFieldSample,
} from '../../../src/shared/town-weather-field.js';
import { townSnowWeatherForOutdoorState, type TownSnowWeather } from './town-weather';

export type TownOutdoorWeatherFieldSample = TownWeatherFieldSample &
  Pick<TownSnowWeather, 'tier' | 'nextTier' | 'progress'>;

export type TownOutdoorWeatherFieldOptions = {
  /** G-09 area exposure used for the whiteout visibility conversion. */
  exposure?: number;
  /** Existing night fog limit; the regional field scales it rather than replacing it. */
  nightFogFar?: number;
  /** Distance to a lit fire pool, preserved from the approved whiteout treatment. */
  litFireDistance?: number;
  /** Optional override of the authoritative wind strength (never used by production). */
  windStrength?: number;
};

/**
 * The only production entry point for the regional weather field. It reads the
 * Presence-authoritative state and returns local visuals/physics values; it
 * does not write, schedule or replace the authoritative weather.
 */
export function townOutdoorWeatherFieldAt(
  state: TownOutdoorWeatherState,
  position: TownWeatherFieldPosition,
  options: TownOutdoorWeatherFieldOptions = {},
): TownOutdoorWeatherFieldSample {
  const base = townSnowWeatherForOutdoorState(
    state,
    options.exposure ?? 1,
    options.nightFogFar ?? Infinity,
    options.litFireDistance ?? Infinity,
  );
  const field = townWeatherFieldAt({
    base: {
      intensity: base.intensity,
      fogNear: base.fogNear,
      fogFar: base.fogFar,
      pilingRate: base.pilingRate,
      targetCover: base.targetCover,
      visibilityMeters: townOutdoorWeatherEffects[state.weather].visibilityMeters,
      skyColor: base.skyColor,
    },
    position,
    windEast: state.windEast,
    windNorth: state.windNorth,
    windStrength: options.windStrength ?? state.windStrength,
  });
  return { ...field, tier: base.tier, nextTier: base.nextTier, progress: base.progress };
}
