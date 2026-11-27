import {
  Color, Group, IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D,
  type BufferGeometry,
} from 'three';
import { createMainSummitBlock, mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { createMainSummitTrail } from './main-summit-trail';
import {
  createTownD2MainSummitSnowRidges, townD2MainSummitSnowRidgeSpec,
  type TownD2SnowRidgeExclusion, type TownD2SnowRidgeHeightAt,
  type TownD2SnowRidgePlacement, type TownD2SnowRidgePoint,
} from './town-d2-main-summit-snow-ridges';
import { sampleTownD2R30Height } from './town-d2-r30-domain';

export type TownD2R30SnowRockHostOptions = Readonly<{
  heightAt?: typeof sampleTownD2R30Height;
  arrivalHeight?: number;
  trailPoints?: readonly { east: number; north: number; height?: number }[];
  exclusions?: readonly { east: number; north: number; radius: number }[];
}>;

export type TownD2R30LowRockPlacement = Readonly<{
  id: string;
  kind: 'low-rock-cluster';
  east: number;
  north: number;
  base: number;
  top: number;
  radius: number;
  position: readonly [x: number, y: number, z: number];
  parts: number;
}>;

export type TownD2R30LowRockInstance = Readonly<{
  cluster: string;
  east: number;
  north: number;
  base: number;
  top: number;
  radius: number;
}>;

export const townD2R30SnowRockBudget = Object.freeze({ drawCalls: 8, triangles: 8_000 });
export const townD2R30LowRockSpec = Object.freeze({
  minimumHeight: 210,
  maximumHeight: 540,
  maximumClusters: 12,
  stonesPerCluster: 3,
  seed: 'town-d2-r30-low-rock-clusters-v1',
});

/** Surveyed keep-clear zones. Caller circles are appended rather than replacing these. */
export const townD2R30DefaultSnowRockExclusions: readonly TownD2SnowRidgeExclusion[] = Object.freeze([
  { id: 'mountain-gate-plaza', kind: 'rectangle', west: -mainSummitSpec.arrivalPlaza[0] / 2,
    east: mainSummitSpec.arrivalPlaza[0] / 2, south: mainSummitBounds.south,
    north: mainSummitSpec.arrivalPlaza[1], clearance: 20 },
  { id: 'summit-platform', kind: 'rectangle',
    west: mainSummitLayout.summit.east - mainSummitSpec.summitPlateau[0] / 2,
    east: mainSummitLayout.summit.east + mainSummitSpec.summitPlateau[0] / 2,
    south: mainSummitLayout.summit.north - mainSummitSpec.summitPlateau[1] / 2,
    north: mainSummitLayout.summit.north + mainSummitSpec.summitPlateau[1] / 2, clearance: 20 },
  { id: 'cloud-terrace-entrance', kind: 'polyline', radius: 4, clearance: 20,
    points: [{ east: 0, north: -14 }, { east: 0, north: 20 }, { east: -1, north: 6.25 }] },
  { id: 'cloud-deck-station', kind: 'rectangle', west: -10, east: -3, south: -2.5, north: 15, clearance: 20 },
  { id: 'mountain-gate-guardroom', kind: 'rectangle', west: 4.5, east: 12, south: 2.5, north: 11.5, clearance: 20 },
  { id: 'cable-two', kind: 'polyline', radius: 0, points: [
    { east: -850, north: 250 }, { east: -520, north: 650 }, { east: -120, north: 900 }, { east: 24, north: 999 },
  ] },
  { id: 'glide-line', kind: 'polyline', radius: 0, points: [
    { east: 50, north: 1000 }, { east: -80, north: 800 }, { east: -350, north: 300 }, { east: -700, north: -50 },
  ] },
  { id: 'watch-ruins', kind: 'circle', east: 390, north: 1120, radius: 18 },
  { id: 'machine-hall', kind: 'circle', east: -80, north: 920, radius: 22 },
]);

type Zone = TownD2SnowRidgeExclusion;
type LowRockCandidate = Readonly<{
  id: string;
  east: number;
  north: number;
  base: number;
  radius: number;
  yaw: number;
  variant: number;
}>;
type LowRockRejections = Record<'bounds' | 'ground' | 'height' | 'clearance' | 'spacing', number>;

const defaultTrailCache = new Map<number, readonly TownD2SnowRidgePoint[]>();
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const outside = (value: number, minimum: number, maximum: number) => Math.max(minimum - value, value - maximum, 0);

function finitePoint(point: TownD2SnowRidgePoint) {
  return Number.isFinite(point.east) && Number.isFinite(point.north);
}

function defaultTrailPoints(arrivalHeight: number): readonly TownD2SnowRidgePoint[] {
  const cached = defaultTrailCache.get(arrivalHeight);
  if (cached) return cached;
  // The surveyed trail is anchored to the canonical P-1 height field, not the
  // R30 relief field (whose micro-noise makes the contour walk stall). Keep
  // this in lockstep with town-d2-r30-strata.ts so snow/rock and strata share
  // one keep-clear centreline. The temporary block is disposed immediately.
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 512);
  let points: readonly TownD2SnowRidgePoint[];
  try {
    points = createMainSummitTrail(block.heightAt, arrivalHeight).points.map(point => ({
      east: point.east, north: point.north, height: point.height,
    })) as readonly TownD2SnowRidgePoint[];
  } finally {
    block.dispose();
  }
  defaultTrailCache.set(arrivalHeight, points);
  return points;
}

