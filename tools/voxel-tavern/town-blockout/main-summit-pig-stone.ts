type SummitPoint = Readonly<{ east: number; north: number; height: number }>;
type SummitWorldPoint = SummitPoint & Readonly<{ layer: string }>;

/** JX-9 site 11, in the same local frame as the surveyed Y800 P-4 hut. */
export const mainSummitPigStone = {
  id: 'pig',
  origin: { east: 66.52, north: 1016.72, height: 800 },
  approach: { east: 65.90, north: 1015.90, height: 800 },
  approachRoute: [
    { east: 62.50, north: 1004.80, height: 800 },
    { east: 62.50, north: 1011.00, height: 800 },
    { east: 62.50, north: 1014.00, height: 800 },
    { east: 65.90, north: 1014.00, height: 800 },
  ],
} as const;

/** The host supplies the summit transform before JX-9 registers its one shared origin. */
export function registerMainSummitPigStone(toWorld: (point: SummitPoint) => SummitWorldPoint) {
  const origin = toWorld(mainSummitPigStone.origin);
  const approach = toWorld(mainSummitPigStone.approach);
  const valid = (point: SummitWorldPoint) => Boolean(point.layer) &&
    [point.east, point.north, point.height].every(Number.isFinite);
  if (!valid(origin) || !valid(approach) || origin.layer !== approach.layer ||
      Math.abs(origin.height - approach.height) > .43 ||
      Math.hypot(origin.east - approach.east, origin.north - approach.north) > 1.1) {
    throw new RangeError('Pig stone origin and approach must be reachable in the same summit layer');
  }
  return { id: mainSummitPigStone.id, origin, approach } as const;
}
