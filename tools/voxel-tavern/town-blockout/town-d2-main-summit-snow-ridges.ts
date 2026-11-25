import {
  BufferGeometry, Color, DodecahedronGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { mainSummitBounds } from './main-summit-block';
import type { MainSummitTrailPoint } from './main-summit-trail';

export type TownD2SnowRidgePoint = Readonly<{ east: number; north: number; height?: number }>;
export type TownD2SnowRidgeHeightAt = (east: number, north: number) => number | undefined;
export type TownD2SnowRidgeExclusion =
  | Readonly<{ id?: string; kind?: 'circle'; east: number; north: number; radius: number; clearance?: number }>
  | Readonly<{ id?: string; kind: 'polyline'; points: readonly TownD2SnowRidgePoint[]; radius: number; clearance?: number }>
  | Readonly<{ id?: string; kind: 'rectangle' | 'bounds'; west: number; east: number; south: number; north: number; clearance?: number }>;

export type TownD2SnowRidgeOptions = Readonly<{
  heightAt: TownD2SnowRidgeHeightAt;
  trailPoints: readonly TownD2SnowRidgePoint[];
  exclusions?: readonly TownD2SnowRidgeExclusion[];
  seed?: number | string;
}>;
export type TownD2SnowRidgeKind = 'snow-ridge' | 'ice-tower' | 'rock-cluster' | 'distant-peak';
export type TownD2SnowRidgePlacement = Readonly<{
  id: string;
  kind: TownD2SnowRidgeKind;
  east: number;
  north: number;
  base: number;
  top: number;
  radius: number;
  position: readonly [x: number, y: number, z: number];
  parts: number;
}>;

export const townD2MainSummitSnowRidgeSpec = Object.freeze({
  minimumHeight: 560,
  maximumHeight: 775,
  trailClearance: 15,
  routeClearance: 20,
  summitFacilities: Object.freeze({ west: 35, east: 85, south: 960, north: 1040 }),
  seed: 'town-d2-main-summit-snow-ridges-v1',
});

type Family = 'snow' | 'ice' | 'darkRock' | 'yellowRock';
type Zone =
  | { kind: 'circle'; east: number; north: number; radius: number; clearance: number; id: string }
  | { kind: 'polyline'; points: readonly TownD2SnowRidgePoint[]; radius: number; clearance: number; id: string }
  | { kind: 'rectangle'; west: number; east: number; south: number; north: number; clearance: number; id: string };
type Candidate = {
  id: string; kind: TownD2SnowRidgeKind; east: number; north: number;
  radius: number; parts: number; yaw: number; variant: number;
};
type Rejections = Record<'ground' | 'height' | 'bounds' | 'clearance' | 'spacing', number>;
type Batch = GeometryBatch;

const familyColors: Record<Family, readonly string[]> = {
  snow: ['#dce8ed', '#c6d7df', '#eef4f5', '#aebfc9'],
  ice: ['#9ed4df', '#c2e8ed', '#6caaba', '#e0f2f3'],
  darkRock: ['#35414a', '#46525a', '#59646b', '#28343d'],
  yellowRock: ['#9b8852', '#b4a064', '#756942'],
};
const families = Object.keys(familyColors) as Family[];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const outside = (value: number, min: number, max: number) => Math.max(min - value, value - max, 0);

function hashSeed(value: number | string) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function randomSource(seed: number | string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function finitePoint(point: TownD2SnowRidgePoint) {
  return Number.isFinite(point.east) && Number.isFinite(point.north);
}
function segmentDistance(east: number, north: number, a: TownD2SnowRidgePoint, b: TownD2SnowRidgePoint) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared === 0 ? 0 : clamp(((east - a.east) * dx + (north - a.north) * dn) / lengthSquared, 0, 1);
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}
function polylineDistance(east: number, north: number, points: readonly TownD2SnowRidgePoint[]) {
  if (points.length === 1) return Math.hypot(east - points[0]!.east, north - points[0]!.north);
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    distance = Math.min(distance, segmentDistance(east, north, points[i - 1]!, points[i]!));
  }
  return distance;
}
function zoneDistance(zone: Zone, east: number, north: number) {
  if (zone.kind === 'circle') return Math.hypot(east - zone.east, north - zone.north) - zone.radius;
  if (zone.kind === 'polyline') return polylineDistance(east, north, zone.points) - zone.radius;
  return Math.hypot(outside(east, zone.west, zone.east), outside(north, zone.south, zone.north));
}

