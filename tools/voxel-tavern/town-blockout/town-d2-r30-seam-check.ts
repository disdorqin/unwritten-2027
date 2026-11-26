import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30ChunkList,
  townD2R30LocalPoint, townD2R30Spec, townD2R30SurfaceBand, townD2R30WorldPoint,
} from './town-d2-r30-domain';
import { mainSummitBounds, mainSummitSpec } from './main-summit-block';
import { summitAssemblyAnchor } from './main-summit-assembly';
import { northRidgeSummit } from './north-ridge-350-terrain';

/**
 * D2-R04 seam contract + return-route audit for the R30 main summit domain.
 * The canonical transition is a domain swap at the cloud terrace (the player
 * "wakes" into the summit domain), not a continuous terrain stitch; the seam
 * is therefore the world-transform anchor and supported return anchors. This
 * is a runnable, evidence-producing check for pairing review — it changes no
 * geometry, terrain, collision or viewer state.
 */
export type TownD2R30SeamReport = Readonly<{
  transform: Readonly<{
    anchor: Readonly<{ east: number; north: number }>;
    matchesAssembly: boolean;
    frontRidgeLocal: Readonly<{ east: number; north: number }>;
    frontRidgeNearArrival: boolean;
    roundTripExact: boolean;
  }>;
  returnAnchors: readonly Readonly<{
    id: string;
    local: Readonly<{ east: number; north: number }>;
    world: Readonly<{ east: number; north: number }>;
    height: number;
    supported: boolean;
  }>[];
  cloudBand: Readonly<{
    bottom: number;
    top: number;
    probes: readonly number[];
    allInsideBand: boolean;
    terrainBands: readonly string[];
  }>;
  collision: Readonly<{
    coveredBounds: boolean;
    chunkCount: number;
    spacing: number;
  }>;
}>;

const RETURN_ANCHORS = Object.freeze([
  { id: 'gate', east: 0, north: -10 },
  { id: 'cloud-terrace-station', east: -1, north: 6.25 },
  { id: 'south-pass', east: townD2R30Anchors.southPass.east, north: townD2R30Anchors.southPass.north },
  { id: 'summit', east: townD2R30Anchors.summit.east, north: townD2R30Anchors.summit.north },
] as const);

export function checkTownD2R30Seam(): TownD2R30SeamReport {
  const anchor = townD2R30Spec.worldAnchor;
  const matchesAssembly = anchor.east === summitAssemblyAnchor.east && anchor.north === summitAssemblyAnchor.north;
  // Front-ridge cloud terrace (320,650) expressed in summit-local frame.
  const frontRidgeLocal = townD2R30LocalPoint({
    east: northRidgeSummit.east, north: northRidgeSummit.north, height: northRidgeSummit.height,
  });
  const frontRidgeNearArrival =
    frontRidgeLocal.east >= mainSummitBounds.west && frontRidgeLocal.east <= mainSummitBounds.east &&
    frontRidgeLocal.north >= mainSummitBounds.south - 40 && frontRidgeLocal.north <= mainSummitBounds.south + 120;

  let roundTripExact = true;
  for (const probe of [{ east: 0, north: -10 }, { east: 200, north: 500 }, { east: -700, north: 1200 }]) {
    const world = townD2R30WorldPoint({ ...probe, height: 0 });
    const back = townD2R30LocalPoint(world);
    if (back.east !== probe.east || back.north !== probe.north) roundTripExact = false;
  }

  const returnAnchors = RETURN_ANCHORS.map(point => {
    const world = townD2R30WorldPoint({ ...point, height: 0 });
    const height = sampleTownD2R30Height(point.east, point.north);
    return Object.freeze({
      id: point.id,
      local: Object.freeze({ east: point.east, north: point.north }),
      world: Object.freeze({ east: world.east, north: world.north }),
      height: height ?? NaN,
      supported: height !== undefined,
    });
  });

  const [bottom, top] = mainSummitSpec.cloudBand;
  const probes = [bottom + 10, (bottom + top) / 2, top - 10];
  const terrainBands = probes.map(height => {
    // Representative surface band at a real point on the massif whose sampled
    // height is closest to this cloud-band elevation.
    let best: string = townD2R30SurfaceBand(0, 300);
    let bestDistance = Infinity;
    for (let north = 0; north <= 1700; north += 50) {
      const band = townD2R30SurfaceBand(0, north);
      const sampled = sampleTownD2R30Height(0, north);
      if (sampled === undefined) continue;
      const distance = Math.abs(sampled - height);
      if (distance < bestDistance) { bestDistance = distance; best = band; }
    }
    return best;
  });

  const area = townD2R30ChunkList.reduce((sum, chunk) =>
    sum + (chunk.east - chunk.west) * (chunk.north - chunk.south), 0);
  const coveredBounds = area === mainSummitSpec.width * mainSummitSpec.depth && townD2R30ChunkList.length > 0;

  return Object.freeze({
    transform: Object.freeze({
      anchor: { ...anchor }, matchesAssembly,
      frontRidgeLocal: Object.freeze({ east: frontRidgeLocal.east, north: frontRidgeLocal.north }),
      frontRidgeNearArrival, roundTripExact,
    }),
    returnAnchors: Object.freeze(returnAnchors),
    cloudBand: Object.freeze({
      bottom, top,
      probes: Object.freeze(probes),
      allInsideBand: probes.every(height => height >= bottom && height <= top),
      terrainBands: Object.freeze(terrainBands),
    }),
    collision: Object.freeze({
      coveredBounds, chunkCount: townD2R30ChunkList.length, spacing: townD2R30Spec.collisionSpacing,
    }),
  });
}
