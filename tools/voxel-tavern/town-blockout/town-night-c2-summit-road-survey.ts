import type { FrontRidgeR30Field } from './town-d-r30-front-ridge';
import type { RidgeRoadPoint } from './town-d-r30-road-survey';

/**
 * C2 cross-sector road survey (C31-2).
 *
 * The four centreline handoffs were published on 2026-11-27 as *authored
 * polylines only*. A then had no way to tell a graded lane from a drawing, and
 * the handoff audit could not name a file or a number. This module measures
 * the built routes on the production raster and reports, per segment and per
 * endpoint:
 *
 * - run length, maximum longitudinal grade, maximum cross slope
 * - net lane width actually available across the tangent normal
 * - endpoint coordinates **and heights**, so A builds to a datum instead of
 *   guessing one
 * - which endpoints really join and which do not, with centreline distance
 *   and elevation difference
 *
 * It never draws, grades, or writes terrain. It is the reproducible check
 * behind the C31-2 report, and it refuses to add segment lengths into a
 * "connected road" that the endpoints do not actually connect.
 */

export const c2RoadSurveySpec = Object.freeze({
  stationStep: .5,
  widthStep: .5,
  halfWidth: 2.8,
  minNetWidth: 2.5,
  maxGrade: .12,
  jointTolerance: .01,
  reportDistance: 120,
} as const);

export type C2RoadSegmentInput = Readonly<{ id: string; route: readonly RidgeRoadPoint[] }>;

export type C2RoadEndpoint = Readonly<{ east: number; north: number; height: number }>;

export type C2RoadSegmentSurvey = Readonly<{
  id: string;
  stations: number;
  length: number;
  maxGrade: number;
  maxCrossSlope: number;
  /** Narrowest lane found across all stations, in metres. */
  minNetWidth: number;
  unsupported: number;
  gradeOk: boolean;
  widthOk: boolean;
  start: C2RoadEndpoint;
  end: C2RoadEndpoint;
}>;

export type C2RoadApproach = Readonly<{
  segment: string;
  distance: number;
  dropHeight: number | undefined;
  kind: 'joint' | 'gap';
}>;

export type C2RoadEndpointProbe = C2RoadEndpoint & Readonly<{
  segment: string;
  role: 'start' | 'end';
  nearest: readonly C2RoadApproach[];
}>;

export type C2RoadSurvey = Readonly<{
  segments: readonly C2RoadSegmentSurvey[];
  endpoints: readonly C2RoadEndpointProbe[];
  joints: readonly Readonly<{ a: string; b: string; distance: number }>[];
  gaps: readonly Readonly<{ a: string; b: string; distance: number; dropHeight: number | undefined }>[];
  networkLength: number;
  maxGrade: number;
  minNetWidth: number;
  /** Every segment meets its own grade and width bound. */
  certified: boolean;
  /** Segments joined to another segment at both ends. */
  connectedSegments: readonly string[];
  spec: typeof c2RoadSurveySpec;
}>;

type PlanPoint = Readonly<{ east: number; north: number }>;

function densify(route: readonly PlanPoint[], step: number) {
  const out: PlanPoint[] = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const de = b.east - a.east, dn = b.north - a.north;
    const length = Math.hypot(de, dn);
    if (length < 1e-9) continue;
    const count = Math.max(1, Math.ceil(length / step));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      out.push({ east: a.east + de * t, north: a.north + dn * t });
    }
  }
  const last = route.at(-1);
  if (last) out.push({ east: last.east, north: last.north });
  return out;
}

function distanceToSegment(point: PlanPoint, a: PlanPoint, b: PlanPoint) {
  const de = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = de * de + dn * dn;
  const t = lengthSquared === 0 ? 0
    : Math.max(0, Math.min(1, ((point.east - a.east) * de + (point.north - a.north) * dn) / lengthSquared));
  return Math.hypot(point.east - a.east - de * t, point.north - a.north - dn * t);
}