function normalizeExclusions(input: readonly TownD2SnowRidgeExclusion[]): Zone[] {
  return input.map((item, index) => {
    const id = item.id ?? `exclusion-${index + 1}`;
    const clearance = item.clearance ?? townD2MainSummitSnowRidgeSpec.routeClearance;
    if (!Number.isFinite(clearance) || clearance < 0) throw new RangeError(`${id}: clearance must be finite and non-negative.`);
    if (item.kind === 'polyline') {
      if (!Array.isArray(item.points) || !item.points.length || !item.points.every(finitePoint) ||
          !Number.isFinite(item.radius) || item.radius < 0) throw new RangeError(`${id}: invalid route exclusion.`);
      return { kind: 'polyline', id, points: item.points.map(point => ({ east: point.east, north: point.north })),
        radius: item.radius, clearance };
    }
    if (item.kind === 'rectangle' || item.kind === 'bounds') {
      if (![item.west, item.east, item.south, item.north].every(Number.isFinite) ||
          item.west >= item.east || item.south >= item.north) throw new RangeError(`${id}: invalid rectangle exclusion.`);
      return { kind: 'rectangle', id, west: item.west, east: item.east, south: item.south, north: item.north, clearance };
    }
    if (item.kind !== undefined && item.kind !== 'circle') throw new RangeError(`${id}: unsupported exclusion kind.`);
    if (![item.east, item.north, item.radius].every(Number.isFinite) || item.radius < 0) {
      throw new RangeError(`${id}: invalid circle exclusion.`);
    }
    return { kind: 'circle', id, east: item.east, north: item.north, radius: item.radius, clearance };
  });
}

/** Mirror the existing twelve tower-cluster footprints so this supplement cannot bury its wayfinding silhouettes. */
function surveyedTowerZones(trail: readonly TownD2SnowRidgePoint[]): Zone[] {
  if (trail.length < 14) return [];
  let seed = 29;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const step = Math.floor(trail.length / 14);
  const zones: Zone[] = [];
  for (let cluster = 0; cluster < 12; cluster++) {
    const anchor = trail[step * (cluster + 1)]!;
    const next = trail[Math.min(trail.length - 1, step * (cluster + 1) + 8)]!;
    const dx = next.east - anchor.east, dn = next.north - anchor.north;
    const length = Math.hypot(dx, dn) || 1;
    const offset = (18 + rand() * 12) * (cluster % 2 === 0 ? 1 : -1);
    const east = anchor.east - dn / length * offset;
    const north = anchor.north + dx / length * offset;
    const spires = 3 + Math.floor(rand() * 3);
    let footprint = 0;
    for (let spire = 0; spire < spires; spire++) {
      rand();
      const radius = 1.6 + rand() * 1.8;
      const px = east + (rand() - .5) * 7;
      const pn = north + (rand() - .5) * 7;
      footprint = Math.max(footprint, Math.hypot(px - east, pn - north) + radius);
    }
    zones.push({ kind: 'circle', id: `surveyed-rock-towers-${cluster + 1}`, east, north,
      radius: footprint, clearance: townD2MainSummitSnowRidgeSpec.routeClearance });
  }
  return zones;
}

