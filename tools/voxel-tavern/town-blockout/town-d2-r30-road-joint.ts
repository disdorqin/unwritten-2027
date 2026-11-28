import { c2EastRoadHandoffs, type RoadHandoff } from './town-night-c2-summit-road-handoff';
import { townD2R30Spec } from './town-d2-r30-domain';
import type { MainSummitTrailPoint } from './main-summit-trail';

/**
 * D32-P1 #8: the real joint between the central switchback road and C2's
 * single east-sector centreline.
 *
 * C2 owns the centreline and publishes read-only handoff endpoints
 * (town-night-c2-summit-road-handoff). D2 owns the central spiral (the P-3
 * trail survey) and its cut/fill support. A joint is real only when the
 * handoff endpoint lands on the canonical trail *and* the walking surface
 * between the two is supported and passable — a shared number in a document
 * is not a road.
 *
 * Nothing here draws a second alignment or moves C2's line: it measures the
 * actual gap on the canonical field and refuses to call a 190 m gap a joint.
 */

export type RoadJointReport = Readonly<{
  id: string;
  world: Readonly<{ east: number; north: number }>;
  local: Readonly<{ east: number; north: number }>;
  /** Nearest canonical trail station and how far the handoff misses it. */
  station: number;
  gapMetres: number;
  stationHeight: number;
  /** Walked samples between the handoff endpoint and that station. */
  samples: number;
  unsupported: number;
  obstructed: number;
  maxStep: number;
  /** A joint needs a real gap (<= 2 m) and a walkable connection. */
  joined: boolean;
  reason?: 'no-gap' | 'unsupported' | 'obstructed' | 'too-steep';
}>;

export type RoadJointSummary = Readonly<{
  version: string;
  handoffs: number;
  joined: readonly string[];
  open: readonly string[];
  reports: readonly RoadJointReport[];
  /** True only when every C2 handoff lands on the canonical central spiral. */
  allJoined: boolean;
}>;

const JOINT_GAP = 2;
const MAX_STEP = .45;

export function certifyRoadJoint(options: Readonly<{
  trail: readonly MainSummitTrailPoint[];
  supportAt(east: number, north: number): number | undefined;
  blocked(east: number, north: number, height: number, radius?: number, bodyHeight?: number): boolean;
  handoffs?: readonly RoadHandoff[];
}>): RoadJointSummary {
  const { trail } = options;
  if (!Array.isArray(trail) || trail.length < 2) throw new RangeError('Road joint needs the canonical trail survey.');
  const anchor = townD2R30Spec.worldAnchor;
  const handoffs = options.handoffs ?? c2EastRoadHandoffs;

  const reports = handoffs.map(handoff => {
    // The handoff is authored in world metres; the trail lives in summit-local.
    const local = { east: handoff.to.east - anchor.east, north: handoff.to.north - anchor.north };
    let station = 0, gap = Infinity;
    trail.forEach((point, index) => {
      const distance = Math.hypot(point.east - local.east, point.north - local.north);
      if (distance < gap) { gap = distance; station = index; }
    });
    const start = trail[station]!;
    let samples = 0, unsupported = 0, obstructed = 0, maxStep = 0;
    const length = Math.hypot(start.east - local.east, start.north - local.north);
    const steps = Math.max(1, Math.ceil(length / .5));
    let previous: number | undefined;
    for (let index = 0; index <= steps; index++) {
      const weight = index / steps;
      const east = local.east + (start.east - local.east) * weight;
      const north = local.north + (start.north - local.north) * weight;
      samples++;
      const support = options.supportAt(east, north);
      if (support === undefined) { unsupported++; previous = undefined; continue; }
      if (previous !== undefined) maxStep = Math.max(maxStep, Math.abs(support - previous));
      previous = support;
      if (options.blocked(east, north, support)) obstructed++;
    }
    const reason: RoadJointReport['reason'] =
      gap > JOINT_GAP ? 'no-gap'
        : unsupported > 0 ? 'unsupported'
          : obstructed > 0 ? 'obstructed'
            : maxStep > MAX_STEP ? 'too-steep'
              : undefined;
    return Object.freeze({
      id: handoff.id,
      world: Object.freeze({ east: handoff.to.east, north: handoff.to.north }),
      local: Object.freeze(local),
      station,
      gapMetres: gap,
      stationHeight: start.height,
      samples,
      unsupported,
      obstructed,
      maxStep,
      joined: reason === undefined,
      ...(reason === undefined ? {} : { reason }),
    });
  });

  const joined = reports.filter(report => report.joined).map(report => report.id);
  return Object.freeze({
    version: 'd2-road-joint-1.0',
    handoffs: reports.length,
    joined: Object.freeze(joined),
    open: Object.freeze(reports.filter(report => !report.joined).map(report => report.id)),
    reports: Object.freeze(reports),
    allJoined: joined.length === reports.length,
  });
}
