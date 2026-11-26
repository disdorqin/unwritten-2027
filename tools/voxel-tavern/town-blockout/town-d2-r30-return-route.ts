import {
  createMainSummitBlock, mainSummitBounds, mainSummitLayout, mainSummitSpec,
} from './main-summit-block';
import { createMainSummitTrail, mainSummitTrailSpec } from './main-summit-trail';
import { createTownD2R30Collision, type TownD2R30Collision } from './town-d2-r30-collision';
import { sampleTownD2R30Height, townD2R30Spec } from './town-d2-r30-domain';
import { createTownD2R30Ropeway } from './town-d2-r30-ropeway';
import {
  resolveTownD2CloudTerraceTransform, townD2CloudTerraceContract,
} from './town-d2-cloud-terrace-transform';

export type TownD2R30ReturnRouteOptions = Readonly<{
  arrivalHeight?: number;
  heightAt?: (east: number, north: number) => number | undefined;
  collisionSpacing?: number;
}>;

export type TownD2R30ReturnRouteDomain = 'summit' | 'front-ridge';
export type TownD2R30ReturnRoutePoint = Readonly<{
  east: number;
  north: number;
  height: number;
  domain: TownD2R30ReturnRouteDomain;
}>;
export type TownD2R30ReturnRouteAnchor = Readonly<{
  id: string;
  east: number;
  north: number;
  height: number;
  domain: TownD2R30ReturnRouteDomain;
  supported: boolean;
}>;

export type TownD2R30ReturnRouteReport = Readonly<{
  route: Readonly<{
    outbound: readonly TownD2R30ReturnRoutePoint[];
    return: readonly TownD2R30ReturnRoutePoint[];
    seam: Readonly<{
      version: string;
      east: number;
      north: number;
      height: number;
      domain: 'domain-swap';
      supported: boolean;
    }>;
    anchors: readonly TownD2R30ReturnRouteAnchor[];
  }>;
  metrics: Readonly<{
    outboundPoints: number;
    returnPoints: number;
    walkSamples: number;
    unsupportedOutbound: number;
    unsupportedReturn: number;
    /** Largest 3D distance between adjacent published route points. */
    maxStep: number;
    maxGrade: number;
    /** Largest absolute difference between authoritative tread and natural R30 ground. */
    maxSurfaceDrift: number;
  }>;
  checks: Readonly<{
    arrivalHeightSupported: boolean;
    outboundContinuous: boolean;
    returnContinuous: boolean;
    returnExactlyReversed: boolean;
    stepWithinCanonical: boolean;
    gradeWithinCanonical: boolean;
    surfaceDriftFinite: boolean;
    seamSupported: boolean;
    returnAnchorsSupported: boolean;
    transformCanonical: boolean;
    /** A owns the public presence path; this audit cannot wire it. */
    presenceWired: false;
  }>;
  productionReady: false;
}>;

const SUPPORT_TOLERANCE_METRES = .05;
const NUMERIC_TOLERANCE = 1e-9;
const MAX_WALK_STEP = 1;
const FOOT_RADIUS = .27;

type DomainPoint = { east: number; north: number; height: number };
type SegmentKind = 'gate-approach' | 'trail-surface' | 'trail-walkway';
type SampledRoutePoint = { point: DomainPoint; kind: SegmentKind };
type SegmentSample = {
  supported: boolean;
  supportDrift: number;
  surfaceDrift: number;
};

function requiredHeight(height: number | undefined, east: number, north: number): number {
  if (height === undefined || !Number.isFinite(height)) {
    throw new RangeError(`The D2-R30 return route has missing height at E${east}, N${north}.`);
  }
  return height;
}

function routePoint(point: DomainPoint): TownD2R30ReturnRoutePoint {
  return Object.freeze({
    east: point.east,
    north: point.north,
    height: point.height,
    domain: point.north < mainSummitBounds.south ? 'front-ridge' : 'summit',
  });
}

