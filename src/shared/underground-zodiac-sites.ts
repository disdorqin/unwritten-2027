type Point = Readonly<{ east: number; north: number; height: number }>;
type WorldPoint = Point & Readonly<{ layer: string }>;

/** Local survey coordinates. A layer origin is only valid after the game host applies its scene anchor. */
export const undergroundZodiacSites = {
  horse: {
    number: 7, scene: 'mine-camp',
    base: { east: 2.90, north: -36.80, height: -91 },
    stand: { east: 2.05, north: -36.80, height: -91 },
  },
  monkey: {
    number: 8, scene: 'crystal-cave',
    // The shared socket is level. Set its underside below the lowest corner of this short ramp.
    base: { east: 3.15, north: 9.25, height: -.612 },
    stand: { east: 2.05, north: 9.25, height: -.592 },
  },
  rooster: {
    number: 9, scene: 'warrior-city',
    base: { east: 98, north: -6.25, height: -165 },
    stand: { east: 98, north: -5.10, height: -165 },
  },
  dog: {
    number: 10, scene: 'palace',
    base: { east: -3.20, north: 112.30, height: -2.40 },
    stand: { east: -2.25, north: 111.76, height: -2.40 },
  },
} as const;

export type UndergroundZodiacId = keyof typeof undergroundZodiacSites;
type Site = typeof undergroundZodiacSites[UndergroundZodiacId];
type Resolve = (scene: Site['scene'], point: Point) => WorldPoint | undefined;
type WorldPoints = Partial<Record<UndergroundZodiacId, WorldPoint>>;

function valid(point: WorldPoint): boolean {
  return point.layer.trim() !== '' && [point.east, point.north, point.height].every(Number.isFinite);
}

/** Supply origins to the shared star-stone authority before it loads a town save. */
export function resolveUndergroundZodiacSites(resolve: Resolve): Readonly<{
  origins: WorldPoints;
  stands: WorldPoints;
}> {
  const origins: WorldPoints = {};
  const stands: WorldPoints = {};
  for (const id of Object.keys(undergroundZodiacSites) as UndergroundZodiacId[]) {
    const { scene, base, stand } = undergroundZodiacSites[id];
    const origin = resolve(scene, base);
    const approach = resolve(scene, stand);
    if (!origin || !approach) continue;
    if (!valid(origin) || !valid(approach) || origin.layer !== approach.layer) {
      throw new RangeError('Invalid underground star-stone anchor: ' + id);
    }
    origins[id] = { ...origin };
    stands[id] = { ...approach };
  }
  return { origins, stands };
}
