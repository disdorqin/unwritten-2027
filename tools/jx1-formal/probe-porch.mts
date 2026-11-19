type Point = readonly [east: number, north: number];
type Box = { min: number[]; max: number[] };
type Ramp = Box & { axis: 'x' | 'z'; ascending: 1 | -1 };
export type MarketHome = {
  id: string;
  portal: { id: string; zone: string; x: number; n: number; ground: number; exitYaw: number };
  site: { x: number; n: number; angle: number };
  approach: { east: number; north: number; ground: number };
  entrance: { x: number; frontZ: number; width: number; height: number; floorY: number };
  audit?: { forward: readonly { x: number; n: number }[] };
  porch?: { route?: readonly { east: number; north: number; ground: number }[] };
  colliders: Box[];
  floors: Box[];
  ramps: Ramp[];
  foundationY: number;
  minTerrainY: number;
  maxTerrainY: number;
};
const radius = .27;
const bodyHeight = 1.8;
const epsilon = .025;
const stepHeight = .43;
const sampleStep = .04;

function horizontalGap([east, north]: Point, { min, max }: Box) {
  return Math.hypot(Math.max(min[0] - east, east - max[0], 0), Math.max(min[2] + north, -north - max[2], 0));
}
function inStandingVolume(box: Box, feet: number) {
  return box.max[1] > feet + epsilon && box.min[1] < feet + bodyHeight - epsilon;
}
function supportAt(home: Pick<MarketHome, 'colliders' | 'floors' | 'ramps'>, point: Point, terrain: number,
  previous: number, solidMargin: number) {
  let y = terrain;
  let source = 'terrain';
  function consider(value: number, limit: number, label: string) {
    if (value <= limit && value > y) {
      y = value;
      source = label;
    }
  }
  const limit = previous + stepHeight;
  for (const [index, floor] of home.floors.entries()) {
    if (horizontalGap(point, floor) < radius) consider(floor.max[1], limit, 'floor:' + index);
  }
  const [east, north] = point;
  for (const [index, ramp] of home.ramps.entries()) {
    if (east < ramp.min[0] || east > ramp.max[0] || -north < ramp.min[2] || -north > ramp.max[2]) continue;
    const axis = ramp.axis === 'x' ? 0 : 2;
    const along = ((axis === 0 ? east : -north) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
    const ratio = ramp.ascending > 0 ? along : 1 - along;
    consider(ramp.min[1] + (ramp.max[1] - ramp.min[1]) * ratio, limit, 'ramp:' + index);
  }
  for (const [index, solid] of home.colliders.entries()) {
    if (horizontalGap(point, solid) < radius) consider(solid.max[1], previous + solidMargin, 'solid:' + index);
  }
  return { y, source };
}

export function dryPorchLanding(home: Pick<MarketHome, 'colliders' | 'floors' | 'ramps'>, point: Point, terrain: number) {
  const { y } = supportAt(home, point, terrain, terrain, epsilon);
  if (!Number.isFinite(y) || Math.abs(y - terrain) > stepHeight) return;
  if ([...home.colliders, ...home.floors].some(box => inStandingVolume(box, y) && horizontalGap(point, box) < radius)) return;
  return y;
}
export function legacyAnchorContact(home: MarketHome) {
  const { x, n, ground } = home.portal;
  const point: Point = [x, n];
  return {
    raisesGround: [...home.floors, ...home.ramps].some(box =>
      horizontalGap(point, box) < radius && box.max[1] > ground + 1e-6),
    hitsBody: home.colliders.some(box =>
      horizontalGap(point, box) < radius && box.max[1] > ground + epsilon &&
      box.min[1] < ground + bodyHeight - epsilon),
  };
}

export function probePorch(home: MarketHome, groundAt: (east: number, north: number) => number,
  coarseBlocked: (east: number, north: number) => boolean, waypoints: readonly Point[] = []) {
  const { approach, entrance, site, colliders, floors, ramps } = home;
  const sin = Math.sin(site.angle), cos = Math.cos(site.angle);
  const world = (x: number, z: number): Point =>
    [site.x + cos * x + sin * z, site.n + sin * x - cos * z];
  const local = ([east, north]: Point) => {
    const dx = east - site.x, dn = north - site.n;
    return [cos * dx + sin * dn, sin * dx - cos * dn] as const;
  };
  const obstacles = [...colliders, ...floors];
  const worldSolids = obstacles.map(box => {
    const corners = [box.min[0], box.max[0]].flatMap(east =>
      [-box.min[2], -box.max[2]].map(north => local([east, north])));
    return { minX: Math.min(...corners.map(p => p[0])), maxX: Math.max(...corners.map(p => p[0])),
      minZ: Math.min(...corners.map(p => p[1])), maxZ: Math.max(...corners.map(p => p[1])), box };
  });

  const start: Point = [approach.east, approach.north];
  const door = world(entrance.x, entrance.frontZ);
  const declaredInterior = home.audit?.forward.at(-1);
  const end: Point = declaredInterior
    ? [declaredInterior.x, declaredInterior.n]
    : world(entrance.x, entrance.frontZ - .65);
  const reportedTurns: Point[] = home.porch?.route?.slice(1, -1).map(({ east, north }) => [east, north]) ?? [];
  const knots = [start, ...reportedTurns, ...waypoints, door, end];
  const segments = knots.slice(0, -1).map((from, index) => [from, knots[index + 1]] as const);
  let length = 0;
  const path: Point[] = [start];
  for (const [[fromEast, fromNorth], [toEast, toNorth]] of segments) {
    const distance = Math.hypot(toEast - fromEast, toNorth - fromNorth);
    length += distance;
    const number = Math.ceil(distance / sampleStep);
    for (let i = 1; i <= number; i++) path.push([
      fromEast + (toEast - fromEast) * i / number, fromNorth + (toNorth - fromNorth) * i / number,
    ]);
  }

  function sweep(points: readonly Point[], initialFeet: number) {
    let feet = initialFeet;
    let maxStep = 0;
    let lastSupport;
    let samples = 0;
    let minWidth = Infinity, minLeft = Infinity, minRight = Infinity, minHeight = Infinity;
    const transitions: { point: Point; feet: number; source: string }[] = [];
    const failures: { point: Point; feet: number; step: number; collision?: number; coarse: boolean }[] = [];
    for (const point of points) {
      samples++;
      const next = supportAt(home, point, groundAt(...point), feet, .03);
      const change = Math.abs(next.y - feet);
      maxStep = Math.max(maxStep, change);
      const collision = obstacles.findIndex(box => inStandingVolume(box, next.y) && horizontalGap(point, box) < radius);
      const coarse = coarseBlocked(...point);
      if (coarse || collision >= 0 || change > stepHeight + 1e-10) {
        failures.push({ point, feet: next.y, step: change, ...(collision >= 0 ? { collision } : {}), coarse });
      }
      feet = next.y;
      if (next.source !== lastSupport) {
        transitions.push({ point, feet, source: next.source });
        lastSupport = next.source;
      }
      const [x, z] = local(point);
      if (z < entrance.frontZ - .27 || z > entrance.frontZ + .10) continue;
      let left = Infinity, right = Infinity;
      for (const solid of worldSolids) {
        if (solid.minZ <= z && solid.maxZ >= z && inStandingVolume(solid.box, feet)) {
          if (solid.maxX <= x) left = Math.min(left, x - solid.maxX);
          if (solid.minX >= x) right = Math.min(right, solid.minX - x);
        }
        if (solid.box.min[1] > feet && horizontalGap(point, solid.box) < radius) {
          minHeight = Math.min(minHeight, solid.box.min[1] - feet);
        }
      }
      minWidth = Math.min(minWidth, left + right);
      minLeft = Math.min(minLeft, left);
      minRight = Math.min(minRight, right);
    }
    return { samples, feet, maxStep, minWidth, minLeft: minLeft - radius, minRight: minRight - radius,
      minHeight, transitions, failures: failures.length, firstFailure: failures[0] };
  }
  const forward = sweep(path, approach.ground);
  const backward = sweep([...path].reverse(), forward.feet);
  const wallSides = [-1, 1].map(side => {
    const point = world(entrance.x + side * (entrance.width / 2 + .38), entrance.frontZ - .05);
    return { side, point, blocked: obstacles.some(box =>
      inStandingVolume(box, home.foundationY + entrance.floorY) && horizontalGap(point, box) < radius) };
  });
  return { id: home.id, length, start, door, end, forward, backward, wallSides };
}
