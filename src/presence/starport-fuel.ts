import { isFlightFieldPoint, type FlightFieldPoint } from '../shared/flight-field.js';
import { fuelSecondsPerStardustOre } from '../shared/flight-thrust.js';

export type StarportFuelProfile = Readonly<{
  revision: number; assembled: boolean; stardustOre: number; fuelSeconds: number;
}>;

export type StarportFuelFoot = Readonly<{ area: string; at: FlightFieldPoint; grounded: boolean }>;

function atDispenser(foot: StarportFuelFoot | undefined, area: string, point: FlightFieldPoint) {
  return Boolean(foot && foot.grounded && foot.area === area && isFlightFieldPoint(foot.at) &&
    Math.abs(foot.at.height - point.height) <= .43 &&
    Math.hypot(foot.at.east - point.east, foot.at.north - point.north) <= 1.1);
}

/** F-6 host-owned refill. No player-supplied inventory or position is trusted. */
export function createStarportFuelDispenser(station: { area: string; point: FlightFieldPoint }, host: {
  foot(player: number): StarportFuelFoot | undefined;
  profile(player: number): StarportFuelProfile | undefined;
  /** Atomically replaces the profile only while its revision matches the old revision. */
  commit(player: number, oldRevision: number, next: StarportFuelProfile): boolean;
}) {
  const { area, point } = station;
  if (!area || !isFlightFieldPoint(point)) throw new RangeError('Invalid starport fuel station');
  const position = { ...point };

  function read(player: number) {
    if (!Number.isSafeInteger(player) || player < 1 || !atDispenser(host.foot(player), area, position)) return;
    const profile = host.profile(player);
    if (!profile || !profile.assembled || !Number.isSafeInteger(profile.revision) || profile.revision < 0 ||
        !Number.isSafeInteger(profile.stardustOre) || profile.stardustOre < 0 ||
        !Number.isFinite(profile.fuelSeconds) || profile.fuelSeconds < 0) return;
    return profile;
  }

  return {
    inspect(player: number) {
      const profile = read(player);
      if (profile) return { revision: profile.revision, ore: profile.stardustOre, fuelSeconds: profile.fuelSeconds,
        fullThrustSecondsPerOre: fuelSecondsPerStardustOre };
    },
    refill(player: number, expectedRevision: number) {
      const profile = read(player);
      if (!profile || profile.revision !== expectedRevision || !profile.stardustOre) return false;
      const next = { ...profile, revision: profile.revision + 1, stardustOre: profile.stardustOre - 1,
        fuelSeconds: profile.fuelSeconds + fuelSecondsPerStardustOre };
      if (!Number.isSafeInteger(next.revision) || !Number.isFinite(next.fuelSeconds) || next.fuelSeconds <= profile.fuelSeconds) {
        return false;
      }
      return host.commit(player, profile.revision, next);
    },
  };
}
