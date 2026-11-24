import {
  BoxGeometry, BufferGeometry, Color, DataTexture, Float32BufferAttribute, Group,
  InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, Object3D, RepeatWrapping,
  SRGBColorSpace, StaticDrawUsage,
} from 'three';
import { meteorCraterRimRadius } from './meteor-crater';
import type { AtlasSpeciesEntry } from './town-atlas-species';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';

/** C2-03 / batch 95. Visual scene only: no pickup, inventory or collision authority. */
export const c2CraterMoltenBeadsPlan = Object.freeze({
  id: 'c2-crater-molten-beads',
  east: -88,
  north: 168,
  width: 20,
  depth: 15,
  longAxis: 'east-west',
  beadCount: 768,
  minBeadSize: .06,
  maxBeadSize: .18,
  gravelCount: 168,
  nearReadDistance: 15,
  rimGuardInset: 1,
  nightEmissiveIntensity: .3,
  workfaceReserveRadius: 14.5,
} as const);

/** K-47 final copy, supplied as data to the existing atlas registry/copy-table interface. */
export const k47StarTearsCopy = Object.freeze({
  'atlas.k47.star-tears.name': '星星的眼泪',
  'atlas.k47.star-tears.form': '坑底焦土里嵌着的青绿小珠，是那颗星星落地时溅出的熔玻璃。',
  'atlas.k47.star-tears.habit': '白天混在灰土里不起眼，夜里凑近看，一粒一粒透着微光。',
  'atlas.k47.star-tears.folk': '镇上老人说，那是星星掉下来的时候疼得掉的眼泪，后来就留在了坑里。',
} as const);

export const k47StarTearsAtlasEntry: AtlasSpeciesEntry = Object.freeze({
  id: 'crater-star-tears' as const,
  region: 'crater',
  range: c2CraterMoltenBeadsPlan.nearReadDistance,
  copy: Object.freeze({
    name: 'atlas.k47.star-tears.name',
    form: 'atlas.k47.star-tears.form',
    habit: 'atlas.k47.star-tears.habit',
    folk: 'atlas.k47.star-tears.folk',
  }),
} as const);

export type MoltenBeadsGround = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
export type MoltenBeadsReservedSite = Readonly<{
  east: number;
  north: number;
  radius: number;
  source: 'workface' | 'winch-foot' | 'snake-stone' | 'winch-plinth' | 'caller';
}>;

export type MoltenBeadsFirstPickupHostMarker = Readonly<{
  id: 'c2-crater-molten-beads-first-pickup';
  kind: 'first-pickup';
  atlasSpeciesId: 'crater-star-tears';
  atlasDiscovery: 'seen';
  east: number;
  north: number;
  height: number;
  range: number;
}>;

export type MoltenBeadsMountOptions = Readonly<{
  /** Called only when the host forwards an authority-accepted first pickup. */
  onFirstPickup?: (marker: MoltenBeadsFirstPickupHostMarker) => void;
  /** Additional protected footprints; this module never moves or consumes them. */
  reservedSites?: readonly Readonly<{ east: number; north: number; radius: number }>[];
}>;

export type MoltenBeadsFrame = Readonly<{
  /** Three.js world camera position: x=east, y=height, z=-north. */
  cameraPosition: Readonly<{ x: number; y: number; z: number }>;
  night: boolean;
}>;

export type MoltenBeadsStats = Readonly<{
  beadCount: number;
  gravelCount: number;
  minBeadSize: number;
  maxBeadSize: number;
  width: number;
  depth: number;
  longAxis: 'east-west';
  nearReadDistance: number;
  footprintDistance: number;
  beadsVisible: boolean;
  night: boolean;
  emissiveIntensity: number;
  materialFamilies: readonly string[];
  drawCalls: number;
  triangles: number;
  reservedSites: readonly MoltenBeadsReservedSite[];
}>;

export type MoltenBeadsScene = {
  readonly group: Group;
  readonly firstPickupHostMarker: MoltenBeadsFirstPickupHostMarker;
  readonly stats: MoltenBeadsStats;
  update(frame: MoltenBeadsFrame): void;
  /** Forward only after window B's pickup authority accepts the first pickup. */
  notifyFirstPickup(): void;
  dispose(): void;
};

const tau = Math.PI * 2;
const cubeHalfDiagonal = Math.sqrt(3) / 2;
const materialFamilies = Object.freeze(['charred-earth', 'impact-glass', 'basalt-gravel'] as const);

