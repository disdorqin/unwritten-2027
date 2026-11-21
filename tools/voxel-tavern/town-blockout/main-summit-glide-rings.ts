import { createSnowWingFlight, type SnowWingLaunch } from '../../../src/shared/snow-wing';

type Point = Readonly<{ east: number; north: number; height: number }>;
type GroundAt = (east: number, north: number) => number | undefined;

export type SummitGlideRing = Point & Readonly<{ id: string; heading: number; radius: number }>;

export const summitGlideRingBodyLift = 1.5;
const targets = [60, 120, 190] as const;
const radius = 6;
const rimAllowance = 1;
const terrainMargin = .5;
const surveyStep = 1 / 60;

function terrainClears(ring: SummitGlideRing, groundAt: GroundAt) {
  const forwardEast = Math.sin(ring.heading);
  const forwardNorth = Math.cos(ring.heading);
  const outerRadius = ring.radius + rimAllowance;
  const lowestAllowed = ring.height - outerRadius - terrainMargin;
  // Check the entire width at the ring's lowest height, plus its front and back margin.
  for (let side = -outerRadius; side <= outerRadius; side += .5) {
    for (const depth of [-terrainMargin, 0, terrainMargin]) {
      const floor = groundAt(
        ring.east + side * forwardNorth + depth * forwardEast,
        ring.north - side * forwardEast + depth * forwardNorth,
      );
      if (floor !== undefined && (!Number.isFinite(floor) || floor >= lowestAllowed)) return false;
    }
  }
  return true;
}

export function surveySummitGlideRings(launch: SnowWingLaunch, groundAt: GroundAt): readonly SummitGlideRing[] {
  const flight = createSnowWingFlight(groundAt);
  if (!flight.launch(launch)) return [];
  let current = flight.snapshot()!;
  let previous = current;
  const rings: SummitGlideRing[] = [];

  for (const [index, target] of targets.entries()) {
    while (current.horizontalMetres < target) {
      previous = current;
      const next = flight.advance(surveyStep);
      if (!next?.usesBothHands) return [];
      current = next;
    }
    const t = (target - previous.horizontalMetres) / (current.horizontalMetres - previous.horizontalMetres);
    const ring: SummitGlideRing = {
      id: `ring-${index + 1}`,
      east: previous.east + (current.east - previous.east) * t,
      north: previous.north + (current.north - previous.north) * t,
      height: previous.height + (current.height - previous.height) * t + summitGlideRingBodyLift,
      heading: launch.heading,
      radius,
    };
    if (!terrainClears(ring, groundAt)) return [];
    rings.push(ring);
  }
  return rings;
}

/** Shared geometric authority: report the exact forward plane intersection and radial miss. */
export function sampleSummitGlideRingPlane(ring: SummitGlideRing, previous: Point, current: Point) {
  const forwardEast = Math.sin(ring.heading);
  const forwardNorth = Math.cos(ring.heading);
  const before = (previous.east - ring.east) * forwardEast + (previous.north - ring.north) * forwardNorth;
  const after = (current.east - ring.east) * forwardEast + (current.north - ring.north) * forwardNorth;
  if (!(before < 0 && after >= 0)) return;

  const t = -before / (after - before);
  const east = previous.east + (current.east - previous.east) * t - ring.east;
  const north = previous.north + (current.north - previous.north) * t - ring.north;
  const height = previous.height + (current.height - previous.height) * t - ring.height;
  const side = east * forwardNorth - north * forwardEast;
  return { fraction: t, radialMetres: Math.hypot(side, height) };
}

function crossing(ring: SummitGlideRing, previous: Point, current: Point) {
  const sample = sampleSummitGlideRingPlane(ring, previous, current);
  return sample && sample.radialMetres <= ring.radius ? sample.fraction : undefined;
}

export function createSummitGlideRingProgress(rings: readonly SummitGlideRing[]) {
  const passed: string[] = [];
  return {
    advance(previous: Point, current: Point) {
      let previousCrossing = -1;
      while (passed.length < rings.length) {
        const ring = rings[passed.length]!;
        const t = crossing(ring, previous, current);
        if (t === undefined || t <= previousCrossing) break;
        passed.push(ring.id);
        previousCrossing = t;
      }
    },
    snapshot(): readonly string[] {
      return [...passed];
    },
  };
}
