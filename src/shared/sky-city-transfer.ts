import type { AircraftPoint } from './aircraft-flight.js';
import { createFittedStarportAssemblySite, starportAssemblyParts,
  type StarportAssemblyState } from './starport-assembly.js';
import { isSkyCityPresenceFoot } from './sky-city-presence-domain.js';

/**
 * Accepted summit and sky poses are world coordinates. The host alone owns
 * identity, the ignition record, active-room readiness and landing collision.
 * A browser can request enter/return, but never supply its destination.
 */
export type SkyTransferDomain = 'summit' | 'sky';
export type SkyTransferRecord = Readonly<{ revision: number; domain: SkyTransferDomain }>;
export type SkyTransferHost = Readonly<{
  read(player: string): SkyTransferRecord | undefined | Promise<SkyTransferRecord | undefined>;
  /** Return undefined unless the caller has a currently accepted pose in the requested domain. */
  pose(player: string, domain: SkyTransferDomain): AircraftPoint | undefined;
  assembly(player: string): StarportAssemblyState | undefined;
  ignition(player: string): Readonly<{ keyOne: boolean; layersOverlap: boolean }> | undefined;
  /** A real mounted scene + an authoritative room must both exist to enable transfer. */
  ready(domain: SkyTransferDomain): boolean;
  /** Resolve the registered, currently walkable landing; never trust a client-proposed destination. */
  landing(domain: SkyTransferDomain): AircraftPoint | undefined;
  canStand(domain: SkyTransferDomain, point: AircraftPoint): boolean;
  /** Must re-check revision, evaluate guard, and commit player domain+position atomically. */
  commit(player: string, revision: number, next: SkyTransferRecord,
    landing: AircraftPoint, guard: () => boolean): boolean | Promise<boolean>;
}>;

export type SkyTransferResult =
  | { kind: 'entered' | 'returned'; state: SkyTransferRecord; landing: AircraftPoint }
  | { kind: 'unavailable' | 'wrong-domain' | 'out-of-reach' | 'not-ignited' |
      'missing-key' | 'window-closed' | 'unsafe-landing' | 'conflict' };

const validPoint = (p: AircraftPoint | undefined): p is AircraftPoint =>
  !!p && Number.isFinite(p.east) && Number.isFinite(p.north) && Number.isFinite(p.height);

const fitted = createFittedStarportAssemblySite({ east: 324, north: 657, height: 347 });
const skyReturn = { east: -14, north: -250, height: 796 } as const;
/** The approved F-3 starport assembly + ZD-05 island departure, not test-scene coordinates. */
export const skyTransferEndpoints = Object.freeze({
  summit: Object.freeze({ ...fitted.ignitionPoint }),
  sky: Object.freeze({ ...skyReturn }),
});

export function createSkyCityTransferAuthority(host: SkyTransferHost) {
  function atEndpoint(player: string, domain: SkyTransferDomain): boolean {
    const foot = host.pose(player, domain);
    const target = skyTransferEndpoints[domain];
    if (!validPoint(foot) || Math.hypot(foot.east - target.east,
      foot.north - target.north, foot.height - target.height) > 2.12) return false;
    // Only the starport rack's front-facing queue may use the ignition switch.
    return domain !== 'summit' || foot.north < target.north;
  }

  function ignitionBlocker(player: string): 'not-ignited' | 'unavailable' | 'missing-key' | 'window-closed' | undefined {
    const assembly = host.assembly(player);
    if (!assembly || assembly.ignited !== true ||
      assembly.installed.length !== starportAssemblyParts.length ||
      !starportAssemblyParts.every(part => assembly.installed.includes(part))) return 'not-ignited';
    const flag = host.ignition(player);
    if (!flag) return 'unavailable';
    if (!flag.keyOne) return 'missing-key';
    if (!flag.layersOverlap) return 'window-closed';
  }

  function qualifies(player: string, origin: SkyTransferDomain) {
    return host.ready(origin) && host.ready(origin === 'summit' ? 'sky' : 'summit') &&
      atEndpoint(player, origin) && (origin === 'sky' || !ignitionBlocker(player));
  }

  async function transfer(player: string, origin: SkyTransferDomain): Promise<SkyTransferResult> {
    if (!player || !host.ready(origin) || !host.ready(origin === 'summit' ? 'sky' : 'summit')) {
      return { kind: 'unavailable' };
    }
    const current = await host.read(player);
    if (!current || !Number.isSafeInteger(current.revision) || current.revision < 0) {
      return { kind: 'unavailable' };
    }
    if (current.domain !== origin) return { kind: 'wrong-domain' };
    if (!atEndpoint(player, origin)) return { kind: 'out-of-reach' };
    const gate = origin === 'summit' ? ignitionBlocker(player) : undefined;
    if (gate) return { kind: gate };
    const destination: SkyTransferDomain = origin === 'summit' ? 'sky' : 'summit';
    const landing = host.landing(destination);
    if (!validPoint(landing) || (destination === 'sky' && !isSkyCityPresenceFoot(
      landing.east, landing.north, landing.height)) ||
      !host.canStand(destination, landing)) return { kind: 'unsafe-landing' };
    if (!Number.isSafeInteger(current.revision + 1)) return { kind: 'unavailable' };
    const next = { revision: current.revision + 1, domain: destination };
    const committed = await host.commit(player, current.revision, next, { ...landing },
      () => qualifies(player, origin) && host.canStand(destination, landing));
    return committed ? { kind: origin === 'summit' ? 'entered' : 'returned', state: next, landing: { ...landing } }
      : { kind: 'conflict' };
  }

  return {
    /** Client requests carry no position or token; only the caller identity is accepted. */
    enter: (player: string) => transfer(player, 'summit'),
    returnToStarport: (player: string) => transfer(player, 'sky'),
  };
}
