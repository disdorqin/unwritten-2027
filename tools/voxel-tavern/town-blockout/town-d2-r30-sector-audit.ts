import { mainSummitBounds } from './main-summit-block';
import {
  sampleTownD2R30Height, townD2R30CanonicalSpacing, townD2R30ChunkList, townD2R30Spec,
  townD2R30GridAxis,
} from './town-d2-r30-domain';
import { townD2CloudTerraceContract } from './town-d2-cloud-terrace-transform';
import { buildR30TownSkyline, townD2R30SkylineContract } from './town-d2-r30-skyline';
import { auditTownD2R30ReturnRoute } from './town-d2-r30-return-route';
import { createTownD2R30Collision, type TownD2R30Collision } from './town-d2-r30-collision';
import { buildTownD2R30ChunkGeometry } from './town-d2-r30-massif';

/**
 * D2's round-3 host contract for the four-sector assembly.
 *
 * The rebalance order gives each window one quadrant of the same mountain and
 * makes D2 the single owner of the canonical height, grid and domain seam.
 * This module is the machine-checkable statement of that ownership: it
 * publishes the sector bounds, verifies the overlap band is read-only, and
 * audits that the near massif, the distant shell and the return route all
 * consume one height source. It also runs the deep seam audit over the 32 m
 * read-only bands D2 shares with A/B/C2: canonical height alignment on both
 * sides of each band, gap-free canonical collision coverage, and
 * same-source rendered vertices in the near and far meshes. Total-control /
 * window A can call it before mounting the four sectors; it never edits
 * shared viewer/terrain files.
 */
export const townD2SectorContract = Object.freeze({
  /** The rebalance order's shared world extent (local E/N). */
  world: Object.freeze({
    west: mainSummitBounds.west,
    east: mainSummitBounds.east,
    south: mainSummitBounds.south,
    north: mainSummitBounds.north,
    splitNorth: 480,
    splitEast: 300,
    overlapWidth: 32,
  }),
  /** D2 owns the central strip north of the split. */
  d2: Object.freeze({
    west: -300,
    east: 300,
    south: 480,
    north: mainSummitBounds.north,
    areaSquareKm: 0.786,
  }),
  canonicalSpacing: townD2R30CanonicalSpacing,
  worldAnchor: Object.freeze({ ...townD2R30Spec.worldAnchor }),
  seamNorthLocal: townD2CloudTerraceContract.seamNorthLocal,
});

export type TownD2SectorPoint = Readonly<{ east: number; north: number }>;

/** Deep four-sector seam audit: the 32 m read-only overlap bands (N≈480,
 * E≈±300) that D2 shares with A/B/C2 must carry one canonical height, a
 * gap-free collision surface and same-source rendered vertices before the
 * four sectors are mounted together. */
export type TownD2SeamBandKey = 'north' | 'west' | 'east';
export type TownD2SeamBandReport = Readonly<{
  seam: number;
  axis: 'east' | 'north';
  extent: Readonly<{ min: number; max: number }>;
  width: number;
  lineSamples: number;
  sideSamples: number;
  unsupported: number;
  maxCrossDrift: number;
  maxLineStep: number;
}>;
export type TownD2SectorSeamReport = Readonly<{
  version: string;
  bands: Readonly<{
    north: TownD2SeamBandReport;
    west: TownD2SeamBandReport;
    east: TownD2SeamBandReport;
  }>;
  checks: Readonly<{
    seamElevationAligned: boolean;
    seamCollisionCovered: boolean;
    seamRenderConsistent: boolean;
  }>;
  measurements: Readonly<{
    bandVertices: number;
    bandUnsupported: number;
    seamCollisionCells: number;
    seamCollisionHoles: number;
    seamCollisionDrift: number;
    nearBandVertices: number;
    farBandVertices: number;
    seamRenderDrift: number;
  }>;
  readyForSeamAssembly: boolean;
}>;

