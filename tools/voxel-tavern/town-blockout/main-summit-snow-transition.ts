import { createSledRide } from './sled-ride';
import { sledRadius } from './sled-motion';
import { townPhysicsDelta } from './town-physics-clock';

export const surveyedSledConnection = {
  east: 1100, north: 203.337527461872, height: 175,
  heading: Math.PI / 2 - .727,
  grade: -.119972798,
} as const;

const endHeight = 18;
const lowerSlope = .14;
const startFeatherMetres = 64;
const endFeatherMetres = 40;
const legacyDropMetres = 7.630983295650992;
const legacyFeatherMetres = 120;
const halfWidth = 4.2 / 2;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const integratedSmoothstep = (t: number) => t * t * t * (1 - t / 2);

type Entry = { east: number; north: number; height: number; heading: number; grade: number };

export function createSummitSnowTransition(entry: Entry = surveyedSledConnection) {
  const entrySlope = -entry.grade;
  const initialDrop = startFeatherMetres * (entrySlope + lowerSlope) / 2;
  const finalDrop = endFeatherMetres * lowerSlope / 2;
  const cruiseDrop = entry.height - endHeight - initialDrop - finalDrop;
  if (!Object.values(entry).every(Number.isFinite) || !(entrySlope > 0 && entrySlope <= lowerSlope) || cruiseDrop <= 0) {
    throw new RangeError('The provisional lower descent requires a finite downhill anchor and sufficient elevation.');
  }
  const finalFeatherAt = startFeatherMetres + cruiseDrop / lowerSlope;
  const planMetres = finalFeatherAt + endFeatherMetres;
  const eastward = Math.sin(entry.heading);
  const northward = Math.cos(entry.heading);

  function heightAt(distance: number) {
    if (distance <= 0) return entry.height - entrySlope * distance;
    if (distance < startFeatherMetres) {
      const inverseRamp = integratedSmoothstep(distance / startFeatherMetres);
      return entry.height - entrySlope * distance - (lowerSlope - entrySlope) * startFeatherMetres * inverseRamp;
    }
    if (distance < finalFeatherAt) {
      return entry.height - initialDrop - lowerSlope * (distance - startFeatherMetres);
    }
    if (distance >= planMetres) return endHeight;
    const runout = distance - finalFeatherAt;
    return endHeight + finalDrop - lowerSlope * (runout - endFeatherMetres * integratedSmoothstep(runout / endFeatherMetres));
  }

  function gradeAt(distance: number) {
    if (distance <= 0) return entry.grade;
    if (distance < startFeatherMetres) {
      return -(entrySlope + (lowerSlope - entrySlope) * smoothstep(distance / startFeatherMetres));
    }
    if (distance < finalFeatherAt) return -lowerSlope;
    if (distance >= planMetres) return 0;
    return -lowerSlope * (1 - smoothstep((distance - finalFeatherAt) / endFeatherMetres));
  }

  function sample(distance: number) {
    return {
      east: entry.east + eastward * distance,
      north: entry.north + northward * distance,
      height: heightAt(distance),
    };
  }

  function samplePolyline(spacing = 1) {
    if (!Number.isFinite(spacing) || spacing <= 0) throw new RangeError('Spacing must be positive.');
    const samples = Math.ceil(planMetres / spacing);
    return Array.from({ length: samples + 1 }, (_, index) => sample(planMetres * index / samples));
  }

  function along(east: number, north: number) {
    return (east - entry.east) * eastward + (north - entry.north) * northward;
  }

  function lateral(east: number, north: number) {
    return (east - entry.east) * northward - (north - entry.north) * eastward;
  }

  // Comparative fixture derived from the earlier R40 edge discrepancy. The
  // independently owned P-1 height field is never written by this overlay.
  function legacyAt(distance: number) {
    if (distance < 0 || distance >= legacyFeatherMetres) return heightAt(distance);
    return heightAt(distance) - legacyDropMetres * (1 - smoothstep(distance / legacyFeatherMetres));
  }

  return {
    entry, planMetres, heightAt, gradeAt, sample, samplePolyline, along, lateral, legacyAt,
    waypoints: { startFeatherMetres, finalFeatherAt, planMetres, legacyFeatherMetres },
  };
}

type Transition = ReturnType<typeof createSummitSnowTransition>;

export function runSummitSnowJoinProbe(
  transition: Transition, surface: 'overlay' | 'legacy-drop', deepSnow = false,
) {
  const { along, lateral, sample, entry, heightAt, legacyAt, planMetres } = transition;
  const runUp = 220;
  const start = sample(-runUp);
  const ground = surface === 'overlay' ? heightAt : legacyAt;
  let wallHits = 0;
  const ride = createSledRide({
    height(east, north) { return ground(along(east, north)); },
    surface() { return { surface: 0, deepSnow }; },
    blocked(east, north) {
      const hit = Math.abs(lateral(east, north)) > halfWidth - sledRadius;
      if (hit) wallHits++;
      return hit;
    },
    snow() {},
    stopped() {},
  });
  if (!ride.mount(start.east, start.north, start.height, entry.heading)) throw new Error('The sled could not start its run-up.');
  let airborneTicks = 0;
  let airTicksNearSeam = 0;
  let maximumHeightStepNearSeam = 0;
  let maximumVerticalSeparation = 0;
  let maximumAdjacentSurfaceHeightChangeNearSeam = 0;
  let seamSeconds: number | undefined;
  let seamSpeed: number | undefined;
  let finishSeconds: number | undefined;
  let approach = -runUp;
  let clock = 0;
  const tick = townPhysicsDelta;
  for (let step = 1; step <= 180 / tick; step++) {
    const previousDistance = approach;
    const previousY = ride.spot.y;
    ride.step(tick, { forward: 1, turn: 0 });
    clock = step * tick;
    if (!ride.active()) break;
    approach = along(ride.spot.x, ride.spot.n);
    if (ride.airborne()) airborneTicks++;
    maximumVerticalSeparation = Math.max(maximumVerticalSeparation, ride.spot.y - ground(approach));
    if (approach >= -12 && approach <= 12) {
      if (ride.airborne()) airTicksNearSeam++;
      maximumHeightStepNearSeam = Math.max(maximumHeightStepNearSeam, Math.abs(ride.spot.y - previousY));
      maximumAdjacentSurfaceHeightChangeNearSeam = Math.max(
        maximumAdjacentSurfaceHeightChangeNearSeam, Math.abs(ground(approach) - ground(previousDistance)),
      );
    }
    if (seamSeconds === undefined && approach >= 0) {
      seamSeconds = clock - tick * approach / (approach - previousDistance);
      seamSpeed = ride.speed();
    }
    if (approach >= planMetres) {
      finishSeconds = clock - tick * (approach - planMetres) / (approach - previousDistance);
      break;
    }
  }
  return {
    surface, deepSnow, airborneTicks, airTicksNearSeam, maximumHeightStepNearSeam, maximumVerticalSeparation,
    maximumAdjacentSurfaceHeightChangeNearSeam, seamSeconds, seamSpeed, clock, finishSeconds,
    lowerSeconds: seamSeconds !== undefined && finishSeconds !== undefined ? finishSeconds - seamSeconds : undefined,
    crash: !ride.active(), wallHits, planarMetresRun: approach, finishHeight: ride.spot.y, finishSpeed: ride.speed(),
  };
}