class GeometryBatch {
  readonly data: { positions: number[]; colors: number[] } = { positions: [], colors: [] };
  readonly color = new Color();
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], tint: string) {
    this.color.set(tint);
    for (const point of [a, b, c, a, c, d]) {
      this.data.positions.push(...point);
      this.data.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }
  triangle(a: readonly number[], b: readonly number[], c: readonly number[], tint: string) {
    this.color.set(tint);
    for (const point of [a, b, c]) {
      this.data.positions.push(...point);
      this.data.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.data.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.data.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function tint(family: Family, random: () => number) {
  const palette = familyColors[family];
  return palette[Math.floor(random() * palette.length)]!;
}
function localPoint(east: number, north: number, yaw: number, x: number, z: number): [number, number] {
  return [east + x * Math.cos(yaw) + z * Math.sin(yaw), north + x * Math.sin(yaw) - z * Math.cos(yaw)];
}

/** A many-slice, terrain-draped faceted snow spine, not a box or a replacement height field. */
function addSnowRidge(batch: Batch, candidate: Candidate, groundAt: TownD2SnowRidgeHeightAt,
  random: () => number, ceiling: number) {
  const slices = 7 + candidate.variant % 4;
  const halfLength = candidate.radius * .82;
  const halfWidth = candidate.radius * (.32 + candidate.variant % 3 * .035);
  const available = ceiling - groundAt(candidate.east, candidate.north)!;
  const height = Math.min(11 + candidate.variant % 6 * 2.2, available);
  const profile = [[-1, 0], [-.76, .23], [-.34, .74], [0, 1], [.36, .68], [.78, .22], [1, 0]] as const;
  const rings: number[][][] = [];
  for (let slice = 0; slice <= slices; slice++) {
    const along = -halfLength + 2 * halfLength * slice / slices;
    const taper = .5 + .5 * Math.sin(Math.PI * slice / slices);
    const ring: number[][] = [];
    for (let side = 0; side < profile.length; side++) {
      const [across, rise] = profile[side]!;
      const [east, north] = localPoint(candidate.east, candidate.north, candidate.yaw,
        along + (side % 2 ? .8 : -.6) * taper, across * halfWidth * taper);
      const base = groundAt(east, north);
      if (base === undefined || !Number.isFinite(base)) throw new RangeError('Snow ridge footprint lost heightAt coverage.');
      ring.push([east, Math.min(ceiling, base + .14 + height * rise * taper), -north]);
    }
    rings.push(ring);
  }
  for (let slice = 0; slice < slices; slice++) for (let side = 0; side < profile.length - 1; side++) {
    batch.quad(rings[slice]![side]!, rings[slice + 1]![side]!, rings[slice + 1]![side + 1]!, rings[slice]![side + 1]!,
      tint('snow', random));
  }
  for (const end of [0, slices]) {
    const ring = rings[end]!;
    const centre = ring.reduce((sum, point) => [sum[0]! + point[0]! / ring.length,
      sum[1]! + point[1]! / ring.length, sum[2]! + point[2]! / ring.length] as number[], [0, 0, 0]);
    for (let side = 1; side < ring.length - 1; side++) {
      if (end === 0) batch.triangle(centre, ring[side + 1]!, ring[side]!, tint('snow', random));
      else batch.triangle(centre, ring[side]!, ring[side + 1]!, tint('snow', random));
    }
  }
}

function addFacetedTower(batch: Batch, candidate: Candidate, groundAt: TownD2SnowRidgeHeightAt,
  random: () => number, ceiling: number, family: 'ice' | 'darkRock') {
  const base = groundAt(candidate.east, candidate.north)! + .08;
  const height = Math.min(candidate.kind === 'distant-peak' ? ceiling - base : 7 + candidate.variant % 7 * 1.7, ceiling - base);
  const sides = family === 'ice' ? 6 : 7;
  const courses = family === 'ice' ? 4 : 3;
  const radiusLimit = candidate.radius / 1.32;
  const rings: number[][][] = [];
  for (let course = 0; course <= courses; course++) {
    const fraction = course / courses;
    const radius = radiusLimit * (1 - fraction * .68) * (course === 0 ? 1 : .88 + random() * .2);
    const ring: number[][] = [];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2 + candidate.yaw + fraction * .13;
      const [east, north] = localPoint(candidate.east, candidate.north, 0,
        Math.cos(angle) * radius * (1 + random() * .16), Math.sin(angle) * radius * (.78 + random() * .25));
      ring.push([east, Math.min(ceiling, base + height * fraction +
        (course > 0 && course < courses ? (random() - .5) * height * .055 : 0)), -north]);
    }
    rings.push(ring);
  }
  for (let course = 0; course < courses; course++) for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    batch.quad(rings[course]![side]!, rings[course + 1]![side]!, rings[course + 1]![next]!, rings[course]![next]!,
      tint(family, random));
  }
  for (const course of [0, courses]) {
    const ring = rings[course]!;
    const centre: [number, number, number] = [candidate.east, base + height * course / courses, -candidate.north];
    for (let side = 1; side < sides - 1; side++) {
      if (course === 0) batch.triangle(centre, ring[side + 1]!, ring[side]!, tint(family, random));
      else batch.triangle(centre, ring[side]!, ring[side + 1]!, tint(family, random));
    }
  }
}

function addRock(batch: Batch, candidate: Candidate, groundAt: TownD2SnowRidgeHeightAt,
  random: () => number, ceiling: number, offsetEast: number, offsetNorth: number,
  radius: number, height: number, family: Family = 'darkRock') {
  const [east, north] = localPoint(candidate.east, candidate.north, candidate.yaw, offsetEast, offsetNorth);
  const base = groundAt(east, north)! + .04;
  const actualHeight = Math.min(height, ceiling - base);
  if (actualHeight < .5) return;
  const source = new DodecahedronGeometry(1, 0);
  const positions = source.getAttribute('position');
  const transformed: number[][] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    // Coordinate-hashed displacement keeps duplicated face vertices watertight.
    const variation = .88 + .2 * Math.abs(Math.sin(x * 71.7 + y * 37.1 + z * 93.3 + candidate.variant));
    transformed.push([east + x * radius * 1.18 * variation,
      Math.min(ceiling, base + (y + 1) * .5 * actualHeight * variation),
      -north + z * radius * variation]);
  }
  for (let i = 0; i < transformed.length; i += 3) {
    batch.triangle(transformed[i]!, transformed[i + 1]!, transformed[i + 2]!, tint(family, random));
  }
  source.dispose();
}

