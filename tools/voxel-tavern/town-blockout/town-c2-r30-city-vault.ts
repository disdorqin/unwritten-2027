import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat,
  SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';
import { warriorDistrictStations } from '../../../src/shared/underground-warrior-district.js';

/**
 * C2-R06 -165 warrior-city "cavern vault, overlook balcony and back alley".
 *
 * The atlas card U-10 asks for a distant view of the warrior city: a huge
 * cavern, layered city silhouettes and no duplicated one-size-fits-all
 * huts. The shipped city shell only had a flat plate ceiling and a plain
 * street wall, so this module adds the missing volume:
 *
 *  - a real rock vault spanning the street, springing above the wall walk
 *    so the shared lookout station stays clear, with hanging formations;
 *  - rock ledges on both cavern walls so the cavern reads as rock, not a box;
 *  - an overlook balcony built on the shared `u10/wall-lookout` station foot,
 *    with railing, brackets, banners and a bench;
 *  - a back-alley service band on the south side with three deliberately
 *    different roof lines (long store, tower house, lean-to shed), so the
 *    city silhouette is layered instead of repeated.
 *
 * Local city ENY frame only (x=east, y=height above the city floor datum,
 * z=-north). No world anchor, no registration, no loot, no presence, no
 * interaction and no real light: the city shell owns the cold-flame lamp
 * and the -165 warm-pool budget.
 */

export type C2R30VaultFamily =
  | 'rock-shadow' | 'rock-mid' | 'rock-pale' | 'gravel' | 'timber'
  | 'dark-timber' | 'iron' | 'moon-crystal' | 'ash';
export type C2R30VaultRole =
  | 'arch' | 'course' | 'formation' | 'deck' | 'post' | 'rail'
  | 'banner' | 'prop' | 'roof';
export type C2R30VaultZone =
  | 'vault' | 'wall' | 'formation' | 'overlook' | 'alley';

export type C2R30VaultPiece = Readonly<{
  id: string;
  zone: C2R30VaultZone;
  role: C2R30VaultRole;
  family: C2R30VaultFamily;
  e: number;
  y: number;
  n: number;
  w: number;
  h: number;
  d: number;
  solid: boolean;
  emitter: boolean;
}>;

export type C2R30VaultSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30VaultFixtureSite: C2R30VaultSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus165:warrior-city:cavern-vault',
  east: 0,
  north: 0,
  height: 0,
  yaw: 0,
});

export const c2R30VaultFootprint = Object.freeze({
  minE: 12, maxE: 176, minN: -31, maxN: 31,
});

export const c2R30VaultFixtureDatum = Object.freeze({
  id: 'c2-r30/minus165/warrior-city/cavern-vault',
  layer: -165 as const,
  coordinateFrame: 'warrior-city-local-east-height-north' as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  footprint: c2R30VaultFootprint,
});

/** The shared wall-lookout station this balcony is built around. */
export const c2R30VaultLookout = Object.freeze({
  id: 'u10/wall-lookout',
  foot: Object.freeze({
    east: warriorDistrictStations.find(station => station.id === 'u10/wall-lookout')!
      .localFoot[0],
    height: warriorDistrictStations.find(station => station.id === 'u10/wall-lookout')!
      .localFoot[1],
    north: warriorDistrictStations.find(station => station.id === 'u10/wall-lookout')!
      .localFoot[2],
  }),
});

export const c2R30VaultPalette = Object.freeze({
  'rock-shadow': 0x2b3038,
  'rock-mid': 0x454b55,
  'rock-pale': 0x646a74,
  gravel: 0x5f5d56,
  timber: 0x6b5239,
  'dark-timber': 0x463426,
  iron: 0x3a4149,
  'moon-crystal': 0x9ad8e2,
  ash: 0x23262b,
} as const satisfies Readonly<Record<C2R30VaultFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30VaultPalette) as C2R30VaultFamily[]);
const roleOrder: readonly C2R30VaultRole[] = [
  'arch', 'course', 'formation', 'deck', 'post', 'rail', 'banner', 'prop', 'roof',
];
const zoneOrder: readonly C2R30VaultZone[] = [
  'vault', 'wall', 'formation', 'overlook', 'alley',
];