export type TownD2SectorReport = Readonly<{
  version: string;
  sector: typeof townD2SectorContract.d2;
  checks: Readonly<{
    sectorInsideWorld: boolean;
    sectorAreaMatches: boolean;
    overlapIsReadOnly: boolean;
    summitInsideSector: boolean;
    northBandInsideSector: boolean;
    canonicalGridShared: boolean;
    nearFarSameSource: boolean;
    returnRouteWalkable: boolean;
    seamElevationAligned: boolean;
    seamCollisionCovered: boolean;
    seamRenderConsistent: boolean;
  }>;
  measurements: Readonly<{
    farTopVertices: number;
    nearFarMaxDrift: number;
    returnPoints: number;
    unsupportedReturn: number;
    skylineMinimumY: number;
    bandVertices: number;
    bandUnsupported: number;
    seamCollisionCells: number;
    seamCollisionHoles: number;
    seamCollisionDrift: number;
    nearBandVertices: number;
    farBandVertices: number;
    seamRenderDrift: number;
  }>;
  seams: TownD2SectorSeamReport;
  readyForAssembly: boolean;
}>;

/** Which rebalanced sector owns a local point. The 32 m band is a read-only
 * overlap on the SEAM between neighbours (N≈480, E≈±300), not down the middle
 * of a sector: the central strip E≈0 is D2's own heartland and stays D2. */
export function townD2SectorAt(east: number, north: number): 'A' | 'B' | 'C2' | 'D2' | 'overlap' {
  const { splitNorth, splitEast, overlapWidth } = townD2SectorContract.world;
  const onNorthSeam = Math.abs(north - splitNorth) <= overlapWidth;
  const onWestSeam = Math.abs(east + splitEast) <= overlapWidth;
  const onEastSeam = Math.abs(east - splitEast) <= overlapWidth;
  if (onNorthSeam) return 'overlap';
  if (north < splitNorth) return east < -splitEast ? 'B' : east >= splitEast ? 'C2' : 'A';
  if (onWestSeam || onEastSeam) return 'overlap';
  if (east < -splitEast) return 'B';
  if (east >= splitEast) return 'C2';
  return 'D2';
}

const SEAM_HALF_WIDTH = townD2SectorContract.world.overlapWidth / 2;
const SEAM_SPACING = townD2R30CanonicalSpacing;
/** Interpolation/collision drift allowed between the canonical sampler and the
 * cached collision surface or the rendered near/far vertices. */
const SEAM_DRIFT_LIMIT = 1e-4;
/** Largest height change allowed between two adjacent canonical 8 m stations
 * along one seam line. The measured D2 field tops out at 11.7 m per station on
 * the shoulder cones; anything above this is a shear wall or a hole, which is
 * the "giant coloured slanted wall" defect class. */
const SEAM_MAX_LINE_STEP = 24;

type SeamBandSpec = Readonly<{
  key: TownD2SeamBandKey;
  seam: number;
  /** Axis the seam LINE runs along. */
  axis: 'east' | 'north';
  extent: Readonly<{ min: number; max: number }>;
}>;

const seamBandSpecs: readonly SeamBandSpec[] = [
  {
    key: 'north', seam: townD2SectorContract.world.splitNorth, axis: 'east',
    extent: { min: townD2SectorContract.world.west, max: townD2SectorContract.world.east },
  },
  {
    key: 'west', seam: -townD2SectorContract.world.splitEast, axis: 'north',
    extent: { min: townD2SectorContract.world.splitNorth, max: townD2SectorContract.world.north },
  },
  {
    key: 'east', seam: townD2SectorContract.world.splitEast, axis: 'north',
    extent: { min: townD2SectorContract.world.splitNorth, max: townD2SectorContract.world.north },
  },
];

/** Nearest canonical grid line, so a band edge can be compared where collision
 * is exact rather than inside an interpolated triangle. */
function snapToCanonical(value: number, origin: number) {
  return origin + Math.round((value - origin) / SEAM_SPACING) * SEAM_SPACING;
}

/** True when a local point falls inside one of the read-only 32 m bands. */
function insideSeamBand(east: number, north: number) {
  for (const spec of seamBandSpecs) {
    const along = spec.axis === 'east' ? east : north;
    const across = spec.axis === 'east' ? north : east;
    if (along < spec.extent.min || along > spec.extent.max) continue;
    if (Math.abs(across - spec.seam) <= SEAM_HALF_WIDTH) return true;
  }
  return false;
}