/** Nearest approach from one route to another, measured as real polyline
 * distance. Only reported; never used to grade or to claim a connection. */
export function c2RouteSeparation(
  field: FrontRidgeR30Field,
  from: readonly PlanPoint[],
  to: readonly PlanPoint[],
) {
  let best = { distance: Infinity, fromEast: 0, fromNorth: 0, toEast: 0, toNorth: 0 };
  const sampled = densify(to, 1);
  for (const point of from) {
    for (let i = 1; i < sampled.length; i++) {
      const a = sampled[i - 1]!, b = sampled[i]!;
      const distance = distanceToSegment(point, a, b);
      if (distance < best.distance) {
        best = { distance, fromEast: point.east, fromNorth: point.north, toEast: a.east, toNorth: a.north };
      }
    }
  }
  if (!Number.isFinite(best.distance)) return { distance: Infinity, dropHeight: undefined };
  const fromHeight = field.heightAt(best.fromEast, best.fromNorth);
  const toHeight = field.heightAt(best.toEast, best.toNorth);
  return {
    distance: best.distance,
    dropHeight: fromHeight === undefined || toHeight === undefined
      ? undefined : Math.abs(fromHeight - toHeight),
  };
}

/** Widest symmetric lane around one station, using the route normal. */
function laneWidth(field: FrontRidgeR30Field, east: number, north: number,
  normalEast: number, normalNorth: number, halfWidth: number, widthStep: number) {
  let width = 0;
  for (let offset = widthStep; offset <= halfWidth + 1e-9; offset += widthStep) {
    const left = field.heightAt(east + normalEast * offset, north + normalNorth * offset);
    const right = field.heightAt(east - normalEast * offset, north - normalNorth * offset);
    if (left === undefined || right === undefined) break;
    width = offset * 2;
  }
  return width;
}

export function surveyC2RoadSegment(
  field: FrontRidgeR30Field,
  input: C2RoadSegmentInput,
): C2RoadSegmentSurvey {
  const spec = c2RoadSurveySpec;
  const stations = densify(input.route, spec.stationStep);
  if (stations.length < 2) throw new RangeError(`C2 road segment ${input.id} has no length.`);
  let length = 0, maxGrade = 0, maxCrossSlope = 0, minWidth = Infinity, unsupported = 0;
  let previous: { east: number; north: number; height: number } | undefined;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]!;
    const height = field.heightAt(station.east, station.north);
    if (height === undefined) { unsupported++; previous = undefined; continue; }
    const ahead = stations[Math.min(i + 1, stations.length - 1)]!;
    const behind = stations[Math.max(i - 1, 0)]!;
    const de = ahead.east - behind.east, dn = ahead.north - behind.north;
    const run = Math.hypot(de, dn);
    const normalEast = run > 1e-9 ? -dn / run : 0;
    const normalNorth = run > 1e-9 ? de / run : 1;
    if (previous) {
      const travelled = Math.hypot(station.east - previous.east, station.north - previous.north);
      if (travelled > 1e-9) maxGrade = Math.max(maxGrade, Math.abs(height - previous.height) / travelled);
      length += travelled;
    }
    previous = { east: station.east, north: station.north, height };
    const across = Math.abs(
      (field.heightAt(station.east + normalEast * spec.halfWidth, station.north + normalNorth * spec.halfWidth) ?? NaN) -
      (field.heightAt(station.east - normalEast * spec.halfWidth, station.north - normalNorth * spec.halfWidth) ?? NaN));
    if (Number.isFinite(across)) maxCrossSlope = Math.max(maxCrossSlope, across / (spec.halfWidth * 2));
    const width = laneWidth(field, station.east, station.north, normalEast, normalNorth, spec.halfWidth, spec.widthStep);
    if (width < minWidth) minWidth = width;
  }
  const first = stations[0]!, last = stations.at(-1)!;
  const startHeight = field.heightAt(first.east, first.north);
  const endHeight = field.heightAt(last.east, last.north);
  if (startHeight === undefined || endHeight === undefined) {
    throw new RangeError(`C2 road segment ${input.id} leaves the surveyed field.`);
  }
  const measuredWidth = Number.isFinite(minWidth) ? minWidth : 0;
  return {
    id: input.id,
    stations: stations.length,
    length,
    maxGrade,
    maxCrossSlope,
    minNetWidth: measuredWidth,
    unsupported,
    gradeOk: maxGrade <= spec.maxGrade + 1e-6,
    widthOk: unsupported === 0 && measuredWidth >= spec.minNetWidth - 1e-9,
    start: { east: first.east, north: first.north, height: startHeight },
    end: { east: last.east, north: last.north, height: endHeight },
  };
}

