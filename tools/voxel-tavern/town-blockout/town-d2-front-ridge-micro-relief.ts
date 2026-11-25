import {
  BufferGeometry, Color, CylinderGeometry, DodecahedronGeometry, Euler, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Matrix4, Material, MeshLambertMaterial, Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEntryApproach, buildSwitchbackCenterline } from './front-ridge-switchback-road';
import { northRidgeCableAnchors, northRidgeMidStation, northRidgeSummit, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createTownD2FrontRidgeRestStops } from './town-d2-front-ridge-rest-stops';
import { surveyTownD2WestFootRiverPool } from './town-d2-west-foot-river-pool';

/** Visual-only D2 low/mid-slope relief. Terrain, road, viewer and heightAt stay untouched. */
export const TOWN_D2_MICRO_RELIEF = Object.freeze({
  minHeight: 60,
  maxHeight: 220,
  roadClearance: 15,
  cableClearance: 20,
  poolMargin: 2,
  restMargin: 1,
  defaultSeed: 0xd2f350,
  gridStep: 16,
});

export type TownD2MicroReliefKind = 'gully' | 'scree' | 'snow-ridge' | 'shrub' | 'gravel';
export type TownD2MicroReliefPlacement = Readonly<{
  id: string;
  kind: TownD2MicroReliefKind;
  east: number;
  north: number;
  height: number;
  /** Minimum plan clearance from the complete cluster footprint to protected ground. */
  clearance: number;
  footprintRadius: number;
  yaw: number;
  scale: Readonly<{ x: number; y: number; z: number }>;
  materialFamilies: readonly string[];
}>;

type CreateOptions = Readonly<{ seed?: number }>;
type Point = Readonly<{ east: number; north: number }>;
type RectExclusion = Point & Readonly<{ halfWidth: number; halfDepth: number; yaw: number }>;
type CircleExclusion = Point & Readonly<{ radius: number }>;
type RestExclusion = RectExclusion | CircleExclusion;
type ClusterPrototype = Readonly<{
  geometry: BufferGeometry;
  horizontalRadius: number;
  verticalExtent: number;
  materialFamilies: readonly string[];
}>;

const KINDS: readonly TownD2MicroReliefKind[] = ['gully', 'scree', 'snow-ridge', 'shrub', 'gravel'];
const PALETTES = {
  gully: { wetStone: '#405354', bankStone: '#8a8378', moss: '#44503c' },
  scree: { darkSchist: '#555b59', paleStone: '#a1a29a', ochreGrit: '#a98a56' },
  'snow-ridge': { snowCrust: '#e8ecf0', snowShade: '#bfcdd7', exposedRock: '#626c6b' },
  shrub: { deadwood: '#65513a', alpineLeaf: '#57684c', berry: '#8a4a34', snowCap: '#d6e4f2' },
  gravel: { granite: '#858b87', rustyPebble: '#8a6f50', lichen: '#697355' },
} as const;

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function hash(seed: number, x: number, y: number, salt: number) {
  let value = Math.imul((x + 1) | 0, 374761393) ^ Math.imul((y + 1) | 0, 668265263) ^
    Math.imul((seed + salt) | 0, 1274126177);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return (value ^ value >>> 16) >>> 0;
}

function pointSegmentDistance(east: number, north: number, a: Point, b: Point) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn || 1;
  const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared));
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function distanceToLine(east: number, north: number, line: readonly Point[]) {
  let distance = Infinity;
  for (let i = 1; i < line.length; i++) {
    distance = Math.min(distance, pointSegmentDistance(east, north, line[i - 1]!, line[i]!));
  }
  return distance;
}

function rectangleDistance(east: number, north: number, rectangle: RectExclusion) {
  const dx = east - rectangle.east, dn = north - rectangle.north;
  const cosine = Math.cos(rectangle.yaw), sine = Math.sin(rectangle.yaw);
  const localEast = cosine * dx - sine * dn;
  const localNorth = sine * dx + cosine * dn;
  return Math.hypot(Math.max(0, Math.abs(localEast) - rectangle.halfWidth),
    Math.max(0, Math.abs(localNorth) - rectangle.halfDepth));
}

