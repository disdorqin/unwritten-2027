import { sledRadius } from './voxel-tavern/town-blockout/sled-motion.ts';
import { createSledRide } from './voxel-tavern/town-blockout/sled-ride.ts';
import { townPhysicsDelta } from './voxel-tavern/town-blockout/town-physics-clock.ts';

type Point = { east: number; north: number; height: number };
type Surface = { surface: number; deepSnow: boolean };
type SurfaceAt = (east: number, north: number) => Surface;
type Projection = { index: number; plan: number; height: number; lateral: number; spatial: number };
type ProbeOptions = {
  points: readonly Point[];
  surface: SurfaceAt;
  steering: boolean;
  widthMetres?: number;
  heightAt?: (east: number, north: number) => number | undefined;
};

const defaultWidth = 4.2;
const apronLength = 5;
const searchWindow = 12;
const steeringGain = 20;
const maxSimulationSeconds = 600;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const cap = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

export function probeMainSummitSledRide({ points, surface, steering, widthMetres = defaultWidth, heightAt }: ProbeOptions) {
  if (!Number.isFinite(widthMetres) || widthMetres <= sledRadius * 2) {
    throw new RangeError('The ribbon must be wider than the sled.');
  }
  let plan = 0;
  let spatial = 0;
  const segments = points.slice(1).map((end, index) => {
    const start = points[index];
    const east = end.east - start.east;
    const north = end.north - start.north;
    const rise = end.height - start.height;
    const span = Math.hypot(east, north);
    const spatialSpan = Math.hypot(span, rise);
    if (!(span > 0)) throw new RangeError('Each probe segment needs nonzero horizontal extent.');
    const segment = { start, east, north, rise, span, spatialSpan, plan, spatial };
    plan += span;
    spatial += spatialSpan;
    return segment;
  });
  if (!segments.length) throw new RangeError('A probe path requires at least two points.');
  const last = segments.length - 1;
  const usableHalfWidth = widthMetres / 2 - sledRadius;
  let cursor = 0;

  function project(east: number, north: number): Projection {
    let closest: Projection | undefined;
    const near = segments[cursor].plan;
    let first = cursor;
    while (first > 0 && near - segments[first].plan < searchWindow) first--;
    for (let index = first; index <= last && segments[index].plan < near + searchWindow; index++) {
      const segment = segments[index];
      const de = east - segment.start.east;
      const dn = north - segment.start.north;
      const along = (de * segment.east + dn * segment.north) / segment.span;
      const local = cap(along, index === 0 ? -apronLength : 0, segment.span + (index === last ? apronLength : 0));
      const fraction = local / segment.span;
      const lateral = Math.hypot(de - segment.east * fraction, dn - segment.north * fraction);
      if (closest && lateral >= closest.lateral) continue;
      closest = {
        index, lateral, plan: segment.plan + local,
        spatial: segment.spatial + segment.spatialSpan * fraction,
        height: segment.start.height + segment.rise * cap(fraction, 0, 1),
      };
    }
    return closest!;
  }

  function projectedTarget(planMetres: number) {
    let index = cursor;
    while (index < last && planMetres >= segments[index + 1].plan) index++;
    const { start, plan, span, east, north } = segments[index];
    const fraction = (planMetres - plan) / span;
    return { east: start.east + east * fraction, north: start.north + north * fraction };
  }

  let blockedChecks = 0;
  let wallHits = 0;
  let boundaryHits = 0;
  let maximumLateral = 0;
  let maximumFloorDeviation = 0;
  let peakSpeed = 0;
  let maximumTurn = 0;
  let airTicks = 0;
  let fullSteerTicks = 0;
  let stalledCalls = 0;
  let elapsed = 0;
  let deepSnowTicks = 0;
  let actualHorizontal = 0;
  let lastBlocked: { east: number; north: number; lateral: number; plan: number } | undefined;
  const start = points[0];
  const heading = Math.atan2(segments[0].east, segments[0].north);
  const ride = createSledRide({
    height: (east, north) => heightAt?.(east, north) ?? project(east, north).height,
    surface(east, north) {
      const snow = surface(east, north);
      if (snow.deepSnow) deepSnowTicks++;
      return snow;
    },
    blocked(east, north) {
      blockedChecks++;
      if (heightAt && heightAt(east, north) === undefined) {
        boundaryHits++;
        return true;
      }
      const projected = project(east, north);
      if (projected.lateral <= usableHalfWidth) return false;
      wallHits++;
      lastBlocked = { east, north, lateral: projected.lateral, plan: projected.plan };
      return true;
    },
    snow() {},
    stopped() { stalledCalls++; },
  });
  const startHeight = heightAt?.(start.east, start.north) ?? start.height;
  if (!ride.mount(start.east, start.north, startHeight, heading)) throw new Error('Probe mount blocked.');
  let projected = project(start.east, start.north);
  const tick = townPhysicsDelta;
  let status = 'time-limit';
  let lastAcceptedSpeed = 0;
  for (let frame = 1; frame <= maxSimulationSeconds / tick; frame++) {
    const lookAhead = Math.max(4, ride.speed() * .5);
    const target = projectedTarget(projected.plan + lookAhead);
    const old = { x: ride.spot.x, n: ride.spot.n };
    const desired = Math.atan2(target.east - old.x, target.north - old.n);
    const turn = steering ? cap(wrap(desired - ride.spot.yaw) * steeringGain / 1.5, -1, 1) : 0;
    maximumTurn = Math.max(maximumTurn, Math.abs(turn));
    if (Math.abs(turn) === 1) fullSteerTicks++;
    const before = projected;
    ride.step(tick, { forward: 1, turn });
    elapsed = frame * tick;
    if (!ride.active()) {
      status = boundaryHits ? 'host-boundary-crash' : wallHits ? 'offside-crash' : 'physics-crash';
      break;
    }
    if (ride.airborne()) airTicks++;
    lastAcceptedSpeed = ride.speed();
    peakSpeed = Math.max(peakSpeed, lastAcceptedSpeed);
    projected = project(ride.spot.x, ride.spot.n);
    cursor = projected.index;
    actualHorizontal += Math.hypot(old.x - ride.spot.x, old.n - ride.spot.n);
    maximumLateral = Math.max(maximumLateral, projected.lateral);
    const floor = heightAt?.(ride.spot.x, ride.spot.n);
    if (floor !== undefined) maximumFloorDeviation = Math.max(maximumFloorDeviation, Math.abs(floor - projected.height));
    if (projected.plan >= plan) {
      status = 'finished';
      elapsed -= tick * (projected.plan - plan) / (projected.plan - before.plan);
      break;
    }
  }
  return {
    status, elapsed, peakSpeed, lastAcceptedSpeed, plannedLength: spatial,
    measuredProjectedLength: Math.min(projected.spatial, spatial), actualHorizontal,
    widthMetres, sledRadius, usableHalfWidth, maximumLateral, maximumFloorDeviation, blockedChecks, wallHits,
    boundaryHits, lastBlocked,
    maximumTurn, fullSteerTicks, airTicks, stalledCalls, deepSnowTicks,
    finish: { east: ride.spot.x, north: ride.spot.n, height: ride.spot.y },
  };
}
