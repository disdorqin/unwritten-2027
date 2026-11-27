import {
  BoxGeometry, DataTexture, FrontSide, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat, SRGBColorSpace,
  StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';

/**
 * C2-R03 -190 vault-approach narrative anchors, in the palace-shell local frame
 * (east, height, north; floor datum -2.4). The main colonnade, sealed gate face,
 * moonstone sconces and locked ring already exist in underground-palace-dressing;
 * this is a small additive layer for the two canon forecourt details that layer
 * does not own: the dog-stone guardian plinth and the two cold, extinguished
 * braziers flanking the vault approach.
 *
 * No world anchor, no gate authority, no guardian, no loot, no presence. The
 * dog-stone collectable itself stays with the shared zodiac-site authority;
 * this only builds the physical plinth it rests on.
 */

export type C2R30VaultFamily =
  | 'ancient-stone' | 'shadow-stone' | 'cold-ash' | 'old-gold' | 'moon-metal';
export type C2R30VaultRole = 'plinth' | 'emblem' | 'brazier' | 'ash' | 'step' | 'lintel';
export type C2R30VaultFeature = 'dog-plinth' | 'cold-brazier-west' | 'cold-brazier-east';

export type C2R30VaultPiece = Readonly<{
  id: string;
  feature: C2R30VaultFeature;
  role: C2R30VaultRole;
  family: C2R30VaultFamily;
  e: number; y: number; n: number;
  w: number; h: number; d: number;
  solid: boolean;
}>;

export const c2R30VaultPalette = Object.freeze({
  'ancient-stone': 0x77746b,
  'shadow-stone': 0x343940,
  'cold-ash': 0x505258,
  'old-gold': 0x8a7047,
  'moon-metal': 0x8fa1a6,
} as const satisfies Readonly<Record<C2R30VaultFamily, number>>);

export type C2R30VaultSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30VaultFixtureSite: C2R30VaultSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus190:vault-approach',
  east: 0, north: 0, height: 0, yaw: 0,
});
export const c2R30VaultFixtureDatum = Object.freeze({
  id: 'c2-r30/minus190/vault-approach-anchors',
  layer: -190 as const,
  coordinateFrame: 'palace-shell-local-east-height-north' as const,
  floorDatum: -2.4 as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  // Anchors from the existing shared authorities, NOT invented positions.
  dogStoneBase: Object.freeze({ east: -3.20, north: 112.30 }),
  gateNorth: 125.8,
});

/** Forecourt band: narrow, on the approach to the sealed gate; centre kept clear. */
export function c2R30VaultBoxAllowed(piece: C2R30VaultPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const foot = c2R30VaultFixtureDatum;
  if (piece.n - piece.d / 2 < 108 || piece.n + piece.d / 2 > 124) return false;
  if (Math.abs(piece.e) - piece.w / 2 > 11) return false;
  // y is relative to the -2.4 palace floor; keep props above the walking datum
  // and below the sconce band.
  if (piece.y < -1e-6 || piece.y + piece.h > 8) return false;
  // The processional centre (|e|<1.4) is never blocked by these props.
  if (piece.solid && Math.abs(piece.e) - piece.w / 2 < 1.4) return false;
  return true;
}

