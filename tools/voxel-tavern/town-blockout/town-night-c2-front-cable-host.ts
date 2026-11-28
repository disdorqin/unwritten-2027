import type { Object3D } from 'three';
import type { FrontRidgeR30Field } from './town-d-r30-front-ridge';
import { externalCableDockSupport } from './town-d-r30-cable-facilities';
import { installNightBFrontOperation } from './town-night-b-summit-front-install';
import { createNightBMountedClearance } from './town-night-b-mounted-clearance';
import type { RepairAnchors } from './town-cable-repair-host';

/**
 * C32-1: the C2 host side of A's `preparePublicFrontCable`.
 *
 * B's installer decides whether the open facility is physically safe; this
 * module supplies everything only the host knows, and refuses to certify a
 * route it has not actually walked:
 *
 * - every obstacle the host owns, read from the *mounted* meshes (B's
 *   triangle scan) plus the host's own logical colliders, excluding only the
 *   closed facility being replaced;
 * - a 0.5 m stepped walk from the nearest graded road station to each of the
 *   6 dock board/approach feet and each of the 4 repair anchors, refusing any
 *   step the ground cannot carry. Two supported endpoints are not a route;
 * - the closed instance is only replaced after all of that passes, and a
 *   rejection leaves the closed instance and `transportReady=false` intact.
 */

type Installer = Parameters<typeof installNightBFrontOperation>[0];
export type C2Foot = Readonly<{ east: number; north: number; height: number }>;
export type C2CableAuthority = Pick<Installer, 'state' | 'now' | 'daylight' | 'firstRun'>;
export type C2FrontCableResult =
  | Readonly<{ ready: true; facilities: Installer['closed']; frontOperation: Extract<ReturnType<typeof installNightBFrontOperation>, { ready: true }>; frontRepair: Readonly<{ anchors: RepairAnchors; surfaceAt: (e: number, n: number) => number | undefined; clear: (p: C2Foot) => boolean }>; meshAudit: ReturnType<ReturnType<typeof createNightBMountedClearance>['stats']> }>
  | Readonly<{ ready: false; reason: string; meshAudit: ReturnType<ReturnType<typeof createNightBMountedClearance>['stats']> }>;

const WALK_STEP = .5;
const MAX_STEP_RISE = .6;
const DECK_TOLERANCE = .08;
const MAX_ROAD_APPROACH = 60;

