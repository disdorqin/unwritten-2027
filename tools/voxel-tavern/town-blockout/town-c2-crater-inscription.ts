import {
  BoxGeometry, BufferGeometry, DataTexture, Group, Mesh, MeshLambertMaterial,
  NearestFilter, Object3D, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box } from './landmark-kit';
import { SHIP_EMBLEM_CELLS } from './ship-emblem';
import type { mountWestCraterRoad } from './town-za22-crater-road';

/** C2-04 / batch 95: scene and host data only; window B owns the rubbing rule. */
export const c2CraterInscriptionSpec = Object.freeze({
  id: 'c2-crater-blackstone-inscription',
  hostId: 'c2-crater-blackstone-rubbing',
  bearingDeg: 90,
  frontBearingDeg: 270,
  dimensions: Object.freeze([2.4, 1.6, .5] as const),
  eastWest: 1.6,
  northSouth: 2.4,
  height: .5,
  tableSouthOffset: 2,
  tableGap: .4,
  tableWidth: 1.25,
  tableDepth: .8,
  tableHeight: .8,
  emblemScale: .36,
  hostRange: 2.4,
  eastSampleHalfSectorDeg: 15,
  blackstoneClearance: .18,
} as const);

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt' | 'ejecta'>;
type Point = Readonly<{ east: number; north: number; height: number }>;
type Size = Readonly<{ eastWest: number; northSouth: number }>;

export type CraterInscriptionSurvey = Readonly<{
  id: string;
  bearingDeg: number;
  east: number;
  north: number;
  height: number;
  sampledRadius: number;
  sampledBlackstoneCount: number;
  source: 'za36-blackstone-geometry';
}>;

export type CraterInscriptionLayout = Readonly<{
  stone: Point & Size & Readonly<{ frontNormal: readonly [number, number, number] }>;
  table: Point & Size;
  useFoot: Point;
  blankStele: Point & Size;
  paper: Point & Size;
  ink: Point & Size;}>;

/** Deliberately contains no hold timer, inventory, collection or atlas authority. */
export type CraterInscriptionRubbingHostMarker = Readonly<{
  id: string;
  kind: 'rubbing';
  targetId: string;
  east: number;
  north: number;
  height: number;
  range: number;
}>;

export type CraterInscriptionStats = Readonly<{
  dimensions: readonly [number, number, number];
  bearingDeg: number;
  frontBearingDeg: number;
  sampledRadius: number;
  sampledBlackstoneCount: number;
  tableGap: number;
  emblemCellCount: number;
  emblemMeshCount: number;
  materialFamilies: readonly string[];
  drawCalls: number;
  triangles: number;
  hasText: false;
}>;

export type CraterInscriptionScene = Readonly<{
  group: Group;
  survey: CraterInscriptionSurvey;
  layout: CraterInscriptionLayout;
  colliders: readonly Box[];
  rubbingHostMarker: CraterInscriptionRubbingHostMarker;
  stats: CraterInscriptionStats;
  dispose(): void;
}>;

const eastBearing = Math.PI / 2;
const radians = (degrees: number) => degrees * Math.PI / 180;
const angleDistance = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

function rectangleClearance(east: number, north: number,
  piece: Readonly<{ east: number; north: number; footprint: number }>) {
  const nearestEast = clamp(piece.east, east - c2CraterInscriptionSpec.eastWest / 2,
    east + c2CraterInscriptionSpec.eastWest / 2);
  const nearestNorth = clamp(piece.north, north - c2CraterInscriptionSpec.northSouth / 2,
    north + c2CraterInscriptionSpec.northSouth / 2);
  return Math.hypot(piece.east - nearestEast, piece.north - nearestNorth) - piece.footprint;
}

/**
 * Samples the real ZA-36 blackstone instances, not a decorative nominal ring.
 * The rimward (upper) radius of the sector straddling due east is projected
 * onto the exact 90-degree ray, then moved inward only if an old stone would
 * intersect the new slab. Thus E/N remain geometry-derived and N is the crater
 * centre's north coordinate whenever a clear slot exists.
 */
