/**
 * C2 cross-sector road centreline contract (2026-11-27 four-sector sprint).
 *
 * The east-sector owner keeps the single road centreline. A/B/D2 own their
 * own physical road segments inside their sectors; they consume these read-
 * only handoff points instead of re-surveying a second alignment. Nothing in
 * this file draws geometry, installs a ground patch, claims an anchor, or
 * writes terrain. It only restates endpoints already authored in the C2
 * modules `town-d-r30-upper-roadbed` and `town-d-r30-rear-connector`.
 */

import {
  lowerEastServiceControls, lowerEastServiceTerminal,
  middleEastNorthControls, middleSouthRoadControls,
} from './town-d-r30-upper-roadbed.js';
import { rearConnectorControls } from './town-d-r30-rear-connector.js';

export type RoadHandoff = Readonly<{
  id: string;
  owner: 'C2';
  from: Readonly<{ east: number; north: number }>;
  to: Readonly<{ east: number; north: number }>;
  // Unit tangent at each end, from the authored control polyline.
  tangentFrom: Readonly<{ east: number; north: number }>;
  tangentTo: Readonly<{ east: number; north: number }>;
  halfWidth: number;
  maxGrade: number;
  // A consumer must build in its own sector and converge through the seam.
  sharedBoundary: number;
  status: 'authored-centreline-only';
}>;

const first = (points: readonly { east: number; north: number }[]) => points[0]!;
const last = (points: readonly { east: number; north: number }[]) => points[points.length - 1]!;

function tangent(points: readonly { east: number; north: number }[], atEnd: boolean) {
  const [a, b] = atEnd
    ? [points[points.length - 2]!, last(points)]
    : [first(points), points[1]!];
  const de = b.east - a.east, dn = b.north - a.north;
  const length = Math.hypot(de, dn);
  if (length <= 0) throw new RangeError('degenerate road handoff');
  return { east: de / length, north: dn / length };
}

function handoff(id: string, points: readonly { east: number; north: number }[]): RoadHandoff {
  return {
    id, owner: 'C2',
    from: { east: first(points).east, north: first(points).north },
    to: { east: last(points).east, north: last(points).north },
    tangentFrom: tangent(points, false),
    tangentTo: tangent(points, true),
    halfWidth: 2.8,
    maxGrade: .12,
    sharedBoundary: 32,
    status: 'authored-centreline-only',
  };
}

/** The four authored centreline segments a neighbouring sector may build to. */
export const c2EastRoadHandoffs = Object.freeze([
  handoff('middle-east-upper', middleEastNorthControls),
  handoff('lower-east-service', lowerEastServiceControls),
  handoff('middle-south-exit', middleSouthRoadControls),
  handoff('rear-connector', rearConnectorControls),
] as const);

export const c2EastRoadTerminalGrades = Object.freeze({
  lowerEastService: { ...lowerEastServiceTerminal },
  rearConnectorStart: 87.5,
  rearConnectorEnd: 140,
} as const);

/** Consumers can assert that a candidate point is at a seam endpoint
 * without importing or modifying any C2 road implementation. */
export function roadHandoffAt(east: number, north: number, tolerance = 1e-9) {
  return c2EastRoadHandoffs.find(segment =>
    (Math.hypot(east - segment.from.east, north - segment.from.north) <= tolerance) ||
    (Math.hypot(east - segment.to.east, north - segment.to.north) <= tolerance));
}
