import {
  BoxGeometry, DataTexture, FrontSide, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat, SRGBColorSpace,
  StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';

/**
 * C2-R02 domestic narrative dressing for the -165 warrior city. Three of the
 * four accessible stone homes each keep one frozen household trace called for
 * by the city canon: (1) a meal table with a single pair of chopsticks left,
 * (2) a child's shoe by the hearth, (3) an unfinished bolt on a frame loom.
 *
 * Standalone local-ENY prefab. It adds no world anchor, gameplay flag, loot or
 * presence; it sits inside already-authored accessible homes and only layers
 * small, non-blocking storytelling props on their interior floors.
 */

export type C2R30DomesticFamily =
  | 'old-stone' | 'timber' | 'dark-timber' | 'cloth' | 'rust' | 'clay' | 'shadow';
export type C2R30DomesticHome = 'meal' | 'child-shoe' | 'unfinished-loom';
export type C2R30DomesticRole =
  | 'table' | 'dish' | 'chopstick' | 'shoe' | 'loom' | 'cloth' | 'seat' | 'hearth';

export type C2R30DomesticPiece = Readonly<{
  id: string;
  home: C2R30DomesticHome;
  role: C2R30DomesticRole;
  family: C2R30DomesticFamily;
  e: number; y: number; n: number;
  w: number; h: number; d: number;
  solid: boolean;
}>;

export const c2R30DomesticPalette = Object.freeze({
  'old-stone': 0x77746b,
  timber: 0x70543e,
  'dark-timber': 0x4a3829,
  cloth: 0x8a8172,
  rust: 0x80563d,
  clay: 0x9a7350,
  shadow: 0x242a30,
} as const satisfies Readonly<Record<C2R30DomesticFamily, number>>);

export type C2R30DomesticSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

/** Host-certified site; the fixture stays local and hidden by default. */
export const c2R30DomesticFixtureSite: C2R30DomesticSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus165:warrior-city:domestic',
  east: 0, north: 0, height: 0, yaw: 0,
});
export const c2R30DomesticFixtureDatum = Object.freeze({
  id: 'c2-r30/minus165/warrior-city/domestic-traces',
  layer: -165 as const,
  coordinateFrame: 'warrior-city-local-east-height-north' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
});

/** Interior boxes of the three target homes, away from their front doors. */
export const c2R30DomesticRooms = Object.freeze({
  meal: Object.freeze({ id: 'u10/stone-home-02', e: 37.75, side: 1 as const,
    minE: 34.2, maxE: 41.3, minN: 9.0, maxN: 16.2 }),
  'child-shoe': Object.freeze({ id: 'u10/stone-home-05', e: 64, side: 1 as const,
    minE: 60.5, maxE: 67.5, minN: 9.0, maxN: 16.2 }),
  'unfinished-loom': Object.freeze({ id: 'u10/stone-home-08', e: 37.75, side: -1 as const,
    minE: 34.2, maxE: 41.3, minN: -16.2, maxN: -9.0 }),
});