function normalizeTrail(input: readonly { east: number; north: number; height?: number }[]) {
  if (!Array.isArray(input) || !input.length || !input.every(point =>
    point && finitePoint(point) && (point.height === undefined || Number.isFinite(point.height)))) {
    throw new RangeError('D2-R30 snow/rock host requires a finite, non-empty trail polyline.');
  }
  return input.map(point => ({ east: point.east, north: point.north,
    ...(point.height === undefined ? {} : { height: point.height }) })) as TownD2SnowRidgePoint[];
}

function segmentDistance(east: number, north: number, a: TownD2SnowRidgePoint, b: TownD2SnowRidgePoint) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const fraction = lengthSquared === 0 ? 0 : clamp(((east - a.east) * dx + (north - a.north) * dn) / lengthSquared, 0, 1);
  return Math.hypot(east - a.east - fraction * dx, north - a.north - fraction * dn);
}

function polylineDistance(east: number, north: number, points: readonly TownD2SnowRidgePoint[]) {
  if (points.length === 1) return Math.hypot(east - points[0]!.east, north - points[0]!.north);
  let distance = Infinity;
  for (let index = 1; index < points.length; index++) {
    distance = Math.min(distance, segmentDistance(east, north, points[index - 1]!, points[index]!));
  }
  return distance;
}

function zoneDistance(zone: Zone, east: number, north: number) {
  if (zone.kind === 'polyline') return polylineDistance(east, north, zone.points) - zone.radius;
  if ('west' in zone) {
    return Math.hypot(outside(east, zone.west, zone.east), outside(north, zone.south, zone.north));
  }
  return Math.hypot(east - zone.east, north - zone.north) - zone.radius;
}

