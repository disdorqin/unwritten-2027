import { createMainSummitBlock, mainSummitLayout } from './main-summit-block.js';
import {
  createMainSummitTrail, mainSummitTrailSpec, type MainSummitTrailPoint,
} from './main-summit-trail.js';
import { clipC2EastTrail } from './town-night-c2-summit-east-trail.js';

/**
 * C33-2 shared walking-corridor clearance.
 *
 * The canonical main-summit trail (5.59 km, D2's single height authority) is
 * the path a player actually walks. C2's east packages previously emitted
 * stone banks and guard rails across it: a 1692-station audit found 41 real
 * blockages (31 landform + 10 switchback). This module derives the corridor
 * once from that same survey and lets each package keep its own plan while
 * refusing to place a body inside the walking lane.
 *
 * Read-only: no terrain, trail, viewer or other window's file is changed.
 */
const CELL = 16;
type TrailSegment = Readonly<{
  ax: number; ay: number; bx: number; by: number;
  minX: number; maxX: number; minY: number; maxY: number;
}>;
let cached: readonly MainSummitTrailPoint[] | undefined;
let walking: readonly { east: number; north: number; height: number }[] | undefined;
let segments: readonly TrailSegment[] | undefined;
let index: Map<string, number[]> | undefined;

function key(east: number, north: number) {
  return `${Math.floor(east / CELL)},${Math.floor(north / CELL)}`;
}

/** Canonical surveyed stations; built once from the same coarse block the
 * production assembly uses (347 m arrival, 100 m sampling). */
export function c2CanonicalTrailPoints(): readonly MainSummitTrailPoint[] {
  if (!cached) {
    const coarse = createMainSummitBlock(mainSummitLayout, 347, 100);
    cached = createMainSummitTrail(coarse.heightAt, 347).points;
  }
  return cached;
}

/** The exact 1692 stations the east-sector physical trail lays stone on.
 * `clipC2EastTrail` also bridges out-of-sector survey gaps (one 356.9 m
 * chord), so those chords are walking surface too and must be protected. */
export function c2EastWalkingStations() {
  if (!walking) walking = clipC2EastTrail(c2CanonicalTrailPoints());
  return walking;
}

/**
 * Segment index, not a vertex index: the survey has 50 m vertex gaps, so a
 * body sitting on an interpolated station between two vertices would be
 * missed by a nearest-vertex test (one such rail post survived the first
 * audit at E=508.6 / N=525.9).
 */
function corridorSegments(): readonly TrailSegment[] {
  if (!segments) {
    const points = c2EastWalkingStations();
    const out: TrailSegment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!;
      out.push({
        ax: a.east, ay: a.north, bx: b.east, by: b.north,
        minX: Math.min(a.east, b.east), maxX: Math.max(a.east, b.east),
        minY: Math.min(a.north, b.north), maxY: Math.max(a.north, b.north),
      });
    }
    segments = out;
  }
  return segments;
}

function corridorIndex() {
  if (!index) {
    const cells = new Map<string, number[]>();
    index = cells;
    corridorSegments().forEach((s, i) => {
      const x0 = Math.floor(s.minX / CELL), x1 = Math.floor(s.maxX / CELL);
      const y0 = Math.floor(s.minY / CELL), y1 = Math.floor(s.maxY / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`;
          const list = cells.get(k) ?? [];
          list.push(i); cells.set(k, list);
        }
      }
    });
  }
  return index;
}

/** Squared distance from a point to a clamped line segment. */
function segmentDistanceSquared(east: number, north: number, s: TrailSegment) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((east - s.ax) * dx + (north - s.ay) * dy) / len2));
  const px = s.ax + dx * t - east, py = s.ay + dy * t - north;
  return px * px + py * py;
}

/**
 * Shortest planar distance from (east,north) to the canonical centreline,
 * searching neighbouring cells. A null result means "far from any segment".
 */
export function c2TrailDistance(east: number, north: number, searchCells = 2) {
  const map = corridorIndex();
  const all = corridorSegments();
  const cx = Math.floor(east / CELL), cz = Math.floor(north / CELL);
  let best = Infinity;
  for (let x = cx - searchCells; x <= cx + searchCells; x++) {
    for (let z = cz - searchCells; z <= cz + searchCells; z++) {
      for (const i of map.get(`${x},${z}`) ?? []) {
        const d2 = segmentDistanceSquared(east, north, all[i]!);
        if (d2 < best) best = d2;
      }
    }
  }
  return Math.sqrt(best);
}

/** Half of the walking lane plus a small body radius margin. */
export const c2TrailClearance = mainSummitTrailSpec.width / 2 + .42;

/** True when a proposed solid body would stand inside the walking lane.
 * The reach argument is the body's own half-extent toward the lane, so a long
 * rail laid along the route is tested by its near edge, not its centre. */
export function c2BlocksTrail(east: number, north: number, reach = 0) {
  return c2TrailDistance(east, north) < c2TrailClearance + reach;
}
