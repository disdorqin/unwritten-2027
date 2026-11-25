import type { TownWeatherArea } from '../../../src/shared/town-weather-exposure';
import { icePalaceSite } from './ice-palace-site';
import layout from './layout.json';

export { townWeatherExposureFor, townAreaWindWalkingScale } from '../../../src/shared/town-weather-exposure';
export type { TownWeatherArea } from '../../../src/shared/town-weather-exposure';

const currentPlots: Partial<Record<string, TownWeatherArea>> = {
  clocktower: 'clocktower',
  tavern: 'tavern',
  memorial: 'memorial',
  'post-office': 'post-office',
  'town-office': 'town-hall',
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
