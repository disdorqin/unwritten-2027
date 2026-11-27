import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat,
  SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import { createStaticFootIndex } from './town-c-static-foot-index.js';
import {
  secondMineAnchors, secondMineBed, secondMineRiver, type MineRiverState,
} from '../../../src/shared/underground-second-mine-layout.js';
import {
  c2SecondMineBoxAllowed,
} from './town-c2-second-mine-contract.js';

/**
 * C2-R07 -140 second-mine "water terraces and a readable dry bypass".
 *
 * Atlas card U-09 asks for terrain continuity and a readable route under
 * changing water levels. The shipped mine has a sloped gravel bed, a water
 * plane that jumps between two heights and a gravel bypass, but nothing told
 * the player where the water had been, and the dry route had no wayfinding.
 *
 * This module adds the missing read:
 *  - dressed stone terraces on both banks: one flat course per metre of the
 *    slope, with the tread tops taken from the shared bed profile, so the
 *    stair *is* the bank and the bank keeps the authoritative gradient;
 *  - three historical waterline crusts, one per hydrology level, set into the
 *    riser that level drew, so the flood history is legible at a glance;
 *  - a live "current waterline" that rides the riser of the level the host
 *    reports and moves with it - a local visual state only;
 *  - a flood-lip course of stones along the top of each bank;
 *  - wayfinding for the dry bypass: a flush paving line, a guide rope, two
 *    unlettered sign boards and seven marker cairns.
 *
 * Placement rules:
 *  - the terraces live on the bank slope inside the river, because that is
 *    the only place where a waterline can honestly be read. They never rise
 *    above the bank, so they never block the ferry, the navigable bed or the
 *    shared pier landings, and they carry no collider: the shared bed stays
 *    the walkable surface when the water is low.
 *  - everything that stands on land follows the shared second-mine contract
 *    guard, so the mine route, the pier landings, the door strips and the
 *    reserved camps keep their clearance.
 *  - the bypass props keep clear of the shared west wall face (E48.235), the
 *    wall-foot chips, the shared railings (E48.38 over the river stretch)
 *    and the gravel route centre line, so the corridor stays readable.
 *
 * The hydrology authority stays where it is: this module never invents a
 * level, never moves the player, never opens the ferry and never claims a
 * world anchor, registration, loot or presence. Coordinates are local -140
 * ENY metres (x=east, y=height above the mine floor datum, z=-north).
 */

export type C2R30TerraceFamily =
  | 'silt-stone' | 'wet-stone' | 'dry-stone' | 'gravel' | 'timber'
  | 'dark-timber' | 'iron' | 'rope' | 'moon-shine';
export type C2R30TerraceRole =
  | 'levee' | 'crest' | 'stain' | 'waterline' | 'cairn' | 'post' | 'rope'
  | 'sign' | 'scree' | 'mark';
export type C2R30TerraceZone =
  | 'near-bank' | 'far-bank' | 'channel' | 'bypass';
export type C2R30TerraceLevel = 'high' | 'middle' | 'low';

export type C2R30TerracePiece = Readonly<{
  id: string;
  zone: C2R30TerraceZone;
  role: C2R30TerraceRole;
  family: C2R30TerraceFamily;
  e: number;
  y: number;
  n: number;
  w: number;
  h: number;
  d: number;
  solid: boolean;
  emitter: boolean;
  level?: C2R30TerraceLevel;
}>;

export type C2R30TerraceSite = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
}>;

export const c2R30TerraceFixtureSite: C2R30TerraceSite = Object.freeze({
  domainId: 'fixture:c2-r30:minus140:second-mine:river-terrace',
  east: 0,
  north: 0,
  height: 0,
  yaw: 0,
});

export const c2R30TerraceFootprint = Object.freeze({
  minE: -46, maxE: 54, minN: 112, maxN: 162,
});

export const c2R30TerraceFixtureDatum = Object.freeze({
  id: 'c2-r30/minus140/second-mine/river-terrace',
  layer: -140 as const,
  coordinateFrame: 'second-mine-local-east-up-north' as const,
  placementKind: 'visual/fixture datum' as const,
  worldAnchor: false as const,
  registration: 'requires-explicit-host-certification; not-a-C-world-anchor' as const,
  footprint: c2R30TerraceFootprint,
});

