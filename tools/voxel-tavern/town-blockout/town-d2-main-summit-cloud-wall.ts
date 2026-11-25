import {
  Color, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4,
  MeshLambertMaterial, Object3D, Vector3,
} from 'three';
import { mainSummitBounds } from './main-summit-block';

export type TownD2MainSummitCloudHeightAt = (east: number, north: number) => number | undefined;
export type TownD2MainSummitCloudPoint = Readonly<{ east: number; north: number; height?: number }>;

/**
 * Exclusion volumes are supplied by the host's surveyed cable, pavilion,
 * icefall and glide data. A path is a swept capsule (all points have height)
 * or a vertical slab over a planar corridor (heights omitted). Circles and
 * boxes use the optional vertical interval, defaulting to the whole cloud band.
 */
export type TownD2MainSummitCloudExclusion = Readonly<{
  kind: 'cable' | 'pavilion' | 'icefall' | 'glide' | 'custom';
  east?: number;
  north?: number;
  radius?: number;
  points?: readonly TownD2MainSummitCloudPoint[];
  minEast?: number;
  maxEast?: number;
  minNorth?: number;
  maxNorth?: number;
  minHeight?: number;
  maxHeight?: number;
}>;

export type TownD2MainSummitCloudPlacement = Readonly<{
  id: string;
  family: 'cloud-wall' | 'isolated-peak' | 'cloudfall-lower';
  east: number;
  north: number;
  height: number;
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  yaw: number;
  paletteIndex: number;
  groundClearance: number;
  trailClearance: number;
}>;

export type TownD2MainSummitCloudWallOptions = Readonly<{
  heightAt: TownD2MainSummitCloudHeightAt;
  trailPoints?: readonly TownD2MainSummitCloudPoint[];
  exclusions?: readonly TownD2MainSummitCloudExclusion[];
  seed?: number;
}>;

export const townD2MainSummitCloudSpec = Object.freeze({
  seed: 0xd2c10d,
  bottom: 380,
  top: 560,
  wallMinHeight: 3,
  wallMaxHeight: 6,
  trailClearance: 15,
  terrainClearance: .8,
  exclusionMargin: .15,
  maxDraws: 10,
});

const DAY_COLORS = ['#f1f4f2', '#dfe7eb', '#c7d6df', '#e9eeec', '#b5c7d3'] as const;
const NIGHT_COLORS = ['#2c3648', '#3c4b61', '#52647c', '#46556c', '#242f42'] as const;
const EPSILON = 1e-9;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const overlaps = (aMin: number, aMax: number, bMin: number, bMax: number) =>
  aMax > bMin + EPSILON && bMax > aMin + EPSILON;

function pointSegmentDistance(east: number, north: number,
  a: TownD2MainSummitCloudPoint, b: TownD2MainSummitCloudPoint) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared > EPSILON ? clamp(((east - a.east) * dx + (north - a.north) * dn) / lengthSquared, 0, 1) : 0;
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function segmentDistance3D(point: Vector3, a: Required<TownD2MainSummitCloudPoint>,
  b: Required<TownD2MainSummitCloudPoint>) {
  const dx = b.east - a.east, dy = b.height - a.height, dn = b.north - a.north;
  const lengthSquared = dx * dx + dy * dy + dn * dn;
  const t = lengthSquared > EPSILON ? clamp(
    ((point.x - a.east) * dx + (point.y - a.height) * dy + (-point.z - a.north) * dn) / lengthSquared,
    0, 1,
  ) : 0;
  return Math.hypot(point.x - a.east - t * dx, point.y - a.height - t * dy,
    -point.z - a.north - t * dn);
}

function distanceToTrail(line: readonly TownD2MainSummitCloudPoint[], east: number, north: number) {
  let distance = Infinity;
  if (line.length === 1) return Math.hypot(east - line[0]!.east, north - line[0]!.north);
  for (let index = 1; index < line.length; index++) {
    distance = Math.min(distance, pointSegmentDistance(east, north, line[index - 1]!, line[index]!));
  }
  return distance;
}