export function surveyC2RoadNetwork(
  field: FrontRidgeR30Field,
  inputs: readonly C2RoadSegmentInput[],
): C2RoadSurvey {
  const spec = c2RoadSurveySpec;
  const segments = inputs.map(input => surveyC2RoadSegment(field, input));
  const probes: C2RoadEndpointProbe[] = [];
  const joints: { a: string; b: string; distance: number }[] = [];
  const gaps: { a: string; b: string; distance: number; dropHeight: number | undefined }[] = [];

  for (const segment of segments) {
    for (const [role, endpoint] of [['start', segment.start], ['end', segment.end]] as const) {
      const nearest: C2RoadApproach[] = [];
      for (const other of segments) {
        if (other.id === segment.id) continue;
        const source = inputs.find(i => i.id === other.id)!;
        const separation = c2RouteSeparation(field, [{
          east: endpoint.east, north: endpoint.north,
        }], source.route);
        if (!Number.isFinite(separation.distance)) continue;
        const kind = separation.distance <= spec.jointTolerance ? 'joint' as const : 'gap' as const;
        nearest.push({ segment: other.id, distance: separation.distance, dropHeight: separation.dropHeight, kind });
        if (kind === 'joint') {
          const key = [segment.id, other.id].sort().join('|');
          if (!joints.some(j => [j.a, j.b].sort().join('|') === key)) {
            joints.push({ a: segment.id, b: other.id, distance: separation.distance });
          }
        } else if (separation.distance <= spec.reportDistance) {
          // One row per unordered pair, carrying the *closest* approach so a
          // wide shared pad is never reported as the network's worst gap.
          const key = [segment.id, other.id].sort().join('|');
          const existing = gaps.findIndex(g => [g.a, g.b].sort().join('|') === key);
          const entry = {
            a: segment.id, b: other.id,
            distance: separation.distance, dropHeight: separation.dropHeight,
          };
          if (existing < 0) gaps.push(entry);
          else if (separation.distance < gaps[existing]!.distance) gaps[existing] = entry;
        }
      }
      probes.push({ segment: segment.id, role, ...endpoint, nearest });
    }
  }

  // A segment is connected only when *both* of its ends land on a joint.
  // One loose end is exactly the state the 2026-11-27 audit called "not全通".
  const connectedSegments = segments
    .filter(segment => probes
      .filter(probe => probe.segment === segment.id)
      .every(probe => probe.nearest.some(n => n.kind === 'joint')))
    .map(segment => segment.id)
    .sort();

  const networkLength = segments.reduce((sum, s) => sum + s.length, 0);
  const maxGrade = segments.reduce((max, s) => Math.max(max, s.maxGrade), 0);
  const minNetWidth = segments.length === 0 ? 0 : segments.reduce((min, s) => Math.min(min, s.minNetWidth), Infinity);
  return {
    segments,
    endpoints: probes,
    joints,
    gaps,
    networkLength,
    maxGrade,
    minNetWidth,
    certified: segments.length > 0 && segments.every(s => s.gradeOk && s.widthOk),
    connectedSegments,
    spec,
  };
}
