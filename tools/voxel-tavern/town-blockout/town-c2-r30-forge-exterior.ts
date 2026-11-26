import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat,
  SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';
import { warriorSafetyPocket } from '../../../src/shared/town-c-warrior-safety-pocket.js';

export type C2R30ForgeExteriorFamily =
  | 'ancient-stone' | 'shadow-stone' | 'old-stone' | 'wet-stone'
  | 'timber' | 'dark-timber' | 'rust' | 'moon-metal' | 'warm-ember';
export type C2R30ForgeExteriorRole =
  | 'portal' | 'step' | 'anvil' | 'stock' | 'quench' | 'charcoal'
  | 'tool-rack' | 'paving' | 'rubble' | 'seam';
export type C2R30ForgeExteriorZone =
  | 'gate' | 'workyard' | 'quench' | 'tool-wall' | 'street';

export type C2R30ForgeExteriorPiece = Readonly<{
  id: string;
  zone: C2R30ForgeExteriorZone;
  role: C2R30ForgeExteriorRole;
  family: C2R30ForgeExteriorFamily;
  e: number;
  y: number;
  n: number;
  w: number;
  h: number;
  d: number;
  solid: boolean;
  emitter: boolean;
}>;

export type C2R30ForgeExteriorSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30ForgeExteriorFixtureSite: C2R30ForgeExteriorSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus165:warrior-city:forge-exterior',
  east: 0, north: 0, height: 0, yaw: 0,
});

export const c2R30ForgeExteriorFixtureDatum = Object.freeze({
  id: 'c2-r30/minus165/warrior-city/forge-exterior',
  layer: -165 as const,
  coordinateFrame: 'warrior-city-local-east-height-north' as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  footprint: Object.freeze({ minE: 139.5, maxE: 144.5, minN: 1.5, maxN: 4.65 }),
  approach: warriorSafetyPocket.rectangles.find(rect => rect.id === 'forge-approach'),
  forge: warriorSafetyPocket.rectangles.find(rect => rect.id === 'forge'),
  path: Object.freeze({ minE: 141.1, maxE: 142.9, minN: 1.8, maxN: 4.9 }),
});

export const c2R30ForgeExteriorPalette = Object.freeze({
  'ancient-stone': 0x77746b,
  'shadow-stone': 0x343940,
  'old-stone': 0x8a8378,
  'wet-stone': 0x505258,
  timber: 0x70543e,
  'dark-timber': 0x4a3829,
  rust: 0x80563d,
  'moon-metal': 0x8fa1a6,
  'warm-ember': 0xe5a45d,
} as const satisfies Readonly<Record<C2R30ForgeExteriorFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30ForgeExteriorPalette) as C2R30ForgeExteriorFamily[]);
const roleOrder: readonly C2R30ForgeExteriorRole[] = [
  'portal', 'step', 'anvil', 'stock', 'quench', 'charcoal', 'tool-rack', 'paving', 'rubble', 'seam',
];
const zoneOrder: readonly C2R30ForgeExteriorZone[] = [
  'gate', 'workyard', 'quench', 'tool-wall', 'street',
];

function overlaps(e: number, w: number, n: number, d: number,
  box: Readonly<{ minE: number; maxE: number; minN: number; maxN: number }>) {
  return e + w / 2 > box.minE && e - w / 2 < box.maxE &&
    n + d / 2 > box.minN && n - d / 2 < box.maxN;
}

