import {
  orbitalAnchorIds, resolveOrbitalAnchorVisit, type AcceptedOrbitalMovement,
  type OrbitalAnchorHost, type OrbitalAnchorId,
} from './orbital-anchor-registry.js';
import {
  resolveOrbitalGateTravel, type OrbitalGateHost, type OrbitalGatePose, type OrbitalGateState,
} from './orbital-gates.js';

export const orbitalFirstTour = ['airlock', 'living', 'cockpit', 'observation', 'teleport'] as const;
export type OrbitalRoom = typeof orbitalFirstTour[number];

export type OrbitalPosition = Readonly<{ domain: string; pose: OrbitalGatePose }>;
export type OrbitalSpaceKeys = Readonly<{ firstKeyLit: boolean; flyerAssembled: boolean }>;

export type OrbitalDownlinkHost = Readonly<{
  chapterOpen: boolean;
  completedRooms: number;
  hubDomain: string;
  isAtHub(pose: OrbitalGatePose): boolean;
  anchorSites: OrbitalAnchorHost;
  landingAt(anchor: OrbitalAnchorId): OrbitalPosition | undefined;
}>;

export type OrbitalReturnHost = Readonly<{
  chapterOpen: boolean;
  anchorSites: OrbitalAnchorHost;
  isAtReturnDoor(anchor: OrbitalAnchorId, pose: OrbitalGatePose): boolean;
  isReturnDoorOpen(anchor: OrbitalAnchorId): boolean;
  airlockDomain: string;
  airlockLanding(anchor: OrbitalAnchorId): OrbitalPosition | undefined;
  isLegalAirlockLanding(pose: OrbitalGatePose): boolean;
}>;

type OrbitalTrip =
  | { ok: true; position: OrbitalPosition }
  | { ok: false; reason: 'invalid-anchor' | 'locked' | 'wrong-origin' | 'unvisited' | 'invalid-landing' };

const anchorId = (value: unknown) => orbitalAnchorIds.find(id => id === value);

function finitePosition(position: OrbitalPosition) {
  const { east, north, height, yaw } = position.pose;
  return Number.isFinite(east) && Number.isFinite(north) && Number.isFinite(height) && Number.isFinite(yaw);
}

/** Calls the S-1 registry only on host-accepted steps. Persist the result in the player transaction. */
export function collectOrbitalAnchorVisits(
  movement: AcceptedOrbitalMovement, visited: readonly OrbitalAnchorId[], sites: OrbitalAnchorHost,
) {
  let next = visited;
  for (const id of orbitalAnchorIds) {
    const visit = resolveOrbitalAnchorVisit(id, movement, next, sites);
    if (visit.ok) next = visit.visited;
  }
  return next;
}

export function readOrbitalHub(visited: readonly OrbitalAnchorId[]) {
  const anchors = {
    starport: visited.includes('starport'), 'crater-bottom': visited.includes('crater-bottom'),
    summit: visited.includes('summit'), plaza: visited.includes('plaza'),
  };
  return { hubLit: true as const, anchors, allAnchorsLit: orbitalAnchorIds.every(id => anchors[id]) };
}

/** A hub selection contains only an anchor ID. The authoritative host owns origin and destination poses. */
export function resolveOrbitalDownlink(
  request: unknown, current: OrbitalPosition, visited: readonly OrbitalAnchorId[], host: OrbitalDownlinkHost,
): OrbitalTrip {
  const id = anchorId(request);
  if (!id) return { ok: false, reason: 'invalid-anchor' };
  if (current.domain !== host.hubDomain || !finitePosition(current) || !host.isAtHub(current.pose)) {
    return { ok: false, reason: 'wrong-origin' };
  }
  if (!host.chapterOpen || host.completedRooms !== orbitalFirstTour.length) return { ok: false, reason: 'locked' };
  if (!visited.includes(id)) return { ok: false, reason: 'unvisited' };

  const site = host.anchorSites[id];
  if (!site) return { ok: false, reason: 'invalid-landing' };
  const landing = host.landingAt(id);
  if (!landing || landing.domain !== site.domain || !finitePosition(landing) ||
      !site.containsSupportedFootpoint(landing.pose)) return { ok: false, reason: 'invalid-landing' };
  return { ok: true, position: { domain: landing.domain, pose: { ...landing.pose } } };
}

/** A mounted local return door always leads to the airlock, never directly to the hub. */
export function resolveOrbitalReturnToAirlock(
  request: unknown, current: OrbitalPosition, visited: readonly OrbitalAnchorId[], host: OrbitalReturnHost,
): OrbitalTrip {
  const id = anchorId(request);
  if (!id) return { ok: false, reason: 'invalid-anchor' };
  const site = host.anchorSites[id];
  if (!site || current.domain !== site.domain || !finitePosition(current) || !host.isAtReturnDoor(id, current.pose)) {
    return { ok: false, reason: 'wrong-origin' };
  }
  if (!host.chapterOpen || !host.isReturnDoorOpen(id)) return { ok: false, reason: 'locked' };
  if (!visited.includes(id)) return { ok: false, reason: 'unvisited' };

  const landing = host.airlockLanding(id);
  if (!landing || landing.domain !== host.airlockDomain || !finitePosition(landing) ||
      !host.isLegalAirlockLanding(landing.pose)) return { ok: false, reason: 'invalid-landing' };
  return { ok: true, position: { domain: landing.domain, pose: { ...landing.pose } } };
}

/** firstKeyLit comes from town-wide in-ring progress, not a player's collected or carried items. */
export function resolveOrbitalChapterDoor(
  request: unknown, current: OrbitalGateState, chapterOpen: boolean, keys: OrbitalSpaceKeys, host: OrbitalGateHost,
) {
  return resolveOrbitalGateTravel(request, current, {
    ...host,
    isOpen: gate => chapterOpen && keys.firstKeyLit === true && keys.flyerAssembled === true && host.isOpen(gate),
  });
}

export const orbitalDoorLockedLabel = '未解锁';

/** Check a supported physical step before accepting it; a corridor has no room ID. */
export function resolveOrbitalTourStep(
  completedRooms: number, room: OrbitalRoom | undefined, route: AcceptedOrbitalMovement['route'],
) {
  if (!Number.isInteger(completedRooms) || completedRooms < 0 || completedRooms > orbitalFirstTour.length) {
    return { ok: false as const, completedRooms: 0 };
  }
  const nextRoom = room === undefined ? -1 : orbitalFirstTour.indexOf(room);
  if (nextRoom > completedRooms) return { ok: false as const, completedRooms };
  return { ok: true as const, completedRooms: route === 'physical' && nextRoom === completedRooms
    ? completedRooms + 1 : completedRooms };
}
