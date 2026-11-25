import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat,
  SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';
import { undergroundZodiacSites } from '../../../src/shared/underground-zodiac-sites.js';

/**
 * C2-R05 -165 warrior-city "rooster star-stone and cold-flame court".
 *
 * The shared zodiac authority already fixes the rooster anchor in the city
 * frame (base 98 / -6.25, stand foot 98 / -5.10) and the design canon puts
 * the star-stone right beside the cold flame in the street heart. The -190
 * dog-stone plinth shipped in C2-R03; the rooster half of that pair did not
 * exist yet, and the court around the cold flame had no physical dressing.
 *
 * This module builds only geometry and dressing: a carved rooster monolith
 * with an EMPTY socket (the star-stone object itself belongs to the shared
 * zodiac authority), a worn standing pad, an approach of flagstones, a kerb
 * line, radial court paving, two stools facing the flame, a fallen banner
 * pole, moss and rubble. It claims no world anchor, no registration, no
 * loot, no presence and no interaction, and it emits no real light: the
 * city shell already owns the cold-flame lamp and the -165 warm-pool budget.
 *
 * Coordinates are absolute in the warrior-city local ENY frame
 * (x=east, y=height above the city floor datum, z=-north). Nothing here is a
 * world position; a host must certify the site before the group is shown.
 */

export type C2R30RoosterFamily =
  | 'cold-granite' | 'pale-granite' | 'basalt' | 'moss-stone' | 'iron'
  | 'verdigris' | 'cold-crystal' | 'ember-trace' | 'shadow';
export type C2R30RoosterRole =
  | 'plinth' | 'monolith' | 'sigil' | 'socket' | 'paving' | 'kerb'
  | 'seat' | 'prop' | 'rubble';
export type C2R30RoosterZone =
  | 'stone' | 'sigil' | 'approach' | 'kerb' | 'court';

export type C2R30RoosterPiece = Readonly<{
  id: string;
  zone: C2R30RoosterZone;
  role: C2R30RoosterRole;
  family: C2R30RoosterFamily;
  e: number;
  y: number;
  n: number;
  w: number;
  h: number;
  d: number;
  solid: boolean;
  emitter: boolean;
}>;

export type C2R30RoosterSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30RoosterFixtureSite: C2R30RoosterSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus165:warrior-city:rooster-star-stone',
  east: 0,
  north: 0,
  height: 0,
  yaw: 0,
});

/** Local footprint guard rails for the whole court. */
export const c2R30RoosterFootprint = Object.freeze({
  minE: 90, maxE: 106, minN: -16, maxN: -2.6,
});

export const c2R30RoosterFixtureDatum = Object.freeze({
  id: 'c2-r30/minus165/warrior-city/rooster-star-stone',
  layer: -165 as const,
  coordinateFrame: 'warrior-city-local-east-height-north' as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  footprint: c2R30RoosterFootprint,
});

/** Nine pigments: cold granite, one metal, two self-lit accents, deep shadow. */
export const c2R30RoosterPalette = Object.freeze({
  'cold-granite': 0x4a5360,
  'pale-granite': 0x7d8590,
  basalt: 0x2f3742,
  'moss-stone': 0x44513f,
  iron: 0x3b4249,
  verdigris: 0x4f7a6c,
  'cold-crystal': 0x8fd8e4,
  'ember-trace': 0xc06a3a,
  shadow: 0x1c2229,
} as const satisfies Readonly<Record<C2R30RoosterFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30RoosterPalette) as C2R30RoosterFamily[]);
const roleOrder: readonly C2R30RoosterRole[] = [
  'plinth', 'monolith', 'sigil', 'socket', 'paving', 'kerb', 'seat', 'prop', 'rubble',
];
const zoneOrder: readonly C2R30RoosterZone[] = [
  'stone', 'sigil', 'approach', 'kerb', 'court',
];

/** The shared zodiac anchors this module dresses. */
export const c2R30RoosterZodiac = Object.freeze({
  id: 'rooster' as const,
  number: undergroundZodiacSites.rooster.number,
  scene: undergroundZodiacSites.rooster.scene,
  base: Object.freeze({ ...undergroundZodiacSites.rooster.base }),
  stand: Object.freeze({ ...undergroundZodiacSites.rooster.stand }),
});

/** The registered recovery fire reserve in the same court; it stays clear. */
export const c2R30RoosterFireReserve = Object.freeze({ east: 96.9, north: -6.7 });

const STAND = c2R30RoosterZodiac.stand;
const BASE = c2R30RoosterZodiac.base;
const STATUE = Object.freeze({ east: 98.1, north: -9.65 });