function validateExclusion(value: TownD2MainSummitCloudExclusion, index: number) {
  const finite = [...Object.values(value)].every(part => typeof part !== 'number' || Number.isFinite(part));
  if (!finite) throw new RangeError(`Cloud exclusion ${index} contains a non-finite number.`);
  const box = value.minEast !== undefined || value.maxEast !== undefined ||
    value.minNorth !== undefined || value.maxNorth !== undefined;
  if (box) {
    if (![value.minEast, value.maxEast, value.minNorth, value.maxNorth].every(Number.isFinite) ||
      value.maxEast! <= value.minEast! || value.maxNorth! <= value.minNorth!) {
      throw new RangeError(`Cloud exclusion ${index} has an invalid box.`);
    }
  } else if (value.points !== undefined) {
    if (!Array.isArray(value.points) || !value.points.length ||
      value.points.some(point => ![point.east, point.north, point.height].every(number =>
        number === undefined || Number.isFinite(number)))) {
      throw new RangeError(`Cloud exclusion ${index} has an invalid swept path.`);
    }
  } else if (![value.east, value.north, value.radius].every(Number.isFinite) || value.radius! <= 0) {
    throw new RangeError(`Cloud exclusion ${index} needs a circle or box.`);
  }
  if (value.points !== undefined && (!Number.isFinite(value.radius) || value.radius! <= 0)) {
    throw new RangeError(`Cloud exclusion ${index} path needs a positive radius.`);
  }
  if (value.radius !== undefined && (!Number.isFinite(value.radius) || value.radius < 0)) {
    throw new RangeError(`Cloud exclusion ${index} has an invalid radius.`);
  }
  if ((value.minHeight !== undefined && !Number.isFinite(value.minHeight)) ||
      (value.maxHeight !== undefined && !Number.isFinite(value.maxHeight)) ||
      (value.minHeight !== undefined && value.maxHeight !== undefined && value.maxHeight <= value.minHeight)) {
    throw new RangeError(`Cloud exclusion ${index} has an invalid height interval.`);
  }
}

type NormalizedExclusion = Readonly<{
  kind: TownD2MainSummitCloudExclusion['kind'];
  shape: 'box' | 'circle' | 'path';
  radius: number;
  minHeight: number;
  maxHeight: number;
  points: readonly Required<TownD2MainSummitCloudPoint>[];
  box?: Readonly<{ minEast: number; maxEast: number; minNorth: number; maxNorth: number }>;
  spatialPath: boolean;
}>;

function normalizeExclusion(value: TownD2MainSummitCloudExclusion): NormalizedExclusion {
  const minHeight = value.minHeight ?? townD2MainSummitCloudSpec.bottom;
  const maxHeight = value.maxHeight ?? townD2MainSummitCloudSpec.top;
  const box = value.minEast !== undefined || value.maxEast !== undefined ||
    value.minNorth !== undefined || value.maxNorth !== undefined;
  if (box) {
    return {
      kind: value.kind, shape: 'box', radius: value.radius ?? 0, minHeight, maxHeight, points: [], spatialPath: false,
      box: { minEast: value.minEast!, maxEast: value.maxEast!, minNorth: value.minNorth!, maxNorth: value.maxNorth! },
    };
  }
  const source = value.points ?? [{ east: value.east!, north: value.north! }];
  const spatialPath = source.length > 1 && source.every(point => point.height !== undefined);
  return {
    kind: value.kind, shape: value.points ? 'path' : 'circle', radius: value.radius ?? 0,
    minHeight, maxHeight, spatialPath,
    points: source.map(point => ({
      east: point.east, north: point.north,
      height: point.height ?? clamp(minHeight + (maxHeight - minHeight) / 2, minHeight, maxHeight),
    })),
  };
}

