import {
  summitGlideRingTerrainClears, type SummitGlideRing,
} from './main-summit-glide-rings';

type GroundAt = (east: number, north: number) => number | undefined;

/**
 * A wind observation obtained from the host's common G-09/ZB-20 daily source.
 * This module deliberately does not invent a second weather RNG or day clock.
 */
export type SummitDailyWind = Readonly<{
  dayId: string;
  eastMetresPerSecond: number;
  northMetresPerSecond: number;
}>;

export type SummitWindCourse = Readonly<{ dayId: string; rings: readonly SummitGlideRing[] }>;

/**
 * Shift the previously surveyed route gently with crosswind and lower the
 * ring line in headwinds. Do not publish an unsafe course; caller must retry
 * once the terrain/wind host has a valid day observation.
 */
export function shiftSummitGlideCourseWithDailyWind(
  base: readonly SummitGlideRing[], wind: SummitDailyWind, groundAt: GroundAt,
): SummitWindCourse | undefined {
  if (!wind.dayId || wind.dayId.trim() !== wind.dayId || wind.dayId.length > 64 ||
      !Number.isFinite(wind.eastMetresPerSecond) || !Number.isFinite(wind.northMetresPerSecond) ||
      Math.hypot(wind.eastMetresPerSecond, wind.northMetresPerSecond) > 35 ||
      base.length < 8 || base.length > 10) return;
  const rings = base.map((ring, index) => {
    const forwardEast = Math.sin(ring.heading), forwardNorth = Math.cos(ring.heading);
    const crosswind = wind.eastMetresPerSecond * forwardNorth - wind.northMetresPerSecond * forwardEast;
    const headwind = -(wind.eastMetresPerSecond * forwardEast +
      wind.northMetresPerSecond * forwardNorth);
    const exposure = .55 + .45 * index / (base.length - 1);
    const lateral = Math.max(-3, Math.min(3, crosswind * .16 * exposure));
    const drop = Math.max(0, headwind) * .12 * exposure;
    return {
      ...ring,
      east: ring.east + lateral * forwardNorth,
      north: ring.north - lateral * forwardEast,
      height: ring.height - drop,
    };
  });
  if (rings.some(ring => !summitGlideRingTerrainClears(ring, groundAt))) return;
  return { dayId: wind.dayId, rings };
}