/** The three water heights the mine hydrology uses, in local metres. */
export const c2R30TerraceWaterLevels = Object.freeze({
  high: -.025,
  middle: -.24,
  low: -.7,
} as const satisfies Readonly<Record<MineRiverState, number>>);

/**
 * Length of the bank slope, measured from the shared bed function so the
 * terraces can never drift away from the authoritative river profile.
 */
const SLOPE_RUN = (() => {
  for (let d = 0; d <= 8; d += .01) {
    if (Math.abs(secondMineBed(secondMineRiver.n0 + d) - secondMineRiver.bed) < 1e-6) return d;
  }
  return 4;
})();

/** The slope is a straight ramp, so one course drops by this much per metre. */
const COURSE_DROP = Math.abs(secondMineRiver.bed) / SLOPE_RUN;

/** Number of dressed terrace courses on each bank. */
const COURSES = Math.round(SLOPE_RUN);

/** The bank top: the level the shared shore floor sits at. */
const BANK_TOP = 0;

/**
 * The ferry runs along x = 0 and the shared pier landings reach 5 m either
 * side of it. A piece may only enter that lane by its outer edge, so the
 * clearance is measured on the box extent and matches the shared contract's
 * `5 + clearance` pier band exactly.
 */
const FERRY_LANE_HALF = 5.45;

/** Does a box of width `w` centred at `e` stay out of the ferry lane? */
function clearsFerryLane(e: number, w: number) {
  return Math.abs(e) - w / 2 >= FERRY_LANE_HALF;
}

/** Shared piers that must stay clear for the ferry. */
const PIERS = Object.freeze([
  secondMineAnchors.nearPier,
  secondMineAnchors.farPier,
] as const);

/**
 * Tread top of terrace course `step`, counted from the bank edge towards the
 * middle of the river. The shore-side course is flush with the bank, then
 * every metre drops by one course.
 */
function treadTop(step: number) {
  return BANK_TOP - step * COURSE_DROP;
}

/**
 * Which terrace riser carries a given water level and where that riser
 * stands. The riser is the vertical face between two treads.
 */
export function c2R30TerraceRiser(level: number) {
  const clamped = Math.min(BANK_TOP, Math.max(secondMineRiver.bed, level));
  let step = 0;
  while (step < COURSES - 1 && clamped < treadTop(step + 1)) step++;
  const upper = treadTop(step), lower = treadTop(step + 1);
  const y = Math.min(upper - .03, Math.max(lower + .03, clamped));
  return Object.freeze({
    step,
    y,
    nearNorth: secondMineRiver.n0 + step + 1,
    farNorth: secondMineRiver.n1 - step - 1,
  });
}

/**
 * North position of the waterline contour of a level on the raw bed, taken
 * from the shared bed function. Informational only: the dressed terraces put
 * the readable mark on the riser that the level actually drew.
 */
export function c2R30TerraceContour(level: C2R30TerraceLevel) {
  const height = c2R30TerraceWaterLevels[level];
  const contour = (from: number, to: number) => {
    for (let d = 0; d <= SLOPE_RUN; d += .01) {
      if (Math.abs(secondMineBed(from + d) - height) < 1e-6) return from + d;
    }
    return to;
  };
  return Object.freeze({
    near: contour(secondMineRiver.n0, secondMineRiver.n0 + SLOPE_RUN),
    far: contour(secondMineRiver.n1, secondMineRiver.n1 - SLOPE_RUN),
  });
}

export const c2R30TerracePalette = Object.freeze({
  'silt-stone': 0x565a61,
  'wet-stone': 0x444c52,
  'dry-stone': 0x7b7669,
  gravel: 0x635f57,
  timber: 0x76593b,
  'dark-timber': 0x4b3828,
  iron: 0x3f464e,
  rope: 0x96855f,
  'moon-shine': 0x9fd6e0,
} as const satisfies Readonly<Record<C2R30TerraceFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30TerracePalette) as C2R30TerraceFamily[]);
const roleOrder: readonly C2R30TerraceRole[] = [
  'levee', 'crest', 'stain', 'waterline', 'cairn', 'post', 'rope', 'sign', 'scree', 'mark',
];
const zoneOrder: readonly C2R30TerraceZone[] = [
  'near-bank', 'far-bank', 'channel', 'bypass',
];