function addRockCluster(batches: Record<Family, Batch>, candidate: Candidate, groundAt: TownD2SnowRidgeHeightAt,
  random: () => number, ceiling: number) {
  const stones = 4 + candidate.variant % 4;
  for (let stone = 0; stone < stones; stone++) {
    const angle = stone / stones * Math.PI * 2 + random() * .5;
    const spread = candidate.radius * (.2 + random() * .45);
    const radius = candidate.radius * (.12 + random() * .09);
    addRock(batches.darkRock, candidate, groundAt, random, ceiling,
      Math.cos(angle) * spread, Math.sin(angle) * spread, radius, 3 + random() * 8);
  }
  // A restrained ochre stratum echoes the main peak without turning the ridge into a yellow wall.
  addRock(batches.yellowRock, candidate, groundAt, random, ceiling,
    candidate.radius * .08, -candidate.radius * .12, candidate.radius * .24, 4 + random() * 5, 'yellowRock');
}

function addRockStratum(batch: Batch, candidate: Candidate, groundAt: TownD2SnowRidgeHeightAt,
  random: () => number, peakHeight: number) {
  const base = groundAt(candidate.east, candidate.north)!;
  const centreHeight = peakHeight - 22;
  const thickness = 7 + candidate.variant % 4;
  if (centreHeight - thickness / 2 <= base) return;
  const sides = 7;
  const rings: number[][][] = [];
  for (const vertical of [-1, 1]) {
    const ring: number[][] = [];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2 + candidate.yaw;
      const radius = candidate.radius * .51 * (.92 + random() * .14);
      const [east, north] = [candidate.east + Math.cos(angle) * radius,
        candidate.north + Math.sin(angle) * radius * .82];
      ring.push([east, centreHeight + vertical * thickness / 2 + (random() - .5) * 1.6, -north]);
    }
    rings.push(ring);
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    batch.quad(rings[0]![side]!, rings[1]![side]!, rings[1]![next]!, rings[0]![next]!, tint('yellowRock', random));
  }
  const centre: [number, number, number] = [candidate.east, centreHeight, -candidate.north];
  for (let side = 1; side < sides - 1; side++) batch.triangle(centre, rings[1]![side]!, rings[1]![side + 1]!,
    tint('yellowRock', random));
}

