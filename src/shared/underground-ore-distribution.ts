export const undergroundOreDepths = [-90, -140, -165, -190] as const;
export type UndergroundOreDepth = typeof undergroundOreDepths[number];
export type UndergroundOrePosition = readonly [east: number, north: number, height: number];
const minerals = ['ordinary-ore', 'stardust',
  'ordinary-ice-crystal', 'amethyst-cluster', 'blue-crystal', 'moonstone'] as const;
type Mineral = typeof minerals[number];

export type UndergroundOreAnchor = Readonly<{
  id: string;
  depth: UndergroundOreDepth;
  region: string;
  evidence: string;
  /** Test the surveyed region against the host's absolute coordinates. */
  contains(position: UndergroundOrePosition): boolean;
  distanceFromMainRoute?(position: UndergroundOrePosition): number;
}>;

export type UndergroundOreFallTraceBand = Readonly<{
  id: string;
  anchorId: string;
  evidence: string;
  centreline: readonly UndergroundOrePosition[];
  radius: number;
}>;

export type UndergroundOrePoint = Readonly<{
  id: string;
  anchorId: string;
  depth: UndergroundOreDepth;
  position: UndergroundOrePosition;
  amount: number;
} & (
  { mineral: 'stardust'; fallTraceBandId: string; firstFind?: boolean } |
  { mineral: Exclude<Mineral, 'stardust'>; grade: 'scatter' | 'deposit' }
)>;

type Configuration = Readonly<{
  anchors?: readonly UndergroundOreAnchor[];
  fallTraceBands?: readonly UndergroundOreFallTraceBand[];
  points?: readonly UndergroundOrePoint[];
}>;

const crystalRegions: Partial<Record<Mineral, readonly string[]>> = {
  'ordinary-ice-crystal': ['crystal-forest', 'underground-pool'],
  'amethyst-cluster': ['crystal-forest'],
  'blue-crystal': ['crystal-hall'],
  moonstone: ['moonstone-vein'],
};

function isAbsolutePosition(position: UndergroundOrePosition) {
  return position.length === 3 && Number.isFinite(position[0]) && Number.isFinite(position[1]) &&
    Number.isFinite(position[2]) && position[2] < 0;
}

function registerUnique<T extends { id: string }>(entries: Map<string, T>, entry: T) {
  if (!entry.id.trim() || entries.has(entry.id)) throw new RangeError('Invalid or duplicate ore ID: ' + entry.id);
  entries.set(entry.id, entry);
}

function segmentLength(from: UndergroundOrePosition, to: UndergroundOrePosition) {
  return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
}

function withinBand(position: UndergroundOrePosition, band: UndergroundOreFallTraceBand) {
  return band.centreline.slice(1).some((to, index) => {
    const from = band.centreline[index];
    const length = segmentLength(from, to);
    const unit = to.map((coordinate, axis) => (coordinate - from[axis]) / length);
    const offset = position.map((coordinate, axis) => coordinate - from[axis]);
    const projected = Math.min(length, Math.max(0, offset.reduce((sum, value, axis) => sum + value * unit[axis], 0)));
    return Math.hypot(...offset.map((value, axis) => value - unit[axis] * projected)) <= band.radius;
  });
}

