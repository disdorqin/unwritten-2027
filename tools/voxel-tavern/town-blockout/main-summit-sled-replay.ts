import { createSledMotion } from './sled-motion';
import { townPhysicsDelta } from './town-physics-clock';

const summitSledStages = ['above-cloud', 'through-cloud', 'below-cloud'] as const;
const gradeLookAheadMetres = 1.5;
export const summitSledTimeTargetSeconds = 240;

type SummitSledStage = typeof summitSledStages[number];
type RoutePoint = { east: number; north: number; height: number };
type RouteArc = { id: SummitSledStage; points: readonly RoutePoint[] };
type SummitSledRoute = { arcs: readonly RouteArc[] };
type RouteSample = RoutePoint & { distanceMetres: number; stage: SummitSledStage };
type SurfaceAt = (sample: RouteSample) => { surface: number; deepSnow: boolean };
type ReplayStatus = 'running' | 'finished' | 'time-limit';
type Snapshot = RouteSample & { elapsedSeconds: number; speed: number; status: ReplayStatus };

type RouteSegment = {
  start: RoutePoint;
  end: RoutePoint;
  stage: SummitSledStage;
  startPlan: number;
  endPlan: number;
  startDistance: number;
  endDistance: number;
};

function surveyReplayRoute(arcs: readonly RouteArc[]) {
  if (arcs.length !== summitSledStages.length ||
      arcs.some(({ id }, index) => id !== summitSledStages[index])) {
    throw new RangeError('A summit sled replay needs the three connected stages in descent order.');
  }
  const segments: RouteSegment[] = [];
  const boundaries: number[] = [];
  let planLength = 0;
  let distance = 0;
  for (const { id, points } of arcs) {
    if (points.length < 2 || points.some(({ east, north, height }) =>
      ![east, north, height].every(Number.isFinite))) {
      throw new RangeError('Each replay stage needs at least two finite points.');
    }
    const previousEnd = segments.at(-1)?.end;
    if (previousEnd && Math.hypot(previousEnd.east - points[0].east, previousEnd.north - points[0].north,
      previousEnd.height - points[0].height) > 1e-6) {
      throw new RangeError('Replay stage endpoints must connect.');
    }
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1];
      const end = points[index];
      const span = Math.hypot(end.east - start.east, end.north - start.north);
      if (span <= 0) throw new RangeError('A sled replay segment must have a positive horizontal length.');
      const surfaceLength = Math.hypot(span, end.height - start.height);
      segments.push({
        start, end, stage: id, startPlan: planLength, endPlan: planLength + span,
        startDistance: distance, endDistance: distance + surfaceLength,
      });
      planLength += span;
      distance += surfaceLength;
    }
    boundaries.push(planLength);
  }

  function sample(planMetres: number): RouteSample {
    let left = 0;
    let right = segments.length - 1;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (planMetres < segments[middle].endPlan) right = middle;
      else left = middle + 1;
    }
    const { start, end, stage, startPlan, endPlan, startDistance, endDistance } = segments[left];
    const fraction = (planMetres - startPlan) / (endPlan - startPlan);
    return {
      east: start.east + (end.east - start.east) * fraction,
      north: start.north + (end.north - start.north) * fraction,
      height: start.height + (end.height - start.height) * fraction,
      distanceMetres: startDistance + (endDistance - startDistance) * fraction,
      stage,
    };
  }
  return { sample, planLength, boundaries, totalDistanceMetres: distance };
}

const packedSnow: SurfaceAt = () => ({ surface: 0, deepSnow: false });

// Follow the surveyed centreline with the real ground integrator. This fixture
// isolates grade, snow depth and traversal time from steering and collision.
export function createSummitSledReplay(
  route: SummitSledRoute, surfaceAt: SurfaceAt = packedSnow, maximumSeconds = 600,
) {
  if (!Number.isFinite(maximumSeconds) || maximumSeconds < townPhysicsDelta) {
    throw new RangeError('The sled replay needs a finite time limit of at least one physics tick.');
  }
  const { sample, planLength, boundaries, totalDistanceMetres } = surveyReplayRoute(route.arcs);
  const motion = createSledMotion();
  motion.reset(0);
  const crossings: Snapshot[] = [];
  let planMetres = 0;
  let elapsedSeconds = 0;
  let remainder = 0;
  let maximumSpeed = 0;
  let status: ReplayStatus = 'running';

  function snapshot(): Snapshot {
    return { ...sample(planMetres), elapsedSeconds, speed: motion.state.speed, status };
  }

  function advance(seconds: number): Snapshot {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid elapsed replay time.');
    remainder += seconds;
    while (status === 'running' && remainder + 1e-9 >= townPhysicsDelta) {
      const dt = Math.min(townPhysicsDelta, maximumSeconds - elapsedSeconds);
      const from = sample(planMetres);
      const movedBackward = motion.state.north < -.15;
      const probe = planMetres + (movedBackward ? -gradeLookAheadMetres : gradeLookAheadMetres);
      const ahead = sample(Math.max(0, Math.min(planLength, probe)));
      const grade = (ahead.height - from.height) / gradeLookAheadMetres;
      const next = motion.step(dt, { forward: 1, turn: 0 }, { ...surfaceAt(from), grade });
      maximumSpeed = Math.max(maximumSpeed, next.speed);
      const target = planMetres + next.north * dt;
      while (crossings.length < boundaries.length - 1 && target >= boundaries[crossings.length]) {
        const boundary = boundaries[crossings.length];
        const crossingTime = elapsedSeconds + dt * (boundary - planMetres) / (target - planMetres);
        crossings.push({ ...sample(boundary), elapsedSeconds: crossingTime, speed: next.speed, status: 'running' });
      }
      if (target >= planLength) {
        elapsedSeconds += dt * (planLength - planMetres) / (target - planMetres);
        planMetres = planLength;
        status = 'finished';
      } else {
        elapsedSeconds += dt;
        planMetres = Math.max(0, target);
        if (elapsedSeconds >= maximumSeconds) status = 'time-limit';
      }
      remainder -= townPhysicsDelta;
    }
    return snapshot();
  }

  return { advance, snapshot, totalDistanceMetres, crossings: () => [...crossings], maximumSpeed: () => maximumSpeed };
}

export function replaySummitSled(route: SummitSledRoute, surfaceAt?: SurfaceAt, maximumSeconds?: number) {
  const replay = createSummitSledReplay(route, surfaceAt, maximumSeconds);
  const samples = [replay.snapshot()];
  while (samples.at(-1)?.status === 'running') samples.push(replay.advance(1));
  const end = replay.snapshot();
  const crossings = replay.crossings();
  const checkpoints = [samples[0], ...crossings, end];
  const stages = checkpoints.slice(0, -1).map((start, index) => {
    const finish = checkpoints[index + 1];
    return {
      id: start.stage, startSeconds: start.elapsedSeconds, endSeconds: finish.elapsedSeconds,
      distanceMetres: finish.distanceMetres - start.distanceMetres,
      durationSeconds: finish.elapsedSeconds - start.elapsedSeconds,
    };
  });
  return {
    ...end, maximumSpeed: replay.maximumSpeed(),
    meetsTimeTarget: end.status === 'finished' && end.elapsedSeconds < summitSledTimeTargetSeconds,
    trajectory: [...samples, ...crossings].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds),
    stages,
  };
}