/** Clearance discs that must stay free: the shared standing foot and the
 * registered recovery fire reserve. Both are player-sized. */
const STAND_CLEARANCE = .55;
const RESERVE_CLEARANCE = .6;

/** Distance from the stone role pieces to the shared standing foot. */
const STONE_FOOT_GAP = .5;

/** Axis-aligned gap between a box and a point, as the hypotenuse of the
 * per-axis slack. Zero when the point lies inside the box. */
function boxGap(piece: C2R30RoosterPiece, point: Readonly<{ east: number; north: number }>) {
  const dx = Math.max(0, Math.abs(piece.e - point.east) - piece.w / 2);
  const dn = Math.max(0, Math.abs(piece.n - point.north) - piece.d / 2);
  return Math.hypot(dx, dn);
}

/**
 * Placement guard. Keeps the shared standing foot walkable, keeps the
 * registered recovery fire reserve flat, and keeps the court inside the
 * declared local footprint.
 */
export function c2R30RoosterBoxAllowed(piece: C2R30RoosterPiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const foot = c2R30RoosterFootprint;
  if (piece.e - piece.w / 2 < foot.minE - 1e-6 ||
    piece.e + piece.w / 2 > foot.maxE + 1e-6 ||
    piece.n - piece.d / 2 < foot.minN - 1e-6 ||
    piece.n + piece.d / 2 > foot.maxN + 1e-6) return false;
  if (piece.y < -1e-6 || piece.y + piece.h > 3.2) return false;
  const stoneRole = piece.role === 'plinth' || piece.role === 'monolith' || piece.role === 'socket';
  // The shared standing foot must stay walkable. The anchor stone itself may
  // approach it, but never covers it and never crowds the player's circle.
  if (boxGap(piece, STAND) < STAND_CLEARANCE - 1e-6) {
    if (stoneRole) {
      if (boxGap(piece, STAND) === 0) return false;
      if (piece.n + piece.d / 2 > STAND.north - STONE_FOOT_GAP) return false;
    } else if (piece.solid && piece.y + piece.h > .1) return false;
  }
  // The registered recovery fire reserve stays flat and unobstructed.
  if (boxGap(piece, c2R30RoosterFireReserve) < RESERVE_CLEARANCE - 1e-6 &&
    piece.solid && piece.y + piece.h > .1) return false;
  return true;
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30RoosterFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30RoosterPalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color = base;
    const grain = (Math.imul(x + 13, 15731) ^ Math.imul(y + 29, 4817)) >>> 0;
    if (family === 'cold-granite' || family === 'pale-granite' || family === 'basalt') {
      const course = Math.floor(y / 4), shiftedX = x + (course % 2) * 4;
      const joint = y % 4 === 0 || shiftedX % 8 === 0;
      const facet = (Math.floor(x / 4) * 3 + Math.floor(y / 4)) % 5;
      color = joint ? c2R30RoosterPalette.shadow :
        facet === 0 ? c2R30RoosterPalette.basalt :
          grain % 21 < 3 ? c2R30RoosterPalette['cold-granite'] : base;
    } else if (family === 'moss-stone') {
      color = grain % 5 === 0 ? c2R30RoosterPalette['cold-granite'] :
        grain % 11 === 0 ? c2R30RoosterPalette.shadow : base;
    } else if (family === 'iron') {
      color = y % 6 === 5 ? c2R30RoosterPalette.shadow :
        grain % 13 < 3 ? c2R30RoosterPalette.basalt : base;
    } else if (family === 'verdigris') {
      color = grain % 9 === 0 ? c2R30RoosterPalette['cold-crystal'] :
        grain % 7 === 0 ? c2R30RoosterPalette.basalt : base;
    } else if (family === 'cold-crystal') {
      color = grain % 7 === 0 ? c2R30RoosterPalette['pale-granite'] : base;
    } else if (family === 'ember-trace') {
      color = grain % 6 === 0 ? c2R30RoosterPalette.shadow : base;
    } else {
      color = grain % 15 < 3 ? c2R30RoosterPalette.basalt : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-rooster/${family}-9colour-16px`;
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
export function c2R30RoosterPlan(): readonly C2R30RoosterPiece[] {
  const parts: C2R30RoosterPiece[] = [];
  function add(zone: C2R30RoosterZone, role: C2R30RoosterRole, family: C2R30RoosterFamily,
    e: number, y: number, n: number, w: number, h: number, d: number,
    solid = false, emitter = false) {
    const piece = Object.freeze({
      id: `${zone}/${role}/${family}/${parts.length}`,
      zone, role, family, e, y, n, w, h, d, solid, emitter,
    });
    if (!c2R30RoosterBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 rooster rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  // --- The rooster monolith: stepped plinth, tapering shaft, empty socket.
  const be = BASE.east, bn = BASE.north;
  add('stone', 'plinth', 'cold-granite', be, 0, bn, 1.0, .18, 1.1, true);
  add('stone', 'plinth', 'basalt', be, .18, bn, .92, .16, 1.02, true);
  add('stone', 'plinth', 'pale-granite', be, .34, bn, .84, .16, .94, true);
  const shaft: readonly { y: number; w: number; h: number; d: number }[] = [
    { y: .50, w: .92, h: .38, d: 1.00 },
    { y: .88, w: .88, h: .38, d: .94 },
    { y: 1.26, w: .88, h: .38, d: .94 },
    { y: 1.64, w: .88, h: .38, d: .94 },
    { y: 2.02, w: .76, h: .30, d: .84 },
  ];
  shaft.forEach((course, index) => {
    const family = index % 3 === 0 ? 'pale-granite' : 'cold-granite';
    add('stone', 'monolith', family, be, course.y, bn, course.w, course.h, course.d, true);
  });
  add('stone', 'monolith', 'pale-granite', be, 2.32, bn, .88, .14, .88, true);
  // Self-lit crystal at the footing: the stone has to read in an unlit city.
  for (const [dx, dn, size] of [[-1, -1, .2], [1, -1, .16], [-1, 1, .14]] as const) {
    add('stone', 'prop', 'cold-crystal', be + dx * .48, 0, bn + dn * .52, size, size * 1.4, size,
      false, true);
  }
  // Two thin crystal veins on the stone: one at the footing band, one at the cap.
  add('stone', 'sigil', 'cold-crystal', be - .28, .52, bn + .52, .05, .34, .05, false, true);
  add('stone', 'sigil', 'cold-crystal', be + .24, 2.06, bn + .44, .05, .22, .05, false, true);
  // Empty socket: the star-stone object belongs to the shared zodiac authority.
  add('stone', 'socket', 'shadow', be, 2.46, bn, .52, .06, .52);
  // A crystal wick on the socket lip: the star-stone's own cold glow.
  add('stone', 'prop', 'cold-crystal', be, 2.44, bn + .39, .16, .22, .14, false, true);
  add('stone', 'prop', 'cold-crystal', be + .1, 2.52, bn + .37, .1, .16, .12, false, true);
  add('stone', 'prop', 'iron', be - .13, 2.42, bn + .38, .1, .14, .1);
  for (const dx of [-1, 1]) for (const dn of [-1, 1]) {
    add('stone', 'socket', 'verdigris', be + dx * .32, 2.46, bn + dn * .32, .14, .12, .14, true);
  }

  // --- Carved rooster relief on the north face, facing the shared stand foot.
  // The relief band keeps one constant face so the panel reads as carving.
  const face = bn + .47;
  const relief = (family: C2R30RoosterFamily, e: number, y: number,
    w: number, h: number, emitter = false) =>
    add('sigil', 'sigil', family, e, y, face + .04, w, h, .08, false, emitter);
  // Recessed panel frame.
  relief('shadow', be, 2.0, .82, .08);
  relief('shadow', be, .88, .82, .08);
  relief('shadow', be - .38, 1.44, .08, 1.2);
  relief('shadow', be + .38, 1.44, .08, 1.2);
  // Comb, head, beak and eye.
  relief('ember-trace', be - .02, 1.9, .08, .12, true);
  relief('ember-trace', be + .08, 1.9, .08, .12, true);
  relief('ember-trace', be + .18, 1.9, .08, .12, true);
  relief('pale-granite', be + .06, 1.66, .3, .24);
  relief('iron', be + .25, 1.72, .1, .09);
  relief('cold-crystal', be + .1, 1.78, .08, .08, true);
  // Neck and body.
  relief('pale-granite', be, 1.4, .26, .28);
  relief('pale-granite', be - .02, 1.12, .24, .24);
  // Tail feathers fanning down-left and two legs.
  relief('iron', be - .24, 1.28, .12, .3);
  relief('iron', be - .2, 1.2, .1, .24);
  relief('iron', be - .16, 1.12, .08, .18);
  relief('iron', be - .02, .94, .07, .14);
  relief('iron', be + .1, .94, .07, .14);
  // Carved ground line under the bird.
  relief('shadow', be - .02, .96, .5, .06);
  // Crystal inlay tracing the bird: deep layers run on self-lit minerals, so
  // the rooster still reads when the court has no lamp at all.
  relief('cold-crystal', be + .2, 1.86, .12, .06, true);
  relief('cold-crystal', be - .07, 1.56, .06, .32, true);
  relief('cold-crystal', be - .17, 1.18, .06, .3, true);
  relief('cold-crystal', be - .29, 1.1, .16, .06, true);
  relief('cold-crystal', be - .31, 1.24, .06, .16, true);

  // --- The worn standing pad at the shared stand foot: a raised worn step.
  add('approach', 'paving', 'pale-granite', STAND.east, 0, STAND.north, 1.3, .08, 1.1);
  add('approach', 'paving', 'shadow', STAND.east, .08, STAND.north, 1.04, .015, .84);

  // --- Approach from the street: flagstones with copper studs.
  let step = 0;
  for (let n = -4.25; n > -6.05; n -= .48) {
    const family = step % 3 === 0 ? 'basalt' : step % 3 === 1 ? 'cold-granite' : 'moss-stone';
    add('approach', 'paving', family, be, 0, n + .22, .86, .06, .44);
    if (step % 2 === 0) {
      add('approach', 'prop', 'verdigris', be + .3, .06, n + .22, .1, .03, .1);
      add('approach', 'prop', 'verdigris', be - .3, .06, n + .22, .1, .03, .1);
    }
    step++;
  }
  // Two low kerb stones flanking the approach mouth.
  for (const side of [-1, 1]) {
    add('approach', 'kerb', 'cold-granite', be + side * 1.16, 0, -4.55, .3, .3, .52, true);
  }

  // --- Kerb line across the street side of the court, with a gap on the path.
  let kerb = 0;
  for (let e = 92.2; e < 104.2; e += .78) {
    if (Math.abs(e - be) < 1.6) continue;
    const family = kerb % 3 === 0 ? 'moss-stone' : kerb % 3 === 1 ? 'cold-granite' : 'basalt';
    add('kerb', 'kerb', family, e, 0, -4.3, .62, .28, .42, true);
    kerb++;
  }

  // --- Cold-flame court paving: two concentric rings of square slabs around
  // the fallen statue, skipping the statue footprint and the fire reserve.
  for (const radius of [2.55, 3.75]) {
    for (let k = 0; k < 20; k++) {
      const angle = k * Math.PI * 2 / 20 + (radius > 3 ? Math.PI / 20 : 0);
      const e = STATUE.east + Math.cos(angle) * radius;
      const n = STATUE.north + Math.sin(angle) * radius;
      if (Math.hypot(e - STATUE.east, n - STATUE.north) < 2.2) continue;
      if (Math.abs(e - c2R30RoosterFireReserve.east) < 1.25 &&
        Math.abs(n - c2R30RoosterFireReserve.north) < 1.25) continue;
      const family = k % 4 === 0 ? 'basalt' : k % 4 === 1 ? 'cold-granite' :
        k % 4 === 2 ? 'moss-stone' : 'pale-granite';
      add('court', 'paving', family, e, 0, n, .92, .12, .92);
    }
  }

  // --- Two stools facing the cold flame.
  for (const e of [95.6, 100.6]) {
    add('court', 'seat', 'cold-granite', e, .42, -7.6, .56, .14, .56, true);
    for (const dx of [-1, 1]) for (const dn of [-1, 1]) {
      add('court', 'seat', 'basalt', e + dx * .19, 0, -7.6 + dn * .19, .16, .42, .16, true);
    }
  }

  // --- Fallen banner pole and torn cloth.
  add('court', 'prop', 'iron', 101.6, .16, -8.8, 1.7, .16, .16, true);
  add('court', 'prop', 'verdigris', 100.7, .16, -8.8, .16, .2, .2);
  add('court', 'prop', 'basalt', 102.5, .12, -8.8, .2, .24, .2, true);
  add('court', 'rubble', 'shadow', 101.2, 0, -9.3, .62, .04, .5);
  add('court', 'rubble', 'moss-stone', 100.4, 0, -9.6, .44, .05, .38);

  // --- Moss patches and rubble near the kerb and the reserve.
  for (let i = 0; i < 7; i++) {
    const e = 91.8 + noise(i, 3) * 4.4;
    const n = -5.2 - noise(i, 9) * 1.4;
    if (Math.abs(e - be) < 1.1) continue;
    add('kerb', 'rubble', 'moss-stone', e, 0, n, .3 + noise(i, 5) * .3, .04, .26);
  }
  for (let i = 0; i < 6; i++) {
    const e = 94.4 + noise(i, 17) * 2.4;
    const n = -8.4 - noise(i, 23) * 2.2;
    if (Math.abs(e - c2R30RoosterFireReserve.east) < 1.3 &&
      Math.abs(n - c2R30RoosterFireReserve.north) < 1.3) continue;
    add('court', 'rubble', i % 2 === 0 ? 'basalt' : 'cold-granite',
      e, 0, n, .18 + noise(i, 7) * .2, .12 + noise(i, 11) * .1, .16 + noise(i, 13) * .18);
  }

  // --- Twelve small stones set in the paving around the monolith.
  for (let k = 0; k < 12; k++) {
    const angle = k * Math.PI * 2 / 12 + .26;
    add('stone', 'prop', k % 3 === 0 ? 'moss-stone' : 'cold-granite',
      be + Math.cos(angle) * 1.42, 0, bn + Math.sin(angle) * 1.42, .24, .16, .24);
  }

  // --- Two iron rings on low posts, old hitching gear near the path.
  for (const e of [94.6, 101.4]) {
    add('court', 'prop', 'iron', e, 0, -5.1, .18, .62, .18, true);
    add('court', 'prop', 'verdigris', e, .62, -5.1, .34, .1, .12);
    add('court', 'prop', 'verdigris', e, .5, -5.04, .12, .2, .1);
    add('court', 'prop', 'verdigris', e, .5, -5.16, .12, .2, .1);
  }
  return Object.freeze(parts);
}

export type C2R30RoosterStats = Readonly<{
  coordinateFrame: 'warrior-city-local-east-height-north';
  depth: -165;
  datum: typeof c2R30RoosterFixtureDatum;
  site: C2R30RoosterSite;
  siteCertified: boolean;
  zodiac: typeof c2R30RoosterZodiac;
  pieceCount: number;
  solidCount: number;
  emitterCount: number;
  paletteColorCount: 9;
  paletteCounts: Readonly<Record<C2R30RoosterFamily, number>>;
  roleCounts: Readonly<Record<C2R30RoosterRole, number>>;
  zoneCounts: Readonly<Record<C2R30RoosterZone, number>>;
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

export type C2R30RoosterScene = Readonly<{
  group: Group;
  pieces: readonly C2R30RoosterPiece[];
  colliders: readonly Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>[];
  canStand(e: number, n: number, y?: number, r?: number): boolean;
  stats(): C2R30RoosterStats;
  dispose(): void;
}>;

/**
 * Mount the rooster star-stone court. Hidden by default; a host must pass an
 * explicit certified site. No world anchor, no registration, no real lights.
 */
export function mountTownC2R30RoosterStarStone(options: Readonly<{
  parent?: Group;
  site?: C2R30RoosterSite;
  supportsSite?: (site: C2R30RoosterSite) => boolean;
}> = {}): C2R30RoosterScene {
  const group = new Group();
  group.name = 'town-c2-r30-rooster-star-stone';
  group.userData.coordinateFrame = 'warrior-city-local-east-height-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30RoosterFixtureDatum;
  group.userData.visualOnly = true;
  group.userData.zodiac = c2R30RoosterZodiac;

  const site = options.site ?? c2R30RoosterFixtureSite;
  const certified = site.domainId !== c2R30RoosterFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30RoosterPlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-rooster-unit-box';
  const matrices = new Map<C2R30RoosterFamily, Matrix4[]>();
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
    const emissive = family === 'cold-crystal' || family === 'ember-trace';
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-rooster/${family}`,
      map: texture,
      color: 0xffffff,
      flatShading: true,
      ...(emissive ? { emissive: new Color(c2R30RoosterPalette[family]), emissiveIntensity: .55 } : {}),
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-rooster/${family}`;
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
    const foot = c2R30RoosterFootprint;
    if (![e, n, y, r].every(Number.isFinite) || e - r < foot.minE || e + r > foot.maxE ||
      n - r < foot.minN || n + r > foot.maxN) return false;
    return !footIndex.blocks(e, n, y, r);
  }

  let disposed = false;
  function stats(): C2R30RoosterStats {
    return Object.freeze({
      coordinateFrame: 'warrior-city-local-east-height-north' as const,
      depth: -165 as const,
      datum: c2R30RoosterFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: certified,
      zodiac: c2R30RoosterZodiac,
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

export const buildTownC2R30RoosterStarStone = mountTownC2R30RoosterStarStone;
