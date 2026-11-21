import {
  sampleSummitGlideRingPlane, type SummitGlideRing,
} from './main-summit-glide-rings';

type Point = Readonly<{ east: number; north: number; height: number }>;
export type SummitGlideRingGrade = 'clean' | 'graze' | 'miss';
export type SummitGlideRingResult = Readonly<{
  ringId: string;
  grade: SummitGlideRingGrade;
  radialMetres: number;
  scoreHalfPoints: number;
  streak: number;
}>;

const finite = (p: Point) =>
  Number.isFinite(p.east) && Number.isFinite(p.north) && Number.isFinite(p.height);

/**
 * Scoring the published ZD-01 surveyed hoops, without changing wing physics.
 * The caller must provide server-accepted positions, the immutable wind-adjusted
 * day's ring layout, and a landing site registered by the host.
 */
export function createSummitGlideRingScore(
  rings: readonly SummitGlideRing[],
  options: { rimBandMetres?: number; maximumStepMetres?: number } = {},
) {
  const band = options.rimBandMetres ?? .6;
  const maxStep = options.maximumStepMetres ?? 8;
  if (!Number.isFinite(band) || band <= 0 || !Number.isFinite(maxStep) || maxStep <= 0 ||
      new Set(rings.map(ring => ring.id)).size !== rings.length ||
      rings.some(ring => !ring.id || !finite(ring) ||
        !Number.isFinite(ring.heading) || !Number.isFinite(ring.radius) || ring.radius <= band)) {
    throw new RangeError('Invalid glide ring scoring course');
  }
  const fixed = rings.map(ring => ({ ...ring }));
  const results: SummitGlideRingResult[] = [];
  let scoreHalfPoints = 0;
  let streak = 0;

  function snapshot() {
    return { nextRing: results.length, ringCount: fixed.length, scoreHalfPoints, streak, results: [...results] };
  }

  return {
    snapshot,
    /**
     * acceptedStep is supplied ONLY by the actual movement authority.
     * Skipped rings are recorded as misses once their forward planes are passed.
     */
    advance(previous: Point, current: Point, acceptedStep: boolean): readonly SummitGlideRingResult[] {
      if (!acceptedStep || !finite(previous) || !finite(current) ||
          Math.hypot(current.east - previous.east, current.north - previous.north,
            current.height - previous.height) > maxStep) return [];
      let lastFraction = -1;
      const thisStep: SummitGlideRingResult[] = [];
      while (results.length < fixed.length) {
        const ring = fixed[results.length]!;
        const hit = sampleSummitGlideRingPlane(ring, previous, current);
        if (!hit || !Number.isFinite(hit.radialMetres) || hit.fraction <= lastFraction) break;
        const grade: SummitGlideRingGrade =
          hit.radialMetres <= ring.radius - band ? 'clean' :
            hit.radialMetres <= ring.radius + band ? 'graze' : 'miss';
        scoreHalfPoints += grade === 'clean' ? 2 : grade === 'graze' ? 1 : 0;
        streak = grade === 'miss' ? 0 : streak + 1;
        const result = { ringId: ring.id, grade, radialMetres: hit.radialMetres, scoreHalfPoints, streak };
        results.push(result);
        thisStep.push(result);
        lastFraction = hit.fraction;
      }
      return thisStep;
    },
    /** Landing precision is measured separately; scoring weights remain the host's policy. */
    landingError(landing: Point, registeredTarget: Point, acceptedTouchdown: boolean) {
      if (!acceptedTouchdown || !finite(landing) || !finite(registeredTarget)) return;
      return {
        horizontalMetres: Math.hypot(landing.east - registeredTarget.east,
          landing.north - registeredTarget.north),
        verticalMetres: Math.abs(landing.height - registeredTarget.height),
      };
    },
  };
}