/** Street corridor that must stay open for the city main route. */
const STREET_HALF = 8;
const STREET_CLEAR_HEIGHT = 4.5;
/** Wall-walk band (shared station at n=27, deck y=7.12) that must stay clear. */
const WALK_MIN_N = 24.4;
const WALK_MAX_N = 29.6;
/** Only a flush surface may touch the walk band; nothing may rise into it. */
const WALK_FLUSH_TOP = 7.3;
/** Vault rock may pass over the walk only well above head height. */
const WALK_OVERHEAD_BOTTOM = 9.4;

/**
 * Placement guard: the vault must not drop into the street corridor, must not
 * foul the wall walk, and must stay inside the declared local footprint.
 */
export function c2R30VaultBoxAllowed(piece: C2R30VaultPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const foot = c2R30VaultFootprint;
  if (piece.e - piece.w / 2 < foot.minE - 1e-6 ||
    piece.e + piece.w / 2 > foot.maxE + 1e-6 ||
    piece.n - piece.d / 2 < foot.minN - 1e-6 ||
    piece.n + piece.d / 2 > foot.maxN + 1e-6) return false;
  if (piece.y < -1e-6 || piece.y + piece.h > 19) return false;
  // Nothing solid may hang into the street corridor below the shopfront line.
  if (piece.solid && piece.y < STREET_CLEAR_HEIGHT &&
    piece.n - piece.d / 2 < STREET_HALF && piece.n + piece.d / 2 > -STREET_HALF) return false;
  // The shared wall walk may only be met by a flush surface, or passed over
  // well above head height.
  if (piece.solid && piece.n - piece.d / 2 < WALK_MAX_N && piece.n + piece.d / 2 > WALK_MIN_N) {
    const flush = piece.y + piece.h <= WALK_FLUSH_TOP + 1e-6;
    const overhead = piece.y >= WALK_OVERHEAD_BOTTOM;
    if (!flush && !overhead) return false;
  }
  return true;
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30VaultFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30VaultPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color = base;
    const grain = (Math.imul(x + 17, 15731) ^ Math.imul(y + 37, 4817)) >>> 0;
    if (family === 'rock-shadow' || family === 'rock-mid' || family === 'rock-pale') {
      const course = Math.floor(y / 4), shiftedX = x + (course % 2) * 4;
      const joint = y % 4 === 0 || shiftedX % 8 === 0;
      const facet = (Math.floor(x / 4) * 3 + Math.floor(y / 4)) % 5;
      color = joint ? c2R30VaultPalette.ash :
        facet === 0 ? c2R30VaultPalette['rock-shadow'] :
          grain % 19 < 3 ? c2R30VaultPalette['rock-pale'] : base;
    } else if (family === 'gravel') {
      color = grain % 6 === 0 ? c2R30VaultPalette.ash :
        grain % 9 === 0 ? c2R30VaultPalette['rock-mid'] : base;
    } else if (family === 'timber' || family === 'dark-timber') {
      const grainLine = (x + Math.floor(y / 5) * 3) % 7;
      color = grainLine === 0 ? c2R30VaultPalette.ash :
        grainLine === 1 ? c2R30VaultPalette['rock-shadow'] : base;
    } else if (family === 'iron') {
      color = y % 6 === 5 ? c2R30VaultPalette.ash :
        grain % 11 < 3 ? c2R30VaultPalette['rock-shadow'] : base;
    } else if (family === 'moon-crystal') {
      color = grain % 8 === 0 ? c2R30VaultPalette['rock-pale'] : base;
    } else {
      color = grain % 13 < 3 ? c2R30VaultPalette['rock-shadow'] : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-vault/${family}-9colour-16px`;
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

/** Static geometry plan, separated so tests can audit it without Three.js. */
export function c2R30VaultPlan(): readonly C2R30VaultPiece[] {
  const parts: C2R30VaultPiece[] = [];
  function add(zone: C2R30VaultZone, role: C2R30VaultRole, family: C2R30VaultFamily,
    e: number, y: number, n: number, w: number, h: number, d: number,
    solid = false, emitter = false) {
    const piece = Object.freeze({
      id: `${zone}/${role}/${family}/${parts.length}`,
      zone, role, family, e, y, n, w, h, d, solid, emitter,
    });
    if (!c2R30VaultBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 vault rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  // --- Cavern vault: rock spans crossing the street, springing above the
  // wall walk so the shared lookout station stays usable.
  const SPRING = 10.6, CROWN = 18.0;
  for (let arch = 0, e = 16; e <= 168; arch++, e += 5.6) {
    const segments = 11;
    for (let s = 0; s < segments; s++) {
      const t = (s + .5) / segments;
      const n = -30 + 60 * t;
      const y = SPRING + (CROWN - SPRING) * Math.sin(Math.PI * t);
      const family = (arch + s) % 5 === 0 ? 'rock-pale' :
        (arch + s) % 3 === 0 ? 'rock-shadow' : 'rock-mid';
      add('vault', 'arch', family, e + (arch % 2) * .4, y - .8, n, 5.6, 1.6, 6.2, true);
    }
    // Hanging formations under the crown.
    for (let k = 0; k < 4; k++) {
      const n = -6 + k * 4 + (k % 2) * 1.2;
      const length = .9 + noise(arch, k) * 2.6;
      const width = .3 + noise(arch, k, 5) * .5;
      add('formation', 'formation', k % 3 === 0 ? 'moon-crystal' : 'rock-pale',
        e + .6, CROWN - 1.6 - length, n, width, length, width, false, k % 3 === 0);
    }
  }

  // --- Cavern wall ledges: rock courses on the south wall (the north wall
  // carries the shared wall walk, so it is left to the district module).
  for (let row = 0; row < 4; row++) {
    const y = row * 2.4;
    for (let col = 0; col < 18; col++) {
      const e = 16 + col * 8.6 + (row % 2) * .6;
      const depth = .9 + noise(row, col, 1) * 1.1;
      const family = (row + col) % 4 === 0 ? 'rock-pale' :
        (row * 2 + col) % 3 === 0 ? 'rock-shadow' : 'rock-mid';
      add('wall', 'course', family, e, y, -(29.9 - depth / 2), 6.4, 2.2, depth, true);
    }
  }

  // --- Overlook balcony on the shared wall-lookout station.
  const lo = c2R30VaultLookout.foot;
  const deckY = lo.height;
  for (let i = 0; i < 9; i++) {
    const e = lo.east - 4.4 + i * 1.1;
    add('overlook', 'deck', 'timber', e, deckY, 22.2, 1.05, .16, 5.6, true);
    add('overlook', 'deck', 'dark-timber', e, deckY - .22, 20.4, 1.05, .22, 3.2, true);
  }
  // Brackets under the projecting deck.
  for (let i = 0; i < 4; i++) {
    const e = lo.east - 3.6 + i * 2.4;
    add('overlook', 'post', 'dark-timber', e, deckY - 1.5, 20.6, .3, 1.3, .3, true);
    add('overlook', 'post', 'dark-timber', e, deckY - .5, 22.6, .24, .9, 2.4, true);
  }
  // Railing along the open south and west edges.
  for (let i = 0; i < 10; i++) {
    const e = lo.east - 4.9 + i * 1.05;
    add('overlook', 'rail', 'dark-timber', e, deckY + .16, 19.6, .16, 1.1, .16, true);
  }
  add('overlook', 'rail', 'timber', lo.east, deckY + 1.2, 19.6, 10.4, .16, .2, true);
  add('overlook', 'rail', 'timber', lo.east - 5.4, deckY + 1.2, 21.6, .2, .16, 4.4, true);
  for (let i = 0; i < 6; i++) {
    const n = 19.8 + i * .82;
    add('overlook', 'rail', 'dark-timber', lo.east + 5.1, deckY + .16, n, .16, 1.1, .16, true);
  }
  // A worn bench, a spear stump and two tattered banners.
  add('overlook', 'prop', 'timber', lo.east - 1.8, deckY + .16, 20.6, 2.2, .16, .5, true);
  for (const side of [-1, 1]) {
    add('overlook', 'prop', 'dark-timber', lo.east - 1.8 + side * .9, deckY, 20.6, .2, .46, .4, true);
  }
  add('overlook', 'prop', 'iron', lo.east + 3.6, deckY, 20.2, .1, 1.5, .1);
  add('overlook', 'prop', 'iron', lo.east + 3.6, deckY + 1.4, 20.2, .1, .3, .1);
  for (const [dx, length] of [[-4.2, 2.6], [2.2, 3.4]] as const) {
    add('overlook', 'banner', 'dark-timber', lo.east + dx, deckY + .1, 19.72, 1.1, length, .08);
    add('overlook', 'banner', 'timber', lo.east + dx, deckY + .1 + length, 19.72, 1.2, .12, .1);
  }
  // Moon-crystal shards on iron stands marking the overlook.
  for (const dx of [-4.8, 4.8]) {
    add('overlook', 'prop', 'iron', lo.east + dx, deckY, 20.1, .14, .5, .14, true);
    add('overlook', 'prop', 'moon-crystal', lo.east + dx, deckY + .5, 20.1, .2, .46, .2, false, true);
  }

  // --- Back-alley service band: three different roof lines on the south side
  // so the city silhouette is layered instead of repeating one hut type.
  const alleyN = -16.4;
  // 1) Long stone store with a low gabled ridge along the street.
  for (let i = 0; i < 8; i++) {
    const e = 27 + i * 1.9;
    add('alley', 'course', 'rock-mid', e, 0, alleyN, 1.85, 2.6, 4.4, true);
    add('alley', 'roof', 'dark-timber', e, 2.6, alleyN - 1.5, 1.85, .3, 1.7, true);
    add('alley', 'roof', 'dark-timber', e, 2.6, alleyN + 1.5, 1.85, .3, 1.7, true);
  }
  add('alley', 'roof', 'timber', 34.5, 3.2, alleyN, 15.2, .3, .5, true);
  add('alley', 'post', 'timber', 27.4, 2.6, alleyN - 2.1, .3, 2.6, .3, true);
  add('alley', 'post', 'timber', 41.6, 2.6, alleyN + 2.1, .3, 2.6, .3, true);
  // 2) Tower house with a steep peaked cap.
  const tw = 49.5;
  for (let row = 0; row < 6; row++) {
    const y = row * 1.2;
    for (const side of [-1, 1]) {
      add('alley', 'course', row % 3 === 0 ? 'rock-pale' : 'rock-mid',
        tw + side * 2.2, y, alleyN, .6, 1.2, 4.2, true);
      add('alley', 'course', row % 3 === 0 ? 'rock-pale' : 'rock-mid',
        tw, y, alleyN + side * 2.1, 4.4, 1.2, .6, true);
    }
  }
  for (let i = 0; i < 5; i++) {
    const w = 4.6 - i * .9;
    add('alley', 'roof', 'dark-timber', tw, 7.2 + i * .42, alleyN, w, .42, w, true);
  }
  add('alley', 'prop', 'moon-crystal', tw, 7.6, alleyN, .5, .6, .5, false, true);
  // 3) Lean-to shed with an open front and stacked crates.
  for (let i = 0; i < 6; i++) {
    const e = 59 + i * 1.9;
    add('alley', 'post', 'timber', e, 0, alleyN - 2.1, .34, 3.1, .34, true);
    add('alley', 'post', 'timber', e, 0, alleyN + 1.6, .34, 2.2, .34, true);
  }
  for (let i = 0; i < 7; i++) {
    const e = 58.4 + i * 1.9;
    add('alley', 'roof', 'dark-timber', e, 3.1 - i * .06, alleyN - .3, 1.85, .24, 4.6, true);
  }
  for (let i = 0; i < 5; i++) {
    add('alley', 'prop', i % 2 === 0 ? 'timber' : 'dark-timber',
      61.4 + (i % 3) * .8, i * .58, alleyN + 1.1, .9, .58, .8, true);
  }
  add('alley', 'prop', 'gravel', 66.5, 0, alleyN + 1.4, 1.6, .16, 1.6);
  add('alley', 'prop', 'iron', 58.6, 2.6, alleyN - 1.6, .3, .4, .3);
  add('alley', 'prop', 'ash', 68.6, 0, alleyN - 1.4, 1.2, .1, 1.2);

  // --- Rubble and scree where the cavern wall meets the street.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const e = 14 + noise(i, 3) * 158;
    const n = side * (9.6 + noise(i, 7) * 5.4);
    if (Math.abs(n) < 9.4) continue;
    add('wall', 'prop', i % 3 === 0 ? 'rock-pale' : 'rock-mid',
      e, 0, n, .5 + noise(i, 11) * .6, .3 + noise(i, 13) * .3, .5 + noise(i, 17) * .6);
  }
  return Object.freeze(parts);
}

export type C2R30VaultStats = Readonly<{
  coordinateFrame: 'warrior-city-local-east-height-north';
  depth: -165;
  datum: typeof c2R30VaultFixtureDatum;
  site: C2R30VaultSite;
  siteCertified: boolean;
  lookout: typeof c2R30VaultLookout;
  pieceCount: number;
  solidCount: number;
  emitterCount: number;
  paletteColorCount: 9;
  paletteCounts: Readonly<Record<C2R30VaultFamily, number>>;
  roleCounts: Readonly<Record<C2R30VaultRole, number>>;
  zoneCounts: Readonly<Record<C2R30VaultZone, number>>;
  drawBatchCount: number;
  pixelTextureCount: number;
  textureSize: 16;
  textureFilter: 'nearest';
  shading: 'lambert';
  realLightCount: 0;
  visibleLightCount: 0;
  colliderCount: number;
  worldAnchor: false;
  registrationChanges: 0;
  lootCount: 0;
  presenceChanges: 0;
  disposed: boolean;
}>;

export type C2R30VaultScene = Readonly<{
  group: Group;
  pieces: readonly C2R30VaultPiece[];
  colliders: readonly Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>[];
  canStand(e: number, n: number, y?: number, r?: number): boolean;
  stats(): C2R30VaultStats;
  dispose(): void;
}>;

/**
 * Mount the cavern vault and overlook. Hidden by default; a host must pass an
 * explicit certified site. No world anchor, no registration, no real lights.
 */
export function mountTownC2R30CityVault(options: Readonly<{
  parent?: Group;
  site?: C2R30VaultSite;
  supportsSite?: (site: C2R30VaultSite) => boolean;
}> = {}): C2R30VaultScene {
  const group = new Group();
  group.name = 'town-c2-r30-city-vault';
  group.userData.coordinateFrame = 'warrior-city-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30VaultFixtureDatum;
  group.userData.visualOnly = true;

  const site = options.site ?? c2R30VaultFixtureSite;
  const certified = site.domainId !== c2R30VaultFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30VaultPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-vault-unit-box';
  const matrices = new Map<C2R30VaultFamily, Matrix4[]>();
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
    const emissive = family === 'moon-crystal';
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-vault/${family}`,
      map: texture,
      color: 0xffffff,
      flatShading: true,
      ...(emissive ? { emissive: new Color(c2R30VaultPalette[family]), emissiveIntensity: .6 } : {}),
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-vault/${family}`;
    mesh.userData.visualOnly = true;
    items.forEach((item, index) => mesh.setMatrixAt(index, item));
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
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

  function canStand(e: number, n: number, y = 0, r = .27) {
    const foot = c2R30VaultFootprint;
    if (![e, n, y, r].every(Number.isFinite) || e - r < foot.minE || e + r > foot.maxE ||
      n - r < foot.minN || n + r > foot.maxN) return false;
    return !footIndex.blocks(e, n, y, r);
  }

  let disposed = false;
  function stats(): C2R30VaultStats {
    return Object.freeze({
      coordinateFrame: 'warrior-city-local-east-height-north' as const,
      depth: -165 as const,
      datum: c2R30VaultFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: certified,
      lookout: c2R30VaultLookout,
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
      visibleLightCount: 0 as const,
      colliderCount: colliders.length,
      worldAnchor: false as const,
      registrationChanges: 0 as const,
      lootCount: 0 as const,
      presenceChanges: 0 as const,
      disposed,
    });
  }
  group.userData.stats = stats();

  options.parent?.add(group);
  return Object.freeze({
    group, pieces, colliders, canStand, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of new Set(materials)) material.dispose();
      for (const texture of new Set(textures)) texture.dispose();
      geometry.dispose();
      group.clear();
      group.userData.stats = stats();
    },
  });
}

export const buildTownC2R30CityVault = mountTownC2R30CityVault;