export function prepareC2FrontCable(input: Readonly<{
  owner: Object3D;
  field: FrontRidgeR30Field;
  closed: Installer['closed'];
  /** Real terrain meshes only; the closed facility is excluded automatically. */
  groundMeshes: readonly Object3D[];
  authority: C2CableAuthority;
  authorized: boolean;
  supportAt: (east: number, north: number) => number | undefined;
  /** Host colliders except the closed facility. */
  blocked: (east: number, north: number, height: number, radius: number, body: number) => boolean;
  repairAnchors: RepairAnchors;
  /** The graded centre lines this host has actually built and certified. */
  roads: readonly (readonly { east: number; north: number; height: number }[])[];
}>): C2FrontCableResult {
  const scan = createNightBMountedClearance(input.owner, [...input.groundMeshes, input.closed.group]);
  // Physical ground for certification: the surveyed raster, not the
  // ownership-gated gameplay support, because the base station sits in A's
  // ground and would otherwise read as "no surface" during the sweep.
  const surfaceAt = (east: number, north: number) =>
    externalCableDockSupport(east, north) ?? input.field.heightAt(east, north) ?? input.supportAt(east, north);
  const clear = (p: C2Foot) =>
    Math.abs((surfaceAt(p.east, p.north) ?? Infinity) - p.height) <= DECK_TOLERANCE &&
    !input.blocked(p.east, p.north, p.height, .27, 1.8);

  const stations = input.roads.flatMap(road => road.map(p => ({ east: p.east, north: p.north, height: p.height })));
  function nearestStation(foot: C2Foot) {
    let best: { station: C2Foot; distance: number } | undefined;
    for (const station of stations) {
      const distance = Math.hypot(station.east - foot.east, station.north - foot.north);
      if (!best || distance < best.distance) best = { station, distance };
    }
    return best;
  }
  /** Step the actual ground between two feet; a supported pair is not a route. */
  function walkFrom(from: C2Foot, to: C2Foot) {
    const distance = Math.hypot(to.east - from.east, to.north - from.north);
    const steps = Math.max(1, Math.ceil(distance / WALK_STEP));
    let previous = surfaceAt(from.east, from.north);
    if (previous === undefined || Math.abs(previous - from.height) > .5) return false;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const east = from.east + (to.east - from.east) * t;
      const north = from.north + (to.north - from.north) * t;
      const height = surfaceAt(east, north);
      if (height === undefined || Math.abs(height - previous) > MAX_STEP_RISE) return false;
      if (input.blocked(east, north, height, .27, 1.8)) return false;
      previous = height;
    }
    return Math.abs(previous - to.height) <= .5;
  }
  /** A dock or repair point is usable when the player can actually get there:
   * step the ground from the nearest graded road station, or from a station
   * foot that is itself certified. The summit station is reached by the line,
   * so its route is the platform it shares with the other cabin. */
  function walked(foot: C2Foot, seeds: readonly C2Foot[] = []) {
    const candidates: C2Foot[] = [...seeds];
    const start = nearestStation(foot);
    if (start && start.distance <= MAX_ROAD_APPROACH) candidates.push(start.station);
    return candidates
      .filter(seed => seed !== foot)
      .map(seed => ({ seed, distance: Math.hypot(seed.east - foot.east, seed.north - foot.north) }))
      .filter(entry => entry.distance <= MAX_ROAD_APPROACH)
      .sort((a, b) => a.distance - b.distance)
      .some(entry => walkFrom(entry.seed, foot));
  }

  const anchors = [input.repairAnchors.brake, input.repairAnchors.cableWheel,
    input.repairAnchors.weightTower, input.repairAnchors.weightFrame];

  let meshAudit = scan.stats();
  const operation = installNightBFrontOperation({
    ...input.authority,
    field: input.field,
    closed: input.closed,
    authorized: input.authorized,
    externalBlocked: (feet, halfWidth, halfDepth, top) => {
      if (scan.blocked({ feet, heading: 0, halfWidth, halfLength: halfDepth, bodyTop: top })) return true;
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) {
        if (input.blocked(feet.east + (i / 3 - 1) * halfWidth, feet.north + (j / 4 - 1) * halfDepth, feet.height, .025, top)) return true;
      }
      return false;
    },
    dockClear: (_station, foot) => clear(foot),
    certifyApproaches: (docks, facilities) => {
      if (docks.length !== 6) return false;
      const allFeet = docks.flatMap(dock => [dock.board, dock.approach] as C2Foot[]);
      for (const dock of docks) {
        for (const foot of [dock.board, dock.approach]) {
          if (Math.abs((surfaceAt(foot.east, foot.north) ?? Infinity) - foot.height) > DECK_TOLERANCE) return false;
          if (facilities.blocked(foot.east, foot.north, foot.height, .27)) return false;
          if (!walked(foot, allFeet)) return false;
        }
      }
      for (const anchor of anchors) {
        const height = surfaceAt(anchor.east, anchor.north);
        if (height === undefined) return false;
        if (!clear({ east: anchor.east, north: anchor.north, height })) return false;
        if (!walked({ east: anchor.east, north: anchor.north, height }, allFeet)) return false;
      }
      return true;
    },
  });
  meshAudit = scan.stats();
  if (!operation.ready) return { ready: false, reason: operation.reason, meshAudit };
  return {
    ready: true,
    facilities: operation.facilities,
    frontOperation: operation,
    frontRepair: {
      anchors: input.repairAnchors,
      surfaceAt,
      clear: (p: C2Foot) => clear(p) && !operation.facilities.blocked(p.east, p.north, p.height, .27),
    },
    meshAudit,
  };
}
