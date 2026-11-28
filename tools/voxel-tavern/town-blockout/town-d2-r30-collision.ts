import { mainSummitBounds } from './main-summit-block';
import { sampleTownD2R30Height, townD2R30GridAxis, townD2R30Spec } from './town-d2-r30-domain';

export type TownD2R30CollisionOptions = Readonly<{
  spacing?: number;
  arrivalHeight?: number;
  heightAt?: (east: number, north: number) => number | undefined;
  preparedHeights?:Float32Array;
}>;

export type TownD2R30CollisionPoint = Readonly<{ east: number; north: number; height: number }>;
export type TownD2R30CollisionPosition = Readonly<{ east: number; north: number; height?: number }>;
export type TownD2R30CollisionRayHit = Readonly<{
  point: TownD2R30CollisionPoint;
  distance: number;
  distanceTravelled: number;
}>;
export type TownD2R30CollisionSweepResult =
  | Readonly<{ safe: true; height: number; blockedAt?: never }>
  | Readonly<{ safe: false; blockedAt: TownD2R30CollisionPosition; height?: never }>;
export type TownD2R30CollisionStats = Readonly<{
  spacing: number;
  eastVertices: number;
  northVertices: number;
  vertexCount: number;
  triangleCount: number;
  heightSamples: number;
  disposed: boolean;
}>;

export type TownD2R30Collision = Readonly<{
  surfaceAt(east: number, north: number): number | undefined;
  normalAt(east: number, north: number): [number, number, number] | undefined;
  slopeAt(east: number, north: number): number | undefined;
  supportsFoot(east: number, north: number, radius?: number): boolean;
  raycast(origin: TownD2R30CollisionPoint, direction: TownD2R30CollisionPoint,
    maxDistance: number): TownD2R30CollisionRayHit | undefined;
  sweep(from: TownD2R30CollisionPosition, to: TownD2R30CollisionPosition,
    radius: number, bodyHeight: number): TownD2R30CollisionSweepResult;
  stats(): TownD2R30CollisionStats;
  dispose(): void;
}>;

const DEFAULT_ARRIVAL_HEIGHT = 347;
const DEFAULT_FOOT_RADIUS = .27;
const FOOT_SAMPLES = 16;
const MAX_FOOT_SLOPE = 55 * Math.PI / 180;
const SLOPE_EPSILON = 1e-10;
const SWEEP_STEP = .5;
const RAY_STEP = .5;
const RAY_BISECTIONS = 20;

type SurfaceSample = Readonly<{ height: number; eastRise: number; northRise: number }>;

function axisLocation(axis: readonly number[], value: number) {
  let lower = 0, upper = axis.length - 1;
  while (lower <= upper) {
    const middle = (lower + upper) >> 1;
    const coordinate = axis[middle]!;
    if (coordinate < value) lower = middle + 1;
    else if (coordinate > value) upper = middle - 1;
    else return {
      cell: Math.min(middle, axis.length - 2), fraction: middle === axis.length - 1 ? 1 : 0,
      vertex: middle,
    };
  }
  const cell = Math.max(0, Math.min(lower - 1, axis.length - 2));
  const start = axis[cell]!, end = axis[cell + 1]!;
  return { cell, fraction: (value - start) / (end - start), vertex: -1 };
}

export function sampleD2CanonicalCollision(arrivalHeight=347){
 const e=townD2R30GridAxis(mainSummitBounds.west,mainSummitBounds.east,townD2R30Spec.collisionSpacing),n=townD2R30GridAxis(mainSummitBounds.south,mainSummitBounds.north,townD2R30Spec.collisionSpacing);
 const heights=new Float32Array(e.length*n.length);
 for(let j=0;j<n.length;j++)for(let i=0;i<e.length;i++)heights[j*e.length+i]=sampleTownD2R30Height(e[i]!,n[j]!,arrivalHeight)??NaN;
 return heights;
}