function auditSeamBand(spec: SeamBandSpec, collision: TownD2R30Collision): TownD2SeamBandReport {
  const { min, max } = spec.extent;
  const stations = Math.floor((max - min) / SEAM_SPACING) + 1;
  let unsupported = 0, maxCrossDrift = 0, maxLineStep = 0, previous: number | undefined;
  let lineSamples = 0, sideSamples = 0;
  for (let index = 0; index < stations; index++) {
    const along = Math.min(max, min + index * SEAM_SPACING);
    const east = spec.axis === 'east' ? along : spec.seam;
    const north = spec.axis === 'east' ? spec.seam : along;
    const height = sampleTownD2R30Height(east, north);
    lineSamples++;
    if (height === undefined) {
      unsupported++;
      previous = undefined;
      continue;
    }
    if (previous !== undefined) maxLineStep = Math.max(maxLineStep, Math.abs(height - previous));
    previous = height;
    // Both edges of the read-only band must sit on the one canonical field and
    // on the one cached collision surface the player actually walks. The raw
    // sample catches holes; the snapped sample lands on a canonical grid
    // vertex, where collision is exact by construction and any difference
    // means the cached grid was built from a different height source. (Mid-cell
    // values differ by design: collision interpolates the 8 m rendered
    // triangles, exactly like the mesh the player stands on.)
    for (const offset of [-SEAM_HALF_WIDTH, SEAM_HALF_WIDTH]) {
      const sideEast = spec.axis === 'east' ? east : east + offset;
      const sideNorth = spec.axis === 'east' ? north + offset : north;
      sideSamples++;
      if (sampleTownD2R30Height(sideEast, sideNorth) === undefined ||
          collision.surfaceAt(sideEast, sideNorth) === undefined) {
        unsupported++;
        continue;
      }
      const snappedEast = snapToCanonical(sideEast, mainSummitBounds.west);
      const snappedNorth = snapToCanonical(sideNorth, mainSummitBounds.south);
      const canonical = sampleTownD2R30Height(snappedEast, snappedNorth);
      const surface = collision.surfaceAt(snappedEast, snappedNorth);
      if (canonical === undefined || surface === undefined) {
        unsupported++;
        continue;
      }
      maxCrossDrift = Math.max(maxCrossDrift, Math.abs(surface - canonical));
    }
  }
  return Object.freeze({
    seam: spec.seam,
    axis: spec.axis,
    extent: Object.freeze({ min, max }),
    width: townD2SectorContract.world.overlapWidth,
    lineSamples,
    sideSamples,
    unsupported,
    maxCrossDrift,
    maxLineStep,
  });
}

/**
 * Deep seam audit over the three 32 m read-only bands D2 shares with A, B and
 * C2. It is still a report, not a mount: it proves the canonical surface,
 * the cached cut-face collision and both rendered LOD meshes agree inside the
 * bands, so `readyForSeamAssembly` can be trusted before the real host
 * installs another window's sector.
 */