export function c2R30DomesticBoxAllowed(piece: C2R30DomesticPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const room = c2R30DomesticRooms[piece.home];
  const epsilon = 1e-6;
  if (piece.e - piece.w / 2 < room.minE - epsilon ||
    piece.e + piece.w / 2 > room.maxE + epsilon ||
    piece.n - piece.d / 2 < room.minN - epsilon ||
    piece.n + piece.d / 2 > room.maxN + epsilon) return false;
  if (piece.y < -epsilon || piece.y + piece.h > 3.3) return false;
  // Props stay low; only a small table is solid and it sits deep in the room,
  // never across the entrance apron (|n| <= 9).
  if (piece.solid && Math.abs(piece.n) < 10.5) return false;
  return true;
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30DomesticFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30DomesticPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (Math.imul(x + 9, 15731) ^ Math.imul(y + 5, 4817)) >>> 0;
    let color = base;
    if (family === 'cloth') {
      const weave = (x + y * 2) % 6;
      color = weave === 0 ? c2R30DomesticPalette.shadow :
        weave === 1 ? c2R30DomesticPalette.timber :
          grain % 23 < 4 ? c2R30DomesticPalette.rust : base;
    } else if (family === 'timber' || family === 'dark-timber') {
      const line = (x + Math.floor(y / 4) * 3) % 7;
      color = line === 0 ? c2R30DomesticPalette.shadow :
        grain % 29 < 3 ? c2R30DomesticPalette.timber : base;
    } else if (family === 'clay') {
      color = (x + y * 3) % 8 === 0 ? c2R30DomesticPalette.rust :
        grain % 19 < 3 ? c2R30DomesticPalette['old-stone'] : base;
    } else if (family === 'old-stone') {
      color = y % 4 === 0 ? c2R30DomesticPalette.shadow :
        grain % 17 < 3 ? c2R30DomesticPalette.clay : base;
    } else {
      color = grain % 11 < 2 ? c2R30DomesticPalette.shadow : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-warrior-domestic/${family}-7colour-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const familyOrder = Object.freeze(Object.keys(c2R30DomesticPalette) as C2R30DomesticFamily[]);
const roleOrder: readonly C2R30DomesticRole[] = [
  'table', 'dish', 'chopstick', 'shoe', 'loom', 'cloth', 'seat', 'hearth',
];
const homeOrder: readonly C2R30DomesticHome[] = ['meal', 'child-shoe', 'unfinished-loom'];

function counts<T extends string>(items: readonly T[], order: readonly T[]) {
  const result = Object.fromEntries(order.map(key => [key, 0])) as Record<T, number>;
  for (const item of items) result[item]++;
  return result;
}

/** Static plan, auditable without Three.js. */
export function c2R30DomesticPlan(): readonly C2R30DomesticPiece[] {
  const parts: C2R30DomesticPiece[] = [];
  function add(home: C2R30DomesticHome, role: C2R30DomesticRole, family: C2R30DomesticFamily,
    e: number, y: number, n: number, w: number, h: number, d: number, solid = false) {
    const piece = Object.freeze({
      id: `${home}/${role}/${family}/${parts.length}`,
      home, role, family, e, y, n, w, h, d, solid,
    });
    if (!c2R30DomesticBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 domestic rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  // Home 02: a low table left set for one, with exactly one pair of chopsticks
  // across a single bowl; the second place was cleared long ago.
  const meal = c2R30DomesticRooms.meal;
  const me = meal.e + .4, mn = meal.side * 13.2;
  add('meal', 'table', 'dark-timber', me, .32, mn, 2.4, .12, 1.3, true);
  for (const dx of [-.95, .95]) for (const dn of [-.48, .48]) {
    add('meal', 'table', 'timber', me + dx, .16, mn + dn, .14, .32, .14, true);
  }
  add('meal', 'dish', 'clay', me - .38, .44, mn, .44, .1, .4);
  add('meal', 'dish', 'old-stone', me - .38, .54, mn, .3, .04, .28);
  // The single pair, laid side by side and slightly askew.
  for (const side of [-1, 1]) {
    add('meal', 'chopstick', 'timber', me - .38 + side * .07, .57, mn - .12, .035, .035, .62);
  }
  // A pushed-aside stool marks the abandoned second seat.
  add('meal', 'seat', 'timber', me + 1.55, .22, mn + .7, .5, .12, .5);
  for (const side of [-1, 1]) {
    add('meal', 'seat', 'dark-timber', me + 1.55 + side * .2, .11, mn + .7, .1, .22, .1);
  }

  // Home 05: one small child's shoe beside a cold hearth, the other lost.
  const shoe = c2R30DomesticRooms['child-shoe'];
  const se = shoe.e - 1.1, sn = shoe.side * 14.4;
  add('child-shoe', 'hearth', 'old-stone', shoe.e + 1.3, .1, sn, 1.5, .2, 1.1);
  for (let i = 0; i < 5; i++) {
    add('child-shoe', 'hearth', i % 2 ? 'rust' : 'shadow',
      shoe.e + 1.3 - .5 + i * .25, .22, sn - .18, .18, .06, .5);
  }
  // Shoe: a low toe box, a heel and a curled upper, deliberately small.
  add('child-shoe', 'shoe', 'dark-timber', se, .1, sn, .26, .2, .46);
  add('child-shoe', 'shoe', 'timber', se - .06, .28, sn - .12, .3, .16, .22);
  add('child-shoe', 'shoe', 'rust', se, .34, sn - .2, .28, .05, .1);
  // A second, empty shoeprint of dust hints where its partner used to be.
  add('child-shoe', 'shoe', 'old-stone', se + .5, .015, sn + .1, .2, .03, .38);

  // Home 08: a frame loom with a bolt of cloth left half-woven on it.
  const loom = c2R30DomesticRooms['unfinished-loom'];
  const le = loom.e + .3, ln = loom.side * 13.6;
  for (const side of [-1, 1]) {
    add('unfinished-loom', 'loom', 'dark-timber', le + side * 1.05, 1.0, ln, .14, 2.0, .14, true);
    add('unfinished-loom', 'loom', 'timber', le + side * 1.05, 1.95, ln, 2.24, .14, .14);
  }
  for (let i = 0; i < 9; i++) {
    add('unfinished-loom', 'loom', i % 3 ? 'timber' : 'rust',
      le - .9 + i * .23, 1.92, ln, .05, .06, 1.5);
  }
  // Completed lower weave vs the sparse, unfinished upper rows: the story is
  // in the contrast, not in any text.
  for (let row = 0; row < 10; row++) {
    const threads = row < 5 ? 11 : 3 + Math.floor(noise(row, 17) * 3);
    for (let col = 0; col < threads; col++) {
      add('unfinished-loom', 'cloth', (row + col) % 5 ? 'cloth' : 'rust',
        le - 1.0 + col * .2, .35 + row * .15, ln + .04, .17, .12, .06);
    }
  }
  add('unfinished-loom', 'cloth', 'cloth', le + .9, .5, ln + .5, .5, .3, .35);
  return Object.freeze(parts);
}

export type C2R30DomesticStats = Readonly<{
  coordinateFrame: 'warrior-city-local-east-height-north';
  depth: -165;
  datum: typeof c2R30DomesticFixtureDatum;
  site: C2R30DomesticSite;
  siteCertified: boolean;
  pieceCount: number;
  solidCount: number;
  paletteColorCount: 7;
  paletteCounts: Readonly<Record<C2R30DomesticFamily, number>>;
  roleCounts: Readonly<Record<C2R30DomesticRole, number>>;
  homeCounts: Readonly<Record<C2R30DomesticHome, number>>;
  drawBatchCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  shading: 'lambert';
  colliderCount: number;
  worldAnchor: false;
  registrationChanges: 0;
  lootCount: 0;
  presenceChanges: 0;
  disposed: boolean;
}>;

export type C2R30DomesticCollider = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>;

export type C2R30DomesticScene = Readonly<{
  group: Group;
  pieces: readonly C2R30DomesticPiece[];
  colliders: readonly C2R30DomesticCollider[];
  stats(): C2R30DomesticStats;
  dispose(): void;
}>;

export function mountTownC2R30Domestic(options: Readonly<{
  parent?: Group;
  site?: C2R30DomesticSite;
  supportsSite?: (site: C2R30DomesticSite) => boolean;
}> = {}): C2R30DomesticScene {
  const site = options.site ?? c2R30DomesticFixtureSite;
  const certified = site.domainId !== c2R30DomesticFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  const group = new Group();
  group.name = 'town-c2-r30-warrior-domestic';
  group.userData.coordinateFrame = 'warrior-city-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30DomesticFixtureDatum;
  group.userData.visualOnly = true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30DomesticPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-domestic-unit-box';
  const matrix = new Matrix4(), pose = new Object3D();
  const meshes: InstancedMesh[] = [];
  const textures: DataTexture[] = [];
  const materials: MeshLambertMaterial[] = [];
  for (const family of familyOrder) {
    const items = pieces.filter(piece => piece.family === family);
    if (!items.length) continue;
    const texture = pixelTexture(family);
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-domestic/${family}`, map: texture, color: 0xffffff, flatShading: true,
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-domestic/${family}`;
    items.forEach((piece, index) => {
      pose.position.set(piece.e, piece.y, -piece.n);
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
  // Sanity: the authored solid props form a valid static index.
  createStaticFootIndex(colliders);

  let disposed = false;
  function stats(): C2R30DomesticStats {
    return Object.freeze({
      coordinateFrame: 'warrior-city-local-east-height-north' as const,
      depth: -165 as const,
      datum: c2R30DomesticFixtureDatum,
      site,
      siteCertified: certified,
      pieceCount: pieces.length,
      solidCount: solids.length,
      paletteColorCount: familyOrder.length as 7,
      paletteCounts: Object.freeze(counts(pieces.map(piece => piece.family), familyOrder)),
      roleCounts: Object.freeze(counts(pieces.map(piece => piece.role), roleOrder)),
      homeCounts: Object.freeze(counts(pieces.map(piece => piece.home), homeOrder)),
      drawBatchCount: disposed ? 0 : meshes.length,
      pixelTextureCount: disposed ? 0 : textures.length,
      textureSize: 16 as const,
      textureFilter: 'nearest' as const,
      shading: 'lambert' as const,
      colliderCount: colliders.length,
      worldAnchor: false as const,
      registrationChanges: 0,
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

export const buildTownC2R30Domestic = mountTownC2R30Domestic;
