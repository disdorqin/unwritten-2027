import { aircraftFlightSpec, type AircraftPoint } from './aircraft-flight.js';

export const starportAssemblyParts = ['snow-wing', 'booster', 'navigation-core'] as const;
export type StarportAssemblyPart = typeof starportAssemblyParts[number];

export type StarportAssemblyState = Readonly<{
  revision: number;
  carried: readonly StarportAssemblyPart[];
  installed: readonly StarportAssemblyPart[];
  ignited: boolean;
}>;

export type StarportAssemblySite = Readonly<{
  sockets: Readonly<Record<StarportAssemblyPart, AircraftPoint>>;
  ignitionPoint: AircraftPoint;
  reach?: number;
}>;

export type StarportAssemblyHost = Readonly<{
  /** The storage key identifies this player's aircraft. The record owns both the parts and their sockets. */
  read(playerId: string): StarportAssemblyState | undefined | Promise<StarportAssemblyState | undefined>;
  /** Current accepted feet in the starport domain. Other domains return undefined. */
  pose(playerId: string): AircraftPoint | undefined;
  /** Read the authoritative key and the shared beacon's first-minute overlap flag. */
  readIgnition(playerId: string): Readonly<{ keyOne: boolean; layersOverlap: boolean }> | undefined;
  /** Compare the revision and evaluate guard at the write boundary, then persist the whole replacement or nothing. */
  commit(playerId: string, expectedRevision: number, next: StarportAssemblyState, guard: () => boolean):
    boolean | Promise<boolean>;
}>;

export type StarportAssemblyResult =
  | { kind: 'placed' | 'already-installed' | 'ignited' | 'already-ignited'; state: StarportAssemblyState }
  | { kind: 'unavailable' | 'invalid-part' | 'out-of-reach' | 'not-carried' | 'incomplete' |
      'missing-key' | 'window-closed' | 'conflict' };

export function isStarportAssemblyPart(value: unknown): value is StarportAssemblyPart {
  return starportAssemblyParts.some(part => value === part);
}

function isFinitePoint(point: AircraftPoint | undefined): point is AircraftPoint {
  return !!point && [point.east, point.north, point.height].every(Number.isFinite);
}

function validState(state: StarportAssemblyState | undefined): state is StarportAssemblyState {
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0 || typeof state.ignited !== 'boolean' ||
      !Array.isArray(state.carried) || !Array.isArray(state.installed)) return false;
  const parts = [...state.carried, ...state.installed];
  return parts.every(isStarportAssemblyPart) && new Set(parts).size === parts.length &&
    (!state.ignited || state.installed.length === starportAssemblyParts.length);
}

function copyState(state: StarportAssemblyState): StarportAssemblyState {
  return { ...state, carried: [...state.carried], installed: [...state.installed] };
}

export function createStarportAssembly(site: StarportAssemblySite, host: StarportAssemblyHost) {
  const reach = site.reach ?? aircraftFlightSpec.assemblyReach;
  if (!Number.isFinite(reach) || reach <= 0 || !isFinitePoint(site.ignitionPoint) ||
      !starportAssemblyParts.every(part => isFinitePoint(site.sockets[part]))) {
    throw new RangeError('Starport assembly requires a valid site and positive reach.');
  }

  function inReach(playerId: string, point: AircraftPoint) {
    const feet = host.pose(playerId);
    return isFinitePoint(feet) && Math.hypot(feet.east - point.east, feet.north - point.north, feet.height - point.height) <= reach;
  }

  async function snapshot(playerId: string): Promise<StarportAssemblyState | undefined> {
    if (!playerId) return;
    const state = await host.read(playerId);
    if (validState(state)) return copyState(state);
  }

  function ignitionBlocker(playerId: string) {
    const access = host.readIgnition(playerId);
    if (!access) return 'unavailable';
    if (access.keyOne !== true) return 'missing-key';
    if (access.layersOverlap !== true) return 'window-closed';
  }

  return {
    snapshot,
    async place(playerId: string, part: StarportAssemblyPart): Promise<StarportAssemblyResult> {
      if (!isStarportAssemblyPart(part)) return { kind: 'invalid-part' };
      const state = await snapshot(playerId);
      if (!state) return { kind: 'unavailable' };
      const point = site.sockets[part];
      if (!inReach(playerId, point)) return { kind: 'out-of-reach' };
      if (state.installed.includes(part)) return { kind: 'already-installed', state };
      if (!state.carried.includes(part)) return { kind: 'not-carried' };
      if (!Number.isSafeInteger(state.revision + 1)) return { kind: 'unavailable' };
      const next = { ...state, revision: state.revision + 1, carried: state.carried.filter(owned => owned !== part),
        installed: [...state.installed, part] };
      const committed = await host.commit(playerId, state.revision, next, () => inReach(playerId, point));
      return committed ? { kind: 'placed', state: copyState(next) } : { kind: 'conflict' };
    },
    async ignite(playerId: string): Promise<StarportAssemblyResult> {
      const state = await snapshot(playerId);
      if (!state) return { kind: 'unavailable' };
      if (!inReach(playerId, site.ignitionPoint)) return { kind: 'out-of-reach' };
      if (state.ignited) return { kind: 'already-ignited', state };
      if (state.installed.length !== starportAssemblyParts.length) return { kind: 'incomplete' };
      const blocked = ignitionBlocker(playerId);
      if (blocked) return { kind: blocked };
      if (!Number.isSafeInteger(state.revision + 1)) return { kind: 'unavailable' };
      const next = { ...state, revision: state.revision + 1, ignited: true };
      const committed = await host.commit(playerId, state.revision, next,
        () => inReach(playerId, site.ignitionPoint) && !ignitionBlocker(playerId));
      return committed ? { kind: 'ignited', state: copyState(next) } : { kind: 'conflict' };
    },
  };
}