export function auditTownD2R30Seams(
  options: Readonly<{ collision?: TownD2R30Collision }> = {},
): TownD2SectorSeamReport {
  const owned = options.collision === undefined;
  const collision = options.collision ?? createTownD2R30Collision({
    heightAt: (east, north) => sampleTownD2R30Height(east, north),
  });
  try {
    const bands = {
      north: auditSeamBand(seamBandSpecs[0]!, collision),
      west: auditSeamBand(seamBandSpecs[1]!, collision),
      east: auditSeamBand(seamBandSpecs[2]!, collision),
    };

    // Canonical grid vertices and collision cells inside the bands: no holes.
    const eastAxis = townD2R30GridAxis(mainSummitBounds.west, mainSummitBounds.east, SEAM_SPACING);
    const northAxis = townD2R30GridAxis(mainSummitBounds.south, mainSummitBounds.north, SEAM_SPACING);
    let bandVertices = 0, bandUnsupported = 0, seamCollisionCells = 0, seamCollisionHoles = 0;
    let seamCollisionDrift = 0;
    for (let row = 0; row < northAxis.length; row++) {
      for (let column = 0; column < eastAxis.length; column++) {
        const east = eastAxis[column]!, north = northAxis[row]!;
        if (!insideSeamBand(east, north)) continue;
        bandVertices++;
        const height = sampleTownD2R30Height(east, north);
        if (height === undefined) {
          bandUnsupported++;
          continue;
        }
        const surface = collision.surfaceAt(east, north);
        if (surface === undefined) seamCollisionDrift = Infinity;
        else seamCollisionDrift = Math.max(seamCollisionDrift, Math.abs(surface - height));
      }
    }
    for (let row = 0; row + 1 < northAxis.length; row++) {
      for (let column = 0; column + 1 < eastAxis.length; column++) {
        const west = eastAxis[column]!, east = eastAxis[column + 1]!;
        const south = northAxis[row]!, north = northAxis[row + 1]!;
        const centreEast = (west + east) / 2, centreNorth = (south + north) / 2;
        if (!insideSeamBand(centreEast, centreNorth) && !insideSeamBand(west, south) &&
            !insideSeamBand(east, south) && !insideSeamBand(west, north) &&
            !insideSeamBand(east, north)) continue;
        seamCollisionCells++;
        const corners = [[west, south], [east, south], [west, north], [east, north]] as const;
        if (corners.some(([eastHere, northHere]) => collision.surfaceAt(eastHere, northHere) === undefined)) {
          seamCollisionHoles++;
        }
      }
    }

    // Rendered near tiles that touch a band must sit on the canonical field.
    let nearBandVertices = 0, seamRenderDrift = 0;
    for (const chunk of townD2R30ChunkList) {
      const touchesBand = insideSeamBand(chunk.west, chunk.south) || insideSeamBand(chunk.east, chunk.south) ||
        insideSeamBand(chunk.west, chunk.north) || insideSeamBand(chunk.east, chunk.north) ||
        insideSeamBand(chunk.centreEast, chunk.centreNorth);
      if (!touchesBand) continue;
      const geometry = buildTownD2R30ChunkGeometry(chunk, SEAM_SPACING);
      try {
        const position = geometry.getAttribute('position');
        for (let index = 0; index < position.count; index++) {
          const east = position.getX(index), north = -position.getZ(index);
          if (!insideSeamBand(east, north)) continue;
          const height = sampleTownD2R30Height(east, north);
          nearBandVertices++;
          if (height === undefined) seamRenderDrift = Infinity;
          else seamRenderDrift = Math.max(seamRenderDrift, Math.abs(position.getY(index) - height));
        }
      } finally {
        geometry.dispose();
      }
    }

    // The distant shell must carry the same vertices, not a second skyline.
    let farBandVertices = 0;
    const far = buildR30TownSkyline();
    try {
      const position = far.getAttribute('position');
      const topCount = far.userData.r30TopVertexCount as number;
      for (let index = 0; index < topCount; index++) {
        const east = position.getX(index), north = -position.getZ(index);
        if (!insideSeamBand(east, north)) continue;
        const height = sampleTownD2R30Height(east, north);
        farBandVertices++;
        if (height === undefined) seamRenderDrift = Infinity;
        else seamRenderDrift = Math.max(seamRenderDrift, Math.abs(position.getY(index) - height));
      }
    } finally {
      far.dispose();
    }

    const bandList = [bands.north, bands.west, bands.east];
    const checks = {
      seamElevationAligned: bandList.every(band => band.unsupported === 0) &&
        bandUnsupported === 0 && bandVertices > 0 &&
        bandList.every(band => band.maxLineStep < SEAM_MAX_LINE_STEP),
      seamCollisionCovered: seamCollisionCells > 0 && seamCollisionHoles === 0 &&
        seamCollisionDrift < SEAM_DRIFT_LIMIT &&
        bandList.every(band => band.maxCrossDrift < SEAM_DRIFT_LIMIT),
      seamRenderConsistent: nearBandVertices > 0 && farBandVertices > 0 &&
        seamRenderDrift < SEAM_DRIFT_LIMIT,
    };
    const readyForSeamAssembly = Object.values(checks).every(Boolean);
    return Object.freeze({
      version: 'd2-seam-audit-1.0',
      bands: Object.freeze(bands),
      checks: Object.freeze(checks),
      measurements: Object.freeze({
        bandVertices,
        bandUnsupported,
        seamCollisionCells,
        seamCollisionHoles,
        seamCollisionDrift,
        nearBandVertices,
        farBandVertices,
        seamRenderDrift,
      }),
      readyForSeamAssembly,
    });
  } finally {
    if (owned) collision.dispose();
  }
}

