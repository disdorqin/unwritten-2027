import { createSnowWingFlight, type SnowWingLaunch } from '../../../src/shared/snow-wing';

export type GlidePoint = Readonly<{ east: number; north: number; height: number }>;
export type SummitGlideTargetGrade = 'bullseye' | 'inner' | 'outer' | 'outside';
export type SummitGlideTarget = GlidePoint & Readonly<{ id: string }>;
export type SummitGlideTargetResult = Readonly<{
  targetId: string;
  grade: SummitGlideTargetGrade;
  horizontalMetres: number;
  verticalMetres: number;
  touchdown: 'soft' | 'seated';
}>;

export const summitGlideTargetRadii = Object.freeze({ bullseye: 2, inner: 4, outer: 8 });
const finitePoint = (point: GlidePoint) =>
  Number.isFinite(point.east) && Number.isFinite(point.north) && Number.isFinite(point.height);

export function summitGlideTargetTerrainIsSafe(
  target: SummitGlideTarget,
  groundAt: (east: number, north: number) => number | undefined,
) {
  if (!target.id || !finitePoint(target)) return false;
  const center = groundAt(target.east, target.north);
  if (center === undefined || !Number.isFinite(center) || Math.abs(center - target.height) > .15) return false;
  // Keep decorative rings above a snowfield, never float them over an unregistered ravine.
  for (let side = 0; side < 8; side++) {
    const theta = side * Math.PI / 4;
    const floor = groundAt(target.east + 8 * Math.cos(theta), target.north + 8 * Math.sin(theta));
    if (floor === undefined || !Number.isFinite(floor) || Math.abs(floor - center) > .35) return false;
  }
  return true;
}

/**
 * Registered landing target: a view of an authoritative touchdown, not a new
 * movement authority. One flight/session has one settlement; retries return
 * the original result. This reports precision only, never invents scoreboard points.
 */
export function createSummitGlideTargetRun(
  flightId: string,
  target: SummitGlideTarget,
  groundAt: (east: number, north: number) => number | undefined,
) {
  if (!flightId || !summitGlideTargetTerrainIsSafe(target, groundAt)) {
    throw new RangeError('Glide target requires a registered, level snowfield and flight id');
  }
  const fixed = { ...target };
  let settled: SummitGlideTargetResult | undefined;
  return {
    snapshot: () => settled && { ...settled },
    settle(receipt: Readonly<GlidePoint & {
      flightId: string;
      accepted: boolean;
      phase: 'lift-off' | 'flap-assist' | 'glide' | 'settling' | 'landed';
      touchdown: 'soft' | 'seated' | null;
    }>): SummitGlideTargetResult | undefined {
      if (settled) return { ...settled };
      if (receipt.flightId !== flightId || !receipt.accepted || receipt.phase !== 'landed' ||
          (receipt.touchdown !== 'soft' && receipt.touchdown !== 'seated') || !finitePoint(receipt)) return;
      const floor = groundAt(receipt.east, receipt.north);
      if (floor === undefined || !Number.isFinite(floor) || Math.abs(floor - receipt.height) > .15) return;
      const horizontalMetres = Math.hypot(receipt.east - fixed.east, receipt.north - fixed.north);
      settled = {
        targetId: fixed.id,
        grade: horizontalMetres <= summitGlideTargetRadii.bullseye ? 'bullseye' :
          horizontalMetres <= summitGlideTargetRadii.inner ? 'inner' :
            horizontalMetres <= summitGlideTargetRadii.outer ? 'outer' : 'outside',
        horizontalMetres,
        verticalMetres: Math.abs(receipt.height - fixed.height),
        touchdown: receipt.touchdown,
      };
      return { ...settled };
    },
  };
}

/**
 * An isolated F-1 reviewer can place a demonstration target at the neutral
 * flight's *actual* snow touchdown. This is not the official ZD-08 footslope
 * target; the production host must register its own surveyed target and wind.
 */
export function surveySummitGlidePracticeTarget(
  launch: SnowWingLaunch,
  groundAt: (east: number, north: number) => number | undefined,
): SummitGlideTarget | undefined {
  const flight = createSnowWingFlight(groundAt);
  if (!flight.launch(launch)) return;
  for (let frame = 0; frame < 36_000; frame++) {
    const step = flight.advance(1 / 60);
    if (step?.phase === 'landed') {
      const target = { id: 'practice-finish', east: step.east, north: step.north, height: step.height };
      return summitGlideTargetTerrainIsSafe(target, groundAt) ? target : undefined;
    }
  }
}