function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function grainTexture(base: number, dark: number, light: number) {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  const random = randomSource(base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = random();
    const color = noise < .22 ? dark : noise > .82 ? light : base;
    pixels.set([color >> 16, color >> 8 & 255, color & 255, 255], 4 * (x + size * y));
  }
  const texture = new DataTexture(pixels, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function circleIntersectsCell(e0: number, e1: number, n0: number, n1: number,
  site: MoltenBeadsReservedSite) {
  const east = Math.max(e0, Math.min(e1, site.east));
  const north = Math.max(n0, Math.min(n1, site.north));
  return Math.hypot(east - site.east, north - site.north) < site.radius;
}

function pointReserved(east: number, north: number, radius: number,
  reserved: readonly MoltenBeadsReservedSite[]) {
  return reserved.some(site => Math.hypot(east - site.east, north - site.north) < site.radius + radius);
}

/** The glass shader gates each fragment, not merely the batch centre, at the 15 m near-read limit. */
function installNearReadGate(material: MeshStandardMaterial) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vMoltenBeadWorld;',
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 moltenWorldPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        moltenWorldPosition = instanceMatrix * moltenWorldPosition;
      #endif
      vMoltenBeadWorld = (modelMatrix * moltenWorldPosition).xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vMoltenBeadWorld;',
    ).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float moltenNearRead = 1.0 - smoothstep(14.5, 15.0, distance(vMoltenBeadWorld, cameraPosition));
      totalEmissiveRadiance *= moltenNearRead;`,
    );
  };
  material.customProgramCacheKey = () => 'c2-molten-beads-near-read-15-v1';
  material.userData.nearReadDistance = c2CraterMoltenBeadsPlan.nearReadDistance;
}

function buildScorchedEarth(ground: MoltenBeadsGround,
  reserved: readonly MoltenBeadsReservedSite[]) {
  const { east: centreE, north: centreN } = c2CraterMoltenBeadsPlan;
  const west = centreE - c2CraterMoltenBeadsPlan.width / 2;
  const south = centreN - c2CraterMoltenBeadsPlan.depth / 2;
  const columns = 40, rows = 30;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const heightAt = (east: number, north: number) => {
    const height = ground.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) {
      throw new Error(`C2-03 has no host terrain height at E${east}/N${north}.`);
    }
    return height;
  };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const e0 = west + column * .5, e1 = e0 + .5;
    const n0 = south + row * .5, n1 = n0 + .5;
    if (reserved.some(site => circleIntersectsCell(e0, e1, n0, n1, site))) continue;
    const corners = [[e0, n0], [e1, n0], [e0, n1], [e1, n1]] as const;
    const offset = positions.length / 3;
    corners.forEach(([east, north]) => {
      positions.push(east, heightAt(east, north) + .018, -north);
      uvs.push((east - west) / c2CraterMoltenBeadsPlan.width,
        (north - south) / c2CraterMoltenBeadsPlan.depth);
    });
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
  }
  if (!indices.length) throw new Error('C2-03 scorched-earth footprint is fully reserved.');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

type Scatter = Readonly<{ east: number; north: number; height: number; size: number }>;

function scatter(ground: MoltenBeadsGround, reserved: readonly MoltenBeadsReservedSite[],
  count: number, minSize: number, maxSize: number, seed: number, spacing: number): Scatter[] {
  const random = randomSource(seed);
  const { east: centreE, north: centreN, width, depth } = c2CraterMoltenBeadsPlan;
  const placements: Scatter[] = [];
  const attemptsLimit = count * 100;
  for (let attempt = 0; attempt < attemptsLimit && placements.length < count; attempt++) {
    const east = centreE + (random() - .5) * width;
    const north = centreN + (random() - .5) * depth;
    const size = minSize + random() * (maxSize - minSize);
    if (pointReserved(east, north, size * cubeHalfDiagonal, reserved)) continue;
    if (placements.some(other => Math.hypot(east - other.east, north - other.north) < spacing)) continue;
    const height = ground.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) {
      throw new Error(`C2-03 has no host terrain height at E${east}/N${north}.`);
    }
    placements.push({ east, north, height, size });
  }
  if (placements.length !== count) {
    throw new Error(`C2-03 could place only ${placements.length}/${count} pieces without entering reserved ground.`);
  }
  return placements;
}

function stampInstances(geometry: BoxGeometry, material: MeshStandardMaterial,
  placements: readonly Scatter[], embedded: number, gravel: boolean) {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  const dummy = new Object3D();
  const random = randomSource(gravel ? 47021 : 47047);
  placements.forEach((piece, index) => {
    dummy.position.set(piece.east, piece.height + piece.size * embedded, -piece.north);
    dummy.rotation.set((random() - .5) * .14, random() * tau, (random() - .5) * .14);
    dummy.scale.setScalar(piece.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function mountC2CraterMoltenBeads(ground: MoltenBeadsGround,
  options: MoltenBeadsMountOptions = {}): MoltenBeadsScene {
  if (![ground.anchor.east, ground.anchor.north, ground.anchor.yaw].every(Number.isFinite)) {
    throw new RangeError('C2-03 requires a finite live crater anchor.');
  }
  if (options.onFirstPickup !== undefined && typeof options.onFirstPickup !== 'function') {
    throw new TypeError('C2-03 onFirstPickup must be a callback.');
  }

  const survey = surveyZa31CraterWinch(ground);
  const reserved: MoltenBeadsReservedSite[] = [{
    east: ground.anchor.east, north: ground.anchor.north,
    radius: c2CraterMoltenBeadsPlan.workfaceReserveRadius, source: 'workface',
  }];
  if (survey) {
    reserved.push(
      { ...survey.useFoot, radius: 1.45, source: 'winch-foot' },
      { ...survey.snakeStoneReservation, source: 'snake-stone' },
      { ...survey.plinth, radius: 1.2, source: 'winch-plinth' },
    );
  }
  for (const site of options.reservedSites ?? []) {
    if (![site.east, site.north, site.radius].every(Number.isFinite) || site.radius <= 0) {
      throw new RangeError('C2-03 reserved sites require finite coordinates and a positive radius.');
    }
    reserved.push({ ...site, source: 'caller' });
  }
  Object.freeze(reserved);

  const group = new Group();
  group.name = c2CraterMoltenBeadsPlan.id;
  const earthMap = grainTexture(0x332d29, 0x181a19, 0x62503b);
  earthMap.repeat.set(10, 7.5);
  const gravelMap = grainTexture(0x5e5b53, 0x353a38, 0x8b8678);
  const earthMaterial = new MeshStandardMaterial({ map: earthMap, roughness: 1, flatShading: true });
  const glassMaterial = new MeshStandardMaterial({
    color: 0xffffff, emissive: 0x65c9ad, emissiveIntensity: 0,
    roughness: .3, metalness: .04, flatShading: true,
  });
  installNearReadGate(glassMaterial);
  const gravelMaterial = new MeshStandardMaterial({ map: gravelMap, roughness: 1, flatShading: true });
  const cube = new BoxGeometry(1, 1, 1);

  const earthGeometry = buildScorchedEarth(ground, reserved);
  const earth = new Mesh(earthGeometry, earthMaterial);
  earth.name = 'c2-molten-beads-scorched-earth';
  earth.receiveShadow = true;
  group.add(earth);

  const beads = scatter(ground, reserved, c2CraterMoltenBeadsPlan.beadCount,
    c2CraterMoltenBeadsPlan.minBeadSize, c2CraterMoltenBeadsPlan.maxBeadSize, 9503, .105);
  const beadMesh = stampInstances(cube, glassMaterial, beads, .42, false);
  beadMesh.name = 'c2-molten-beads-impact-glass';
  beadMesh.visible = false;
  beadMesh.receiveShadow = true;
  const glassTones = [0x397f73, 0x4f9b87, 0x69b39c, 0x80bfa8].map(value => new Color(value));
  beads.forEach((_, index) => beadMesh.setColorAt(index, glassTones[index % glassTones.length]!));
  if (beadMesh.instanceColor) beadMesh.instanceColor.needsUpdate = true;
  group.add(beadMesh);

  const gravel = scatter(ground, reserved, c2CraterMoltenBeadsPlan.gravelCount,
    .045, .13, 9521, .08);
  const gravelMesh = stampInstances(cube, gravelMaterial, gravel, .24, true);
  gravelMesh.name = 'c2-molten-beads-basalt-gravel';
  gravelMesh.receiveShadow = true;
  group.add(gravelMesh);

  const hostBead = beads.reduce((best, piece) =>
    Math.hypot(piece.east - c2CraterMoltenBeadsPlan.east, piece.north - c2CraterMoltenBeadsPlan.north) <
    Math.hypot(best.east - c2CraterMoltenBeadsPlan.east, best.north - c2CraterMoltenBeadsPlan.north)
      ? piece : best);
  const firstPickupHostMarker: MoltenBeadsFirstPickupHostMarker = Object.freeze({
    id: 'c2-crater-molten-beads-first-pickup',
    kind: 'first-pickup',
    atlasSpeciesId: 'crater-star-tears' as const,
    atlasDiscovery: 'seen',
    east: hostBead.east,
    north: hostBead.north,
    height: hostBead.height + hostBead.size * .92,
    range: 2.4,
  });

  const minBeadSize = Math.min(...beads.map(piece => piece.size));
  const maxBeadSize = Math.max(...beads.map(piece => piece.size));
  const minHeight = Math.min(...beads.map(piece => piece.height)) - c2CraterMoltenBeadsPlan.maxBeadSize;
  const maxHeight = Math.max(...beads.map(piece => piece.height)) + c2CraterMoltenBeadsPlan.maxBeadSize;
  let footprintDistance = Infinity;
  let night = false;
  let disposed = false;

  const update = (frame: MoltenBeadsFrame) => {
    if (disposed) return;
    const camera = frame.cameraPosition;
    if (![camera.x, camera.y, camera.z].every(Number.isFinite)) {
      throw new RangeError('C2-03 camera position must be finite.');
    }
    const dx = Math.max(Math.abs(camera.x - c2CraterMoltenBeadsPlan.east) - c2CraterMoltenBeadsPlan.width / 2, 0);
    const dz = Math.max(Math.abs(camera.z + c2CraterMoltenBeadsPlan.north) - c2CraterMoltenBeadsPlan.depth / 2, 0);
    const dy = Math.max(minHeight - camera.y, camera.y - maxHeight, 0);
    footprintDistance = Math.hypot(dx, dy, dz);
    const craterRadius = Math.hypot(camera.x - ground.anchor.east, camera.z + ground.anchor.north);
    const insideRimGuard = craterRadius < meteorCraterRimRadius - c2CraterMoltenBeadsPlan.rimGuardInset;
    // The rim has its own explicit veto even where the 20 m beach comes within 15 m.
    // Inside that guard, the shader still gates individual fragments at 15 m.
    beadMesh.visible = insideRimGuard && footprintDistance <= c2CraterMoltenBeadsPlan.nearReadDistance;
    night = frame.night;
    glassMaterial.emissiveIntensity = night ? c2CraterMoltenBeadsPlan.nightEmissiveIntensity : 0;
  };

  const notifyFirstPickup = () => {
    if (!disposed) options.onFirstPickup?.(firstPickupHostMarker);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    earthGeometry.dispose();
    cube.dispose();
    earthMaterial.dispose();
    glassMaterial.dispose();
    gravelMaterial.dispose();
    earthMap.dispose();
    gravelMap.dispose();
  };

  return {
    group,
    firstPickupHostMarker,
    update,
    notifyFirstPickup,
    dispose,
    get stats(): MoltenBeadsStats {
      return Object.freeze({
        beadCount: beads.length,
        gravelCount: gravel.length,
        minBeadSize,
        maxBeadSize,
        width: c2CraterMoltenBeadsPlan.width,
        depth: c2CraterMoltenBeadsPlan.depth,
        longAxis: c2CraterMoltenBeadsPlan.longAxis,
        nearReadDistance: c2CraterMoltenBeadsPlan.nearReadDistance,
        footprintDistance,
        beadsVisible: beadMesh.visible,
        night,
        emissiveIntensity: glassMaterial.emissiveIntensity,
        materialFamilies,
        drawCalls: 3,
        triangles: earthGeometry.index!.count / 3 + (beads.length + gravel.length) * 12,
        reservedSites: reserved,
      });
    },
  };
}

/** Explicit functional hooks for the mainline frame loop; the handle exposes the same hooks. */
export function updateC2CraterMoltenBeads(scene: MoltenBeadsScene, frame: MoltenBeadsFrame) {
  scene.update(frame);
}

export function disposeC2CraterMoltenBeads(scene: MoltenBeadsScene) {
  scene.dispose();
}