function randomSource(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function rockGeometry() {
  const geometry: BufferGeometry = new IcosahedronGeometry(1, 0);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const horizontal = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
  const height = box.max.y - box.min.y;
  geometry.translate(0, -box.min.y, 0);
  geometry.scale(1 / horizontal, 1 / height, 1 / horizontal);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addLowRockClusters(options: {
  heightAt: TownD2SnowRidgeHeightAt;
  trailPoints: readonly TownD2SnowRidgePoint[];
  zones: readonly Zone[];
  triangleBudget: number;
}) {
  const { heightAt, trailPoints, zones, triangleBudget } = options;
  const geometry = rockGeometry();
  const trianglesPerStone = (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  const maximumClusters = Math.min(townD2R30LowRockSpec.maximumClusters,
    Math.floor(triangleBudget / (townD2R30LowRockSpec.stonesPerCluster * trianglesPerStone)));
  const random = randomSource(townD2R30LowRockSpec.seed);
  const rejections: LowRockRejections = { bounds: 0, ground: 0, height: 0, clearance: 0, spacing: 0 };
  const accepted: LowRockCandidate[] = [];
  const bounds = mainSummitBounds;

  if (maximumClusters > 0) {
    candidate: for (let row = 0; row < 18; row++) for (let column = 0; column < 20; column++) {
      const radius = 8 + random() * 4;
      const east = bounds.west + 42 + column * 111 + (random() - .5) * 28;
      const north = bounds.south + 42 + row * 100 + (random() - .5) * 28;
      if (outside(east - radius, bounds.west, bounds.east) > 0 || outside(east + radius, bounds.west, bounds.east) > 0 ||
          outside(north - radius, bounds.south, bounds.north) > 0 || outside(north + radius, bounds.south, bounds.north) > 0) {
        rejections.bounds++;
        continue;
      }
      const base = heightAt(east, north);
      if (base === undefined || !Number.isFinite(base)) { rejections.ground++; continue; }
      if (base < townD2R30LowRockSpec.minimumHeight || base > townD2R30LowRockSpec.maximumHeight) {
        rejections.height++;
        continue;
      }
      let validFootprint = true;
      for (let probe = 0; probe < 8; probe++) {
        const angle = probe / 8 * Math.PI * 2;
        const height = heightAt(east + Math.cos(angle) * radius, north + Math.sin(angle) * radius);
        if (height === undefined || !Number.isFinite(height)) { rejections.ground++; validFootprint = false; break; }
        if (height < townD2R30LowRockSpec.minimumHeight || height > townD2R30LowRockSpec.maximumHeight) {
          rejections.height++;
          validFootprint = false;
          break;
        }
      }
      if (!validFootprint) continue;
      if (polylineDistance(east, north, trailPoints) < townD2MainSummitSnowRidgeSpec.trailClearance + radius ||
          zones.some(zone => zoneDistance(zone, east, north) < (zone.clearance ?? townD2MainSummitSnowRidgeSpec.routeClearance) + radius)) {
        rejections.clearance++;
        continue;
      }
      if (accepted.some(other => Math.hypot(east - other.east, north - other.north) < radius + other.radius + 34)) {
        rejections.spacing++;
        continue;
      }
      accepted.push({ id: `low-rock-cluster-${accepted.length + 1}`, east, north, base, radius,
        yaw: random() * Math.PI * 2, variant: accepted.length });
      if (accepted.length === maximumClusters) break candidate;
    }
  }

  const material = new MeshLambertMaterial({ color: '#ffffff', emissive: '#000000', emissiveIntensity: 0 });
  material.name = 'town-d2-r30-low-rock';
  const mesh = new InstancedMesh(geometry, material, accepted.length * townD2R30LowRockSpec.stonesPerCluster);
  mesh.name = 'town-d2-r30-instanced-low-rock-clusters';
  mesh.userData = { visualOnly: true, materialFamily: 'lowRock', heightAtAuthoritative: true };
  const transform = new Object3D();
  const tint = new Color();
  const placements: TownD2R30LowRockPlacement[] = [];
  const instances: TownD2R30LowRockInstance[] = [];
  let instanceIndex = 0;
  for (const candidate of accepted) {
    let clusterTop = candidate.base;
    for (let stone = 0; stone < townD2R30LowRockSpec.stonesPerCluster; stone++) {
      const angle = stone / townD2R30LowRockSpec.stonesPerCluster * Math.PI * 2 + random() * .65;
      const stoneRadius = 1.25 + random() * 1.05;
      const spread = candidate.radius * (.16 + random() * .25);
      const east = candidate.east + Math.cos(angle) * spread;
      const north = candidate.north + Math.sin(angle) * spread;
      const base = heightAt(east, north);
      if (base === undefined || !Number.isFinite(base)) throw new RangeError('Low-rock cluster lost heightAt coverage.');
      const height = 2.4 + random() * 4.2;
      transform.position.set(east, base, -north);
      transform.rotation.set(0, candidate.yaw + random() * Math.PI, 0);
      transform.scale.set(stoneRadius, height, stoneRadius);
      transform.updateMatrix();
      mesh.setMatrixAt(instanceIndex, transform.matrix);
      tint.set(['#535d64', '#68737a', '#424c54', '#778087'][(candidate.variant + stone) % 4]!);
      mesh.setColorAt(instanceIndex, tint);
      instances.push(Object.freeze({ cluster: candidate.id, east, north, base, top: base + height, radius: stoneRadius }));
      clusterTop = Math.max(clusterTop, base + height);
      instanceIndex++;
    }
    placements.push(Object.freeze({ id: candidate.id, kind: 'low-rock-cluster' as const,
      east: candidate.east, north: candidate.north, base: candidate.base, top: clusterTop, radius: candidate.radius,
      position: [candidate.east, candidate.base, -candidate.north] as const,
      parts: townD2R30LowRockSpec.stonesPerCluster }));
  }
  mesh.count = instanceIndex;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { geometry, material, mesh, placements, instances, triangles: instanceIndex * trianglesPerStone, rejections };
}

/**
 * Mounts the surveyed snow/ridge supplement on the complete R30 height field.
 * The optional low-rock batch is instanced, terrain-supported and budgeted after
 * the existing four material batches; it never changes terrain or collision.
 */
export function createTownD2R30SnowRockHost(options: TownD2R30SnowRockHostOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('arrivalHeight must be finite.');
  const heightAt: TownD2SnowRidgeHeightAt = options.heightAt ??
    ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  const trailPoints = normalizeTrail(options.trailPoints ?? defaultTrailPoints(arrivalHeight));
  const suppliedExclusions = options.exclusions ?? [];
  if (!Array.isArray(suppliedExclusions)) throw new RangeError('exclusions must be an array of circles.');
  const callerZones: Zone[] = suppliedExclusions.map((zone, index) => {
    if (!zone || ![zone.east, zone.north, zone.radius].every(Number.isFinite) || zone.radius < 0) {
      throw new RangeError(`caller-exclusion-${index + 1}: invalid circle exclusion.`);
    }
    return { id: `caller-exclusion-${index + 1}`, kind: 'circle', east: zone.east, north: zone.north, radius: zone.radius };
  });
  const zones: readonly Zone[] = [...townD2R30DefaultSnowRockExclusions, ...callerZones];
  const ridges = createTownD2MainSummitSnowRidges({ heightAt, trailPoints, exclusions: zones });
  if (ridges.stats.triangles > townD2R30SnowRockBudget.triangles) {
    ridges.dispose();
    throw new RangeError('The surveyed snow ridges exceed the D2-R30 8k triangle budget.');
  }
  const lowRocks = addLowRockClusters({ heightAt, trailPoints, zones,
    triangleBudget: townD2R30SnowRockBudget.triangles - ridges.stats.triangles });
  const group = new Group();
  group.name = 'town-d2-r30-snow-rock-host';
  group.add(ridges.group);
  if (lowRocks.instances.length) group.add(lowRocks.mesh);
  const triangles = ridges.stats.triangles + lowRocks.triangles;
  const meshes = ridges.stats.meshes + (lowRocks.instances.length ? 1 : 0);
  const stats = Object.freeze({
    ...ridges.stats,
    totalPlacements: ridges.stats.placements + lowRocks.placements.length,
    lowRockClusters: lowRocks.placements.length,
    lowRockInstances: lowRocks.instances.length,
    lowRockTriangles: lowRocks.triangles,
    lowRockMinimumHeight: townD2R30LowRockSpec.minimumHeight,
    lowRockMaximumHeight: townD2R30LowRockSpec.maximumHeight,
    triangles,
    vertices: ridges.stats.vertices + lowRocks.instances.length * lowRocks.geometry.getAttribute('position').count,
    meshes,
    drawCalls: meshes,
    materialFamilies: ridges.stats.materialFamilies + (lowRocks.instances.length ? 1 : 0),
    drawBudget: townD2R30SnowRockBudget.drawCalls,
    triangleBudget: townD2R30SnowRockBudget.triangles,
    trailPoints: trailPoints.length,
    defaultExclusions: townD2R30DefaultSnowRockExclusions.length,
    suppliedExclusions: suppliedExclusions.length,
    lowRockRejections: Object.freeze({ ...lowRocks.rejections }),
  });
  const ridgePlacements = ridges.placements as readonly TownD2SnowRidgePlacement[];
  group.userData = {
    visualOnly: true, includesWorldCollision: false, modifiesHeightAt: false, heightAtAuthoritative: true,
    stats, placements: ridgePlacements, lowRockPlacements: lowRocks.placements,
    lowRockInstances: lowRocks.instances, exclusions: zones, night: false,
  };
  let disposed = false;
  let night = false;
  return {
    group,
    stats: () => stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R30 snow/rock host is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      ridges.setNight(value);
      if (lowRocks.instances.length) {
        lowRocks.material.color.set(value ? '#8fa5b5' : '#ffffff');
        lowRocks.material.emissive.set(value ? '#101b26' : '#000000');
        lowRocks.material.emissiveIntensity = value ? .16 : 0;
        lowRocks.material.needsUpdate = true;
      }
      night = value;
      group.userData.night = night;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ridges.dispose();
      if (lowRocks.instances.length) {
        lowRocks.mesh.removeFromParent();
        lowRocks.mesh.dispose();
      }
      lowRocks.geometry.dispose();
      lowRocks.material.dispose();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
