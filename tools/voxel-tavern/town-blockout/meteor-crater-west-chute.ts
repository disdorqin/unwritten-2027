type HorizontalPoint = Readonly<{ east: number; north: number }>;
type LocalPoint = { offset: number; distance: number; height: number };

export type MeteorCraterWestChutePlan = Readonly<{
  entry: HorizontalPoint;
  gravelStart: HorizontalPoint;
  halfWidth: number;
  gravelLength: number;
  shaft: HorizontalPoint & Readonly<{ radius: number }>;
  // Signed horizontal distance to the surface pond: positive on dry ground.
  pondDistanceAt(east: number, north: number): number;
  shoreReach: number;
  // Indexed crater render surface in the same EN frame, with Three.js z = -north.
  surface: Readonly<{ positions: ArrayLike<number>; indices: ArrayLike<number> }>;
}>;

function clip(
  polygon: LocalPoint[], axis: 'offset' | 'distance', limit: number, sign: 1 | -1,
) {
  const clipped: LocalPoint[] = [];
  let previous = polygon.at(-1);
  if (!previous) return clipped;
  let outside = sign * (previous[axis] - limit);
  for (const point of polygon) {
    const nextOutside = sign * (point[axis] - limit);
    if ((outside > 0) !== (nextOutside > 0)) {
      const t = outside / (outside - nextOutside);
      clipped.push({
        offset: previous.offset + (point.offset - previous.offset) * t,
        distance: previous.distance + (point.distance - previous.distance) * t,
        height: previous.height + (point.height - previous.height) * t,
        [axis]: limit,
      });
    }
    if (nextOutside <= 0) clipped.push(point);
    previous = point;
    outside = nextOutside;
  }
  return clipped;
}

function orient(a: LocalPoint, b: LocalPoint, c: LocalPoint) {
  return (b.offset - a.offset) * (c.distance - a.distance) - (b.distance - a.distance) * (c.offset - a.offset);
}

