import type { OrbitalGatePose } from './orbital-gates.js';

export const orbitalAnchorIds = ['starport', 'crater-bottom', 'summit', 'plaza'] as const;
export type OrbitalAnchorId = typeof orbitalAnchorIds[number];

export type AcceptedOrbitalMovement = Readonly<{
  domain: string;
  pose: OrbitalGatePose;
  route: 'physical' | 'transport' | 'restore';
}>;

type OrbitalAnchorSite = Readonly<{
  domain: string;
  containsSupportedFootpoint(pose: OrbitalGatePose): boolean;
}>;

export type OrbitalAnchorHost = Readonly<Partial<Record<OrbitalAnchorId, OrbitalAnchorSite>>>;
export type OrbitalAnchorVisit =
  | { ok: true; visited: readonly OrbitalAnchorId[]; added: boolean }
  | { ok: false; reason: 'invalid-anchor' | 'missing-anchor' | 'not-physical' | 'wrong-position' };

/** Read accepted movement and persist the new visit in the host's player-state transaction. */
export function resolveOrbitalAnchorVisit(
  anchor: unknown,
  movement: AcceptedOrbitalMovement,
  visited: readonly OrbitalAnchorId[],
  host: OrbitalAnchorHost,
): OrbitalAnchorVisit {
  const id = orbitalAnchorIds.find(candidate => candidate === anchor);
  if (!id) return { ok: false, reason: 'invalid-anchor' };
  const site = host[id];
  if (!site) return { ok: false, reason: 'missing-anchor' };
  if (movement.route !== 'physical') return { ok: false, reason: 'not-physical' };

  const { east, north, height, yaw } = movement.pose;
  if (movement.domain !== site.domain || ![east, north, height, yaw].every(Number.isFinite) ||
      !site.containsSupportedFootpoint(movement.pose)) return { ok: false, reason: 'wrong-position' };
  if (visited.includes(id)) return { ok: true, visited, added: false };
  return { ok: true, visited: [...visited, id], added: true };
}

/**
 * Reports the two independent orbital unlock prerequisites. The numbered
 * recoveredLogPageIds (1–12) are pages of the missing 未央号 ship's log.
 * They are NOT the twelve zodiac stones, not the town atlas rubbings, and
 * never a client claim of an unlocked transfer. The current chapter keeps
 * both doors locked until the server owns the full accepted transition.
 */
export function readOrbitalDualKeyStatus(recoveredLogPageIds: Iterable<number>, assembledFlyer: boolean) {
  const pages = new Set<number>();
  for (const id of recoveredLogPageIds) {
    if (Number.isSafeInteger(id) && id >= 1 && id <= 12) pages.add(id);
  }
  return {
    collectedPages: pages.size,
    fragmentsComplete: pages.size === 12,
    flyerAssembled: assembledFlyer === true,
  };
}