/** Validate authored placements before the host exposes markers or lets its mining authority resolve an ID. */
export function createUndergroundOreDistribution({ anchors = [], fallTraceBands = [], points = [] }: Configuration = {}) {
  const anchorsById = new Map<string, UndergroundOreAnchor>();
  for (const anchor of anchors) {
    if (!undergroundOreDepths.includes(anchor.depth) || !anchor.region.trim() || !anchor.evidence.trim() ||
        typeof anchor.contains !== 'function') throw new RangeError('Ore needs a confirmed underground anchor: ' + anchor.id);
    registerUnique(anchorsById, anchor);
  }

  const bandsById = new Map<string, UndergroundOreFallTraceBand>();
  for (const band of fallTraceBands) {
    if (!anchorsById.has(band.anchorId) || !band.evidence.trim() || !Number.isFinite(band.radius) || band.radius <= 0 ||
        band.centreline.length < 2 || !band.centreline.every(isAbsolutePosition) ||
        band.centreline.slice(1).some((point, index) => {
          const length = segmentLength(band.centreline[index], point);
          return !Number.isFinite(length) || length === 0;
        })) throw new RangeError('Invalid confirmed fall trace band: ' + band.id);
    registerUnique(bandsById, band);
  }

  type RegisteredPoint = UndergroundOrePoint & Readonly<{ region: string; anchorEvidence: string }>;
  const pointsById = new Map<string, RegisteredPoint>();
  const placements = new Set<string>();
  let hasFirstStardust = false;
  for (const point of points) {
    const anchor = anchorsById.get(point.anchorId);
    if (!anchor || anchor.depth !== point.depth || !isAbsolutePosition(point.position) || !minerals.includes(point.mineral) ||
        anchor.contains(point.position) !== true || !Number.isSafeInteger(point.amount) || point.amount <= 0) {
      throw new RangeError('Ore point is outside its confirmed underground anchor: ' + point.id);
    }
    if (point.depth === -140 && anchor.region === 'dark-passage') {
      throw new RangeError('The crystal cave dark passage has no mining points: ' + point.id);
    }
    if (point.mineral === 'stardust') {
      const band = bandsById.get(point.fallTraceBandId);
      const isFirstMineBand = anchor.region === 'mining-side-passage' || anchor.region === 'pre-gate-waterline';
      if (!band || band.anchorId !== anchor.id || !withinBand(point.position, band) ||
          (point.depth === -90 && !isFirstMineBand)) {
        throw new RangeError('Stardust must be inside its confirmed fall trace band: ' + point.id);
      }
      if (point.firstFind) {
        if (hasFirstStardust || point.depth !== -90 || anchor.region !== 'pre-gate-waterline' || point.amount > 2) {
          throw new RangeError('First stardust is one finding of 1–2 pieces in the mine waterline: ' + point.id);
        }
        hasFirstStardust = true;
      }
    } else if (point.depth === -140) {
      const regions = crystalRegions[point.mineral];
      if (!regions?.includes(anchor.region)) throw new RangeError('Mineral is outside its crystal cave region: ' + point.id);
      if (point.grade === 'deposit') {
        const distance = anchor.distanceFromMainRoute?.(point.position);
        if (distance === undefined || !Number.isFinite(distance) || distance <= 10) {
          throw new RangeError('Crystal deposits must be more than 10 m from the main route: ' + point.id);
        }
      }
    }
    const placement = point.position.join(',');
    if (placements.has(placement)) throw new RangeError('Two ore points share the same position: ' + point.id);
    const entry = Object.freeze({ ...point, position: Object.freeze([...point.position] as const),
      region: anchor.region, anchorEvidence: anchor.evidence });
    registerUnique(pointsById, entry);
    placements.add(placement);
  }

  const layers = undergroundOreDepths.map(depth => {
    const anchorIds = anchors.filter(anchor => anchor.depth === depth).map(anchor => anchor.id);
    const bandIds = fallTraceBands.filter(band => anchorsById.get(band.anchorId)?.depth === depth).map(band => band.id);
    const markers = Object.freeze([...pointsById.values()].filter(point => point.depth === depth));
    return {
      depth, anchorIds, fallTraceBandIds: bandIds, markers,
      missingWorldAnchors: anchorIds.length === 0,
      missingOrePoints: markers.length === 0,
      missingFallTrace: bandIds.length === 0,
    };
  });
  return {
    layers,
    /** The host owns reach, tool, depletion, respawn and atomic inventory writes. */
    availablePoint(id: string, depletedIds: ReadonlySet<string>) {
      if (!depletedIds.has(id)) return pointsById.get(id);
    },
  };
}