/** Cached height-field collision using the same two triangles per cell as the massif mesh. */
export function createTownD2R30Collision(options: TownD2R30CollisionOptions = {}): TownD2R30Collision {
  const spacing = options.spacing ?? townD2R30Spec.collisionSpacing;
  const arrivalHeight = options.arrivalHeight ?? DEFAULT_ARRIVAL_HEIGHT;
  if (!Number.isFinite(spacing) || spacing <= 0) throw new RangeError('Invalid D2-R30 collision spacing.');
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid D2-R30 arrival height.');
  const heightAt = options.heightAt ?? ((east: number, north: number) =>
    sampleTownD2R30Height(east, north, arrivalHeight));

  let eastAxis = townD2R30GridAxis(mainSummitBounds.west, mainSummitBounds.east, spacing);
  let northAxis = townD2R30GridAxis(mainSummitBounds.south, mainSummitBounds.north, spacing);
  const eastVertices = eastAxis.length, northVertices = northAxis.length;
  const vertexCount = eastVertices * northVertices;
  const triangleCount = (eastVertices - 1) * (northVertices - 1) * 2;
  // Match the visible mesh's Float32 positions exactly. Collision therefore
  // interpolates the rendered triangles, not a separate higher-frequency field.
  const heights = options.preparedHeights??new Float32Array(vertexCount);
  if(heights.length!==vertexCount)throw Error('Prepared collision grid dimensions changed');
  let heightSamples = options.preparedHeights?vertexCount:0;
  if(!options.preparedHeights)for (let row = 0; row < northVertices; row++) {
    for (let column = 0; column < eastVertices; column++) {
      const value = heightAt(eastAxis[column]!, northAxis[row]!);
      heights[row * eastVertices + column] = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
      heightSamples++;
    }
  }
  const metadata = Object.freeze({ spacing, eastVertices, northVertices, vertexCount, triangleCount, heightSamples });
  let disposed = false;

  function sampleSurface(east: number, north: number): SurfaceSample | undefined {
    if (disposed || !Number.isFinite(east) || !Number.isFinite(north) ||
        east < mainSummitBounds.west || east > mainSummitBounds.east ||
        north < mainSummitBounds.south || north > mainSummitBounds.north) return;
    const eastLocation = axisLocation(eastAxis, east), northLocation = axisLocation(northAxis, north);
    const column = eastLocation.cell, row = northLocation.cell;
    const west = eastAxis[column]!, eastEdge = eastAxis[column + 1]!;
    const south = northAxis[row]!, northEdge = northAxis[row + 1]!;
    const width = eastEdge - west, depth = northEdge - south;
    const offset = row * eastVertices;
    const a = heights[offset + column]!, b = heights[offset + column + 1]!;
    const c = heights[offset + eastVertices + column]!, d = heights[offset + eastVertices + column + 1]!;

    // Return the cached sampler value itself at a shared grid vertex, without
    // allowing interpolation arithmetic to perturb an anchor by one ulp.
    if (eastLocation.vertex >= 0 && northLocation.vertex >= 0) {
      const height = heights[northLocation.vertex * eastVertices + eastLocation.vertex]!;
      if (!Number.isFinite(height)) return;
      const eastRise = eastLocation.vertex === eastVertices - 1 ? (d - c) / width : (b - a) / width;
      const northRise = northLocation.vertex === northVertices - 1 ? (d - b) / depth : (c - a) / depth;
      return { height, eastRise, northRise };
    }

    const u = eastLocation.fraction, v = northLocation.fraction;
    if (u + v <= 1) {
      if (![a, b, c].every(Number.isFinite)) return;
      return {
        height: a + (b - a) * u + (c - a) * v,
        eastRise: (b - a) / width,
        northRise: (c - a) / depth,
      };
    }
    if (![b, c, d].every(Number.isFinite)) return;
    return {
      height: (1 - v) * b + (u + v - 1) * d + (1 - u) * c,
      eastRise: (d - c) / width,
      northRise: (d - b) / depth,
    };
  }

  function surfaceAt(east: number, north: number) {
    return sampleSurface(east, north)?.height;
  }

  function normalAt(east: number, north: number): [number, number, number] | undefined {
    const sample = sampleSurface(east, north);
    if (!sample) return;
    const length = Math.hypot(sample.eastRise, 1, sample.northRise);
    return [-sample.eastRise / length, 1 / length, -sample.northRise / length];
  }

  function slopeAt(east: number, north: number) {
    const sample = sampleSurface(east, north);
    return sample ? Math.atan(Math.hypot(sample.eastRise, sample.northRise)) : undefined;
  }

  function supportsFoot(east: number, north: number, radius = DEFAULT_FOOT_RADIUS) {
    if (disposed || !Number.isFinite(east) || !Number.isFinite(north) ||
        !Number.isFinite(radius) || radius < 0) return false;
    const centreSlope = slopeAt(east, north);
    if (centreSlope === undefined || centreSlope > MAX_FOOT_SLOPE + SLOPE_EPSILON) return false;
    for (let index = 0; index < FOOT_SAMPLES; index++) {
      const angle = index * Math.PI * 2 / FOOT_SAMPLES;
      const slope = slopeAt(east + Math.cos(angle) * radius, north + Math.sin(angle) * radius);
      if (slope === undefined || slope > MAX_FOOT_SLOPE + SLOPE_EPSILON) return false;
    }
    return true;
  }

  function raycast(origin: TownD2R30CollisionPoint, direction: TownD2R30CollisionPoint,
    maxDistance: number): TownD2R30CollisionRayHit | undefined {
    if (disposed || !origin || !direction || ![origin.east, origin.north, origin.height,
      direction.east, direction.north, direction.height, maxDistance].every(Number.isFinite) ||
      maxDistance < 0) return;
    const directionLength = Math.hypot(direction.east, direction.north, direction.height);
    if (directionLength === 0) return;
    const unit = {
      east: direction.east / directionLength,
      north: direction.north / directionLength,
      height: direction.height / directionLength,
    };
    const pointAt = (distance: number): TownD2R30CollisionPoint => ({
      east: origin.east + unit.east * distance,
      north: origin.north + unit.north * distance,
      height: origin.height + unit.height * distance,
    });
    const hitAt = (distance: number): TownD2R30CollisionRayHit | undefined => {
      const point = pointAt(distance);
      const height = surfaceAt(point.east, point.north);
      if (height === undefined) return;
      return {
        point: { east: point.east, north: point.north, height },
        distance,
        distanceTravelled: distance,
      };
    };

    const initialGround = surfaceAt(origin.east, origin.north);
    if (initialGround === undefined) return;
    if (origin.height <= initialGround) return hitAt(0);
    let previousDistance = 0;
    const steps = Math.ceil(maxDistance / RAY_STEP);
    for (let step = 1; step <= steps; step++) {
      const distance = Math.min(step * RAY_STEP, maxDistance);
      const point = pointAt(distance);
      const ground = surfaceAt(point.east, point.north);
      if (ground === undefined) return;
      if (point.height <= ground) {
        let low = previousDistance, high = distance;
        for (let iteration = 0; iteration < RAY_BISECTIONS; iteration++) {
          const middle = (low + high) / 2;
          const candidate = pointAt(middle);
          const height = surfaceAt(candidate.east, candidate.north);
          if (height === undefined) return;
          if (candidate.height <= height) high = middle;
          else low = middle;
        }
        return hitAt(high);
      }
      previousDistance = distance;
    }
    return;
  }

  function sweep(from: TownD2R30CollisionPosition, to: TownD2R30CollisionPosition,
    radius: number, bodyHeight: number): TownD2R30CollisionSweepResult {
    if (!from || !to) return { safe: false, blockedAt: { east: NaN, north: NaN } };
    if (disposed || ![from.east, from.north, to.east, to.north, radius, bodyHeight].every(Number.isFinite) ||
        radius < 0 || bodyHeight < 0) return { safe: false, blockedAt: { ...from } };
    const eastDelta = to.east - from.east, northDelta = to.north - from.north;
    const length = Math.hypot(eastDelta, northDelta);
    const positionAt = (distance: number): TownD2R30CollisionPosition => {
      const weight = length === 0 ? 0 : distance / length;
      const position: { east: number; north: number; height?: number } = {
        east: from.east + eastDelta * weight,
        north: from.north + northDelta * weight,
      };
      if (typeof from.height === 'number' && Number.isFinite(from.height) &&
          typeof to.height === 'number' && Number.isFinite(to.height)) {
        position.height = from.height + (to.height - from.height) * weight;
      }
      return position;
    };
    const blockedAt = (position: TownD2R30CollisionPosition, ground?: number) => ({
      safe: false as const,
      blockedAt: ground === undefined ? position : { ...position, height: ground },
    });

    const steps = Math.ceil(length / SWEEP_STEP);
    let previousGround: number | undefined;
    for (let step = 0; step <= steps; step++) {
      const position = positionAt(Math.min(step * SWEEP_STEP, length));
      const ground = surfaceAt(position.east, position.north);
      if (ground === undefined || !supportsFoot(position.east, position.north, radius) ||
          (previousGround !== undefined && ground - previousGround > bodyHeight + SLOPE_EPSILON)) {
        return blockedAt(position, ground);
      }
      previousGround = ground;
    }
    return { safe: true, height: previousGround! };
  }

  function stats(): TownD2R30CollisionStats {
    return Object.freeze({ ...metadata, disposed });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    heights.fill(NaN);
    eastAxis = [];
    northAxis = [];
  }

  return Object.freeze({ surfaceAt, normalAt, slopeAt, supportsFoot, raycast, sweep, stats, dispose });
}
