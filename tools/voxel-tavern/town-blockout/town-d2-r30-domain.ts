import { mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';

/** Static massif, streaming near LOD and collision all consume this exact grid. */
export const townD2R30CanonicalSpacing = 8;

export const townD2R30Spec = Object.freeze({
  width: mainSummitSpec.width,
  depth: mainSummitSpec.depth,
  baseHeight: mainSummitSpec.baseHeight,
  summitHeight: mainSummitSpec.summitHeight,
  floorHeight: 130,
  cloudBand: Object.freeze([mainSummitSpec.cloudBand[0], mainSummitSpec.cloudBand[1]] as const),
  macroCell: 64,
  renderChunk: 256,
  canonicalSpacing: townD2R30CanonicalSpacing,
  collisionSpacing: townD2R30CanonicalSpacing,
  nearSpacing: townD2R30CanonicalSpacing,
  middleSpacing: 16,
  farSpacing: 32,
  horizonSpacing: 64,
  nearRadius: 320,
  middleRadius: 640,
  farRadius: 1_100,
  visibleRadius: 1_700,
  residentRadius: 1_500,
  simulationRadius: 640,
  unloadHysteresis: 96,
  worldAnchor: Object.freeze({ east: 300, north: 676 }),
});

export type TownD2R30Point = Readonly<{ east: number; north: number; height: number }>;
export type TownD2R30Chunk = Readonly<{
  key: string;
  column: number;
  row: number;
  west: number;
  east: number;
  south: number;
  north: number;
  centreEast: number;
  centreNorth: number;
}>;
export type TownD2R30SurfaceBand = 'forest' | 'woodland' | 'snowfield' | 'alpine-rock' | 'glacier' | 'summit-cap';

const boundsWest = mainSummitBounds.west, boundsEast = mainSummitBounds.east;
const boundsSouth = mainSummitBounds.south, boundsNorth = mainSummitBounds.north;
const halfPlateauWidth = mainSummitSpec.summitPlateau[0] / 2;
const halfPlateauDepth = mainSummitSpec.summitPlateau[1] / 2;
const halfPlazaWidth = mainSummitSpec.arrivalPlaza[0] / 2;
const plazaNorth = mainSummitSpec.arrivalPlaza[1];
const shoulders = mainSummitLayout.shoulders.map(shoulder => ({ ...shoulder }));

export const townD2R30Anchors = Object.freeze({
  gate: Object.freeze({ east: 0, north: -10, height: 347 }),
  summit: Object.freeze({ ...mainSummitLayout.summit, height: 800 }),
  shoulders: Object.freeze(shoulders.map(shoulder => Object.freeze({ ...shoulder }))),
  southPass: Object.freeze({ east: 40, north: 690 }),
  valleys: Object.freeze([
    Object.freeze({ id: 'west-gully', east: -760, north: 520, heading: -.28 }),
    Object.freeze({ id: 'south-gully', east: -250, north: 350, heading: .22 }),
    Object.freeze({ id: 'east-gully', east: 760, north: 590, heading: .34 }),
    Object.freeze({ id: 'north-gully', east: 160, north: 1_450, heading: -.18 }),
  ] as const),
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (lower: number, upper: number, value: number) => {
  const weight = clamp01((value - lower) / (upper - lower));
  return weight * weight * (3 - 2 * weight);
};
const outside = (value: number, lower: number, upper: number) => Math.max(lower - value, value - upper, 0);

function hash(east: number, north: number) {
  const value = Math.sin(east * 127.1 + north * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function valueNoise(east: number, north: number) {
  const x = Math.floor(east), n = Math.floor(north);
  const tx = east - x, tn = north - n;
  const sx = tx * tx * (3 - 2 * tx), sn = tn * tn * (3 - 2 * tn);
  const a = hash(x, n), b = hash(x + 1, n), c = hash(x, n + 1), d = hash(x + 1, n + 1);
  return (a + (b - a) * sx) * (1 - sn) + (c + (d - c) * sx) * sn;
}

function fractalNoise(east: number, north: number) {
  return valueNoise(east, north) * .58 + valueNoise(east * 2.07 + 17, north * 2.07 - 11) * .28 +
    valueNoise(east * 4.13 - 23, north * 4.13 + 31) * .14;
}

function distanceFromPlaza(e: number, n: number) {
  return Math.hypot(outside(e, -halfPlazaWidth, halfPlazaWidth), outside(n, boundsSouth, plazaNorth));
}

function distanceToValley(e: number, n: number, valley: Readonly<{ east: number; north: number; heading: number }>) {
  const dx = e - valley.east, dn = n - valley.north;
  const along = dx * Math.cos(valley.heading) + dn * Math.sin(valley.heading);
  const across = -dx * Math.sin(valley.heading) + dn * Math.cos(valley.heading);
  return Math.hypot(across + Math.sin(along * .011) * 24, Math.max(0, Math.abs(along) - 460) * .22);
}

function baseMassifHeight(e: number, n: number) {
  const summitDistance = Math.hypot(
    outside(e, mainSummitLayout.summit.east - halfPlateauWidth, mainSummitLayout.summit.east + halfPlateauWidth) /
      mainSummitLayout.summit.eastRun,
    outside(n, mainSummitLayout.summit.north - halfPlateauDepth, mainSummitLayout.summit.north + halfPlateauDepth) /
      mainSummitLayout.summit.northRun,
  );
  let height = townD2R30Spec.baseHeight +
    (townD2R30Spec.summitHeight - townD2R30Spec.baseHeight) * Math.max(0, 1 - summitDistance);
  for (const shoulder of shoulders) {
    const dx = shoulder.east - mainSummitLayout.summit.east;
    const dn = shoulder.north - mainSummitLayout.summit.north;
    const along = clamp01(((e - mainSummitLayout.summit.east) * dx + (n - mainSummitLayout.summit.north) * dn) /
      (dx * dx + dn * dn));
    const peakDistance = Math.hypot((e - shoulder.east) / shoulder.eastRun, (n - shoulder.north) / shoulder.northRun);
    const ridgeDistance = Math.hypot(
      e - mainSummitLayout.summit.east - dx * along,
      n - mainSummitLayout.summit.north - dn * along,
    );
    const ridgeHeight = townD2R30Spec.summitHeight + (shoulder.height - townD2R30Spec.summitHeight) * along;
    height = Math.max(height,
      townD2R30Spec.baseHeight + (shoulder.height - townD2R30Spec.baseHeight) * Math.max(0, 1 - peakDistance),
      townD2R30Spec.baseHeight + (ridgeHeight - townD2R30Spec.baseHeight) *
        Math.max(0, 1 - ridgeDistance / mainSummitLayout.ridgeHalfWidth));
  }
  return height;
}

export function sampleTownD2R30Height(east: number, north: number, arrivalHeight = 347): number | undefined {
  if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(arrivalHeight) ||
      outside(east, boundsWest, boundsEast) > 0 || outside(north, boundsSouth, boundsNorth) > 0) return;
  const plazaDistance = distanceFromPlaza(east, north);
  if (plazaDistance === 0) return arrivalHeight;
  const base = baseMassifHeight(east, north);
  const plateauDistance = Math.hypot(
    outside(east, mainSummitLayout.summit.east - halfPlateauWidth, mainSummitLayout.summit.east + halfPlateauWidth),
    outside(north, mainSummitLayout.summit.north - halfPlateauDepth, mainSummitLayout.summit.north + halfPlateauDepth),
  );
  const shoulderDistance = Math.min(...shoulders.map(shoulder => Math.hypot(east - shoulder.east, north - shoulder.north)));
  const edgeDistance = Math.min(east - boundsWest, boundsEast - east, north - boundsSouth, boundsNorth - north);
  const reliefMask = smoothstep(0, 24, plateauDistance) * smoothstep(0, 20, shoulderDistance) *
    smoothstep(0, mainSummitLayout.arrivalBlend, plazaDistance) * smoothstep(0, 120, edgeDistance);
  const broad = (fractalNoise(east * .0027 + 8, north * .0027 - 5) - .5) * 34;
  const fractured = (fractalNoise(east * .009 - 13, north * .009 + 21) - .5) * 12;
  const ridge = Math.sin(east * .006 + north * .0035) * Math.sin(north * .004 - east * .0015) * 8;
  const valleyDistance = Math.min(...townD2R30Anchors.valleys.map(valley => distanceToValley(east, north, valley)));
  const gully = -42 * Math.exp(-(valleyDistance * valleyDistance) / 1_500);
  const elevationWeight = .45 + .55 * Math.sin(clamp01((base - 150) / 650) * Math.PI);
  const relief = (broad + fractured + ridge + gully) * reliefMask * elevationWeight;
  const arrivalWeight = Math.max(0, 1 - plazaDistance / mainSummitLayout.arrivalBlend);
  return Math.max(townD2R30Spec.baseHeight, Math.min(townD2R30Spec.summitHeight,
    base + relief + (arrivalHeight - base) * arrivalWeight));
}

export function sampleTownD2R30Normal(east: number, north: number, arrivalHeight = 347): readonly [number, number, number] {
  if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(arrivalHeight) ||
      outside(east, boundsWest, boundsEast) > 0 || outside(north, boundsSouth, boundsNorth) > 0) {
    throw new RangeError('D2-R30 normal sampler rejects points outside the canonical domain.');
  }
  // Clamp sample offsets to the domain so boundary points use one-sided
  // differences instead of sampling outside the frozen height field. The
  // frozen sampler returns undefined outside the bounds, which would turn
  // the normal into NaN at every edge.
  const step = 2;
  const eastHigh = Math.min(boundsEast, east + step), eastLow = Math.max(boundsWest, east - step);
  const northHigh = Math.min(boundsNorth, north + step), northLow = Math.max(boundsSouth, north - step);
  const dx = (sampleTownD2R30Height(eastHigh, north, arrivalHeight)! -
    sampleTownD2R30Height(eastLow, north, arrivalHeight)!) / (eastHigh - eastLow);
  const dn = (sampleTownD2R30Height(east, northHigh, arrivalHeight)! -
    sampleTownD2R30Height(east, northLow, arrivalHeight)!) / (northHigh - northLow);
  const length = Math.hypot(dx, 1, dn);
  return [-dx / length, 1 / length, dn / length] as const;
}

export function townD2R30SurfaceBand(east: number, north: number, arrivalHeight = 347): TownD2R30SurfaceBand {
  if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(arrivalHeight) ||
      outside(east, boundsWest, boundsEast) > 0 || outside(north, boundsSouth, boundsNorth) > 0) {
    throw new RangeError('D2-R30 surface band rejects points outside the canonical domain.');
  }
  const height = sampleTownD2R30Height(east, north, arrivalHeight)!;
  const normal = sampleTownD2R30Normal(east, north, arrivalHeight);
  const slope = 1 - normal[1];
  if (height >= 770) return 'summit-cap';
  if (height >= 610 && slope < .42) return 'glacier';
  if (height >= 500) return 'alpine-rock';
  if (height >= 350) return slope < .16 ? 'snowfield' : 'alpine-rock';
  if (height >= 245) return 'woodland';
  return 'forest';
}

export function townD2R30WorldPoint(point: TownD2R30Point): TownD2R30Point {
  return {
    east: point.east + townD2R30Spec.worldAnchor.east,
    north: point.north + townD2R30Spec.worldAnchor.north,
    height: point.height,
  };
}

export function townD2R30LocalPoint(point: TownD2R30Point): TownD2R30Point {
  return {
    east: point.east - townD2R30Spec.worldAnchor.east,
    north: point.north - townD2R30Spec.worldAnchor.north,
    height: point.height,
  };
}

export function townD2R30LodSpacing(distance: number) {
  if (distance <= townD2R30Spec.nearRadius) return townD2R30Spec.nearSpacing;
  if (distance <= townD2R30Spec.middleRadius) return townD2R30Spec.middleSpacing;
  if (distance <= townD2R30Spec.farRadius) return townD2R30Spec.farSpacing;
  return townD2R30Spec.horizonSpacing;
}

export function townD2R30GridAxis(minimum: number, maximum: number, spacing: number) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(spacing) ||
      maximum <= minimum || spacing <= 0) throw new RangeError('Invalid D2-R01 terrain grid.');
  const count = Math.ceil((maximum - minimum) / spacing);
  return Array.from({ length: count + 1 }, (_, index) => Math.min(maximum, minimum + index * spacing));
}

export function townD2R30Chunks(): readonly TownD2R30Chunk[] {
  const size = townD2R30Spec.renderChunk;
  const columns = Math.ceil((boundsEast - boundsWest) / size), rows = Math.ceil((boundsNorth - boundsSouth) / size);
  const chunks: TownD2R30Chunk[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const chunkWest = boundsWest + column * size, chunkEast = Math.min(boundsEast, chunkWest + size);
      const chunkSouth = boundsSouth + row * size, chunkNorth = Math.min(boundsNorth, chunkSouth + size);
      chunks.push(Object.freeze({
        key: `${column}:${row}`, column, row,
        west: chunkWest, east: chunkEast, south: chunkSouth, north: chunkNorth,
        centreEast: (chunkWest + chunkEast) / 2, centreNorth: (chunkSouth + chunkNorth) / 2,
      }));
    }
  }
  return Object.freeze(chunks);
}

export const townD2R30ChunkList = townD2R30Chunks();
