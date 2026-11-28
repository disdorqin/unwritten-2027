import { c2EastRoadHandoffs, type RoadHandoff } from './town-night-c2-summit-road-handoff';
import { townD2R30Spec } from './town-d2-r30-domain';
import { townD2SectorAt } from './town-d2-r30-sector-audit';
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
  /** Which sector owns the ground this endpoint needs, so the gap is assigned
   * to a window instead of floating between all four. */
  sector: 'A' | 'B' | 'C2' | 'D2' | 'overlap';
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
  excludedFront:readonly string[];
  joined: readonly string[];
  open: readonly string[];
  /** Handoffs the owner of `sector` still has to build to, per sector. */
  bySector: Readonly<Record<string, readonly string[]>>;
  reports: readonly RoadJointReport[];
  /** True only when every C2 handoff lands on the canonical central spiral. */
  allJoined: boolean;
}>;

const JOINT_GAP = 2;
const MAX_STEP = .45;

export type ConnectorSurvey = Readonly<{
  id: string;
  ok: boolean;
  from: Readonly<{ east: number; north: number }>;
  to: Readonly<{ east: number; north: number }>;
  lengthMetres: number;
  maxGrade: number;
  /** Height difference the connector has to absorb between the two ends. */
  heightDelta: number;
  /** Shortest legal ramp that can absorb it at the 12 % design limit; a
   * straight line shorter than this is a staircase, not a road. */
  requiredRampMetres: number;
  cutMetres: number;
  fillMetres: number;
  widthClear: boolean;
  unsupported: number;
  obstructed: number;
  reason?: 'no-ground' | 'grade' | 'obstructed' | 'width';
}>;

/**
 * Survey a connector candidate between a C2 handoff endpoint and the nearest
 * canonical spiral station, and hand the numbers to the sector owner.
 *
 * This builds nothing: it measures whether a legal path exists (<= 12 %,
 * 2.5 m clear, real ground) so the owning window can adopt or reject a real
 * alignment instead of starting from a gap in metres.
 */
export function surveyRoadConnector(options: Readonly<{
  trail: readonly MainSummitTrailPoint[];
  supportAt(east: number, north: number): number | undefined;
  blocked(east: number, north: number, height: number, radius?: number, bodyHeight?: number): boolean;
  handoff: RoadHandoff;
  /** Half-width of the legal corridor the survey must keep clear. */
  halfWidth?: number;
  maxGrade?: number;
}>): ConnectorSurvey {
  if(options.handoff.domain!=='summit')throw Error('Front-ridge road handoff must be surveyed on front ground, not rear summit');
  const anchor = townD2R30Spec.worldAnchor;
  const halfWidth = options.halfWidth ?? 1.25;
  const maxGrade = options.maxGrade ?? .12;
  const local = {
    east: options.handoff.to.east - anchor.east,
    north: options.handoff.to.north - anchor.north,
  };
  let station = 0, gap = Infinity;
  options.trail.forEach((point, index) => {
    const distance = Math.hypot(point.east - local.east, point.north - local.north);
    if (distance < gap) { gap = distance; station = index; }
  });
  const target = options.trail[station]!;
  const eastDelta = target.east - local.east, northDelta = target.north - local.north;
  const lengthMetres = Math.hypot(eastDelta, northDelta);
  const length = Math.max(1, lengthMetres);
  const unitEast = eastDelta / length, unitNorth = northDelta / length;
  const steps = Math.max(1, Math.ceil(lengthMetres));
  let maxGradeSeen = 0, cutMetres = 0, fillMetres = 0, unsupported = 0, obstructed = 0;
  let firstHeight: number | undefined, lastHeight: number | undefined;
  let widthClear = true, previous: number | undefined;
  for (let index = 0; index <= steps; index++) {
    const along = Math.min(lengthMetres, index * (lengthMetres / steps));
    const east = local.east + unitEast * along;
    const north = local.north + unitNorth * along;
    const support = options.supportAt(east, north);
    if (support === undefined) { unsupported++; previous = undefined; continue; }
    if (previous !== undefined && along > 0) {
      maxGradeSeen = Math.max(maxGradeSeen, Math.abs(support - previous) / (lengthMetres / steps));
    }
    previous = support;
    if (firstHeight === undefined) firstHeight = support;
    lastHeight = support;
    // Both shoulders must be walkable: a 2.5 m road that clips a wall is not a road.
    for (const side of [-halfWidth, 0, halfWidth]) {
      const shoulderEast = east - unitNorth * side, shoulderNorth = north + unitEast * side;
      const shoulder = options.supportAt(shoulderEast, shoulderNorth);
      if (shoulder === undefined) { widthClear = false; continue; }
      if (shoulder > support + .45) cutMetres = Math.max(cutMetres, shoulder - support);
      if (shoulder < support - .45) fillMetres = Math.max(fillMetres, support - shoulder);
      if (options.blocked(shoulderEast, shoulderNorth, Math.max(shoulder, support))) widthClear = false;
    }
    // The centreline walk itself must be clear.
    if (options.blocked(east, north, support)) obstructed++;
  }
  const heightDelta = firstHeight === undefined || lastHeight === undefined
    ? 0 : Math.abs(lastHeight - firstHeight);
  const reason: ConnectorSurvey['reason'] =
    unsupported > 0 ? 'no-ground'
      : maxGradeSeen > maxGrade ? 'grade'
        : obstructed > 0 ? 'obstructed'
          : !widthClear ? 'width'
            : undefined;
  return Object.freeze({
    id: options.handoff.id,
    ok: reason === undefined,
    from: Object.freeze({ ...local }),
    to: Object.freeze({ east: target.east, north: target.north }),
    lengthMetres,
    maxGrade: maxGradeSeen,
    heightDelta,
    requiredRampMetres: heightDelta / maxGrade,
    cutMetres,
    fillMetres,
    widthClear,
    unsupported,
    obstructed,
    ...(reason === undefined ? {} : { reason }),
  });
}

export function certifyRoadJoint(options: Readonly<{
  trail: readonly MainSummitTrailPoint[];
  supportAt(east: number, north: number): number | undefined;
  blocked(east: number, north: number, height: number, radius?: number, bodyHeight?: number): boolean;
  handoffs?: readonly RoadHandoff[];
}>): RoadJointSummary {
  const { trail } = options;
  if (!Array.isArray(trail) || trail.length < 2) throw new RangeError('Road joint needs the canonical trail survey.');
  const anchor = townD2R30Spec.worldAnchor;
  const supplied=options.handoffs??c2EastRoadHandoffs;
  const handoffs=supplied.filter(h=>h.domain==='summit');
  const excludedFront=supplied.filter(h=>h.domain!=='summit').map(h=>h.id);

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
      sector: townD2SectorAt(local.east, local.north),
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
  const bySector: Record<string, string[]> = {};
  for (const report of reports) {
    if (report.joined) continue;
    (bySector[report.sector] ??= []).push(report.id);
  }
  return Object.freeze({
    version: 'd2-road-joint-1.0',
    handoffs: reports.length,
    excludedFront:Object.freeze(excludedFront),
    joined: Object.freeze(joined),
    open: Object.freeze(reports.filter(report => !report.joined).map(report => report.id)),
    bySector: Object.freeze(Object.fromEntries(
      Object.entries(bySector).map(([sector, ids]) => [sector, Object.freeze(ids)]))),
    reports: Object.freeze(reports),
    allJoined: reports.length>0&&joined.length === reports.length,
  });
}
