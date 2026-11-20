import {
  townOutdoorWindWalkingScale, type TownOutdoorWeatherState,
} from '../../../src/shared/town-outdoor-weather';
import { icePalaceSite } from './ice-palace-site';
import layout from './layout.json';

/** Ground-scene exposure coefficients from the approved G-09 scene table. */
const exposureScales = {
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
} as const;

export type TownWeatherArea = keyof typeof exposureScales;

export function townWeatherExposureFor(area: TownWeatherArea) {
  return exposureScales[area];
}

export function townAreaWindWalkingScale(
  state: TownOutdoorWeatherState, area: TownWeatherArea, east: number, north: number,
) {
  return 1 + (townOutdoorWindWalkingScale(state, east, north) - 1) * townWeatherExposureFor(area);
}

const currentPlots: Partial<Record<string, TownWeatherArea>> = {
  clocktower: 'clocktower',
  tavern: 'tavern',
  memorial: 'memorial',
  'post-office': 'post-office',
  cabins: 'residential',
  stage: 'plaza',
};
const plots = layout.plots.flatMap(({ id, origin, footprint }) => {
  const area = currentPlots[id];
  return area ? [{ area, origin, footprint }] : [];
});
plots.push({ area: 'ice-palace', origin: [...icePalaceSite.terrain.origin], footprint: [...icePalaceSite.terrain.footprint] });
const [plazaWest, plazaSouth, plazaEast, plazaNorth] = layout.plaza.bounds;
const [lakeEast, lakeNorth] = layout.lake.center;
const [lakeWidth, lakeDepth] = layout.lake.radius;

type TownWeatherLocation = Readonly<{
  /** An active room or partition takes precedence over the current town layout. */
  area?: TownWeatherArea;
  clocktowerLookout?: boolean;
  inPineCamp?: boolean;
  residentialStreet?: boolean;
}>;

export function townWeatherAreaAt(east: number, north: number, location: TownWeatherLocation = {}): TownWeatherArea {
  if (location.area) return location.area;
  for (const { area, origin: [x, n], footprint: [width, depth] } of plots) {
    if (Math.abs(east - x) <= width / 2 && Math.abs(north - n) <= depth / 2) {
      return area === 'clocktower' && location.clocktowerLookout ? 'clocktower-lookout' : area;
    }
  }
  if (east >= plazaWest && east <= plazaEast && north >= plazaSouth && north <= plazaNorth) return 'plaza';
  if (((east - lakeEast) / lakeWidth) ** 2 + ((north - lakeNorth) / lakeDepth) ** 2 <= 1) return 'mirror-lake';
  if (location.inPineCamp) return 'pine-forest';
  if (location.residentialStreet) return 'residential';
  return 'open-ground';
}