export function surveyC2CraterInscription(ground: Ground): CraterInscriptionSurvey {
  const { anchor, heightAt, ejecta } = ground;
  if (![anchor.east, anchor.north, anchor.rimHeight, anchor.yaw].every(Number.isFinite)) {
    throw new RangeError('C2-04 requires the finite live crater anchor.');
  }
  const blackstones = ejecta.placements.filter(piece => piece.kind === 'blackstone' &&
    [piece.east, piece.north, piece.footprint].every(Number.isFinite) && piece.footprint > 0);
  const sector = blackstones.flatMap(piece => {
    const dx = piece.east - anchor.east, dn = piece.north - anchor.north;
    const bearing = Math.atan2(dx, dn);
    return angleDistance(bearing, eastBearing) <= radians(c2CraterInscriptionSpec.eastSampleHalfSectorDeg)
      ? [{ piece, radius: Math.hypot(dx, dn) }]
      : [];
  });
  if (!sector.length) throw new RangeError('C2-04 found no blackstone geometry in the due-east sector.');
  const upperRadius = Math.max(...sector.map(item => item.radius));
  const lowerRadius = Math.min(...sector.map(item => item.radius)) - .5;
  for (let radius = upperRadius; radius >= lowerRadius - 1e-8; radius -= .25) {
    const east = anchor.east + radius * Math.sin(eastBearing);
    const north = anchor.north + radius * Math.cos(eastBearing);
    const height = heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) continue;
    if (blackstones.some(piece => rectangleClearance(east, north, piece) <
      c2CraterInscriptionSpec.blackstoneClearance)) continue;
    return Object.freeze({
      id: c2CraterInscriptionSpec.id,
      bearingDeg: c2CraterInscriptionSpec.bearingDeg,
      east, north, height,
      sampledRadius: radius,
      sampledBlackstoneCount: sector.length,
      source: 'za36-blackstone-geometry',
    });
  }
  throw new RangeError('C2-04 could not find a clear exact-east slot on the sampled blackstone upper edge.');
}

