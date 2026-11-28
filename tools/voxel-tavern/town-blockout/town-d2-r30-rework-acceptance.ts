import { resolveTownD2SectorAudit, auditTownD2R30Seams } from './town-d2-r30-sector-audit';
import { checkTownD2R30Seam } from './town-d2-r30-seam-check';
import { auditTownD2R30ReturnRoute } from './town-d2-r30-return-route';
import { townD2R30FarLodContract } from './town-d2-r30-far-lod';
import { townD2SectorContract } from './town-d2-r30-sector-audit';
import { townD2R30Spec } from './town-d2-r30-domain';

/**
 * D33-3: one read-only acceptance report that aggregates the D2-side evidence
 * A/总控 need to pair-review the 3.2 rework. It does NOT mount anything, does
 * NOT touch the public viewer/terrain/presence (A's single-writer files), and
 * never claims the mountain is wired into the live game.
 *
 * The report is deliberately honest: geometry/source contracts can be proven
 * here; "the player sees and walks it in the public build" cannot — that is
 * A's mount plus a real two-client play test.
 */
export type TownD2ReworkAcceptance = Readonly<{
  version: string;
  owner: 'D2';
  revision: string;
  domain: Readonly<{
    sector: Readonly<{ west: number; east: number; south: number; north: number; areaSquareKm: number }>;
    worldAnchor: Readonly<{ east: number; north: number }>;
    bounds: typeof townD2SectorContract.world;
    canonicalSpacing: number;
    arrivalHeight: number;
  }>;
  /** Same-source height / collision / render and the 32 m seam bands. */
  terrain: Readonly<{
    sector: ReturnType<typeof resolveTownD2SectorAudit>;
    seams: ReturnType<typeof auditTownD2R30Seams>;
    cloudSwap: ReturnType<typeof checkTownD2R30Seam>;
  }>;
  /** Gate approach + P-3 trail + exact-reverse descent, all on real support. */
  walk: ReturnType<typeof auditTownD2R30ReturnRoute>;
  /** Far LOD is same-source and replaces (never coexists with) the R31 apron. */
  lod: Readonly<{
    levels: readonly { name: string; spacing: number }[];
    far: typeof townD2R30FarLodContract;
  }>;
  lifecycle: Readonly<{
    /** Every source module creates a Group and an idempotent dispose. */
    groupLifecycle: 'create/dispose per module';
    collisionIsSameSource: true;
    streamingDefault: 'static';
  }>;
  checks: Readonly<{
    canonicalFieldShared: boolean;
    seamBandsClean: boolean;
    cloudSwapSupported: boolean;
    roundTripSupported: boolean;
    farLodSameSource: boolean;
    /** Never claimed here: A owns the public mount and presence wiring. */
    publicSceneMounted: false;
    presenceWired: false;
    twoClientVerified: false;
  }>;
  readyForPairReview: boolean;
}>;

/** Aggregate the current D2 source evidence into one immutable report. */
export function resolveTownD2ReworkAcceptance(): TownD2ReworkAcceptance {
  const sector = resolveTownD2SectorAudit();
  const seams = auditTownD2R30Seams();
  const cloudSwap = checkTownD2R30Seam();
  const walk = auditTownD2R30ReturnRoute();

  const checks = Object.freeze({
    canonicalFieldShared: sector.checks.canonicalGridShared === true &&
      sector.checks.nearFarSameSource === true,
    seamBandsClean: seams.readyForSeamAssembly === true &&
      sector.checks.seamElevationAligned === true &&
      sector.checks.seamCollisionCovered === true &&
      sector.checks.seamRenderConsistent === true,
    cloudSwapSupported: cloudSwap.transform.matchesAssembly === true &&
      cloudSwap.transform.roundTripExact === true &&
      cloudSwap.transform.frontRidgeNearArrival === true &&
      cloudSwap.returnAnchors.every(anchor => anchor.supported) &&
      cloudSwap.cloudBand.allInsideBand === true &&
      cloudSwap.collision.coveredBounds === true,
    roundTripSupported: walk.checks.outboundContinuous === true &&
      walk.checks.returnContinuous === true &&
      walk.checks.returnExactlyReversed === true &&
      walk.checks.returnAnchorsSupported === true,
    farLodSameSource: townD2R30FarLodContract.source === 'sampleTownD2R30Height' &&
      townD2R30FarLodContract.replacesR31Apron === true,
    publicSceneMounted: false as const,
    presenceWired: false as const,
    twoClientVerified: false as const,
  });

  const sourceChecks = Object.entries(checks).filter(([key]) =>
    key !== 'publicSceneMounted' && key !== 'presenceWired' && key !== 'twoClientVerified');
  const readyForPairReview = sourceChecks.every(([, value]) => value === true);

  return Object.freeze({
    version: 'd2-rework-acceptance-1.0',
    owner: 'D2' as const,
    revision: 'cfeb6648..d5d8b80b',
    domain: Object.freeze({
      sector: sector.sector,
      worldAnchor: Object.freeze({ ...townD2R30Spec.worldAnchor }),
      bounds: townD2SectorContract.world,
      canonicalSpacing: townD2R30Spec.canonicalSpacing,
      // The canonical arrival floor; same value the assembly and skyline use.
      arrivalHeight: 347,
    }),
    terrain: Object.freeze({ sector, seams, cloudSwap }),
    walk,
    lod: Object.freeze({
      levels: Object.freeze([
        Object.freeze({ name: 'near', spacing: townD2R30Spec.nearSpacing }),
        Object.freeze({ name: 'mid', spacing: townD2R30Spec.middleSpacing }),
        Object.freeze({ name: 'far', spacing: townD2R30Spec.farSpacing }),
        Object.freeze({ name: 'horizon', spacing: townD2R30Spec.horizonSpacing }),
      ]),
      far: townD2R30FarLodContract,
    }),
    lifecycle: Object.freeze({
      groupLifecycle: 'create/dispose per module' as const,
      collisionIsSameSource: true as const,
      streamingDefault: 'static' as const,
    }),
    checks,
    readyForPairReview,
  });
}
