import { isWater, layout } from './terrain';

const [lakeEast, lakeNorth] = layout.lake.center;
const [eastRadius, northRadius] = layout.lake.radius;
const iceMargin = 1.5;

export const lakeSkateStation = { x: 362, n: 88 };

// Loop stays on the east side of the ice. The last checkpoint returns to the start.
export const lakeSkateGates: readonly { x: number; n: number }[] = [
  { x: 371, n: 80 },
  { x: 379, n: 66 },
  { x: 370, n: 51 },
  { x: 357, n: 57 },
  { x: 359, n: 76 },
  lakeSkateStation,
];

export function isLakeSkateIce(east: number, north: number) {
  const x = (east - lakeEast) / (eastRadius - iceMargin);
  const n = (north - lakeNorth) / (northRadius - iceMargin);
  if (!(x * x + n * n < 1) || isWater(east, north)) return false;
  // Keep the north–south snowball lane and its entry off the slippery surface.
  return Math.abs(east - 350) > 5.25 || north < 75 || north > 93;
}