function pixelTexture(colors: readonly [number, number, number], seed: number, kind: 'stone' | 'wood' | 'paper' | 'ink') {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  const bends = [0, 0, 1, 1, 0, -1, -1, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const blockX = Math.floor(x / 4), blockY = Math.floor(y / 4);
    const layer = Math.floor((blockY + bends[(blockX + seed) % bends.length]! + 8) / 2);
    const fleck = (Math.imul(x + 11, 733) ^ Math.imul(y + 13, 199) ^ seed) & 15;
    let tone = kind === 'stone'
      ? colors[[0, 0, 1, 1, 0, 2, 2, 1][(layer + seed) % 8]!]!
      : kind === 'wood'
        ? (x + Math.floor(y / 3) * 3 + seed) % 8 === 0 ? colors[1]! : colors[fleck < 3 ? 2 : 0]!
        : colors[fleck < 2 ? 1 : fleck > 13 ? 2 : 0]!;
    if (kind === 'stone' && blockX === (seed * 3 + 2) % 4 && blockY === (seed + 5) % 4) tone = colors[2]!;
    pixels.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function box(width: number, height: number, depth: number, x: number, y: number, z: number) {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}

/** Builds without mutating the host. Mainline mounting appends only to za22's existing colliders channel. */
export function buildTownC2CraterInscription(ground: Ground): CraterInscriptionScene {
  const survey = surveyC2CraterInscription(ground);
  const spec = c2CraterInscriptionSpec;
  const group = new Group();
  group.name = 'town-c2-crater-inscription';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const textures = new Set<DataTexture>();

  const makeMaterial = (colors: readonly [number, number, number], seed: number,
    kind: 'stone' | 'wood' | 'paper' | 'ink') => {
    const map = pixelTexture(colors, seed, kind);
    const material = new MeshLambertMaterial({ map, flatShading: true });
    textures.add(map);
    materials.add(material);
    return material;
  };
  const stoneMaterial = makeMaterial([0x55534c, 0x747064, 0x343630], 41, 'stone');
  const woodMaterial = makeMaterial([0x72543e, 0x3e3028, 0x997352], 29, 'wood');
  const paperMaterial = makeMaterial([0xd8d0b8, 0xb8ad92, 0xeee7d2], 53, 'paper');
  const inkMaterial = makeMaterial([0x252a27, 0x111714, 0x454b43], 67, 'ink');
  const engravingMaterial = new MeshLambertMaterial({ color: 0x24251f });
  materials.add(engravingMaterial);

  const addMerged = (name: string, parts: BufferGeometry[], material: MeshLambertMaterial, parent: Object3D) => {
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error(`C2-04 cannot merge ${name}`);
    for (const part of parts) part.dispose();
    geometry.computeBoundingSphere();
    geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  // 2.4 m is the west-face width (north-south); 1.6 m runs into the slab from that face.
  const stoneGeometry = new BoxGeometry(spec.eastWest, spec.height, spec.northSouth);
  geometries.add(stoneGeometry);
  const stone = new Mesh(stoneGeometry, stoneMaterial);
  stone.name = 'town-c2-crater-inscription/stone';
  stone.position.set(survey.east, survey.height + spec.height / 2, -survey.north);
  group.add(stone);

  // Reuse the canonical crescent + descending-arc cells as ONE incised mesh.
  // Its first arc cell is the crescent tip cell; no second arc or gold plate is added.
  const markParts = SHIP_EMBLEM_CELLS.map(cell => box(
    .008, .104 * spec.emblemScale, .104 * spec.emblemScale,
    -spec.eastWest / 2 - .002, cell.y * spec.emblemScale,
    cell.x * spec.emblemScale,
  ));
  const mark = addMerged('town-c2-crater-inscription/crescent-descending-arc',
    markParts, engravingMaterial, stone);
  mark.userData.cellCount = SHIP_EMBLEM_CELLS.length;
  mark.userData.parts = ['crescent', 'arc'];

  const tableNorth = survey.north - spec.tableSouthOffset;
  const tableHeight = ground.heightAt(survey.east, tableNorth);
  if (tableHeight === undefined || !Number.isFinite(tableHeight)) {
    throw new RangeError('C2-04 lacks host ground immediately south of the inscription.');
  }
  const table = new Group();
  table.name = 'town-c2-crater-inscription/rubbing-table';
  table.position.set(survey.east, tableHeight, -tableNorth);
  group.add(table);
  addMerged('town-c2-crater-inscription/table-stone', [
    box(spec.tableWidth, .12, spec.tableDepth, 0, .74, 0),
  ], stoneMaterial, table);
  addMerged('town-c2-crater-inscription/table-timber', [
    box(.14, .68, .14, -.48, .34, -.27),
    box(.14, .68, .14, .48, .34, -.27),
    box(.14, .68, .14, -.48, .34, .27),
    box(.14, .68, .14, .48, .34, .27),
    box(1.02, .09, .09, 0, .22, -.27),
    box(1.02, .09, .09, 0, .22, .27),
  ], woodMaterial, table);

  const blankStele = new Mesh(new BoxGeometry(.12, .62, .42), stoneMaterial);
  blankStele.name = 'town-c2-crater-inscription/blank-stone-slab';
  blankStele.position.set(.42, spec.tableHeight + .31, 0);
  geometries.add(blankStele.geometry);
  table.add(blankStele);

  addMerged('town-c2-crater-inscription/paper', [
    box(.42, .012, .34, -.30, .812, .04),
    box(.42, .012, .34, -.295, .824, .035),
    box(.42, .012, .34, -.30, .836, .03),
  ], paperMaterial, table);
  addMerged('town-c2-crater-inscription/inkstone-and-stick', [
    box(.18, .05, .14, .20, .825, -.18),
    box(.16, .035, .035, .20, .867, -.18),
  ], inkMaterial, table);

  const useFootHeight = ground.heightAt(survey.east - 1.55, survey.north - 1.75);
  if (useFootHeight === undefined || !Number.isFinite(useFootHeight)) {
    throw new RangeError('C2-04 lacks a reachable rubbing host foot point.');
  }
  const layout: CraterInscriptionLayout = Object.freeze({
    stone: Object.freeze({
      east: survey.east, north: survey.north, height: survey.height,
      eastWest: spec.eastWest, northSouth: spec.northSouth,
      frontNormal: Object.freeze([-1, 0, 0] as const),
    }),
    table: Object.freeze({
      east: survey.east, north: tableNorth, height: tableHeight,
      eastWest: spec.tableWidth, northSouth: spec.tableDepth,
    }),
    useFoot: Object.freeze({ east: survey.east - 1.55, north: survey.north - 1.75, height: useFootHeight }),
    blankStele: Object.freeze({
      east: survey.east + .42, north: tableNorth, height: tableHeight + spec.tableHeight,
      eastWest: .12, northSouth: .42,
    }),
    paper: Object.freeze({
      east: survey.east - .30, north: tableNorth + .035, height: tableHeight + .824,
      eastWest: .42, northSouth: .34,
    }),
    ink: Object.freeze({
      east: survey.east + .20, north: tableNorth - .18, height: tableHeight + .825,
      eastWest: .18, northSouth: .14,
    }),
  });
  const rubbingHostMarker: CraterInscriptionRubbingHostMarker = Object.freeze({
    id: spec.hostId,
    kind: 'rubbing',
    targetId: spec.id,
    east: layout.useFoot.east,
    north: layout.useFoot.north,
    height: layout.useFoot.height,
    range: spec.hostRange,
  });
  const hostMarker = new Object3D();
  hostMarker.name = 'town-c2-crater-inscription/rubbing-host-marker';
  hostMarker.position.set(layout.useFoot.east, layout.useFoot.height, -layout.useFoot.north);
  hostMarker.visible = false;
  group.add(hostMarker);
  group.userData.rubbingHostMarker = rubbingHostMarker;

  const collider: Box = {
    min: [survey.east - spec.eastWest / 2, survey.height, -survey.north - spec.northSouth / 2],
    max: [survey.east + spec.eastWest / 2, survey.height + spec.height, -survey.north + spec.northSouth / 2],
  };
  const colliders = Object.freeze([collider]);
  let disposed = false;
  const stats: CraterInscriptionStats = Object.freeze({
    dimensions: spec.dimensions,
    bearingDeg: spec.bearingDeg,
    frontBearingDeg: spec.frontBearingDeg,
    sampledRadius: survey.sampledRadius,
    sampledBlackstoneCount: survey.sampledBlackstoneCount,
    tableGap: spec.tableSouthOffset - spec.northSouth / 2 - spec.tableDepth / 2,
    emblemCellCount: SHIP_EMBLEM_CELLS.length,
    emblemMeshCount: 1,
    materialFamilies: Object.freeze(['stone', 'timber', 'paper', 'ink', 'engraving']),
    drawCalls: 7,
    triangles: [...geometries].reduce((sum, geometry) => sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3, 0),
    hasText: false,
  });
  return Object.freeze({
    group, survey, layout, colliders, rubbingHostMarker, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  });
}

/** One-call mainline adapter: append the slab box to za22's existing channel, never a parallel channel. */
export function mountC2CraterInscription(owner: Group, ground: Ground): CraterInscriptionScene {
  if (owner.getObjectByName('town-c2-crater-inscription')) {
    throw new RangeError('C2-04 inscription is already mounted; duplicate old/new carved stones are forbidden.');
  }
  if (owner.userData.colliders !== undefined && !Array.isArray(owner.userData.colliders)) {
    throw new TypeError('C2-04 requires the existing za22 colliders array.');
  }
  const scene = buildTownC2CraterInscription(ground);
  const channel = owner.userData.colliders ??= [];
  owner.add(scene.group);
  channel.push(...scene.colliders);
  let disposed = false;
  return Object.freeze({
    ...scene,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const collider of scene.colliders) {
        const index = channel.indexOf(collider);
        if (index >= 0) channel.splice(index, 1);
      }
      scene.dispose();
    },
  });
}