function maximumStep(points: readonly DomainPoint[]) {
  let maximum = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!, to = points[index]!;
    maximum = Math.max(maximum, Math.hypot(
      to.east - from.east, to.north - from.north, to.height - from.height,
    ));
  }
  return maximum;
}

function resampleRoute(segments: readonly { from: DomainPoint; to: DomainPoint; kind: SegmentKind }[]) {
  const sampled: SampledRoutePoint[] = [];
  for (const segment of segments) {
    const length = Math.hypot(
      segment.to.east - segment.from.east,
      segment.to.north - segment.from.north,
      segment.to.height - segment.from.height,
    );
    if (length <= NUMERIC_TOLERANCE) continue;
    const steps = Math.ceil(length / MAX_WALK_STEP);
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps;
      sampled.push({
        kind: segment.kind,
        point: {
          east: segment.from.east + (segment.to.east - segment.from.east) * fraction,
          north: segment.from.north + (segment.to.north - segment.from.north) * fraction,
          height: segment.from.height + (segment.to.height - segment.from.height) * fraction,
        },
      });
    }
  }
  const last = segments.at(-1);
  if (last) sampled.push({ point: { ...last.to }, kind: last.kind });
  return sampled;
}

/**
 * Audits the canonical gate approach plus P-3 trail and its exact reverse.
 * All emitted coordinates are summit-local E/N/Y; front-ridge points retain
 * their domain label. R30 collision is queried only for natural-ground drift,
 * never as a substitute for the station/trail support samplers.
 *
 * The function owns and releases its temporary ropeway and collision objects
 * in `finally`; the returned value is immutable data with no live state.
 */
