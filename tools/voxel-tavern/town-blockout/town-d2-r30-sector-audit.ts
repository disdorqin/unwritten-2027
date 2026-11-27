import { mainSummitBounds } from './main-summit-block';
import {
  sampleTownD2R30Height, townD2R30CanonicalSpacing, townD2R30Spec,
} from './town-d2-r30-domain';
import { townD2CloudTerraceContract } from './town-d2-cloud-terrace-transform';
import { buildR30TownSkyline, townD2R30SkylineContract } from './town-d2-r30-skyline';
import { auditTownD2R30ReturnRoute } from './town-d2-r30-return-route';

/**
 * D2's round-3 host contract for the four-sector assembly.
 *
 * The rebalance order gives each window one quadrant of the same mountain and
 * makes D2 the single owner of the canonical height, grid and domain seam.
 * This module is the machine-checkable statement of that ownership: it
 * publishes the sector bounds, verifies the overlap band is read-only, and
 * audits that the near massif, the distant shell and the return route all
 * consume one height source. Total-control / window A can call it before
 * mounting the four sectors; it never edits shared viewer/terrain files.
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
  }>;
  measurements: Readonly<{
    farTopVertices: number;
    nearFarMaxDrift: number;
    returnPoints: number;
    unsupportedReturn: number;
    skylineMinimumY: number;
  }>;
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
  };
  const readyForAssembly = Object.values(checks).every(Boolean);
  return Object.freeze({
    version: 'd2-sector-audit-1.0',
    sector: Object.freeze({ ...sector }),
    checks: Object.freeze(checks),
    measurements: Object.freeze({
      farTopVertices,
      nearFarMaxDrift,
      returnPoints,
      unsupportedReturn,
      skylineMinimumY: townD2R30SkylineContract.floorHeight,
    }),
    readyForAssembly,
  });
}