/** The dry bypass centre line, straight from the shared anchor table. */
const BYPASS_X = 51.5;

/** Near / far bank slope band of the river. */
function inSlopeBand(n: number, d: number) {
  const n0 = secondMineRiver.n0, n1 = secondMineRiver.n1;
  const near = n + d / 2 > n0 - .4 && n - d / 2 < n0 + SLOPE_RUN + .4;
  const far = n + d / 2 > n1 - SLOPE_RUN - .4 && n - d / 2 < n1 + .4;
  return near || far;
}

/**
 * Placement guard. The terrace courses live inside the river because that is
 * where a waterline can honestly be read; they are held to a tighter rule
 * than the rest of the mine: never above the bank, clear of the ferry lane,
 * never solid and never blocking a shared pier.
 */
export function c2R30TerraceBoxAllowed(piece: C2R30TerracePiece) {
  if (![piece.e, piece.y, piece.n, piece.w, piece.h, piece.d].every(Number.isFinite) ||
    piece.w <= 0 || piece.h <= 0 || piece.d <= 0) return false;
  const foot = c2R30TerraceFootprint;
  if (piece.e - piece.w / 2 < foot.minE - 1e-6 ||
    piece.e + piece.w / 2 > foot.maxE + 1e-6 ||
    piece.n - piece.d / 2 < foot.minN - 1e-6 ||
    piece.n + piece.d / 2 > foot.maxN + 1e-6) return false;
  if (piece.y < -1.1 || piece.y + piece.h > 3.2) return false;

  if (piece.role === 'levee' || piece.role === 'crest' || piece.role === 'scree') {
    if (!inSlopeBand(piece.n, piece.d)) return false;
    if (!clearsFerryLane(piece.e, piece.w)) return false;
    // The shared bed stays the walkable surface, so bank dressing is never
    // a collider and never rises above the bank itself.
    if (piece.solid) return false;
    const ceiling = piece.role === 'scree' ? BANK_TOP + .3 :
      piece.role === 'crest' ? BANK_TOP + .22 : BANK_TOP + .02;
    if (piece.y + piece.h > ceiling) return false;
    for (const pier of PIERS) {
      const dx = Math.max(0, Math.abs(piece.e - pier.east) - piece.w / 2);
      const dn = Math.max(0, Math.abs(piece.n - pier.north) - piece.d / 2);
      if (Math.hypot(dx, dn) < 2.4) return false;
    }
    return true;
  }

  if (piece.role === 'stain') {
    // Historic waterline crust: a low band set into the riser of one level.
    if (piece.level === undefined) return false;
    if (piece.solid) return false;
    if (piece.h > .12) return false;
    if (!clearsFerryLane(piece.e, piece.w)) return false;
    const height = c2R30TerraceWaterLevels[piece.level];
    const riser = c2R30TerraceRiser(height);
    if (Math.abs(piece.y + piece.h / 2 - riser.y) > .09) return false;
    const near = Math.abs(piece.n - riser.nearNorth) < .4;
    const far = Math.abs(piece.n - riser.farNorth) < .4;
    if (!near && !far) return false;
    if (piece.e - piece.w / 2 < secondMineRiver.x0 + .2 ||
      piece.e + piece.w / 2 > secondMineRiver.x1 - .2) return false;
    return true;
  }

  // Everything that stands on land follows the shared second-mine contract.
  return c2SecondMineBoxAllowed({
    x: piece.e, y: piece.y, n: piece.n, w: piece.w, h: piece.h, d: piece.d,
  });
}

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pixelTexture(family: C2R30TerraceFamily) {
  const size = 16, pixels = new Uint8Array(size * size * 4);
  const base = c2R30TerracePalette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let color = base;
    const grain = (Math.imul(x + 23, 15731) ^ Math.imul(y + 41, 4817)) >>> 0;
    if (family === 'silt-stone' || family === 'wet-stone' || family === 'dry-stone') {
      const course = Math.floor(y / 4), shiftedX = x + (course % 2) * 4;
      const joint = y % 4 === 0 || shiftedX % 8 === 0;
      const facet = (Math.floor(x / 4) * 3 + Math.floor(y / 4)) % 5;
      color = joint ? c2R30TerracePalette.gravel :
        facet === 0 ? c2R30TerracePalette['wet-stone'] :
          grain % 19 < 3 ? c2R30TerracePalette['dry-stone'] : base;
    } else if (family === 'gravel') {
      color = grain % 6 === 0 ? c2R30TerracePalette['wet-stone'] :
        grain % 9 === 0 ? c2R30TerracePalette['silt-stone'] : base;
    } else if (family === 'timber' || family === 'dark-timber') {
      const grainLine = (x + Math.floor(y / 5) * 3) % 7;
      color = grainLine === 0 ? c2R30TerracePalette.gravel :
        grainLine === 1 ? c2R30TerracePalette['wet-stone'] : base;
    } else if (family === 'iron') {
      color = y % 6 === 5 ? c2R30TerracePalette.gravel :
        grain % 11 < 3 ? c2R30TerracePalette['silt-stone'] : base;
    } else if (family === 'rope') {
      color = (x + y) % 5 === 0 ? c2R30TerracePalette.gravel : base;
    } else if (family === 'moon-shine') {
      color = grain % 7 === 0 ? c2R30TerracePalette['wet-stone'] : base;
    } else {
      color = grain % 13 < 3 ? c2R30TerracePalette.gravel : base;
    }
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = `town-c2-r30-terrace/${family}-9colour-16px`;
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
export function c2R30TerracePlan(): readonly C2R30TerracePiece[] {
  const parts: C2R30TerracePiece[] = [];
  function add(zone: C2R30TerraceZone, role: C2R30TerraceRole, family: C2R30TerraceFamily,
    e: number, y: number, n: number, w: number, h: number, d: number,
    solid = false, emitter = false, level?: C2R30TerraceLevel) {
    const piece = Object.freeze({
      id: `${zone}/${role}/${family}/${parts.length}`,
      zone, role, family, e, y, n, w, h, d, solid, emitter, level,
    });
    if (!c2R30TerraceBoxAllowed(piece)) {
      throw new RangeError(`C2 R30 terrace rejected ${piece.id}: ${JSON.stringify(piece)}`);
    }
    parts.push(piece);
  }

  const n0 = secondMineRiver.n0, n1 = secondMineRiver.n1;

  // --- Dressed bank terraces. One flat course per metre of slope, the tread
  // tops taken from the shared bed so the stair *is* the bank.
  for (const side of ['near', 'far'] as const) {
    const zone = side === 'near' ? 'near-bank' : 'far-bank';
    for (let column = 0; column < 42; column++) {
      const e = -44 + column * 2.15 + (column % 2) * .07;
      if (!clearsFerryLane(e, 1.98)) continue;
      for (let step = 0; step < COURSES; step++) {
        const top = treadTop(step);
        const n = side === 'near' ? n0 + step + .5 : n1 - step - .5;
        // One metre deep per course, so the four courses tile exactly the
        // four metre slope run the shared bed function describes and the
        // risers butt against each other without a slot.
        add(zone, 'levee', step % 2 === 0 ? 'silt-stone' : 'dry-stone',
          e, -.95, n, 1.98, top + .95, 1);
      }
    }
  }

  // --- Flood-lip stones along the top edge of each bank: the line the
  // highest water topped out at.
  for (const side of ['near', 'far'] as const) {
    const zone = side === 'near' ? 'near-bank' : 'far-bank';
    for (let index = 0; index < 44; index++) {
      const e = -45 + index * 2.06 + (index % 3) * .12;
      const width = 1.1 + noise(index, 7) * .5;
      if (!clearsFerryLane(e, width)) continue;
      const n = side === 'near' ? n0 + .3 : n1 - .3;
      // A lip stone has to stand proud of the bank or the flood line reads as
      // nothing; 10-16 cm stays inside the shared step tolerance.
      const height = .1 + noise(index, side === 'near' ? 3 : 5) * .06;
      // Sits on the top tread, so it starts just above that face: no
      // coplanar z-fight with the dressed course underneath.
      add(zone, 'crest', index % 3 === 0 ? 'dry-stone' : 'silt-stone',
        e, .002, n, width, height, .34);
    }
  }

  // --- Historic waterline crusts: one band per hydrology level, set into the
  // riser that level drew, so the flood history is readable. The value ladder
  // runs bright at the top: the highest band carries a moon-shine mineral
  // seam, the middle band is pale dry stone, the lowest band is cold silt.
  for (const level of ['high', 'middle', 'low'] as const) {
    const height = c2R30TerraceWaterLevels[level];
    const riser = c2R30TerraceRiser(height);
    for (const side of ['near', 'far'] as const) {
      // The crust hugs the riser face: it sits just proud of the step edge,
      // on the water side, so it never fights the face it marks.
      const n = side === 'near' ? riser.nearNorth + .025 : riser.farNorth - .025;
      for (let segment = 0; segment < 24; segment++) {
        const e = -44 + segment * 3.75 + (segment % 2) * .2;
        if (!clearsFerryLane(e, 3.2)) continue;
        const seam = level === 'high' && segment % 2 === 0;
        const family: C2R30TerraceFamily = seam ? 'moon-shine' :
          level === 'high' ? 'wet-stone' : level === 'middle' ? 'dry-stone' : 'silt-stone';
        add('channel', 'stain', family,
          e, riser.y - .045, n, 3.2, .09, .06, false, seam, level);
      }
    }
  }

  // --- Loose scree on the treads, so the terraces do not end too neatly.
  for (let index = 0; index < 44; index++) {
    const side = index % 2 === 0 ? 'near' : 'far';
    const zone = side === 'near' ? 'near-bank' : 'far-bank';
    const e = -45 + noise(index, 11) * 90;
    const width = .34 + noise(index, 17) * .4;
    if (!clearsFerryLane(e, width)) continue;
    const step = Math.floor(noise(index, 13) * COURSES);
    const top = treadTop(step);
    const n = side === 'near' ? n0 + step + .5 : n1 - step - .5;
    // Resting on the tread, lifted by a hair so the loose stones never fight
    // the dressed face they sit on.
    add(zone, 'scree', index % 3 === 0 ? 'dry-stone' : 'gravel',
      e, top + .002, n, width, .08 + noise(index, 19) * .1, .3 + noise(index, 23) * .3);
  }

  // --- Dry bypass wayfinding. The shared wall, the west railings over the
  // river stretch and the east railing along the whole corridor decide where
  // anything can stand: a dressed kerb course runs along the west shoulder of
  // the gravel route, the guide rope hangs on the wall only where that wall
  // has no railing and no shared route crossing, and the two unlettered sign
  // boards stand clear of both wall and rails.
  for (let index = 0; index < 20; index++) {
    const n = 117.5 + index * 2.05;
    add('bypass', 'mark', index % 4 === 0 ? 'silt-stone' : 'dry-stone',
      50.15, .045, n, .85, .06, 1.3);
  }
  for (const [start, count] of [[115, 6], [148, 5]] as const) {
    for (let index = 0; index < count; index++) {
      const n = start + index * 2;
      add('bypass', 'rope', 'rope', 48.32, .9, n, .12, .12, 2.02);
      if (index % 3 === 0) {
        add('bypass', 'post', 'iron', 48.38, .86, n, .14, .12, .14);
      }
    }
  }
  // Two unlettered sign boards: a cantilever board off the west wall whose
  // face is square to the corridor, so a walker reads it head on instead of
  // edge on. It hangs above the guide rope, so the two never fight, and it
  // stands between the cairn groups so the props read as one line.
  for (const n of [117, 151]) {
    add('bypass', 'post', 'dark-timber', 49.25, 0, n, .16, 1.35, .16, true);
    add('bypass', 'sign', 'timber', 48.72, 1.2, n, .92, .55, .08, true);
    add('bypass', 'sign', 'dark-timber', 48.72, 1.26, n - .06, .66, .36, .03, true);
    add('bypass', 'sign', 'timber', 48.4, 1.34, n - .09, .18, .22, .04);
  }
  // Seven marker cairns, set along the west shoulder of the gravel route so
  // the dry line keeps a rhythm even where the rope stops. The shared route
  // turns north at N159, so the last cairn stays south of that corner.
  for (const n of [115.5, 118.5, 121.5, 124.5, 149.5, 152.5, 155.5]) {
    for (let stone = 0; stone < 4; stone++) {
      const width = .5 - stone * .09;
      add('bypass', 'cairn', stone % 2 === 0 ? 'dry-stone' : 'silt-stone',
        49.3, stone * .15, n + (stone % 2) * .07, width, .15, width * .92, true);
    }
  }
  // A marker post where the entry gallery turns into the bypass.
  add('bypass', 'post', 'dark-timber', 52.9, 0, 113.2, .16, 1.1, .16, true);
  add('bypass', 'post', 'iron', 52.9, 1.05, 113.2, .2, .1, .2);

  return Object.freeze(parts);
}

export type C2R30TerraceStats = Readonly<{
  coordinateFrame: 'second-mine-local-east-up-north';
  depth: -140;
  datum: typeof c2R30TerraceFixtureDatum;
  site: C2R30TerraceSite;
  siteCertified: boolean;
  waterState: MineRiverState;
  waterLevel: number;
  waterRiser: Readonly<{ step: number; y: number; nearNorth: number; farNorth: number }>;
  pieceCount: number;
  solidCount: number;
  emitterCount: number;
  paletteColorCount: 9;
  paletteCounts: Readonly<Record<C2R30TerraceFamily, number>>;
  roleCounts: Readonly<Record<C2R30TerraceRole, number>>;
  zoneCounts: Readonly<Record<C2R30TerraceZone, number>>;
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

export type C2R30TerraceScene = Readonly<{
  group: Group;
  pieces: readonly C2R30TerracePiece[];
  colliders: readonly Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>[];
  canStand(e: number, n: number, y?: number, r?: number): boolean;
  setWaterState(state: MineRiverState): C2R30TerraceStats;
  stats(): C2R30TerraceStats;
  dispose(): void;
}>;

/**
 * Mount the terraces, waterlines and bypass marks. Hidden by default; a host
 * must pass an explicit certified site. The hydrology state only moves the
 * live waterline strip - it never moves the player or the ferry.
 */
export function mountTownC2R30RiverTerrace(options: Readonly<{
  parent?: Group;
  site?: C2R30TerraceSite;
  supportsSite?: (site: C2R30TerraceSite) => boolean;
  readWaterState?: () => MineRiverState;
}> = {}): C2R30TerraceScene {
  const group = new Group();
  group.name = 'town-c2-r30-river-terrace';
  group.userData.coordinateFrame = 'second-mine-local-east-up-north';
  group.userData.worldAnchor = false;
  group.userData.datum = c2R30TerraceFixtureDatum;
  group.userData.visualOnly = true;

  const site = options.site ?? c2R30TerraceFixtureSite;
  const certified = site.domainId !== c2R30TerraceFixtureSite.domainId &&
    options.supportsSite?.(site) === true;
  group.userData.site = site;
  group.userData.siteCertified = certified;
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = certified;

  const pieces = c2R30TerracePlan();
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-terrace-unit-box';
  const matrices = new Map<C2R30TerraceFamily, Matrix4[]>();
  const matrix = new Matrix4(), pose = new Object3D();
  for (const family of familyOrder) matrices.set(family, []);
  for (const piece of pieces) {
    // `y` is the bottom of the piece, exactly as the collider and the guard
    // use it, so the visible box and the collision box share one source.
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
    const emissive = family === 'moon-shine';
    const material = new MeshLambertMaterial({
      name: `town-c2-r30-terrace/${family}`,
      map: texture,
      color: 0xffffff,
      flatShading: true,
      ...(emissive ? { emissive: new Color(c2R30TerracePalette[family]), emissiveIntensity: .55 } : {}),
    });
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `town-c2-r30-terrace/${family}`;
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

  // Live waterline: the only part that reacts to the reported level. It
  // rides the riser of that level on both banks, on the water side of the
  // riser, so it always marks the edge of the water the host says is there.
  const shine = new MeshLambertMaterial({
    name: 'town-c2-r30-terrace/live-waterline',
    map: pixelTexture('moon-shine'),
    color: 0xffffff,
    flatShading: true,
    emissive: new Color(c2R30TerracePalette['moon-shine']),
    emissiveIntensity: .7,
  });
  // The live line shares the crust segment layout, so it overlays the
  // historic band of the level it reports instead of floating beside it.
  const liveSegments: number[] = [];
  for (let segment = 0; segment < 24; segment++) {
    const e = -44 + segment * 3.75 + (segment % 2) * .2;
    if (!clearsFerryLane(e, 3.1)) continue;
    liveSegments.push(e);
  }
  const liveWaterline = new InstancedMesh(geometry, shine, liveSegments.length * 2);
  liveWaterline.name = 'town-c2-r30-terrace/live-waterline';
  liveWaterline.userData.visualOnly = true;
  group.add(liveWaterline);
  meshes.push(liveWaterline);
  materials.push(shine);
  textures.push(shine.map as DataTexture);

  const solidPieces = pieces.filter(piece => piece.solid);
  const colliders = solidPieces.map(piece => ({
    min: [piece.e - piece.w / 2, piece.y, -piece.n - piece.d / 2] as const,
    max: [piece.e + piece.w / 2, piece.y + piece.h, -piece.n + piece.d / 2] as const,
  }));
  const footIndex = createStaticFootIndex(colliders);

  function canStand(e: number, n: number, y = 0, r = .27) {
    const foot = c2R30TerraceFootprint;
    if (![e, n, y, r].every(Number.isFinite) || e - r < foot.minE || e + r > foot.maxE ||
      n - r < foot.minN || n + r > foot.maxN) return false;
    return !footIndex.blocks(e, n, y, r);
  }

  let waterState: MineRiverState = options.readWaterState?.() ?? 'middle';
  function applyWaterline(state: MineRiverState) {
    const level = c2R30TerraceWaterLevels[state];
    const riser = c2R30TerraceRiser(level);
    for (let index = 0; index < liveSegments.length * 2; index++) {
      const near = index < liveSegments.length;
      const e = liveSegments[index % liveSegments.length]!;
      // The water lies north of the near riser and south of the far one, so
      // the live line floats just clear of the crust it rides on.
      const n = near ? riser.nearNorth + .09 : riser.farNorth - .09;
      pose.position.set(e, riser.y, -n);
      pose.rotation.set(0, 0, 0);
      pose.scale.set(3.1, .05, .06);
      pose.updateMatrix();
      liveWaterline.setMatrixAt(index, pose.matrix);
    }
    liveWaterline.instanceMatrix.needsUpdate = true;
    liveWaterline.computeBoundingSphere();
    group.userData.waterState = state;
    group.userData.waterLevel = level;
    group.userData.waterRiser = riser;
  }
  applyWaterline(waterState);

  let disposed = false;
  function stats(): C2R30TerraceStats {
    return Object.freeze({
      coordinateFrame: 'second-mine-local-east-up-north' as const,
      depth: -140 as const,
      datum: c2R30TerraceFixtureDatum,
      site: Object.freeze({ ...site }),
      siteCertified: certified,
      waterState,
      waterLevel: c2R30TerraceWaterLevels[waterState],
      waterRiser: c2R30TerraceRiser(c2R30TerraceWaterLevels[waterState]),
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

  function setWaterState(state: MineRiverState): C2R30TerraceStats {
    if (state !== 'low' && state !== 'middle' && state !== 'high') {
      throw new RangeError(`C2 R30 unknown water state: ${String(state)}`);
    }
    if (disposed || state === waterState) return stats();
    waterState = state;
    applyWaterline(state);
    group.userData.stats = stats();
    return stats();
  }

  options.parent?.add(group);
  return Object.freeze({
    group, pieces, colliders, canStand, setWaterState, stats,
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

export const buildTownC2R30RiverTerrace = mountTownC2R30RiverTerrace;