export function createMeteorCraterWestChute(plan: MeteorCraterWestChutePlan) {
  const { entry, gravelStart, gravelLength, halfWidth, shaft, pondDistanceAt, shoreReach, surface } = plan;
  const { east, north } = entry;
  const eastSpan = gravelStart.east - east;
  const northSpan = gravelStart.north - north;
  const slideLength = Math.hypot(eastSpan, northSpan);
  const fullLength = slideLength + gravelLength;
  if (![east, north, fullLength, halfWidth, shaft.east, shaft.north, shaft.radius, shoreReach].every(Number.isFinite) ||
      slideLength <= 0 || halfWidth <= 0 || gravelLength <= 0 || shaft.radius <= 0 || shoreReach <= 0 ||
      surface.positions.length % 3 !== 0 || surface.indices.length % 3 !== 0) {
    throw new RangeError('The west chute needs a finite site, shaft and indexed crater surface');
  }

  const forwardEast = eastSpan / slideLength;
  const forwardNorth = northSpan / slideLength;
  const boundaryTolerance = 8 * Number.EPSILON * Math.max(1, fullLength, halfWidth, Math.abs(east), Math.abs(north));
  function local({ east: pointEast, north: pointNorth }: HorizontalPoint) {
    const x = pointEast - east;
    const z = pointNorth - north;
    return { offset: x * forwardNorth - z * forwardEast, distance: x * forwardEast + z * forwardNorth };
  }

  const shaftAt = local(shaft);
  const shaftGap = Math.hypot(
    Math.max(0, Math.abs(shaftAt.offset) - halfWidth),
    Math.max(0, -shaftAt.distance, shaftAt.distance - fullLength),
  ) - shaft.radius;
  if (shaftGap <= 0) throw new RangeError('The west chute and dry landing must stay clear of the shaft');

  // The signed-distance samples conservatively cover each cell of the gravel strip.
  const shoreRows = Math.min(64, Math.ceil(gravelLength * 2));
  const shoreColumns = Math.min(64, Math.ceil(halfWidth * 4));
  const unsampledReach = Math.hypot(gravelLength / shoreRows, 2 * halfWidth / shoreColumns) / 2;
  let nearestWater = Infinity;
  for (let row = 0; row <= shoreRows; row++) {
    const distance = slideLength + gravelLength * row / shoreRows;
    for (let column = 0; column <= shoreColumns; column++) {
      const offset = 2 * halfWidth * (column / shoreColumns - .5);
      const clearance = pondDistanceAt(east + distance * forwardEast + offset * forwardNorth,
        north + distance * forwardNorth - offset * forwardEast);
      if (!Number.isFinite(clearance) || clearance <= unsampledReach) {
        throw new RangeError('The gravel landing needs a continuously dry surface pond shore');
      }
      nearestWater = Math.min(nearestWater, clearance);
    }
  }
  if (nearestWater > shoreReach) throw new RangeError('The gravel landing needs to reach the surface pond shore');

  const vertices: LocalPoint[] = [];
  for (let i = 0; i < surface.positions.length; i += 3) {
    const point = { east: surface.positions[i], north: -surface.positions[i + 2] };
    const height = surface.positions[i + 1];
    if (![point.east, point.north, height].every(Number.isFinite)) throw new RangeError('Invalid crater vertex');
    vertices.push({ ...local(point), height });
  }
  const slide: LocalPoint[] = [];
  const gravel: LocalPoint[] = [];
  function appendTriangles(target: LocalPoint[], polygon: LocalPoint[]) {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const a = polygon[0], b = polygon[i], c = polygon[i + 1];
      if (Math.abs(orient(a, b, c)) > 1e-10) target.push(a, b, c);
    }
  }
  for (let i = 0; i < surface.indices.length; i += 3) {
    const a = vertices[surface.indices[i]], b = vertices[surface.indices[i + 1]], c = vertices[surface.indices[i + 2]];
    if (!a || !b || !c) throw new RangeError('Invalid crater triangle');
    const strip = clip(clip([a, b, c], 'offset', -halfWidth, -1), 'offset', halfWidth, 1);
    if (strip.length < 3) continue;
    appendTriangles(slide, clip(clip(strip, 'distance', 0, -1), 'distance', slideLength, 1));
    appendTriangles(gravel, clip(clip(strip, 'distance', slideLength, -1), 'distance', fullLength, 1));
  }
  if (!slide.length || !gravel.length) throw new RangeError('The crater surface must support both sections of the west chute');

  const triangles = [...slide, ...gravel];
  const positions = new Float32Array(3 * triangles.length);
  const indices = new Uint32Array(triangles.length);
  triangles.forEach(({ offset, distance, height }, index) => {
    positions.set([offset, height, -distance], index * 3);
    indices[index] = index;
    triangles[index] = { offset: positions[index * 3], height: positions[index * 3 + 1], distance: -positions[index * 3 + 2] };
  });

  function supportAt(point: HorizontalPoint) {
    const foot = { ...local(point), height: 0 };
    if (!Number.isFinite(foot.offset) || !Number.isFinite(foot.distance) ||
        Math.abs(foot.offset) > halfWidth + boundaryTolerance || foot.distance < -boundaryTolerance ||
        foot.distance > fullLength + boundaryTolerance) return;
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      const area = orient(a, b, c);
      if (Math.abs(area) < 1e-10) continue;
      const s = orient(foot, b, c) / area;
      const t = orient(a, foot, c) / area;
      const u = 1 - s - t;
      if (s >= -1e-6 && t >= -1e-6 && u >= -1e-6) {
        return {
          height: s * a.height + t * b.height + u * c.height,
          ground: foot.distance < slideLength - boundaryTolerance ? 'west-fissure' : 'dry-surface-gravel',
        } as const;
      }
    }
  }

  // The host selects the west route before querying this sweep, then applies its usual movement collisions.
  function allowsSweep(from: HorizontalPoint, to: HorizontalPoint, footRadius: number): boolean {
    const start = local(from);
    const end = local(to);
    if (![start.offset, start.distance, end.offset, end.distance, footRadius].every(Number.isFinite) ||
        footRadius < 0 || footRadius > halfWidth) return false;
    if (Math.min(start.distance, end.distance) >= slideLength || Math.max(start.distance, end.distance) <= 0) return true;
    const travel = end.distance - start.distance;
    if (travel < -boundaryTolerance) return false;
    if (travel <= boundaryTolerance) return Math.max(Math.abs(start.offset), Math.abs(end.offset)) + footRadius <= halfWidth;
    const sideways = end.offset - start.offset;
    const firstOffset = start.offset + sideways * Math.max(0, -start.distance / travel);
    const lastOffset = start.offset + sideways * Math.min(1, (slideLength - start.distance) / travel);
    return Math.max(Math.abs(firstOffset), Math.abs(lastOffset)) + footRadius <= halfWidth;
  }

  return {
    // Mesh placement uses E/N translation and rotation, since Y already shares the source surface frame.
    origin: { east, north },
    yaw: Math.atan2(-forwardEast, forwardNorth),
    slideLength,
    fullLength,
    positions,
    indices,
    gravelFirstIndex: slide.length,
    supportAt,
    allowsSweep,
  };
}