export function auditTownD2R30ReturnRoute(
  options: TownD2R30ReturnRouteOptions = {},
): TownD2R30ReturnRouteReport {
  const arrivalHeight = options.arrivalHeight ?? townD2CloudTerraceContract.arrivalHeight;
  const collisionSpacing = options.collisionSpacing ?? townD2R30Spec.collisionSpacing;
  if (!Number.isFinite(arrivalHeight) || arrivalHeight < mainSummitSpec.frontRidgeArrivalBand[0] ||
      arrivalHeight > mainSummitSpec.frontRidgeArrivalBand[1]) {
    throw new RangeError('D2-R30 return route needs the surveyed 347–350 m arrival height.');
  }
  if (!Number.isFinite(collisionSpacing) || collisionSpacing <= 0) {
    throw new RangeError('Invalid D2-R30 return-route collision spacing.');
  }
  const heightAt = options.heightAt ?? ((east: number, north: number) =>
    sampleTownD2R30Height(east, north, arrivalHeight));
  const transform = resolveTownD2CloudTerraceTransform();
  const ropeway = createTownD2R30Ropeway({ arrivalHeight, heightAt });
  let collision: TownD2R30Collision | undefined;

  try {
    // P-3 is surveyed against the canonical P-1 block, exactly as the assembly
    // mounts it. The noisier R30 field is natural ground for drift reporting;
    // feeding it back into the trail survey would create a parallel route.
    const trail = (() => {
      const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
      try {
        return createMainSummitTrail(block.heightAt, arrivalHeight);
      } finally {
        block.dispose();
      }
    })();
    collision = createTownD2R30Collision({ arrivalHeight, heightAt, spacing: collisionSpacing });
    const stationHeightAt = ropeway.stations.heightAt;

    // The station owns the approach coordinates and the front-ridge/summit
    // height selection. Re-sample every published approach point instead of
    // copying a second apron formula into this audit.
    const approach = ropeway.stations.gate.route.map(point => ({
      east: point.east,
      north: point.north,
      height: requiredHeight(stationHeightAt(point.east, point.north), point.east, point.north),
    }));
    if (approach.length < 2) throw new RangeError('The canonical gate approach has no walkable segments.');
    const sourcePoints = [
      ...approach,
      // The first surveyed trail section is the canonical plaza approach. The
      // walkway sampler intentionally excludes it; sampleSurface covers that
      // join, and sampleWalkwaySurface audits every later section.
      ...trail.points.slice(1),
    ];
    const segments = sourcePoints.slice(1).map((point, index) => {
      const segmentIndex = index;
      const kind: SegmentKind = segmentIndex < approach.length - 1 ? 'gate-approach'
        : segmentIndex === approach.length - 1 ? 'trail-surface' : 'trail-walkway';
      return { from: sourcePoints[segmentIndex]!, to: point, kind };
    });
    const sampled = resampleRoute(segments);
    if (sampled.length < 2) throw new RangeError('The canonical return route has no walkable segments.');
    const outbound = sampled.map(item => routePoint(item.point));
    const returning = [...outbound].reverse();

    function samplePoint(point: DomainPoint, kind: SegmentKind): SegmentSample {
      let support: number | undefined;
      let supportDrift = 0;
      if (kind === 'gate-approach') {
        support = stationHeightAt(point.east, point.north);
      } else {
        const surface = trail.sampleSurface(point.east, point.north);
        const walkway = kind === 'trail-walkway'
          ? trail.sampleWalkwaySurface(point.east, point.north, FOOT_RADIUS)
          : surface;
        if (surface !== undefined && Number.isFinite(surface)) {
          supportDrift = Math.max(supportDrift, Math.abs(surface - point.height));
        }
        if (walkway !== undefined && Number.isFinite(walkway)) {
          supportDrift = Math.max(supportDrift, Math.abs(walkway - point.height));
        }
        support = surface !== undefined && Number.isFinite(surface) &&
          walkway !== undefined && Number.isFinite(walkway) ? surface : undefined;
      }
      const supported = support !== undefined && Number.isFinite(support);
      if (support !== undefined && Number.isFinite(support) && kind === 'gate-approach') {
        supportDrift = Math.abs(support - point.height);
      }

      // Natural terrain can be far below a cut or above a fill. That is useful
      // evidence, but it must not change the authoritative support result.
      const natural = point.north >= mainSummitBounds.south
        ? collision!.surfaceAt(point.east, point.north)
        : undefined;
      if (point.north >= mainSummitBounds.south &&
          (natural === undefined || !Number.isFinite(natural))) {
        throw new RangeError(`The D2-R30 return route has missing natural ground at E${point.east}, N${point.north}.`);
      }
      return {
        supported,
        supportDrift,
        surfaceDrift: support !== undefined && Number.isFinite(support) &&
          natural !== undefined && Number.isFinite(natural)
          ? Math.abs(support - natural)
          : 0,
      };
    }

    function auditDirection(points: readonly SampledRoutePoint[], reverse: boolean) {
      let unsupported = 0;
      let maxSupportDrift = 0;
      let maxSurfaceDrift = 0;
      let walkSamples = 0;
      for (let index = 0; index < points.length; index++) {
        const source = reverse ? points[points.length - index - 1]! : points[index]!;
        const sample = samplePoint(source.point, source.kind);
        walkSamples++;
        if (!sample.supported) unsupported++;
        maxSupportDrift = Math.max(maxSupportDrift, sample.supportDrift);
        maxSurfaceDrift = Math.max(maxSurfaceDrift, sample.surfaceDrift);
      }
      return { unsupported, maxSupportDrift, maxSurfaceDrift, walkSamples };
    }

    const outboundAudit = auditDirection(sampled, false);
    const returnAudit = auditDirection(sampled, true);
    const sampledPoints = sampled.map(item => item.point);
    const maxStep = maximumStep(sampledPoints);
    let maxGrade = 0;
    for (let index = 1; index < sampledPoints.length; index++) {
      const from = sampledPoints[index - 1]!, to = sampledPoints[index]!;
      const horizontal = Math.hypot(to.east - from.east, to.north - from.north);
      maxGrade = Math.max(maxGrade, horizontal === 0
        ? Math.abs(to.height - from.height) === 0 ? 0 : Infinity
        : Math.abs(to.height - from.height) / horizontal);
    }
    const maxSurfaceDrift = Math.max(outboundAudit.maxSurfaceDrift, returnAudit.maxSurfaceDrift);

    const seamHeight = requiredHeight(
      stationHeightAt(townD2CloudTerraceContract.apronLocal.east, townD2CloudTerraceContract.seamNorthLocal),
      townD2CloudTerraceContract.apronLocal.east, townD2CloudTerraceContract.seamNorthLocal,
    );
    const seamSupported = Number.isFinite(seamHeight) && transform.swap.stepInsideBand &&
      transform.footprint.apronContinuous;
    const anchors = transform.returnAnchors.map(anchor => {
      const height = anchor.domain === 'summit'
        ? requiredHeight(heightAt(anchor.local.east, anchor.local.north), anchor.local.east, anchor.local.north)
        : anchor.height;
      return Object.freeze({
        id: anchor.id,
        east: anchor.local.east,
        north: anchor.local.north,
        height,
        domain: anchor.domain,
        supported: anchor.supported && Number.isFinite(height),
      });
    });
    const arrivalGround = stationHeightAt(0, mainSummitBounds.south);
    const arrivalHeightSupported = arrivalGround !== undefined && Number.isFinite(arrivalGround) &&
      Math.abs(arrivalGround - arrivalHeight) <= NUMERIC_TOLERANCE;
    const returnExactlyReversed = outbound.length === returning.length && outbound.every((point, index) => {
      const other = returning[returning.length - index - 1]!;
      return point.east === other.east && point.north === other.north &&
        point.height === other.height && point.domain === other.domain;
    });
    const transformCanonical = transform.anchor.matchesAssembly && transform.anchor.matchesR30 &&
      transform.terrace.roundTripExact && transform.swap.stepInsideBand &&
      transform.footprint.apronContinuous;
    const outboundContinuous = outboundAudit.unsupported === 0 &&
      outboundAudit.maxSupportDrift <= SUPPORT_TOLERANCE_METRES;
    const returnContinuous = returnAudit.unsupported === 0 &&
      returnAudit.maxSupportDrift <= SUPPORT_TOLERANCE_METRES;

    return Object.freeze({
      route: Object.freeze({
        outbound: Object.freeze(outbound),
        return: Object.freeze(returning),
        seam: Object.freeze({
          version: townD2CloudTerraceContract.version,
          east: townD2CloudTerraceContract.apronLocal.east,
          north: townD2CloudTerraceContract.seamNorthLocal,
          height: seamHeight,
          domain: 'domain-swap' as const,
          supported: seamSupported,
        }),
        anchors: Object.freeze(anchors),
      }),
      metrics: Object.freeze({
        outboundPoints: outbound.length,
        returnPoints: returning.length,
        walkSamples: outboundAudit.walkSamples + returnAudit.walkSamples,
        unsupportedOutbound: outboundAudit.unsupported,
        unsupportedReturn: returnAudit.unsupported,
        maxStep,
        maxGrade,
        maxSurfaceDrift,
      }),
      checks: Object.freeze({
        arrivalHeightSupported,
        outboundContinuous,
        returnContinuous,
        returnExactlyReversed,
        stepWithinCanonical: Number.isFinite(maxStep) && maxStep <= MAX_WALK_STEP + NUMERIC_TOLERANCE,
        gradeWithinCanonical: Number.isFinite(maxGrade) && maxGrade <= trail.metrics.maxGrade + NUMERIC_TOLERANCE &&
          maxGrade <= mainSummitTrailSpec.maximumGrade + NUMERIC_TOLERANCE,
        surfaceDriftFinite: Number.isFinite(maxSurfaceDrift),
        seamSupported,
        returnAnchorsSupported: anchors.length > 0 && anchors.every(anchor => anchor.supported),
        transformCanonical,
        presenceWired: false as const,
      }),
      productionReady: false as const,
    });
  } finally {
    collision?.dispose();
    ropeway.dispose();
  }
}