function clearsExclusion(exclusion: NormalizedExclusion, placement: TownD2MainSummitCloudPlacement,
  centre: Vector3) {
  const { bottom, top, exclusionMargin } = townD2MainSummitCloudSpec;
  const low = placement.height - placement.radiusY;
  const high = placement.height + placement.radiusY;
  if (!overlaps(low, high, exclusion.minHeight, exclusion.maxHeight)) return true;
  const horizontalRadius = Math.max(placement.radiusX, placement.radiusZ);
  const boundingRadius = Math.hypot(placement.radiusX, placement.radiusY, placement.radiusZ);
  const required = exclusion.radius + exclusionMargin;
  if (exclusion.shape === 'box') {
    const box = exclusion.box!;
    const dx = Math.max(box.minEast - placement.east, placement.east - box.maxEast, 0);
    const dz = Math.max(box.minNorth - placement.north, placement.north - box.maxNorth, 0);
    const dy = Math.max(exclusion.minHeight - high, low - exclusion.maxHeight, 0);
    return Math.hypot(dx, dy, dz) >= boundingRadius + required;
  }
  if (exclusion.spatialPath) {
    let distance = Infinity;
    if (exclusion.points.length === 1) {
      const point = exclusion.points[0]!;
      distance = Math.hypot(placement.east - point.east, placement.height - point.height,
        placement.north - point.north);
    } else {
      for (let index = 1; index < exclusion.points.length; index++) {
        distance = Math.min(distance, segmentDistance3D(centre,
          exclusion.points[index - 1]!, exclusion.points[index]!));
      }
    }
    return distance >= boundingRadius + required;
  }
  const horizontal = distanceToTrail(exclusion.points, placement.east, placement.north);
  return horizontal - horizontalRadius >= required;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

type Candidate = Omit<TownD2MainSummitCloudPlacement, 'id' | 'groundClearance' | 'trailClearance'>;
type Rejections = Record<'bounds' | 'height' | 'terrain' | 'trail' | 'exclusion', number>;

/**
 * Visual-only D2 supplement. It never writes heightAt, moves a trail, changes
 * the existing cloud layer or claims collision authority. Coordinates entering
 * Three.js are always (east, height, -north).
 */
export function createTownD2MainSummitCloudWall(
  input: TownD2MainSummitCloudWallOptions | TownD2MainSummitCloudHeightAt,
  trailPoints: readonly TownD2MainSummitCloudPoint[] = [],
  exclusions: readonly TownD2MainSummitCloudExclusion[] = [], seed = townD2MainSummitCloudSpec.seed,
) {
  const options = typeof input === 'function'
    ? { heightAt: input, trailPoints, exclusions, seed }
    : input;
  const { heightAt } = options;
  const trail = options.trailPoints ?? [];
  const volumes = options.exclusions ?? [];
  const actualSeed = options.seed ?? townD2MainSummitCloudSpec.seed;
  if (typeof heightAt !== 'function') throw new TypeError('The cloud wall needs a heightAt sampler.');
  if (!Number.isInteger(actualSeed) || actualSeed < 0 || actualSeed > 0xffffffff) {
    throw new RangeError('The cloud wall seed must be an unsigned 32-bit integer.');
  }
  if (!Array.isArray(trail) || trail.some(point => ![point.east, point.north, point.height].every(number =>
    number === undefined || Number.isFinite(number)))) {
    throw new RangeError('The cloud wall trail contains an invalid point.');
  }
  if (!Array.isArray(volumes)) throw new RangeError('Cloud exclusions must be an array.');
  volumes.forEach(validateExclusion);
  const normalizedExclusions = volumes.map(normalizeExclusion);
  const random = mulberry32(actualSeed);
  const range = (min: number, max: number) => min + (max - min) * random();
  const candidates: Candidate[] = [];
  const add = (candidate: Candidate) => { candidates.push(candidate); };

  // Downsample the dense one-metre trail survey by true band arc length.
  // A fixed 32 m anchor spacing keeps density without thousands of duplicate lobes.
  const bandAnchors: Array<TownD2MainSummitCloudPoint & { height: number; eastDir: number; northDir: number }> = [];
  let previousBandPoint: (TownD2MainSummitCloudPoint & { height: number }) | undefined;
  let bandDistance = 0, nextAnchorDistance = 0;
  for (const point of trail) {
    const height = point.height ?? heightAt(point.east, point.north);
    if (height === undefined || !Number.isFinite(height) ||
        height < townD2MainSummitCloudSpec.bottom || height > townD2MainSummitCloudSpec.top) {
      previousBandPoint = undefined;
      continue;
    }
    if (!previousBandPoint) {
      bandAnchors.push({ east: point.east, north: point.north, height, eastDir: 0, northDir: 1 });
      previousBandPoint = { east: point.east, north: point.north, height };
      nextAnchorDistance = 32;
      continue;
    }
    const dx = point.east - previousBandPoint.east, dn = point.north - previousBandPoint.north;
    const norm = Math.hypot(dx, dn);
    bandDistance += norm;
    if (bandDistance >= nextAnchorDistance && norm > EPSILON) {
      bandAnchors.push({ east: point.east, north: point.north, height,
        eastDir: dx / norm, northDir: dn / norm });
      nextAnchorDistance += 32;
    }
    previousBandPoint = { east: point.east, north: point.north, height };
  }
  for (const [index, anchor] of bandAnchors.entries()) {
    const normalEast = -anchor.northDir, normalNorth = anchor.eastDir;
    for (const side of [-1, 1]) for (let lobe = 0; lobe < 3; lobe++) {
      const along = (lobe - 1) * 10 + range(-1.2, 1.2);
      const offset = 28 + range(1, 9) + Math.sin(lobe * 1.7) * 1.2;
      add({
        family: 'cloud-wall',
        east: anchor.east + normalEast * side * offset + anchor.eastDir * along,
        north: anchor.north + normalNorth * side * offset + anchor.northDir * along,
        height: clamp(anchor.height + range(-4, 5), 383, 557),
        radiusX: range(4.8, 8.4), radiusY: range(1.5, 3), radiusZ: range(3.5, 6.2),
        yaw: Math.atan2(anchor.eastDir, anchor.northDir), paletteIndex: (index + lobe + (side > 0 ? 1 : 0)) % DAY_COLORS.length,
      });
    }
  }

  // Sparse shoulder/isolated-peak clusters fill the middle layer without
  // paving a continuous white sheet over the mountain.
  const { west, east, south, north } = mainSummitBounds;
  const levels = [395, 421, 449, 478, 508, 539];
  let clusterIndex = 0;
  for (let northPos = south + 75; northPos < north - 45; northPos += 112) {
    for (let eastPos = west + 70; eastPos < east - 55; eastPos += 118) {
      const salt = clusterIndex++;
      if ((salt * 37 + 11) % 10 > 3) continue;
      const centreEast = eastPos + range(-24, 24), centreNorth = northPos + range(-24, 24);
      const baseHeight = levels[(salt * 7 + 3) % levels.length]! + range(-4, 4);
      const lobes = 4 + Math.floor(random() * 3);
      for (let lobe = 0; lobe < lobes; lobe++) {
        const angle = range(0, Math.PI * 2), distance = lobe === 0 ? 0 : range(8, 30);
        add({
          family: 'isolated-peak',
          east: centreEast + Math.cos(angle) * distance, north: centreNorth + Math.sin(angle) * distance,
          height: baseHeight + range(-7, 9) + (lobe === 0 ? 3 : 0),
          radiusX: range(5.5, 11.5), radiusY: range(2.4, 6.8), radiusZ: range(5, 10.5),
          yaw: range(0, Math.PI * 2), paletteIndex: (salt + lobe * 2) % DAY_COLORS.length,
        });
      }
    }
  }

  // The lower visible stretch of the south-saddle cloudfall: 416 → 381 m,
  // never below the user's 380 m band floor. Terrain and all host volumes can
  // remove individual lobes without changing the existing cloud layer.
  for (let row = 0; row < 11; row++) {
    const t = row / 10;
    const centreNorth = south + 105 + t * 145;
    const centreEast = Math.sin(t * Math.PI * 1.35) * 24 - 12;
    const baseHeight = 416 - t * 35;
    for (let column = -3; column <= 3; column++) {
      const across = column * 12 + range(-3, 3);
      add({
        family: 'cloudfall-lower',
        east: centreEast + across, north: centreNorth + Math.cos(column * 1.3) * 5 + range(-2, 2),
        height: baseHeight + range(-.7, .7) - Math.abs(column) * .35,
        radiusX: range(6, 10), radiusY: range(1.8, 3.2), radiusZ: range(4.5, 8),
        yaw: range(-.35, .35), paletteIndex: (row + column + 6) % DAY_COLORS.length,
      });
    }
  }

  const group = new Group();
  group.name = 'town-d2-main-summit-cloud-wall';
  group.userData = {
    includesWorldCollision: false, modifiesHeightAt: false, modifiesCloudLayer: false,
    coordinateConvention: 'x=east,y=height,z=-north',
  };
  const placements: TownD2MainSummitCloudPlacement[] = [];
  const rejections: Rejections = { bounds: 0, height: 0, terrain: 0, trail: 0, exclusion: 0 };
  const centre = new Vector3();
  for (const candidate of candidates) {
    const horizontalRadius = Math.max(candidate.radiusX, candidate.radiusZ);
    const low = candidate.height - candidate.radiusY, high = candidate.height + candidate.radiusY;
    const outsideBounds = candidate.east - horizontalRadius < west || candidate.east + horizontalRadius > east ||
      candidate.north - horizontalRadius < south || candidate.north + horizontalRadius > north;
    if (outsideBounds) { rejections.bounds++; continue; }
    if (!Object.values(candidate).every(value => typeof value !== 'number' || Number.isFinite(value)) ||
      low < townD2MainSummitCloudSpec.bottom || high > townD2MainSummitCloudSpec.top ||
      candidate.radiusX <= 0 || candidate.radiusY <= 0 || candidate.radiusZ <= 0 ||
      (candidate.family === 'cloud-wall' && (candidate.radiusY * 2 < townD2MainSummitCloudSpec.wallMinHeight ||
        candidate.radiusY * 2 > townD2MainSummitCloudSpec.wallMaxHeight + EPSILON))) {
      rejections.height++; continue;
    }
    const groundProbes = [
      [candidate.east, candidate.north], [candidate.east - candidate.radiusX, candidate.north],
      [candidate.east + candidate.radiusX, candidate.north], [candidate.east, candidate.north - candidate.radiusZ],
      [candidate.east, candidate.north + candidate.radiusZ],
    ].map(([eastPos, northPos]) => heightAt(eastPos, northPos));
    if (groundProbes.some(height => height === undefined || !Number.isFinite(height))) {
      rejections.terrain++; continue;
    }
    const groundClearance = low - Math.max(...groundProbes as number[]);
    if (groundClearance < townD2MainSummitCloudSpec.terrainClearance) { rejections.terrain++; continue; }
    const trailDistance = distanceToTrail(trail, candidate.east, candidate.north);
    const trailClearance = trailDistance - horizontalRadius;
    if (trailClearance < townD2MainSummitCloudSpec.trailClearance - EPSILON) { rejections.trail++; continue; }
    centre.set(candidate.east, candidate.height, -candidate.north);
    const provisional: TownD2MainSummitCloudPlacement = Object.freeze({
      ...candidate, id: `d2-cloud-${placements.length + 1}`, groundClearance, trailClearance,
    });
    if (normalizedExclusions.some(exclusion => !clearsExclusion(exclusion, provisional, centre))) {
      rejections.exclusion++; continue;
    }
    placements.push(provisional);
  }

  // Keep the 20-face budget, but turn the icosahedron's broad side toward the
  // vertical axis so each lobe fills its declared height instead of reading as
  // a thin snow slab. Radial billows only pull inward: every vertex remains in
  // the same unit bounding sphere used by the unchanged 3D exclusion tests.
  const geometry = new IcosahedronGeometry(1, 0);
  const vertices = geometry.getAttribute('position');
  const vertexColors = new Float32Array(vertices.count * 3);
  const diagonal = Math.SQRT1_2;
  for (let index = 0; index < vertices.count; index++) {
    const x = vertices.getX(index), y = vertices.getY(index), z = vertices.getZ(index);
    const cloudX = x;
    const cloudY = (y + z) * diagonal;
    const cloudZ = (z - y) * diagonal;
    const cap = Math.pow(Math.abs(cloudY), 8);
    const billow = .5 + .5 * Math.sin(cloudX * 7.4 + cloudY * 5.1 + cloudZ * 8.3);
    const radial = 1 - .055 * (1 - cap) * (.35 + .65 * billow);
    const px = cloudX * radial, py = cloudY * radial, pz = cloudZ * radial;
    vertices.setXYZ(index, px, py, pz);
    // A radial normal is exact for this star-shaped puff and stays smooth
    // across the duplicated triangle vertices without another geometry pass.
    geometry.attributes.normal.setXYZ(index, cloudX, cloudY, cloudZ);
    const shade = clamp(.89 + .085 * ((cloudY + 1) / 2) +
      .012 * Math.sin(cloudX * 5.2 + cloudZ * 4.7), .86, .99);
    vertexColors[index * 3] = shade * .985;
    vertexColors[index * 3 + 1] = shade * .995;
    vertexColors[index * 3 + 2] = shade;
  }
  vertices.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.setAttribute('color', new Float32BufferAttribute(vertexColors, 3));
  // Opaque Lambert keeps the soft vertex shading without transparent overdraw.
  const material = new MeshLambertMaterial({
    color: '#ffffff', vertexColors: true, transparent: false, opacity: 1,
    depthWrite: true, flatShading: false, dithering: true, fog: true,
  });
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = 'town-d2-main-summit-cloud-lobes';
  mesh.frustumCulled = false;
  const pose = new Object3D();
  const matrix = new Matrix4();
  const color = new Color();
  let night = false;
  function applyColors() {
    const palette = night ? NIGHT_COLORS : DAY_COLORS;
    for (const [index, placement] of placements.entries()) {
      mesh.setColorAt(index, color.set(palette[placement.paletteIndex]!));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    material.emissive.set(night ? '#0a1320' : '#000000');
    material.emissiveIntensity = night ? .24 : 0;
    material.needsUpdate = true;
  }
  for (const [index, placement] of placements.entries()) {
    pose.position.set(placement.east, placement.height, -placement.north);
    pose.rotation.set(0, placement.yaw, 0);
    pose.scale.set(placement.radiusX, placement.radiusY, placement.radiusZ);
    pose.updateMatrix();
    matrix.copy(pose.matrix);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  applyColors();
  group.add(mesh);

  const familyCounts = {
    'cloud-wall': placements.filter(item => item.family === 'cloud-wall').length,
    'isolated-peak': placements.filter(item => item.family === 'isolated-peak').length,
    'cloudfall-lower': placements.filter(item => item.family === 'cloudfall-lower').length,
  };
  const stats = Object.freeze({
    seed: actualSeed,
    candidates: candidates.length,
    instances: placements.length,
    meshes: 1,
    drawCalls: 1,
    triangles: placements.length * vertices.count / 3,
    minHeight: placements.length ? Math.min(...placements.map(item => item.height - item.radiusY)) : townD2MainSummitCloudSpec.bottom,
    maxHeight: placements.length ? Math.max(...placements.map(item => item.height + item.radiusY)) : townD2MainSummitCloudSpec.bottom,
    minTrailClearance: placements.length ? Math.min(...placements.map(item => item.trailClearance)) : townD2MainSummitCloudSpec.trailClearance,
    familyCounts: Object.freeze(familyCounts),
    rejected: Object.freeze({ ...rejections }),
    bounds: Object.freeze({ ...mainSummitBounds }),
    cloudBand: Object.freeze({ bottom: townD2MainSummitCloudSpec.bottom, top: townD2MainSummitCloudSpec.top }),
    maxDraws: townD2MainSummitCloudSpec.maxDraws,
  });
  let disposed = false;
  return {
    group,
    placements: Object.freeze([...placements]),
    stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2 summit cloud wall is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      applyColors();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