function restExclusions() {
  const stops = createTownD2FrontRidgeRestStops();
  const exclusions: RestExclusion[] = [];
  try {
    for (const placement of stops.placements) {
      const object = stops.group.getObjectByName(placement.id);
      const foundation = object?.userData.foundation as
        | { halfWidth?: number; halfDepth?: number; radius?: number } | undefined;
      const margin = TOWN_D2_MICRO_RELIEF.restMargin;
      if (foundation?.halfWidth !== undefined && foundation?.halfDepth !== undefined) {
        exclusions.push({ east: placement.east, north: placement.north, yaw: placement.yaw,
          halfWidth: foundation.halfWidth + margin, halfDepth: foundation.halfDepth + margin });
      } else {
        const radius = foundation?.radius ?? (placement.kind === 'bench' ? 1.25 :
          placement.kind === 'warning' ? 1.55 : .55);
        exclusions.push({ east: placement.east, north: placement.north, radius: radius + margin });
      }
    }
  } finally {
    stops.dispose();
  }
  return exclusions;
}

/** Every sub-part is an irregular faceted solid; merged colours are the material families. */
function clusterPrototype(kind: TownD2MicroReliefKind, seed: number): ClusterPrototype {
  const rand = random(seed);
  const pieces: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, color: string, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const matrix = new Matrix4().compose(new Vector3(x, y, z),
      new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));
    flat.applyMatrix4(matrix);
    const count = flat.getAttribute('position').count;
    const tint = new Color(color);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
    flat.setAttribute('color', new Float32BufferAttribute(colors, 3));
    if (!flat.getAttribute('uv')) {
      flat.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    pieces.push(flat);
  };

  if (kind === 'gully') {
    for (let i = 0; i < 7; i++) {
      const x = -1.75 + i * .58 + (rand() - .5) * .18;
      const z = Math.sin(i * 1.31) * .25;
      add(new DodecahedronGeometry(1, 0), PALETTES.gully.wetStone,
        x, .02, z, .42 + rand() * .15, .11 + rand() * .08, .34 + rand() * .12,
        .08, rand() * Math.PI, .05);
      if (i % 2 === 0) add(new DodecahedronGeometry(1, 0), PALETTES.gully.bankStone,
        x + .12, .15, (i % 4 ? -1 : 1) * (.62 + rand() * .18),
        .32 + rand() * .18, .20 + rand() * .12, .28 + rand() * .12, .1, rand() * 3, .12);
    }
    for (let i = 0; i < 4; i++) add(new IcosahedronGeometry(1, 0), PALETTES.gully.moss,
      -.9 + i * .62, .10, .52 + Math.sin(i * 2.1) * .22,
      .27 + rand() * .12, .08, .22 + rand() * .09, 0, rand() * 3, 0);
  } else if (kind === 'scree') {
    for (let i = 0; i < 10; i++) {
      const angle = rand() * Math.PI * 2, radius = Math.sqrt(rand()) * 1.55;
      const size = .24 + rand() * .42;
      add(new DodecahedronGeometry(1, 0), i % 3 === 0 ? PALETTES.scree.paleStone :
        i % 3 === 1 ? PALETTES.scree.ochreGrit : PALETTES.scree.darkSchist,
        Math.cos(angle) * radius, size * .42, Math.sin(angle) * radius,
        size * (1 + rand() * .45), size * (.65 + rand() * .35), size, rand() * .3, rand() * 3, rand() * .2);
    }
    add(new DodecahedronGeometry(1, 0), PALETTES.scree.paleStone,
      -.25, .39, -.12, .76, .56, .62, .08, .6, -.12);
  } else if (kind === 'snow-ridge') {
    for (let i = 0; i < 5; i++) {
      add(new DodecahedronGeometry(1, 0), i % 2 ? PALETTES['snow-ridge'].snowShade : PALETTES['snow-ridge'].snowCrust,
        -1.45 + i * .72, .16 + (i % 2) * .04, Math.sin(i * 1.7) * .16,
        .69 + rand() * .14, .22 + rand() * .12, .48 + rand() * .14, 0, rand() * .16, (rand() - .5) * .08);
    }
    for (let i = 0; i < 3; i++) add(new DodecahedronGeometry(1, 0), PALETTES['snow-ridge'].exposedRock,
      -.9 + i * .92, .18, (i % 2 ? -1 : 1) * .48,
      .29 + rand() * .13, .25 + rand() * .13, .25, .15, rand() * 3, .12);
  } else if (kind === 'shrub') {
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2 + rand() * .3;
      const x = Math.cos(angle) * .38, z = Math.sin(angle) * .38;
      add(new CylinderGeometry(.035, .065, .82 + rand() * .22, 5), PALETTES.shrub.deadwood,
        x, .43, z, 1, 1, 1, Math.sin(angle) * .28, 0, -Math.cos(angle) * .28);
      add(new IcosahedronGeometry(1, 0), i % 2 ? PALETTES.shrub.alpineLeaf : '#44503c',
        x * 1.35, .69 + rand() * .23, z * 1.35, .48 + rand() * .16, .38 + rand() * .17, .45 + rand() * .13,
        rand() * .3, rand() * 3, rand() * .2);
    }
    for (let i = 0; i < 5; i++) add(new DodecahedronGeometry(1, 0), PALETTES.shrub.berry,
      (rand() - .5) * 1.25, .55 + rand() * .43, (rand() - .5) * 1.1,
      .065, .07, .065, 0, rand() * 3, 0);
    add(new DodecahedronGeometry(1, 0), PALETTES.shrub.snowCap,
      -.12, 1.03, .05, .55, .10, .41, .04, .3, -.03);
  } else {
    for (let i = 0; i < 12; i++) {
      const angle = rand() * Math.PI * 2, radius = Math.sqrt(rand()) * 1.5;
      const size = .13 + rand() * .25;
      const color = i % 3 === 0 ? PALETTES.gravel.rustyPebble :
        i % 3 === 1 ? PALETTES.gravel.lichen : PALETTES.gravel.granite;
      add(new DodecahedronGeometry(1, 0), color, Math.cos(angle) * radius, size * .35,
        Math.sin(angle) * radius, size * 1.25, size * .7, size, rand() * .4, rand() * 3, rand() * .3);
    }
  }

  const merged = mergeGeometries(pieces);
  pieces.forEach(piece => piece.dispose());
  if (!merged) throw new Error(`D2 micro-relief: failed to merge ${kind}.`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const bounds = merged.boundingBox!;
  return {
    geometry: merged,
    horizontalRadius: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x),
      Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
    verticalExtent: Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
    materialFamilies: Object.keys(PALETTES[kind]),
  };
}