function pixelTexture(family: C2R30VaultFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30VaultPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (Math.imul(x + 3, 15731) ^ Math.imul(y + 7, 4817)) >>> 0;
    let color = base;
    if (family === 'ancient-stone' || family === 'shadow-stone') {
      const course = Math.floor(y / 4);
      const joint = y % 4 === 0 || (x + (course % 2) * 4) % 8 === 0;
      color = joint ? c2R30VaultPalette['shadow-stone'] :
        grain % 19 < 3 ? c2R30VaultPalette['cold-ash'] : base;
    } else if (family === 'old-gold') {
      color = grain % 9 === 0 ? c2R30VaultPalette['ancient-stone'] : base;
    } else if (family === 'cold-ash') {
      color = (x * 3 + y) % 11 < 2 ? c2R30VaultPalette['shadow-stone'] : base;
    } else {
      color = grain % 13 === 0 ? c2R30VaultPalette['ancient-stone'] : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-vault/${family}-5colour-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const familyOrder = Object.freeze(Object.keys(c2R30VaultPalette) as C2R30VaultFamily[]);
const roleOrder: readonly C2R30VaultRole[] = ['plinth', 'emblem', 'brazier', 'ash', 'step', 'lintel'];
const featureOrder: readonly C2R30VaultFeature[] = [
  'dog-plinth', 'cold-brazier-west', 'cold-brazier-east',
];

function counts<T extends string>(items: readonly T[], order: readonly T[]) {
  const result = Object.fromEntries(order.map(key => [key, 0])) as Record<T, number>;
  for (const item of items) result[item]++;
  return result;
}

/** Static, auditable plan. */
export function c2R30VaultPlan(): readonly C2R30VaultPiece[] {
  const parts: C2R30VaultPiece[] = [];
  function add(feature: C2R30VaultFeature, role: C2R30VaultRole, family: C2R30VaultFamily,
    e: number, y: number, n: number, w: number, h: number, d: number, solid = false) {
    const piece = Object.freeze({
      id: `${feature}/${role}/${family}/${parts.length}`,
      feature, role, family, e, y, n, w, h, d, solid,
    });
    if (!c2R30VaultBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 vault rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  // Dog-stone guardian plinth, centred exactly on the shared zodiac base.
  const dog = c2R30VaultFixtureDatum.dogStoneBase;
  for (let row = 0; row < 4; row++) {
    const scale = 1 - row * .12;
    add('dog-plinth', 'plinth', row % 2 ? 'ancient-stone' : 'shadow-stone',
      dog.east, row * .16, dog.north, 2.1 * scale, .16, 1.7 * scale, true);
  }
  add('dog-plinth', 'plinth', 'ancient-stone', dog.east, .7, dog.north, 1.3, .2, 1.05, true);
  // Half-moon ship emblem, carved into stone only: no letters, no new story.
  for (let i = 0; i < 11; i++) {
    const angle = Math.PI * i / 10;
    add('dog-plinth', 'emblem', 'moon-metal',
      dog.east + Math.cos(angle) * .42, .82, dog.north - .53 + Math.sin(angle) * .14,
      .09, .09, .05);
  }
  // Low step in front of the plinth, off the processional centre-line.
  for (let i = 0; i < 3; i++) {
    add('dog-plinth', 'step', 'ancient-stone', dog.east - .6 + i * .6, .05, dog.north - 1.3,
      .58, .1, .5);
  }

  // Two extinguished braziers flanking the approach, cold ash only. No light,
  // no flame, no emissive — the canon says the fire basins are already cold.
  for (const [feature, e] of [
    ['cold-brazier-west', -5.4],
    ['cold-brazier-east', 5.4],
  ] as const) {
    const n = 119.2;
    for (let row = 0; row < 6; row++) {
      const scale = 1 - row * .08;
      add(feature, 'brazier', row % 2 ? 'ancient-stone' : 'shadow-stone',
        e, row * .18, n, .9 * scale, .18, .9 * scale, true);
    }
    add(feature, 'brazier', 'ancient-stone', e, 1.08, n, 1.15, .16, 1.15, true);
    // Cold ash basin: a recessed dark plate, deliberately unlit.
    add(feature, 'ash', 'cold-ash', e, 1.16, n, .74, .04, .74);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      add(feature, 'ash', i % 2 ? 'cold-ash' : 'shadow-stone',
        e + Math.cos(angle) * .3, 1.19, n + Math.sin(angle) * .3, .12, .03, .12);
    }
    // A short lintel stub on the inner side hints at the former shrine canopy.
    add(feature, 'lintel', 'old-gold', e + (e < 0 ? .7 : -.7), 2.3, n, .9, .14, .18);
  }
  return Object.freeze(parts);
}

export type C2R30VaultStats = Readonly<{
  coordinateFrame: 'palace-shell-local-east-height-north';
  depth: -190;
  datum: typeof c2R30VaultFixtureDatum;
  site: C2R30VaultSite;
  siteCertified: boolean;
  pieceCount: number;
  solidCount: number;
  realLightCount: 0;
  paletteColorCount: 5;
  paletteCounts: Readonly<Record<C2R30VaultFamily, number>>;
  roleCounts: Readonly<Record<C2R30VaultRole, number>>;
  featureCounts: Readonly<Record<C2R30VaultFeature, number>>;
  drawBatchCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  shading: 'lambert';
  colliderCount: number;
  worldAnchor: false;
  gateAuthorityChanges: 0;
  lootCount: 0;
  presenceChanges: 0;
  disposed: boolean;
}>;

export type C2R30VaultCollider = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type C2R30VaultScene = Readonly<{
  group: Group;
  pieces: readonly C2R30VaultPiece[];
  colliders: readonly C2R30VaultCollider[];
  stats(): C2R30VaultStats;
  dispose(): void;
}>;

export function mountTownC2R30VaultApproach(options: Readonly<{
  parent?: Group;
  site?: C2R30VaultSite;
  supportsSite?: (site: C2R30VaultSite) => boolean;
}> = {}): C2R30VaultScene {
  const site = options.site ?? c2R30VaultFixtureSite;
  const certified = site.domainId !== c2R30VaultFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  const group = new Group();
  group.name = 'town-c2-r30-vault-approach';
  group.userData.coordinateFrame = 'palace-shell-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30VaultFixtureDatum;
  group.userData.visualOnly = true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30VaultPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-vault-unit-box';
  const matrix = new Matrix4(), pose = new Object3D();
  const meshes: InstancedMesh[] = [];
  const textures: DataTexture[] = [];
  const materials: MeshLambertMaterial[] = [];
  for (const family of familyOrder) {
    const items = pieces.filter(piece => piece.family === family);
    if (!items.length) continue;
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-vault/${family}`, map: texture, color: 0xffffff,
      flatShading: true, side: FrontSide,
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-vault/${family}`;
    items.forEach((piece, index) => {
      pose.position.set(piece.e, piece.y + piece.h / 2, -piece.n);
      pose.rotation.set(0, 0, 0);
      pose.scale.set(piece.w, piece.h, piece.d);
      pose.updateMatrix();
      mesh.setMatrixAt(index, pose.matrix);
    });
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.userData.visualOnly = true;
    group.add(mesh);
    meshes.push(mesh);
    textures.push(texture);
    materials.push(material);
  }

  const solids = pieces.filter(piece => piece.solid);
  const colliders = solids.map(piece => ({
    min: [piece.e - piece.w / 2, piece.y, -piece.n - piece.d / 2] as const,
    max: [piece.e + piece.w / 2, piece.y + piece.h, -piece.n + piece.d / 2] as const,
  }));
  createStaticFootIndex(colliders);

  let disposed = false;
  function stats(): C2R30VaultStats {
    return Object.freeze({
      coordinateFrame: 'palace-shell-local-east-height-north' as const,
      depth: -190 as const,
      datum: c2R30VaultFixtureDatum,
      site,
      siteCertified: certified,
      pieceCount: pieces.length,
      solidCount: solids.length,
      realLightCount: 0,
      paletteColorCount: familyOrder.length as 5,
      paletteCounts: Object.freeze(counts(pieces.map(piece => piece.family), familyOrder)),
      roleCounts: Object.freeze(counts(pieces.map(piece => piece.role), roleOrder)),
      featureCounts: Object.freeze(counts(pieces.map(piece => piece.feature), featureOrder)),
      drawBatchCount: disposed ? 0 : meshes.length,
      pixelTextureCount: disposed ? 0 : textures.length,
      textureSize: 16 as const,
      textureFilter: 'nearest' as const,
      shading: 'lambert' as const,
      colliderCount: colliders.length,
      worldAnchor: false as const,
      gateAuthorityChanges: 0,
      lootCount: 0,
      presenceChanges: 0,
      disposed,
    });
  }
  group.userData.stats = stats();
  options.parent?.add(group);
  return Object.freeze({
    group, pieces, colliders, stats,
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

export const buildTownC2R30VaultApproach = mountTownC2R30VaultApproach;