/** Builds the H560–775 snowfield/rock-belt supplement without changing terrain, viewer or colliders. */
export function createTownD2MainSummitSnowRidges(options: TownD2SnowRidgeOptions) {
  const { heightAt, trailPoints, seed = townD2MainSummitSnowRidgeSpec.seed } = options;
  if (typeof heightAt !== 'function' || !Array.isArray(trailPoints) || !trailPoints.length || !trailPoints.every(finitePoint)) {
    throw new RangeError('Snow ridges require heightAt and a finite, non-empty trail polyline.');
  }
  if (!options.exclusions || !Array.isArray(options.exclusions)) {
    throw new RangeError('Supply the surveyed cable, observatory, facilities and glide-line exclusions.');
  }
  const suppliedZones = normalizeExclusions(options.exclusions);
  const summit = townD2MainSummitSnowRidgeSpec.summitFacilities;
  const zones: Zone[] = [...suppliedZones, ...surveyedTowerZones(trailPoints), {
    kind: 'rectangle', id: 'summit-facilities', ...summit,
    clearance: townD2MainSummitSnowRidgeSpec.routeClearance,
  }];
  const random = randomSource(seed);
  const bounds = mainSummitBounds;
  const width = bounds.east - bounds.west, depth = bounds.north - bounds.south;
  const ceiling = townD2MainSummitSnowRidgeSpec.maximumHeight;
  const rejections: Rejections = { ground: 0, height: 0, bounds: 0, clearance: 0, spacing: 0 };
  const candidates: Candidate[] = [];

  for (let ridge = 0; ridge < 3; ridge++) for (let part = 0; part < 9; part++) {
    candidates.push({ id: `snow-ridge-${ridge + 1}-${part + 1}`, kind: 'snow-ridge',
      east: bounds.west + width * (.12 + part / 8 * .76) + (random() - .5) * 55,
      north: bounds.south + depth * (.30 + ridge * .235) + (random() - .5) * 65,
      radius: 66 + random() * 42, parts: 1, yaw: (random() - .5) * .9, variant: Math.floor(random() * 12) });
  }
  for (let tower = 0; tower < 72; tower++) {
    candidates.push({ id: `ice-tower-${tower + 1}`, kind: 'ice-tower',
      east: bounds.west + width * (.08 + random() * .84), north: bounds.south + depth * (.24 + random() * .61),
      radius: 2.2 + random() * 4.4, parts: 1, yaw: random() * Math.PI, variant: Math.floor(random() * 14) });
  }
  for (let cluster = 0; cluster < 96; cluster++) {
    candidates.push({ id: `rock-cluster-${cluster + 1}`, kind: 'rock-cluster',
      east: bounds.west + width * (.06 + random() * .88), north: bounds.south + depth * (.22 + random() * .65),
      radius: 8 + random() * 10, parts: 5 + cluster % 4, yaw: random() * Math.PI * 2, variant: cluster });
  }
  for (let peak = 0; peak < 24; peak++) {
    const angle = peak / 24 * Math.PI * 2 + (random() - .5) * .12;
    const radius = 520 + random() * 300;
    const east = 50 + Math.cos(angle) * radius;
    const north = 1000 + Math.sin(angle) * radius;
    candidates.push({ id: `distant-peak-${peak + 1}`, kind: 'distant-peak', east, north,
      radius: 64 + random() * 48, parts: 2, yaw: random() * Math.PI, variant: peak });
  }

  const accepted: Candidate[] = [];
  const placements: TownD2SnowRidgePlacement[] = [];
  for (const candidate of candidates) {
    const { east, north, radius } = candidate;
    if (outside(east - radius, bounds.west, bounds.east) > 0 || outside(east + radius, bounds.west, bounds.east) > 0 ||
        outside(north - radius, bounds.south, bounds.north) > 0 || outside(north + radius, bounds.south, bounds.north) > 0) {
      rejections.bounds++;
      continue;
    }
    const base = heightAt(east, north);
    if (base === undefined || !Number.isFinite(base)) { rejections.ground++; continue; }
    const footprintGround = [base];
    const probeRadius = candidate.kind === 'distant-peak' ? radius * .6 : radius;
    for (let probe = 0; probe < 8; probe++) {
      const angle = probe / 8 * Math.PI * 2;
      const height = heightAt(east + Math.cos(angle) * probeRadius, north + Math.sin(angle) * probeRadius);
      if (height === undefined || !Number.isFinite(height)) { rejections.ground++; break; }
      footprintGround.push(height);
    }
    if (footprintGround.length !== 9) continue;
    const minimumFootprintBase = Math.min(...footprintGround);
    const top = candidate.kind === 'distant-peak'
      ? Math.min(ceiling, Math.max(610, base + 105 + candidate.variant % 6 * 20))
      : Math.min(ceiling, base + (candidate.kind === 'snow-ridge' ? 25 : candidate.kind === 'ice-tower' ? 28 : 15));
    if (minimumFootprintBase < townD2MainSummitSnowRidgeSpec.minimumHeight || base >= ceiling ||
        top <= base + 4 || top > ceiling) { rejections.height++; continue; }
    const trailDistance = polylineDistance(east, north, trailPoints);
    if (trailDistance < townD2MainSummitSnowRidgeSpec.trailClearance + radius ||
        zones.some(zone => zoneDistance(zone, east, north) < zone.clearance + radius)) {
      rejections.clearance++;
      continue;
    }
    const separation = candidate.kind === 'distant-peak' ? 145 : candidate.kind === 'snow-ridge' ? 105 : 32;
    if (accepted.some(other => other.kind !== 'distant-peak' && candidate.kind !== 'distant-peak' &&
        Math.hypot(east - other.east, north - other.north) < radius + other.radius + separation)) {
      rejections.spacing++;
      continue;
    }
    accepted.push(candidate);
    placements.push({ id: candidate.id, kind: candidate.kind, east, north, base, top, radius,
      position: [east, base, -north], parts: candidate.parts });
  }
  if (!placements.some(placement => placement.kind === 'snow-ridge') ||
      !placements.some(placement => placement.kind === 'ice-tower') ||
      !placements.some(placement => placement.kind === 'rock-cluster')) {
    throw new RangeError('The H560–775 domain and exclusions leave no valid snow-ridge, ice-tower and rock-cluster layout.');
  }

  const group = new Group();
  group.name = 'town-d2-main-summit-snow-ridges';
  const batches: Record<Family, Batch> = {
    snow: new GeometryBatch(), ice: new GeometryBatch(), darkRock: new GeometryBatch(), yellowRock: new GeometryBatch(),
  };
  for (const candidate of accepted) {
    if (candidate.kind === 'snow-ridge') addSnowRidge(batches.snow, candidate, heightAt, random, ceiling);
    else if (candidate.kind === 'ice-tower') addFacetedTower(batches.ice, candidate, heightAt, random, ceiling, 'ice');
    else if (candidate.kind === 'rock-cluster') addRockCluster(batches, candidate, heightAt, random, ceiling);
    else {
      addFacetedTower(batches.darkRock, candidate, heightAt, random, ceiling, 'darkRock');
      const base = heightAt(candidate.east, candidate.north)!;
      const peakHeight = Math.min(ceiling, Math.max(610, base + 105 + candidate.variant % 6 * 20));
      addRockStratum(batches.yellowRock, candidate, heightAt, random, peakHeight);
    }
  }

  const meshNames: Record<Family, string> = {
    snow: 'snow-ridge-spines', ice: 'ice-tower-serrations', darkRock: 'rock-clusters-and-distant-peaks',
    yellowRock: 'yellow-rock-strata',
  };
  const materials = new Map<Family, MeshLambertMaterial>();
  let vertices = 0, triangles = 0, meshes = 0;
  for (const family of families) {
    const batch = batches[family];
    if (!batch.data.positions.length) continue;
    const geometry = batch.geometry();
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    materials.set(family, material);
    const mesh = new Mesh(geometry, material);
    mesh.name = `town-d2-${meshNames[family]}`;
    mesh.userData = { visualOnly: true, materialFamily: family, heightAtAuthoritative: true };
    group.add(mesh);
    vertices += geometry.getAttribute('position').count;
    triangles += geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
    meshes++;
  }
  const count = (kind: TownD2SnowRidgeKind) => placements.filter(placement => placement.kind === kind).length;
  const stats = Object.freeze({
    seed: String(seed), placements: placements.length,
    snowRidges: count('snow-ridge'), iceTowers: count('ice-tower'), rockClusters: count('rock-cluster'),
    distantPeaks: count('distant-peak'), parts: placements.reduce((sum, placement) => sum + placement.parts, 0),
    vertices, triangles, meshes, drawCalls: meshes, materialFamilies: materials.size,
    minimumBase: Math.min(...placements.map(placement => placement.base)),
    maximumTop: Math.max(...placements.map(placement => placement.top)),
    trailClearance: townD2MainSummitSnowRidgeSpec.trailClearance,
    routeClearance: townD2MainSummitSnowRidgeSpec.routeClearance,
    suppliedExclusions: suppliedZones.length, protectedRockTowerClusters: surveyedTowerZones(trailPoints).length,
    rejections: Object.freeze({ ...rejections }),
  });
  group.userData = { visualOnly: true, includesWorldCollision: false, modifiesHeightAt: false, stats };
  let disposed = false;
  return {
    group,
    placements: placements as readonly TownD2SnowRidgePlacement[],
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
      materials.forEach(material => material.dispose());
      group.clear();
      group.userData.disposed = true;
    },
  };
}
