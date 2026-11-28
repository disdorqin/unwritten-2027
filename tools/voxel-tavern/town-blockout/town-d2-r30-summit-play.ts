import {
  createMainSummitRegistration,
  createMainSummitRegistrationLandmarks,
  withinMainSummitRegistrationReach,
} from './main-summit-registration';
import type { TownD2R30NorthWall } from './town-d2-r30-north-wall';
import { townD2R30NorthWallSpec } from './town-d2-r30-north-wall';

/**
 * D32-P1: the original summit play, bound to the real production bodies.
 *
 * Nothing here builds a second mountain, a second inventory or a second
 * weather authority. It binds the already-mounted hut, monument, registrar,
 * north-wall climb and glide course into the interaction contract the player
 * actually needs:
 *  - climb-up registration and the snow-wing grant at the hut,
 *  - the two-level passport (front terrace stamp, then summit stamp),
 *  - the climb with its 15-20 m rest ledges, where an ice slip returns to the
 *    ledge below and never costs health,
 *  - climbing closed during a high-mountain blizzard,
 *  - the 6:1 glide envelope the snow wing flies inside.
 */

export type SummitPlayPoint = Readonly<{ east: number; north: number; height: number }>;

export type SummitPassport = Readonly<{
  cloudStamped: boolean;
  summitStamped: boolean;
  summitRegistered: boolean;
  snowWingEligible: boolean;
  /** The two-level passport: level 1 is the front terrace stamp, level 2 needs
   * the summit stamp as well. */
  level: 0 | 1 | 2;
  snowWingGranted: boolean;
}>;

export type SummitPlayOptions = Readonly<{
  northWall?: TownD2R30NorthWall;
  supportAt(east: number, north: number): number | undefined;
  blocked(east: number, north: number, height: number, radius?: number, bodyHeight?: number): boolean;
  /** Same-source snow tier 0..5 from the production host. */
  snowTierAt(east: number, north: number): number | undefined;
  /** Persisted passport, so a returning player keeps their stamps. */
  saved?: Partial<{ cloudStamped: boolean; summitStamped: boolean; summitRegistered: boolean }>;
}>;

/** Blizzard closes the wall: tier 5 is the design's high-mountain blizzard. */
const BLIZZARD_TIER = 5;
/** The snow wing's original glide ratio. */
const GLIDE_RATIO = 6;

