import type { StarStoneLocation } from './zodiac-star-stones.js';

// The live terrain supplies the surface layer for this surveyed pine-camp point.
export const pineOxStarStoneSite = {
  east: 415.75,
  north: 227.75,
  height: 20.430503845214844,
} as const satisfies Omit<StarStoneLocation, 'layer'>;