export function resolveTownD2SectorAudit(): TownD2SectorReport {
  const world = townD2SectorContract.world;
  const sector = townD2SectorContract.d2;
  const summit = { east: 50, north: 1000 };

  const far = buildR30TownSkyline();
  let farTopVertices = 0, nearFarMaxDrift = 0;
  try {
    const position = far.getAttribute('position');
    farTopVertices = far.userData.r30TopVertexCount as number;
    for (let index = 0; index < farTopVertices; index++) {
      const east = position.getX(index), north = -position.getZ(index);
      const near = sampleTownD2R30Height(east, north);
      if (near === undefined) { nearFarMaxDrift = Infinity; break; }
      nearFarMaxDrift = Math.max(nearFarMaxDrift, Math.abs(position.getY(index) - near));
    }
  } finally {
    far.dispose();
  }

  const route = auditTownD2R30ReturnRoute();
  const returnPoints = route.metrics.returnPoints;
  const unsupportedReturn = route.metrics.unsupportedReturn;
  const seams = auditTownD2R30Seams();

  const grids = [
    townD2R30Spec.middleSpacing, townD2R30Spec.farSpacing, townD2R30Spec.horizonSpacing,
  ];
  const checks = {
    sectorInsideWorld: sector.west >= world.west && sector.east <= world.east &&
      sector.south >= world.south && sector.north <= world.north,
    sectorAreaMatches: Math.abs(
      (sector.east - sector.west) * (sector.north - sector.south) / 1_000_000 - sector.areaSquareKm,
    ) < .002,
    overlapIsReadOnly: townD2SectorAt(-300, 700) === 'overlap' &&
      townD2SectorAt(300, 700) === 'overlap' &&
      townD2SectorAt(0, 480) === 'overlap' &&
      townD2SectorAt(0, 1000) === 'D2',
    summitInsideSector: summit.east > sector.west && summit.east < sector.east &&
      summit.north > sector.south && summit.north < sector.north,
    northBandInsideSector: townD2SectorAt(0, 1400) === 'D2' &&
      townD2R30SkylineContract.south >= sector.south &&
      townD2R30SkylineContract.north <= sector.north,
    canonicalGridShared: townD2R30CanonicalSpacing === townD2R30Spec.collisionSpacing &&
      townD2R30CanonicalSpacing === townD2R30Spec.nearSpacing &&
      grids.every(spacing => spacing % townD2R30CanonicalSpacing === 0),
    nearFarSameSource: nearFarMaxDrift < 1e-4 &&
      townD2R30SkylineContract.floorHeight === townD2R30Spec.floorHeight,
    returnRouteWalkable: unsupportedReturn === 0 && route.checks.returnContinuous &&
      route.checks.returnExactlyReversed && route.checks.returnAnchorsSupported,
    seamElevationAligned: seams.checks.seamElevationAligned,
    seamCollisionCovered: seams.checks.seamCollisionCovered,
    seamRenderConsistent: seams.checks.seamRenderConsistent,
  };
  const readyForAssembly = Object.values(checks).every(Boolean);
  return Object.freeze({
    version: 'd2-sector-audit-1.1',
    sector: Object.freeze({ ...sector }),
    checks: Object.freeze(checks),
    measurements: Object.freeze({
      farTopVertices,
      nearFarMaxDrift,
      returnPoints,
      unsupportedReturn,
      skylineMinimumY: townD2R30SkylineContract.floorHeight,
      bandVertices: seams.measurements.bandVertices,
      bandUnsupported: seams.measurements.bandUnsupported,
      seamCollisionCells: seams.measurements.seamCollisionCells,
      seamCollisionHoles: seams.measurements.seamCollisionHoles,
      seamCollisionDrift: seams.measurements.seamCollisionDrift,
      nearBandVertices: seams.measurements.nearBandVertices,
      farBandVertices: seams.measurements.farBandVertices,
      seamRenderDrift: seams.measurements.seamRenderDrift,
    }),
    seams,
    readyForAssembly,
  });
}
