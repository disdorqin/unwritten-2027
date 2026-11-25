import {
  BufferGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, StaticDrawUsage,
} from 'three';
import { mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';
import { createTownD2CloudTerraceOuterRing, TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS } from './town-d2-cloud-terrace-outer-ring';
import { createTownD2MainSummitCloudWall, townD2MainSummitCloudSpec } from './town-d2-main-summit-cloud-wall';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30Spec,
} from './town-d2-r30-domain';

export const TOWN_D2_R30_CLOUD_TERRACE_HOST_MAX_DRAWS = 12;
export const TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT = 320;

export type TownD2R30CloudTerraceTrailPoint = Readonly<{ east: number; north: number; height?: number }>;
export type TownD2R30CloudTerraceExclusion = Readonly<{ east: number; north: number; radius: number }>;
export type TownD2R30CloudTerraceHostOptions = Readonly<{
  heightAt?: typeof sampleTownD2R30Height;
  arrivalHeight?: number;
  trailPoints?: readonly TownD2R30CloudTerraceTrailPoint[];
  exclusions?: readonly TownD2R30CloudTerraceExclusion[];
}>;

type Rect = Readonly<{ west: number; east: number; south: number; north: number }>;
type ForestKind = 'pine' | 'rock';
type ForestPlacement = Readonly<{
  id: string;
  cluster: number;
  kind: ForestKind;
  east: number;
  north: number;
  height: number;
  base: number;
  width: number;
  tall: number;
  depth: number;
  yaw: number;
  slope: number;
  footprintRadius: number;
  groundGap: number;
}>;
type Rejections = Record<'bounds' | 'height' | 'terrain' | 'slope' | 'arrival' | 'summit' |
  'valley' | 'trail' | 'terrace' | 'exclusion' | 'spacing', number>;

const ARRIVAL_RECT: Rect = { west: -30, east: 30, south: -10, north: 40 };
const SUMMIT_RECT: Rect = {
  west: mainSummitLayout.summit.east - mainSummitSpec.summitPlateau[0] / 2,
  east: mainSummitLayout.summit.east + mainSummitSpec.summitPlateau[0] / 2,
  south: mainSummitLayout.summit.north - mainSummitSpec.summitPlateau[1] / 2,
  north: mainSummitLayout.summit.north + mainSummitSpec.summitPlateau[1] / 2,
};
const ARRIVAL_CLEARANCE = 3;
const SUMMIT_CLEARANCE = 4;
const VALLEY_CLEARANCE = 28;
const TERRACE_CLEARANCE = 4;
const TRAIL_CLEARANCE = 15;
const GROUND_SINK = .1;
const CLUSTER_SPACING = 64;
const EPSILON = 1e-9;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const outside = (value: number, minimum: number, maximum: number) => Math.max(minimum - value, value - maximum, 0);

function distanceToRect(east: number, north: number, rect: Rect) {
  return Math.hypot(outside(east, rect.west, rect.east), outside(north, rect.south, rect.north));
}

function pointSegmentDistance(east: number, north: number,
  a: TownD2R30CloudTerraceTrailPoint, b: TownD2R30CloudTerraceTrailPoint) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared > EPSILON ? clamp(((east - a.east) * dx + (north - a.north) * dn) / lengthSquared, 0, 1) : 0;
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function distanceToTrail(line: readonly TownD2R30CloudTerraceTrailPoint[], east: number, north: number) {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return Math.hypot(east - line[0]!.east, north - line[0]!.north);
  let distance = Infinity;
  for (let index = 1; index < line.length; index++) {
    distance = Math.min(distance, pointSegmentDistance(east, north, line[index - 1]!, line[index]!));
  }
  return distance;
}

/** Same surveyed gully metric as the R30 height field, including its meandering centre. */
function distanceToValley(east: number, north: number,
  valley: Readonly<{ east: number; north: number; heading: number }>) {
  const dx = east - valley.east, dn = north - valley.north;
  const along = dx * Math.cos(valley.heading) + dn * Math.sin(valley.heading);
  const across = -dx * Math.sin(valley.heading) + dn * Math.cos(valley.heading);
  return Math.hypot(across + Math.sin(along * .011) * 24, Math.max(0, Math.abs(along) - 460) * .22);
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

function addColoredBox(positions: number[], colors: number[], tint: Color,
  centre: readonly [number, number, number], size: readonly [number, number, number]) {
  const [cx, cy, cz] = centre, [width, height, depth] = size;
  const x0 = cx - width / 2, x1 = cx + width / 2;
  const y0 = cy - height / 2, y1 = cy + height / 2;
  const z0 = cz - depth / 2, z1 = cz + depth / 2;
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y0, z1], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y0, z0], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  ] as const;
  for (const face of faces) for (const point of face) {
    positions.push(...point);
    colors.push(tint.r, tint.g, tint.b);
  }
}

