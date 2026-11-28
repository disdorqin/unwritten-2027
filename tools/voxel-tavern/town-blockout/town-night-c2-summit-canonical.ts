import { mainSummitBounds } from './main-summit-block';
import { createTownD2R30Collision } from './town-d2-r30-collision';
import {
  sampleTownD2R30Height, townD2R30LocalPoint, townD2R30Spec, townD2R30WorldPoint,
} from './town-d2-r30-domain';

/**
 * C2 east sector's read-only bridge to the one canonical summit field.
 *
 * This module deliberately owns **no** height function. The summit surface is
 * D2's: `sampleTownD2R30Height` is the field, and `createTownD2R30Collision`
 * stores exactly the grid the visible massif mesh is drawn from. The audit on
 * 2026-11-27 found the east preview was still seating every piece on the older
 * `createMainSummitBlock(...).heightAt` sampler, which differs from the live
 * field by 6.687 m mean / 52.177 m max over the sector. Even against the
 * *rendered* mesh the same class of error survives: because the peak of the
 * 610 m east shoulder at (590,1080) does not land on an 8 m grid vertex, the
 * drawn triangles reach only 602.82 m there - a piece seated on the analytic
 * field would float 7.18 m above the visible ground.
 *
 * So the export of record for seating east-sector geometry is `heightAt`,
 * which interpolates the same two triangles per cell as the rendered mesh.
 * `analyticAt` stays available for reporting and for grid construction, but no
 * C2 asset is seated on it.
 */

export const c2EastCanonicalArrivalHeight = 347;

/** Same 8 m lattice as the canonical visible/collision grid. */
export const c2EastCanonicalSpacing = townD2R30Spec.collisionSpacing;

/** East sector: E>=300 and N>=480 of the main-summit local frame. */
export const c2EastSector = Object.freeze({
  west: 300,
  south: 480,
  east: mainSummitBounds.east,
  north: mainSummitBounds.north,
  boundary: 32,
} as const);

/** 0.800 km x 1.310 km = 1.048 km², the dispatched east-sector area. */
export const c2EastSectorAreaKm2 =
  (c2EastSector.east - c2EastSector.west) * (c2EastSector.north - c2EastSector.south) / 1e6;

export type C2EastHeightAt = (east: number, north: number) => number | undefined;

export function inC2EastSector(east: number, north: number) {
  return Number.isFinite(east) && Number.isFinite(north) &&
    east >= c2EastSector.west && east <= c2EastSector.east &&
    north >= c2EastSector.south && north <= c2EastSector.north;
}

/** Distance inside the sector from the read-only shared seams (W and S). */
export function c2EastSeamDistance(east: number, north: number) {
  return Math.min(east - c2EastSector.west, north - c2EastSector.south);
}

export type C2EastGroundPoint = Readonly<{ east: number; north: number; height: number }>;

export type C2EastGroundStats = Readonly<{
  spacing: number;
  triangleCount: number;
  arrivalHeight: number;
  sectorSamples: number;
  /** |rendered face - analytic field| sampled on the 4 m lattice. */
  meanFaceDeviation: number;
  maxFaceDeviation: number;
  worstDeviationAt: Readonly<{ east: number; north: number }> | null;
  heightAtShoulder: number | undefined;
  analyticAtShoulder: number;
  disposed: boolean;
}>;

export type C2EastGround = Readonly<{
  arrivalHeight: number;
  spacing: number;
  /** Rendered 8 m triangles. This is the seating authority for C2 geometry. */
  heightAt: C2EastHeightAt;
  /** D2's continuous field the triangles are sampled from. Report-only. */
  analyticAt: C2EastHeightAt;
  /** Canonical local -> world transform, height included. */
  worldAt(east: number, north: number): C2EastGroundPoint | undefined;
  /** Canonical world -> local transform, height included. */
  localAt(east: number, north: number, height?: number): C2EastGroundPoint | undefined;
  stats(): C2EastGroundStats;
  dispose(): void;
}>;

const DEVIATION_STEP = 4;

export function createC2EastCanonicalGround(options: Readonly<{
  spacing?: number;
  arrivalHeight?: number;
}> = {}): C2EastGround {
  const spacing = options.spacing ?? c2EastCanonicalSpacing;
  const arrivalHeight = options.arrivalHeight ?? c2EastCanonicalArrivalHeight;
  if (!Number.isFinite(spacing) || spacing <= 0) throw new RangeError('Invalid C2 east ground spacing.');
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid C2 east arrival height.');

  const collision = createTownD2R30Collision({ spacing, arrivalHeight });
  let disposed = false;
  let cached: C2EastGroundStats | undefined;

  const heightAt: C2EastHeightAt = (east, north) =>
    disposed ? undefined : collision.surfaceAt(east, north);
  const analyticAt: C2EastHeightAt = (east, north) =>
    sampleTownD2R30Height(east, north, arrivalHeight);

  function worldAt(east: number, north: number) {
    const height = heightAt(east, north);
    if (height === undefined) return;
    return townD2R30WorldPoint({ east, north, height });
  }

  function localAt(east: number, north: number, height?: number) {
    const resolved = height ?? heightAt(east, north);
    if (resolved === undefined) return;
    return townD2R30LocalPoint({ east, north, height: resolved });
  }

  function stats(): C2EastGroundStats {
    if (cached) return { ...cached, disposed };
    let samples = 0, sum = 0, max = 0;
    let worst: { east: number; north: number } | null = null;
    for (let east = c2EastSector.west; east <= c2EastSector.east; east += DEVIATION_STEP) {
      for (let north = c2EastSector.south; north <= c2EastSector.north; north += DEVIATION_STEP) {
        const face = collision.surfaceAt(east, north);
        const field = sampleTownD2R30Height(east, north, arrivalHeight);
        if (face === undefined || field === undefined) continue;
        const delta = Math.abs(face - field);
        samples++;
        sum += delta;
        if (delta > max) { max = delta; worst = { east, north }; }
      }
    }
    const shoulder = collision.surfaceAt(590, 1080);
    cached = Object.freeze({
      spacing,
      triangleCount: collision.stats().triangleCount,
      arrivalHeight,
      sectorSamples: samples,
      meanFaceDeviation: samples === 0 ? 0 : sum / samples,
      maxFaceDeviation: max,
      worstDeviationAt: worst,
      heightAtShoulder: shoulder,
      analyticAtShoulder: sampleTownD2R30Height(590, 1080, arrivalHeight)!,
      disposed: false,
    });
    return { ...cached, disposed };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    collision.dispose();
  }

  return { arrivalHeight, spacing, heightAt, analyticAt, worldAt, localAt, stats, dispose };
}
