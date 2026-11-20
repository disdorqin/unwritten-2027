import {
  createAircraftFlight, type AircraftInput, type AircraftPoint, type AircraftSurface, type AircraftWorld,
} from '../../../src/shared/aircraft-flight';
import { createFlightThrust, fuelSecondsPerStardustOre } from '../../../src/shared/flight-thrust';
import { createSkyCitySite, type SkyCitySite } from './sky-city-site';

/** The flight review uses this isolated datum. A live host supplies its own island site. */
export const skyCityApproachSite = createSkyCitySite({ east: 0, north: 0, height: 750 });
export const skyCityDeparture = Object.freeze({ east: -14, north: -250, height: 796 } satisfies AircraftPoint);
export const skyCityDepartureBounds = Object.freeze({ xMin: -23, xMax: -5, zMin: 204, zLip: 250, zMax: 266 });
export const skyCityLandingLane = Object.freeze({ xMin: -16.65, xMax: -11.35, zMin: 16, zMax: 52 });

type SkyCityLandingModel = Readonly<{
  islandFloorAt(x: number, z: number): number | undefined;
  islandBlocked?(x: number, z: number, feet: number, radius: number): boolean;
}>;
type SkyCityApproachOptions = SkyCityLandingModel & Readonly<{ site?: SkyCitySite }>;

type ApproachStage = 'departure' | 'flight' | 'walking';
const dropPerMetre = 1.25;

export function skyCityDepartureFloorAt(east: number, north: number) {
  const z = -north;
  const { xMin, xMax, zMin, zLip, zMax } = skyCityDepartureBounds;
  if (east < xMin || east > xMax || z < zMin || z > zMax) return;
  return skyCityDeparture.height - Math.max(0, zLip - z) * dropPerMetre;
}

function onLandingLane(x: number, z: number) {
  const { xMin, xMax, zMin, zMax } = skyCityLandingLane;
  return x >= xMin && x <= xMax && z >= zMin && z <= zMax;
}

export function createSkyCityLanding(site: SkyCitySite, { islandFloorAt, islandBlocked }: SkyCityLandingModel) {
  return {
    surfaceAt(east: number, north: number): AircraftSurface | undefined {
      const { x, z } = site.toLocal({ east, north, height: site.origin.height });
      const height = islandFloorAt(x, z);
      if (height === undefined || !Number.isFinite(height)) return;
      // The flight model's hard-surface rollout also fits the paved landing lane.
      return { height: site.origin.height + height, kind: 'roof', slopeDegrees: 0, obstacleAhead: onLandingLane(x, z) ? 0 : 2 };
    },
    onLane(at: AircraftPoint) {
      const { x, z } = site.toLocal(at);
      return onLandingLane(x, z);
    },
    blocked(at: AircraftPoint, clearance: number) {
      const { x, y, z } = site.toLocal(at);
      return islandBlocked?.(x, z, y, clearance) ?? false;
    },
  };
}

export function createSkyCityApproach({ site = skyCityApproachSite, islandFloorAt, islandBlocked }: SkyCityApproachOptions) {
  const landing = createSkyCityLanding(site, { islandFloorAt, islandBlocked });
  function surfaceAt(east: number, north: number): AircraftSurface | undefined {
    const departureHeight = skyCityDepartureFloorAt(east, north);
    if (departureHeight !== undefined) {
      const slopeDegrees = -north < skyCityDepartureBounds.zLip ? Math.atan(dropPerMetre) * 180 / Math.PI : 0;
      return { height: departureHeight, kind: 'snow', slopeDegrees, obstacleAhead: 0 };
    }
    return landing.surfaceAt(east, north);
  }

  const world: AircraftWorld = {
    surfaceAt,
    contains(point) {
      return Math.abs(point.east) <= 400 && point.north >= -450 && point.north <= 350;
    },
    recoveryAt: () => skyCityDeparture,
    sweep(from, to, clearance) {
      const steps = Math.max(1, Math.ceil(Math.hypot(to.east - from.east, to.north - from.north, to.height - from.height) / .25));
      for (let step = 1; step <= steps; step++) {
        const fraction = step / steps;
        const east = from.east + (to.east - from.east) * fraction;
        const north = from.north + (to.north - from.north) * fraction;
        const feet = from.height + (to.height - from.height) * fraction;
        const ridge = skyCityDepartureFloorAt(east, north);
        if (ridge !== undefined && feet < ridge - .025) return 'wall';
        if (landing.blocked({ east, north, height: feet }, clearance)) return 'wall';
      }
    },
  };

  const aircraft = createAircraftFlight(world, createFlightThrust(fuelSecondsPerStardustOre));
  let stage: ApproachStage = 'departure';
  let feet: AircraftPoint = skyCityDeparture;
  let heading = 0;

  function snapshot() {
    return { stage, feet: { ...feet }, heading, flight: aircraft.snapshot() };
  }

  function launch() {
    // The isolated approach opens with an assembled craft at the departure edge.
    if (stage !== 'departure' || !aircraft.launchEdge(true, feet, 0)) return false;
    const active = aircraft.snapshot()!;
    stage = 'flight';
    feet = active.point;
    heading = active.heading;
    return true;
  }

  function advance(seconds: number, input: AircraftInput = {}) {
    if (stage !== 'flight') return snapshot();
    const next = aircraft.advance(seconds, input)!;
    feet = next.point;
    heading = next.heading;
    if (next.phase === 'landed') {
      stage = !next.recovery && next.touchdown === 'roof' && landing.onLane(feet) ? 'walking' : 'departure';
      if (stage === 'departure') heading = 0;
    }
    return snapshot();
  }

  return { launch, advance, snapshot };
}
