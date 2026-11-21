import type { TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';
import { townWeatherExposureFor, type TownWeatherArea } from './town-weather-exposure';

/** G-09 phase-two leaf: map-space acceleration, compatible with the existing 60 Hz ballistics.
 * Keep the server-authoritative weather state as the source; the host must pin each
 * remote launch to its weather epoch before enabling this in a multiplayer match.
 */
export function townSnowballWindAcceleration(state: TownOutdoorWeatherState, area: TownWeatherArea) {
  if (state.weather === 'clear-snow') return { east: 0, north: 0 };
  // The maximum lateral acceleration is kept below the simulator's 2 m/s² guard.
  const strength = Math.min(1, Math.max(0, state.windStrength));
  const acceleration = 1.6 * strength * townWeatherExposureFor(area);
  return { east: state.windEast * acceleration, north: state.windNorth * acceleration };
}