export function createTownD2R30SummitPlay(options: SummitPlayOptions) {
  const landmarks = createMainSummitRegistrationLandmarks();
  const registration = createMainSummitRegistration(landmarks, options.saved);
  const ledges = options.northWall?.climbLedges ?? [];
  let snowWingGranted = false;

  function passport(): SummitPassport {
    const state = registration.snapshot();
    const level: 0 | 1 | 2 = state.summitStamped ? 2 : state.cloudStamped ? 1 : 0;
    return Object.freeze({
      ...state,
      level,
      snowWingGranted,
    });
  }

  /** The hut registrar: registration and stamping at the real anchors, in the
   * real reach. Returns 'out-of-range' where there is nothing to interact with
   * — never a speculative success. */
  function interact(area: 'cloud-deck' | 'summit', position: SummitPlayPoint) {
    if (!position || ![position.east, position.north, position.height].every(Number.isFinite)) {
      throw new RangeError('Summit interaction needs a finite foot position.');
    }
    const result = registration.interact(area, position);
    if (result.action !== 'out-of-range') {
      // The grant is not a separate inventory: it is exactly the eligibility
      // the registration already publishes.
      snowWingGranted = result.profile.snowWingEligible === true;
    }
    return Object.freeze({ ...result, passport: passport() });
  }

  /** Number of the ledge the feet stand on, or -1 when not on the wall. */
  function ledgeAt(position: SummitPlayPoint) {
    if (!Number.isFinite(position.east) || !Number.isFinite(position.north)) return -1;
    let found = -1, best = Infinity;
    ledges.forEach((ledge, index) => {
      const distance = Math.hypot(position.east - ledge.east, position.north - ledge.north);
      if (distance < best && distance <= 3.2 && Math.abs(position.height - ledge.ground) <= 1.2) {
        best = distance;
        found = index;
      }
    });
    return found;
  }

  /** Climbing is refused while a high-mountain blizzard is running: the design
   * closes the wall, it does not merely slow the player. */
  function canClimb(position: SummitPlayPoint) {
    const tier = options.snowTierAt(position.east, position.north);
    if (tier === undefined) return Object.freeze({ ok: false as const, reason: 'no-ground' as const });
    if (tier >= BLIZZARD_TIER) return Object.freeze({ ok: false as const, reason: 'blizzard' as const, tier });
    if (ledgeAt(position) < 0) return Object.freeze({ ok: false as const, reason: 'not-on-wall' as const, tier });
    return Object.freeze({ ok: true as const, tier });
  }

  /** An ice slip drops the player to the ledge below. It never damages them. */
  function slip(position: SummitPlayPoint) {
    if (!canClimb(position).ok) return Object.freeze({ landed: false as const, damage: 0 as const });
    const index = ledgeAt(position);
    const target = ledges[Math.max(0, index - 1)];
    if (!target) return Object.freeze({ landed: false as const, damage: 0 as const });
    return Object.freeze({
      landed: true as const,
      damage: 0 as const,
      ledge: index === 0 ? 0 : index - 1,
      to: Object.freeze({ east: target.east, north: target.north, height: target.ground }),
      /** Sliding is only safe when the ledge below is real support. */
      supported: options.supportAt(target.east, target.north) !== undefined,
    });
  }

  /** The 6:1 envelope: fly out along a real heading and find where the descent
   * gradient actually meets the mountain, so the plan reports a real landing
   * instead of a made-up reach. */
  function planGlide(from: SummitPlayPoint, headingEast = 0, headingNorth = 1) {
    if (!snowWingGranted) return Object.freeze({ ok: false as const, reason: 'no-snow-wing' as const });
    const launch = townD2R30NorthWallSpec.lookout;
    const atLaunch = Math.hypot(from.east - launch.east, from.north - launch.north) <=
      Math.max(launch.width, launch.depth) / 2 + 1.2;
    if (!atLaunch) return Object.freeze({ ok: false as const, reason: 'not-at-glide-deck' as const });
    const length = Math.hypot(headingEast, headingNorth);
    if (!Number.isFinite(length) || length === 0) {
      return Object.freeze({ ok: false as const, reason: 'no-heading' as const });
    }
    const unitEast = headingEast / length, unitNorth = headingNorth / length;
    const start = options.supportAt(from.east, from.north);
    if (start === undefined) return Object.freeze({ ok: false as const, reason: 'no-ground' as const });
    // Walk the glide slope until the terrain meets the flight path.
    for (let distance = 2; distance <= 1_200; distance += 2) {
      const east = from.east + unitEast * distance;
      const north = from.north + unitNorth * distance;
      const ground = options.supportAt(east, north);
      // Leaving the canonical domain ends the flight: report it as no landing
      // rather than inventing a point in the void.
      if (ground === undefined) return Object.freeze({ ok: false as const, reason: 'out-of-domain' as const });
      const altitude = from.height - distance / GLIDE_RATIO;
      if (ground >= altitude) {
        return Object.freeze({
          ok: true as const,
          ratio: GLIDE_RATIO,
          reachMetres: distance,
          start: Object.freeze({ ...from }),
          landing: Object.freeze({ east, north, height: ground }),
          supported: ground !== undefined && !options.blocked(east, north, ground),
        });
      }
    }
    return Object.freeze({ ok: false as const, reason: 'no-landing' as const });
  }

  function stats() {
    return Object.freeze({
      ledges: ledges.length,
      ledgeRiseMin: 15,
      ledgeRiseMax: 20,
      blizzardTier: BLIZZARD_TIER,
      glideRatio: GLIDE_RATIO,
      registrars: 3,
      landmarks: Object.freeze({
        hut: landmarks.summit.hut,
        registry: landmarks.summit.registry,
        summitStamp: landmarks.summit.stampPoint,
        cloudStamp: landmarks.cloudDeck.stampPoint,
      }),
      reach: Object.freeze({
        registry: withinMainSummitRegistrationReach(landmarks.summit.registry, landmarks.summit.registry),
      }),
    });
  }

  return { passport, interact, canClimb, slip, planGlide, ledgeAt, ledger: ledges, stats };
}

export type TownD2R30SummitPlay = ReturnType<typeof createTownD2R30SummitPlay>;