export function c2R30ForgeExteriorBoxAllowed(piece: C2R30ForgeExteriorPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
      piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const foot = c2R30ForgeExteriorFixtureDatum.footprint;
  if (piece.e - piece.w / 2 < foot.minE || piece.e + piece.w / 2 > foot.maxE ||
      piece.n - piece.d / 2 < foot.minN || piece.n + piece.d / 2 > foot.maxN) return false;
  if (piece.y < 0 || piece.y + piece.h > 4.5) return false;
  if (piece.solid && piece.y < 2.2 &&
      overlaps(piece.e, piece.w, piece.n, piece.d, c2R30ForgeExteriorFixtureDatum.path)) return false;
  if (piece.role === 'paving' || piece.role === 'seam' || piece.role === 'step') {
    if (piece.solid || piece.y + piece.h > .16) return false;
  }
  if (piece.role === 'charcoal' && piece.h > .24) return false;
  return true;
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30ForgeExteriorFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30ForgeExteriorPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (Math.imul(x + 13, 15731) ^ Math.imul(y + 29, 4817)) >>> 0;
    let color = base;
    if (family === 'ancient-stone' || family === 'old-stone' || family === 'wet-stone') {
      const course = Math.floor(y / 4), shiftedX = x + (course % 2) * 3;
      const joint = y % 4 === 0 || shiftedX % 9 === 0;
      const facet = (Math.floor(x / 4) * 3 + Math.floor(y / 3)) % 5;
      color = joint ? c2R30ForgeExteriorPalette['shadow-stone'] :
        facet === 0 ? c2R30ForgeExteriorPalette['wet-stone'] :
          grain % 23 < 3 ? c2R30ForgeExteriorPalette['old-stone'] : base;
    } else if (family === 'timber' || family === 'dark-timber') {
      const line = (x + Math.floor(y / 4) * 3) % 7;
      color = line === 0 ? c2R30ForgeExteriorPalette['shadow-stone'] :
        line === 1 ? c2R30ForgeExteriorPalette.rust :
          grain % 29 < 4 ? c2R30ForgeExteriorPalette.timber : base;
    } else if (family === 'rust') {
      color = y % 5 === 4 ? c2R30ForgeExteriorPalette['shadow-stone'] :
        grain % 17 < 4 ? c2R30ForgeExteriorPalette['dark-timber'] : base;
    } else if (family === 'moon-metal') {
      color = grain % 11 === 0 ? c2R30ForgeExteriorPalette['shadow-stone'] :
        grain % 5 === 0 ? c2R30ForgeExteriorPalette['old-stone'] : base;
    } else if (family === 'warm-ember') {
      color = grain % 7 === 0 ? c2R30ForgeExteriorPalette.rust : base;
    } else {
      color = grain % 13 < 2 ? c2R30ForgeExteriorPalette['old-stone'] : base;
    }
    pixels.set([color >>> 16, color >>> 8 & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-forge-exterior/${family}-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function counts<T extends string>(items: readonly T[], order: readonly T[]) {
  const result = Object.fromEntries(order.map(key => [key, 0])) as Record<T, number>;
  for (const item of items) result[item]++;
  return result;
}

export function c2R30ForgeExteriorPlan(): readonly C2R30ForgeExteriorPiece[] {
  const parts: C2R30ForgeExteriorPiece[] = [];
  function add(zone: C2R30ForgeExteriorZone, role: C2R30ForgeExteriorRole,
    family: C2R30ForgeExteriorFamily, e: number, y: number, n: number,
    w: number, h: number, d: number, solid = false, emitter = false) {
    const piece = Object.freeze({
      id: `${zone}/${role}/${family}/${parts.length}`,
      zone, role, family, e, y, n, w, h, d, solid, emitter,
    });
    if (!c2R30ForgeExteriorBoxAllowed(piece)) {
      throw new RangeError(`C2 R09 forge exterior rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  for (const side of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      add('gate', 'portal', row % 3 === 0 ? 'old-stone' : 'ancient-stone',
        142 + side * 2.05, row * .55, 4.0, .76, .52, .88, true);
    }
    add('gate', 'portal', 'shadow-stone', 142 + side * 2.05, 0, 4.0, .88, .22, 1.02, true);
    add('gate', 'portal', 'moon-metal', 142 + side * 2.05, 3.42, 4.0, .82, .12, .94);
  }
  for (let col = 0; col < 5; col++) {
    add('gate', 'portal', col % 2 ? 'ancient-stone' : 'old-stone',
      140.32 + col * .84, 3.86, 4.0, .82, .5, .9, true);
  }
  add('gate', 'portal', 'shadow-stone', 142, 3.62, 3.64, 4.7, .12, .12);

  for (let index = 0; index < 3; index++) {
    add('gate', 'step', index === 1 ? 'wet-stone' : 'old-stone',
      142, .018 + index * .025, 3.55 + index * .32, 2.7, .05, .3);
  }
  for (let col = 0; col < 5; col++) {
    add('gate', 'paving', col % 2 ? 'ancient-stone' : 'old-stone',
      141.18 + col * .41, .012, 4.22, .39, .035, .48);
  }

  const ae = 140.35, an = 2.62;
  add('workyard', 'anvil', 'dark-timber', ae - .28, 0, an - .24, .16, .76, .16, true);
  add('workyard', 'anvil', 'dark-timber', ae + .28, 0, an - .24, .16, .76, .16, true);
  add('workyard', 'anvil', 'dark-timber', ae - .28, 0, an + .24, .16, .76, .16, true);
  add('workyard', 'anvil', 'dark-timber', ae + .28, 0, an + .24, .16, .76, .16, true);
  add('workyard', 'anvil', 'timber', ae, .72, an, .86, .16, .72, true);
  add('workyard', 'anvil', 'moon-metal', ae, .88, an, .58, .2, .42, true);
  add('workyard', 'anvil', 'moon-metal', ae + .34, .94, an, .34, .14, .2, true);
  add('workyard', 'anvil', 'shadow-stone', ae, .9, an, .34, .08, .28);
  for (let index = 0; index < 3; index++) {
    add('workyard', 'stock', index === 1 ? 'rust' : 'moon-metal',
      ae - .2 + index * .2, .91, an + .48, .1, .1, .62 - index * .08);
  }
  add('workyard', 'stock', 'dark-timber', ae, .05, an + .48, .74, .1, .16, true);
  add('workyard', 'stock', 'dark-timber', ae - .3, 0, an + .48, .1, .55, .1, true);
  add('workyard', 'stock', 'dark-timber', ae + .3, 0, an + .48, .1, .55, .1, true);

  const qe = 143.52, qn = 3.02;
  add('quench', 'quench', 'ancient-stone', qe, 0, qn, 1.12, .42, 1.5, true);
  add('quench', 'quench', 'wet-stone', qe, .42, qn, .88, .035, 1.24);
  for (const side of [-1, 1]) {
    add('quench', 'quench', 'old-stone', qe + side * .5, .12, qn, .14, .48, 1.56, true);
    add('quench', 'quench', 'old-stone', qe, .12, qn + side * .69, 1.12, .48, .14, true);
  }
  add('quench', 'quench', 'rust', qe + .57, .28, qn, .06, .12, 1.2);

  for (let index = 0; index < 9; index++) {
    const e = 143.25 + (index % 3) * .26;
    const n = 1.98 + Math.floor(index / 3) * .22;
    const h = .12 + noise(index, 41) * .09;
    add('quench', 'charcoal', index % 4 === 0 ? 'warm-ember' : 'shadow-stone',
      e, .04 + (index % 2) * .05, n, .24, h, .22, false, index % 4 === 0);
  }

  add('tool-wall', 'tool-rack', 'dark-timber', 144.18, 1.28, 3.85, .16, .18, 1.28, true);
  for (let index = 0; index < 3; index++) {
    const n = 3.62 + index * .36;
    add('tool-wall', 'tool-rack', 'rust', 144.06, 1.83, n, .055, .48, .055);
    add('tool-wall', 'tool-rack', index === 1 ? 'moon-metal' : 'dark-timber',
      144.02, 1.52, n, index === 1 ? .22 : .16, .28, .12);
  }
  add('tool-wall', 'tool-rack', 'moon-metal', 143.98, 1.78, 4.0, .32, .07, .07);

  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
    add('street', 'paving', (col + row) % 3 === 0 ? 'wet-stone' : 'old-stone',
      140.12 + col * 1.02, .008, 2.04 + row * .72, .96, .03, .66);
  }
  for (const side of [-1, 1]) {
    add('street', 'seam', 'shadow-stone', 142 + side * 1.75, .01, 3.2, .12, .035, 2.5);
  }
  for (let index = 0; index < 7; index++) {
    add('street', 'rubble', index % 2 ? 'ancient-stone' : 'wet-stone',
      139.72 + noise(index, 73) * .55, .025, 1.9 + noise(index, 97) * 2.3,
      .12 + noise(index, 11) * .14, .08 + noise(index, 17) * .08,
      .12 + noise(index, 23) * .16);
  }
  return Object.freeze(parts);
}

export type C2R30ForgeExteriorCollider = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type C2R30ForgeExteriorStats = Readonly<{
  coordinateFrame: 'warrior-city-local-east-height-north';
  depth: -165;
  datum: typeof c2R30ForgeExteriorFixtureDatum;
  site: C2R30ForgeExteriorSite;
  siteCertified: boolean;
  pieceCount: number;
  solidCount: number;
  emitterCount: number;
  paletteColorCount: 9;
  paletteCounts: Readonly<Record<C2R30ForgeExteriorFamily, number>>;
  roleCounts: Readonly<Record<C2R30ForgeExteriorRole, number>>;
  zoneCounts: Readonly<Record<C2R30ForgeExteriorZone, number>>;
  drawBatchCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  shading: 'lambert';
  realLightCount: 0;
  colliderCount: number;
  worldAnchor: false;
  registrationChanges: 0;
  interactionSockets: 0;
  lootCount: 0;
  presenceChanges: 0;
  disposed: boolean;
}>;

export type C2R30ForgeExteriorScene = Readonly<{
  group: Group;
  pieces: readonly C2R30ForgeExteriorPiece[];
  colliders: readonly C2R30ForgeExteriorCollider[];
  blocks(e: number, n: number, y?: number, r?: number): boolean;
  canStand(e: number, n: number, y?: number, r?: number): boolean;
  stats(): C2R30ForgeExteriorStats;
  dispose(): void;
}>;

export function mountTownC2R30ForgeExterior(options: Readonly<{
  parent?: Group;
  site?: C2R30ForgeExteriorSite;
  supportsSite?: (site: C2R30ForgeExteriorSite) => boolean;
}> = {}): C2R30ForgeExteriorScene {
  const group = new Group();
  group.name = 'town-c2-r30-forge-exterior';
  group.userData.coordinateFrame = 'warrior-city-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30ForgeExteriorFixtureDatum;
  group.userData.visualOnly = true;

  const site = options.site ?? c2R30ForgeExteriorFixtureSite;
  const certified = site.domainId !== c2R30ForgeExteriorFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30ForgeExteriorPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-forge-exterior-unit-box';
  const matrices = new Map<C2R30ForgeExteriorFamily, Matrix4[]>();
  const matrix = new Matrix4(), pose = new Object3D();
  for (const family of familyOrder) matrices.set(family, []);
  for (const piece of pieces) {
    pose.position.set(piece.e, piece.y + piece.h / 2, -piece.n);
    pose.rotation.set(0, 0, 0);
    pose.scale.set(piece.w, piece.h, piece.d);
    pose.updateMatrix();
    matrices.get(piece.family)!.push(matrix.clone().copy(pose.matrix));
  }

  const meshes: InstancedMesh[] = [];
  const textures: DataTexture[] = [];
  const materials: MeshLambertMaterial[] = [];
  for (const family of familyOrder) {
    const items = matrices.get(family)!;
    if (!items.length) continue;
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-forge-exterior/${family}`,
      map: texture,
      color: 0xffffff,
      flatShading: true,
      ...(family === 'warm-ember' ? {
        emissive: new Color(c2R30ForgeExteriorPalette[family]), emissiveIntensity: .35,
      } : {}),
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-forge-exterior/${family}`;
    mesh.userData.visualOnly = true;
    items.forEach((item, index) => mesh.setMatrixAt(index, item));
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    textures.push(texture);
    materials.push(material);
  }

  const solidPieces = pieces.filter(piece => piece.solid);
  const colliders = solidPieces.map(piece => ({
    min: [piece.e - piece.w / 2, piece.y, -piece.n - piece.d / 2] as const,
    max: [piece.e + piece.w / 2, piece.y + piece.h, -piece.n + piece.d / 2] as const,
  }));
  const footIndex = createStaticFootIndex(colliders);
  function blocks(e: number, n: number, y = 0, r = .27) {
    return ![e, n, y, r].every(Number.isFinite) || r <= 0 || footIndex.blocks(e, n, y, r);
  }
  function canStand(e: number, n: number, y = 0, r = .27) {
    const foot = c2R30ForgeExteriorFixtureDatum.footprint;
    if (![e, n, y, r].every(Number.isFinite) || e - r < foot.minE || e + r > foot.maxE ||
        n - r < foot.minN || n + r > foot.maxN) return false;
    return !blocks(e, n, y, r);
  }

  let disposed = false;
  function stats(): C2R30ForgeExteriorStats {
    return Object.freeze({
      coordinateFrame: 'warrior-city-local-east-height-north' as const,
      depth: -165 as const,
      datum: c2R30ForgeExteriorFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: certified,
      pieceCount: pieces.length,
      solidCount: solidPieces.length,
      emitterCount: pieces.filter(piece => piece.emitter).length,
      paletteColorCount: familyOrder.length as 9,
      paletteCounts: Object.freeze(counts(pieces.map(piece => piece.family), familyOrder)),
      roleCounts: Object.freeze(counts(pieces.map(piece => piece.role), roleOrder)),
      zoneCounts: Object.freeze(counts(pieces.map(piece => piece.zone), zoneOrder)),
      drawBatchCount: disposed ? 0 : meshes.length,
      pixelTextureCount: disposed ? 0 : textures.length,
      textureSize: 16 as const,
      textureFilter: 'nearest' as const,
      shading: 'lambert' as const,
      realLightCount: 0 as const,
      colliderCount: colliders.length,
      worldAnchor: false as const,
      registrationChanges: 0 as const,
      interactionSockets: 0 as const,
      lootCount: 0 as const,
      presenceChanges: 0 as const,
      disposed,
    });
  }
  group.userData.stats = stats();

  options.parent?.add(group);
  return Object.freeze({
    group, pieces, colliders, blocks, canStand, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      geometry.dispose();
      group.clear();
      group.userData.stats = stats();
    },
  });
}

export const buildTownC2R30ForgeExterior = mountTownC2R30ForgeExterior;
