import { townOutdoorWindWalkingScale, type TownOutdoorWeatherState } from './town-outdoor-weather.js';

/** G-09 canonical outdoor exposure coefficients approved for the town map. */
export const townWeatherAreaExposure = Object.freeze({
  plaza: .4,
  'town-hall': .4,
  clocktower: .5,
  tavern: .4,
  memorial: .4,
  'bus-station': .6,
  'post-office': .4,
  'shared-home': .5,
  inn: .5,
  'mirror-lake': .8,
  'ice-palace': .7,
  'pine-forest': .6,
  'meteor-rim': .9,
  'lower-cable-station': .7,
  'front-mountain': 1,
  summit: 1,
  residential: .5,
  'clocktower-lookout': 1,
  'mountain-pass': 1,
  'meteor-bottom': .5,
  'open-ground': 1,
} as const);

export type TownWeatherArea = keyof typeof townWeatherAreaExposure;

/** Shared by Presence and browser. Never let a client submit the multiplier. */
export function townWeatherExposureFor(area: TownWeatherArea): number {
  return townWeatherAreaExposure[area];
}

/** Wind movement blends smoothly by shelter without changing the global wind vector. */
export function townAreaWindWalkingScale(
  weather: TownOutdoorWeatherState, area: TownWeatherArea, east: number, north: number,
): number {
  return 1 + (townOutdoorWindWalkingScale(weather, east, north) - 1) * townWeatherExposureFor(area);
}