/** One six-block pine prototype; every tree is one instance of this shared geometry. */
function createPineGeometry() {
  const positions: number[] = [], colors: number[] = [];
  const box = (tint: string, centre: readonly [number, number, number], size: readonly [number, number, number]) =>
    addColoredBox(positions, colors, new Color(tint), centre, size);
  box('#654a32', [0, -.22, 0], [.16, .56, .16]);
  box('#314c3b', [0, -.18, 0], [.9, .2, .9]);
  box('#3d5b43', [0, -.02, 0], [.74, .22, .74]);
  box('#49684a', [0, .15, 0], [.56, .22, .56]);
  box('#36533f', [0, .35, 0], [.34, .3, .34]);
  box('#dce6e8', [0, .465, 0], [.37, .07, .37]);
  const geometry = new BufferGeometry();
  geometry.name = 'd2-r30-lowland-pine-prototype';
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A faceted, asymmetric rock normalized to exactly [-.5, .5] vertically. */
function createRockGeometry() {
  const geometry = new IcosahedronGeometry(.5, 0);
  geometry.name = 'd2-r30-lowland-rock-prototype';
  const positions = geometry.getAttribute('position');
  let minimumY = Infinity, maximumY = -Infinity;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const radius = .91 + .07 * Math.sin(x * 19 + y * 13 + z * 17);
    const px = x * radius, py = y * radius, pz = z * radius;
    positions.setXYZ(index, px, py, pz);
    minimumY = Math.min(minimumY, py);
    maximumY = Math.max(maximumY, py);
  }
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, -.5 + (positions.getY(index) - minimumY) / (maximumY - minimumY));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLowlandForest(heightAt: (east: number, north: number) => number | undefined,
  trail: readonly TownD2R30CloudTerraceTrailPoint[],
  exclusions: readonly TownD2R30CloudTerraceExclusion[]) {
  const random = mulberry32(0xd2f0301);
  const between = (minimum: number, maximum: number) => minimum + (maximum - minimum) * random();
  const placements: ForestPlacement[] = [];
  const rejected: Rejections = { bounds: 0, height: 0, terrain: 0, slope: 0, arrival: 0, summit: 0,
    valley: 0, trail: 0, terrace: 0, exclusion: 0, spacing: 0 };
  let candidates = 0, clustersAttempted = 0;
  const occupiedClusters = new Set<number>();
  const { west, east, south, north } = mainSummitBounds;

  function place(kind: ForestKind, cluster: number, eastPos: number, northPos: number) {
    candidates++;
    const width = kind === 'pine' ? between(3.2, 5.1) : between(1.3, 3.4);
    const depth = kind === 'pine' ? width * between(.88, 1.08) : width * between(.75, 1.2);
    const tall = kind === 'pine' ? between(5.8, 9.2) : width * between(.65, 1.05);
    const footprintRadius = Math.hypot(width * .5, depth * .5);
    if (eastPos - footprintRadius < west || eastPos + footprintRadius > east ||
        northPos - footprintRadius < south || northPos + footprintRadius > north) {
      rejected.bounds++;
      return;
    }
    const ground = heightAt(eastPos, northPos);
    if (ground === undefined || !Number.isFinite(ground)) { rejected.terrain++; return; }
    if (ground >= TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT) { rejected.height++; return; }

    const probe = 3;
    const heights = [
      ground, heightAt(eastPos - probe, northPos), heightAt(eastPos + probe, northPos),
      heightAt(eastPos, northPos - probe), heightAt(eastPos, northPos + probe),
    ];
    if (heights.some(value => value === undefined || !Number.isFinite(value))) { rejected.terrain++; return; }
    const gradientEast = (heights[2]! - heights[1]!) / (probe * 2);
    const gradientNorth = (heights[4]! - heights[3]!) / (probe * 2);
    const slope = Math.hypot(gradientEast, gradientNorth);
    if (slope > (kind === 'pine' ? .52 : .72)) { rejected.slope++; return; }

    const halfEast = width * .5, halfNorth = depth * .5;
    const footprintHeights = [
      ground, heightAt(eastPos - halfEast, northPos - halfNorth), heightAt(eastPos + halfEast, northPos - halfNorth),
      heightAt(eastPos - halfEast, northPos + halfNorth), heightAt(eastPos + halfEast, northPos + halfNorth),
    ];
    if (footprintHeights.some(value => value === undefined || !Number.isFinite(value))) { rejected.terrain++; return; }
    const lowest = Math.min(...footprintHeights as number[]), highest = Math.max(...footprintHeights as number[]);
    const groundGap = highest - lowest;
    if (groundGap > (kind === 'pine' ? 1.35 : 1.8)) { rejected.terrain++; return; }

    if (distanceToRect(eastPos, northPos, ARRIVAL_RECT) - footprintRadius < ARRIVAL_CLEARANCE) {
      rejected.arrival++;
      return;
    }
    if (distanceToRect(eastPos, northPos, SUMMIT_RECT) - footprintRadius < SUMMIT_CLEARANCE) {
      rejected.summit++;
      return;
    }
    if (townD2R30Anchors.valleys.some(valley =>
      distanceToValley(eastPos, northPos, valley) - footprintRadius < VALLEY_CLEARANCE)) {
      rejected.valley++;
      return;
    }
    if (distanceToTrail(trail, eastPos, northPos) - footprintRadius < TRAIL_CLEARANCE) {
      rejected.trail++;
      return;
    }
    if (distanceToRect(eastPos, northPos, TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS) - footprintRadius < TERRACE_CLEARANCE) {
      rejected.terrace++;
      return;
    }
    if (exclusions.some(exclusion =>
      Math.hypot(eastPos - exclusion.east, northPos - exclusion.north) - footprintRadius < exclusion.radius)) {
      rejected.exclusion++;
      return;
    }
    const minimumSpacing = kind === 'pine' ? 3.4 : 2.2;
    if (placements.some(other => Math.hypot(eastPos - other.east, northPos - other.north) <
      (minimumSpacing + other.footprintRadius) * .62)) {
      rejected.spacing++;
      return;
    }
    placements.push(Object.freeze({
      id: `d2-r30-${kind}-${String(placements.length + 1).padStart(4, '0')}`,
      cluster, kind, east: eastPos, north: northPos, height: ground, base: lowest - GROUND_SINK,
      width, tall, depth, yaw: between(0, Math.PI * 2), slope, footprintRadius, groundGap,
    }));
    occupiedClusters.add(cluster);
  }

  // Coarse cluster anchors avoid uniform tree farming. Members and rocks are
  // independently terrain/slope/clearance tested, so a rejected anchor does not
  // discard an otherwise valid neighbouring patch.
  let cluster = 0;
  for (let northPos = south + 42; northPos < north - 42; northPos += CLUSTER_SPACING) {
    for (let eastPos = west + 42; eastPos < east - 42; eastPos += CLUSTER_SPACING) {
      cluster++;
      if (random() < .34) continue;
      clustersAttempted++;
      const centreEast = eastPos + between(-19, 19), centreNorth = northPos + between(-19, 19);
      const anchorHeight = heightAt(centreEast, centreNorth);
      if (anchorHeight === undefined || !Number.isFinite(anchorHeight) || anchorHeight >= 310) continue;
      const trees = 5 + Math.floor(random() * 6);
      for (let index = 0; index < trees; index++) {
        const angle = between(0, Math.PI * 2), distance = Math.sqrt(random()) * 24;
        place('pine', cluster, centreEast + Math.cos(angle) * distance, centreNorth + Math.sin(angle) * distance);
      }
      const rocks = 1 + Math.floor(random() * 3);
      for (let index = 0; index < rocks; index++) {
        const angle = between(0, Math.PI * 2), distance = between(5, 27);
        place('rock', cluster, centreEast + Math.cos(angle) * distance, centreNorth + Math.sin(angle) * distance);
      }
    }
  }

  const group = new Group();
  group.name = 'town-d2-r30-lowland-forest';
  group.userData = {
    visualOnly: true, includesWorldCollision: false, includesLights: false, includesText: false,
    modifiesHeightAt: false, coordinateConvention: 'x=east,y=height,z=-north',
  };
  const pineGeometry = createPineGeometry(), rockGeometry = createRockGeometry();
  const material = new MeshLambertMaterial({
    name: 'd2-r30-lowland-forest-lambert', color: '#ffffff', vertexColors: true,
    transparent: false, opacity: 1, depthWrite: true, fog: true,
  });
  const meshes: InstancedMesh[] = [];
  const dummy = new Object3D(), matrix = new Matrix4(), tint = new Color();
  const dayColors = new Map<InstancedMesh, Float32Array>();
  const pinePalette = ['#b7c9ad', '#a8bca0', '#c3d0b8', '#9caf97'];
  const rockPalette = ['#a7aaa4', '#92978f', '#b5b5aa', '#7f8985'];
  for (const kind of ['pine', 'rock'] as const) {
    const subset = placements.filter(placement => placement.kind === kind);
    const geometry = kind === 'pine' ? pineGeometry : rockGeometry;
    const mesh = new InstancedMesh(geometry, material, subset.length);
    mesh.name = `town-d2-r30-lowland-${kind}`;
    mesh.frustumCulled = false;
    subset.forEach((placement, index) => {
      dummy.position.set(placement.east, placement.base + placement.tall / 2, -placement.north);
      dummy.rotation.set(0, placement.yaw, 0);
      dummy.scale.set(placement.width, placement.tall, placement.depth);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      mesh.setMatrixAt(index, matrix);
      const palette = kind === 'pine' ? pinePalette : rockPalette;
      mesh.setColorAt(index, tint.set(palette[(placement.cluster + index) % palette.length]!));
    });
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    // Three allocates instanceColor lazily in setColorAt. Keep an empty,
    // valid attribute for an excluded domain so night toggles remain safe.
    mesh.instanceColor ??= new InstancedBufferAttribute(new Float32Array(subset.length * 3), 3);
    mesh.instanceColor.setUsage(StaticDrawUsage);
    dayColors.set(mesh, new Float32Array(mesh.instanceColor.array));
    group.add(mesh);
    meshes.push(mesh);
  }

  const pines = placements.filter(placement => placement.kind === 'pine');
  const rocks = placements.filter(placement => placement.kind === 'rock');
  const triangleCount = meshes.reduce((sum, mesh) => sum +
    (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count, 0);
  const stats = Object.freeze({
    seed: 0xd2f0301,
    candidates,
    clustersAttempted,
    clusters: occupiedClusters.size,
    pines: pines.length,
    rocks: rocks.length,
    trees: pines.length,
    instances: placements.length,
    meshes: meshes.length,
    draws: meshes.length,
    drawCalls: meshes.length,
    triangles: triangleCount,
    minGroundHeight: placements.length ? Math.min(...placements.map(item => item.height)) : 0,
    maxGroundHeight: placements.length ? Math.max(...placements.map(item => item.height)) : 0,
    maxSlope: placements.length ? Math.max(...placements.map(item => item.slope)) : 0,
    maxGroundGap: placements.length ? Math.max(...placements.map(item => item.groundGap)) : 0,
    maxGroundSink: placements.length ? Math.max(...placements.map(item => item.height - item.base)) : 0,
    maxHeight: TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT,
    trailClearance: TRAIL_CLEARANCE,
    valleyClearance: VALLEY_CLEARANCE,
    rejected: Object.freeze({ ...rejected }),
  });
  group.userData.stats = stats;
  let night = false, disposed = false;
  const nightTint = new Color('#304868');
  function applyNight(value: boolean) {
    for (const mesh of meshes) {
      const source = dayColors.get(mesh)!;
      if (value) {
        for (let index = 0; index < source.length; index += 3) {
          tint.setRGB(source[index]!, source[index + 1]!, source[index + 2]!)
            .multiplyScalar(.42).lerp(nightTint, .38);
          mesh.instanceColor!.setXYZ(index / 3, tint.r, tint.g, tint.b);
        }
      } else {
        (mesh.instanceColor!.array as Float32Array).set(source);
      }
      mesh.instanceColor!.needsUpdate = true;
    }
    material.emissive.set(value ? '#0b1626' : '#000000');
    material.emissiveIntensity = value ? .22 : 0;
    material.needsUpdate = true;
  }
  return {
    group, stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2 R30 lowland forest is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      applyNight(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      meshes.forEach(mesh => mesh.dispose());
      pineGeometry.dispose();
      rockGeometry.dispose();
      material.dispose();
      group.userData.disposed = true;
    },
  };
}

/**
 * Composes the reviewed cloud-wall and cloud-terrace supplements with a new
 * low-altitude clustered forest. All inputs and outputs remain in local
 * (east, north, height); only Three.js positions convert north to -z.
 */
export function createTownD2R30CloudTerraceHost(options: TownD2R30CloudTerraceHostOptions = {}) {
  const heightAt = options.heightAt === undefined ? sampleTownD2R30Height : options.heightAt;
  const arrivalHeight = options.arrivalHeight ?? 347;
  const trail = options.trailPoints ?? [];
  const exclusions = options.exclusions ?? [];
  if (typeof heightAt !== 'function') throw new TypeError('heightAt must be a function.');
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('arrivalHeight must be finite.');
  if (!Array.isArray(trail) || trail.some(point => !point ||
    ![point.east, point.north, point.height].every(value => value === undefined || Number.isFinite(value)))) {
    throw new RangeError('trailPoints contains an invalid point.');
  }
  if (!Array.isArray(exclusions) || exclusions.some(exclusion => !exclusion ||
    ![exclusion.east, exclusion.north, exclusion.radius].every(Number.isFinite) || exclusion.radius <= 0)) {
    throw new RangeError('exclusions must contain finite circles with positive radii.');
  }
  const sample = (east: number, north: number) => heightAt(east, north, arrivalHeight);
  const cloud = createTownD2MainSummitCloudWall({
    heightAt: sample,
    trailPoints: trail,
    // The reviewed wall consumes east/north directly. Never feed it Three.js
    // z here: doing so would reflect every exclusion across the north axis.
    exclusions: exclusions.map(exclusion => ({
      kind: 'custom' as const, east: exclusion.east, north: exclusion.north, radius: exclusion.radius,
      minHeight: townD2MainSummitCloudSpec.bottom, maxHeight: townD2MainSummitCloudSpec.top,
    })),
  });
  const outerRing = createTownD2CloudTerraceOuterRing();
  const forest = createLowlandForest(sample, trail, exclusions);
  const group = new Group();
  group.name = 'town-d2-r30-cloud-terrace-host';
  group.add(cloud.group, outerRing.group, forest.group);
  const stats = Object.freeze({
    groups: Object.freeze([cloud.group.name, outerRing.group.name, forest.group.name]),
    cloud: cloud.stats,
    outerRing: outerRing.stats,
    forest: forest.stats,
    instances: cloud.stats.instances + outerRing.stats.instances + forest.stats.instances,
    meshes: cloud.stats.meshes + outerRing.stats.meshes + forest.stats.meshes,
    draws: cloud.stats.drawCalls + outerRing.stats.drawCalls + forest.stats.drawCalls,
    drawCalls: cloud.stats.drawCalls + outerRing.stats.drawCalls + forest.stats.drawCalls,
    triangles: cloud.stats.triangles + outerRing.stats.triangleCount + forest.stats.triangles,
    maxDraws: TOWN_D2_R30_CLOUD_TERRACE_HOST_MAX_DRAWS,
    cloudBand: Object.freeze({
      bottom: townD2MainSummitCloudSpec.bottom, top: townD2MainSummitCloudSpec.top,
    }),
    forestHeightBand: Object.freeze({
      minimum: townD2R30Spec.baseHeight, maximumExclusive: TOWN_D2_R30_LOWLAND_FOREST_MAX_HEIGHT,
    }),
    coordinateConvention: 'x=east,y=height,z=-north',
    visualOnly: true,
    includesWorldCollision: false,
    modifiesHeightAt: false,
  });
  group.userData = { ...stats, terrainSampler: 'host-heightAt', owner: 'D2-R01' };
  let disposed = false;
  return {
    group,
    stats() { return stats; },
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2 R30 cloud terrace host is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      cloud.setNight(value);
      forest.setNight(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cloud.dispose();
      outerRing.dispose();
      forest.dispose();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