export function createTownD2FrontRidgeMicroRelief(options: CreateOptions = {}) {
  const seed = options.seed ?? TOWN_D2_MICRO_RELIEF.defaultSeed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('D2 micro-relief seed must be an unsigned 32-bit integer.');
  }
  const road = buildSwitchbackCenterline();
  const junction = road.find(point => point.east === 270 && point.north === 460)!;
  const entry = buildEntryApproach(junction.height);
  const protectedRoad: readonly Point[] = [...road, ...entry];
  const cable = northRidgeCableAnchors.map(([east, north]) => ({ east, north }));
  const platforms: RectExclusion[] = [
    { east: northRidgeMidStation.east, north: northRidgeMidStation.north,
      halfWidth: northRidgeMidStation.width / 2 + 4, halfDepth: northRidgeMidStation.depth / 2 + 4, yaw: 0 },
    { east: northRidgeSummit.east, north: northRidgeSummit.north,
      halfWidth: northRidgeSummit.width / 2 + 4, halfDepth: northRidgeSummit.depth / 2 + 4, yaw: 0 },
    { east: 526, north: 329, halfWidth: 18, halfDepth: 16, yaw: 0 },
  ];
  const pool = surveyTownD2WestFootRiverPool().site;
  const poolExclusion = { east: pool.east, north: pool.north,
    radius: pool.radius + TOWN_D2_MICRO_RELIEF.poolMargin };
  const stops = restExclusions();
  const prototypes = new Map(townD2Kinds(seed));
  const placements: TownD2MicroReliefPlacement[] = [];
  const config = TOWN_D2_MICRO_RELIEF;

  for (let north = 276; north <= 610; north += config.gridStep) {
    for (let east = 8; east <= 632; east += config.gridStep) {
      const index = Math.round((north - 276) / config.gridStep) * 40 + Math.round((east - 8) / config.gridStep);
      const rand = random(hash(seed, index, 0, 91));
      const kind = KINDS[hash(seed, index, 0, 17) % KINDS.length]!;
      const prototype = prototypes.get(kind)!;
      const x = east + (rand() - .5) * config.gridStep * .55;
      const n = north + (rand() - .5) * config.gridStep * .55;
      if (x < 2 || x > 638 || n < 2 || n > 798) continue;
      const ground = sampleNorthRidge350(x, n);
      if (ground < config.minHeight + .2 || ground > config.maxHeight - .2) continue;

      const slopeEast = (sampleNorthRidge350(x + .5, n) - sampleNorthRidge350(x - .5, n));
      const slopeNorth = (sampleNorthRidge350(x, n + .5) - sampleNorthRidge350(x, n - .5));
      const slope = Math.hypot(slopeEast, slopeNorth);
      let scale: { x: number; y: number; z: number };
      if (kind === 'gully') scale = { x: 1.05 + rand() * .45, y: .85 + rand() * .35, z: .78 + rand() * .25 };
      else if (kind === 'snow-ridge') scale = { x: 1.05 + rand() * .55, y: .9 + rand() * .35, z: .75 + rand() * .3 };
      else if (kind === 'shrub') scale = { x: .82 + rand() * .4, y: .82 + rand() * .38, z: .82 + rand() * .4 };
      else scale = { x: .82 + rand() * .48, y: .78 + rand() * .42, z: .82 + rand() * .48 };
      const footprintRadius = prototype.horizontalRadius * Math.max(scale.x, scale.z) +
        prototype.verticalExtent * scale.y * slope + .2;
      const roadGap = distanceToLine(x, n, protectedRoad) - footprintRadius - config.roadClearance;
      const cableGap = distanceToLine(x, n, cable) - footprintRadius - config.cableClearance;
      const platformGap = Math.min(...platforms.map(site => rectangleDistance(x, n, site) - footprintRadius));
      const poolGap = Math.hypot(x - poolExclusion.east, n - poolExclusion.north) -
        poolExclusion.radius - footprintRadius;
      const restGap = Math.min(...stops.map(site => 'radius' in site ?
        Math.hypot(x - site.east, n - site.north) - site.radius - footprintRadius :
        rectangleDistance(x, n, site) - footprintRadius));
      const clearance = Math.min(roadGap, cableGap, platformGap, poolGap, restGap);
      if (clearance < .1) continue;

      // Reject a cluster if any part of its conservative footprint leaves the H60–220 band.
      let minimumGround = Infinity, maximumGround = -Infinity;
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2;
        const height = sampleNorthRidge350(x + Math.cos(angle) * footprintRadius,
          n + Math.sin(angle) * footprintRadius);
        minimumGround = Math.min(minimumGround, height);
        maximumGround = Math.max(maximumGround, height);
      }
      if (minimumGround < config.minHeight + .05 || maximumGround > config.maxHeight - .05) continue;
      if (placements.some(other => Math.hypot(x - other.east, n - other.north) <
        (footprintRadius + other.footprintRadius) * .68)) continue;

      const downhill = kind === 'gully' ? Math.atan2(slopeNorth, -slopeEast) :
        kind === 'snow-ridge' ? Math.atan2(slopeEast, slopeNorth) : rand() * Math.PI * 2;
      placements.push(Object.freeze({
        id: `town-d2-micro-${kind}-${placements.length.toString().padStart(3, '0')}`,
        kind, east: x, north: n, height: ground - .1, clearance, footprintRadius,
        yaw: downhill, scale: Object.freeze(scale), materialFamilies: prototype.materialFamilies,
      }));
    }
  }

  const group = new Group();
  group.name = 'town-d2-front-ridge-micro-relief';
  group.userData = { visualOnly: true, includesWorldCollision: false, scope: 'D2-H60-220',
    terrainAuthority: 'sampleNorthRidge350', positionConvention: 'x=east,y=height,z=-north', seed };
  const materials = new Set<Material>();
  const meshes: InstancedMesh[] = [];
  const up = new Vector3(0, 1, 0);
  for (const kind of KINDS) {
    const list = placements.filter(placement => placement.kind === kind);
    if (!list.length) continue;
    const prototype = prototypes.get(kind)!;
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    material.name = `town-d2-micro-${kind}-families`;
    materials.add(material);
    const mesh = new InstancedMesh(prototype.geometry, material, list.length);
    mesh.name = `town-d2-micro-relief-${kind}`;
    mesh.userData = { kind, materialFamilies: prototype.materialFamilies };
    const matrix = new Matrix4(), tilt = new Matrix4(), yawMatrix = new Matrix4();
    list.forEach((placement, index) => {
      const dx = (sampleNorthRidge350(placement.east + .5, placement.north) -
        sampleNorthRidge350(placement.east - .5, placement.north));
      const dn = (sampleNorthRidge350(placement.east, placement.north + .5) -
        sampleNorthRidge350(placement.east, placement.north - .5));
      const normal = new Vector3(-dx, 1, dn).normalize();
      const gradient = new Vector3(-dx, 0, dn);
      const tangent = gradient.addScaledVector(normal, -gradient.dot(normal)).normalize();
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
      const bitangent = new Vector3().crossVectors(tangent, normal).normalize();
      tilt.makeBasis(tangent, normal, bitangent);
      yawMatrix.makeRotationY(placement.yaw);
      matrix.copy(tilt).multiply(yawMatrix);
      matrix.scale(new Vector3(placement.scale.x, placement.scale.y, placement.scale.z));
      matrix.setPosition(placement.east, placement.height, -placement.north);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }

  const byKind = Object.fromEntries(KINDS.map(kind =>
    [kind, placements.filter(placement => placement.kind === kind).length])) as Record<TownD2MicroReliefKind, number>;
  const stats = Object.freeze({
    seed,
    placementCount: placements.length,
    instanceCount: placements.length,
    meshCount: meshes.length,
    drawCalls: meshes.length,
    triangles: meshes.reduce((total, mesh) => total +
      (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count, 0),
    materialFamilyCount: new Set(placements.flatMap(placement => placement.materialFamilies)).size,
    minHeight: placements.length ? Math.min(...placements.map(placement => placement.height)) : 0,
    maxHeight: placements.length ? Math.max(...placements.map(placement => placement.height)) : 0,
    minClearance: placements.length ? Math.min(...placements.map(placement => placement.clearance)) : 0,
    byKind: Object.freeze(byKind),
  });
  let disposed = false;
  return {
    group,
    placements,
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.dispose();
        mesh.geometry.dispose();
      }
      for (const material of materials) material.dispose();
      group.clear();
      group.userData.disposed = true;
    },
  };
}

function* townD2Kinds(seed: number) {
  const salts = [3, 19, 47, 83, 131];
  for (let i = 0; i < KINDS.length; i++) {
    const kind = KINDS[i]!;
    yield [kind, clusterPrototype(kind, hash(seed, i, 0, salts[i]!))] as const;
  }
}
