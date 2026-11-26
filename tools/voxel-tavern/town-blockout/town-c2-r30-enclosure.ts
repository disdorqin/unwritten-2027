import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial,
  NearestFilter, RGBAFormat, SRGBColorSpace, StaticDrawUsage, UnsignedByteType,
} from 'three';
import {
  secondMineAnchors, secondMineRiver,
} from '../../../src/shared/underground-second-mine-layout.js';
import { secondMineDrySites } from '../../../src/shared/underground-second-mine-dry-wings.js';
import {
  c2SecondMineBoxAllowed, c2SecondMineBounds, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';
import { c2R30DeepMouths, type C2R30DeepMouth } from './town-c2-r30-deep-mouths.js';

export type C2R30EnclosureRole = 'floor' | 'wall' | 'ceiling' | 'rail' | 'post' | 'portal';
export type C2R30EnclosureFamily =
  | 'basalt' | 'granite' | 'shale' | 'gravel' | 'iron' | 'rust'
  | 'wood' | 'wet-stone' | 'moss';

export type C2R30EnclosurePart = C2SecondMineBox & Readonly<{
  id: string;
  segment: string;
  role: C2R30EnclosureRole;
  family: C2R30EnclosureFamily;
}>;

export type C2R30EnclosureRoom = Readonly<{
  id: string;
  x0: number; x1: number; n0: number; n1: number;
  ceiling: number;
  floor: boolean;
}>;

export type C2R30EnclosureWall = Readonly<{
  id: string;
  axis: 'x' | 'n';
  fixed: number;
  start: number;
  end: number;
  ceiling: number;
  thickness: number;
  bottom?: number;
}>;

export type C2R30EnclosureStats = Readonly<{
  pieceCount: number;
  colliderCount: number;
  visiblePieceCount: number;
  drawCount: number;
  triangles: number;
  textureSize: 32;
  textureFilter: 'nearest';
  shading: 'lambert';
  paletteColorCount: 9;
  paletteCounts: Readonly<Record<C2R30EnclosureFamily, number>>;
  roleCounts: Readonly<Record<C2R30EnclosureRole, number>>;
  roomCount: number;
  wallRunCount: number;
  westRailSegmentCount: number;
  staticMatrices: true;
  floorChanges: 0;
  rewards: 0;
  disposed: boolean;
}>;

export type C2R30EnclosureRoofRect = Readonly<{ minE: number; maxE: number; minN: number; maxN: number }>;
export type C2R30EnclosureOptions = Readonly<{
  entryRoofPieces?: readonly C2R30EnclosureRoofRect[];
  entryRoofOpening?: C2R30EnclosureRoofRect;
}>;
export type C2R30EnclosureScene = Readonly<{
  group: Group;
  boxes: readonly C2R30EnclosurePart[];
  colliders: readonly C2R30EnclosurePart[];
  acceptsMouth(mouth: C2R30DeepMouth): boolean;
  stats(): C2R30EnclosureStats;
  dispose(): void;
}>;

/** Nine pigment colours are carried by instance colour, leaving one Lambert draw. */
export const c2R30EnclosurePalette = Object.freeze({
  basalt: 0x343d46,
  granite: 0x657078,
  shale: 0x49545a,
  gravel: 0x787a70,
  iron: 0x596a73,
  rust: 0x8b573b,
  wood: 0x765437,
  'wet-stone': 0x3d5355,
  moss: 0x59654b,
} as const satisfies Readonly<Record<C2R30EnclosureFamily, number>>);

const familyOrder = Object.freeze(Object.keys(c2R30EnclosurePalette) as C2R30EnclosureFamily[]);
const roleOrder: readonly C2R30EnclosureRole[] = [
  'floor', 'wall', 'ceiling', 'rail', 'post', 'portal',
];

/** Surveyed main hall only. Existing river/bed and wing dressing remain authoritative elsewhere. */
export const c2R30EnclosureRooms: readonly C2R30EnclosureRoom[] = Object.freeze([
  Object.freeze({ id: 'entry', x0: -6, x1: 6, n0: 0, n1: 24, ceiling: 5, floor: true }),
  Object.freeze({ id: 'iron-gallery', x0: -4, x1: 4, n0: 24, n1: 96, ceiling: 4.5, floor: true }),
  Object.freeze({ id: 'near-shore', x0: -48, x1: 48, n0: 96, n1: 128, ceiling: 12, floor: true }),
  Object.freeze({ id: 'dark-river', x0: -48, x1: 48, n0: 128, n1: 146, ceiling: 12, floor: false }),
  Object.freeze({ id: 'far-shore', x0: -48, x1: 48, n0: 146, n1: 182, ceiling: 12, floor: true }),
  Object.freeze({ id: 'dry-bypass', x0: 48, x1: 55, n0: 112, n1: 164, ceiling: 7, floor: true }),
  Object.freeze({ id: 'exit', x0: -6, x1: 6, n0: 182, n1: 198, ceiling: 5, floor: true }),
]);

/**
 * Wall centre-lines include the small outward foundation offset. Openings are
 * explicit runs, not invisible collision walls across a surveyed doorway.
 */
export const c2R30EnclosureWalls: readonly C2R30EnclosureWall[] = Object.freeze([
  { id: 'entry-west', axis: 'x', fixed: -6.32, start: 0, end: 24, ceiling: 5, thickness: .64 },
  { id: 'entry-east', axis: 'x', fixed: 6.32, start: 0, end: 24, ceiling: 5, thickness: .64 },
  { id: 'entry-mouth', axis: 'n', fixed: .32, start: -6, end: 6, ceiling: 5, thickness: .64 },
  { id: 'entry-gallery-jamb-west', axis: 'n', fixed: 24.32, start: -6, end: -4, ceiling: 5, thickness: .64 },
  { id: 'entry-gallery-jamb-east', axis: 'n', fixed: 24.32, start: 4, end: 6, ceiling: 5, thickness: .64 },
  { id: 'gallery-west-south', axis: 'x', fixed: -4.32, start: 24, end: 37.5, ceiling: 4.5, thickness: .64 },
  { id: 'gallery-west-north', axis: 'x', fixed: -4.32, start: 56.5, end: 96, ceiling: 4.5, thickness: .64 },
  { id: 'gallery-east-south', axis: 'x', fixed: 4.32, start: 24, end: 67.5, ceiling: 4.5, thickness: .64 },
  { id: 'gallery-east-north', axis: 'x', fixed: 4.32, start: 90.5, end: 96, ceiling: 4.5, thickness: .64 },
  { id: 'near-south-west', axis: 'n', fixed: 96.32, start: -48, end: -4, ceiling: 12, thickness: .64 },
  { id: 'near-south-east', axis: 'n', fixed: 96.32, start: 4, end: 48, ceiling: 12, thickness: .64 },
  { id: 'near-west', axis: 'x', fixed: -48.72, start: 96, end: 128, ceiling: 12, thickness: .5 },
  { id: 'river-west', axis: 'x', fixed: -48.72, start: 128, end: 146, ceiling: 12, thickness: .5 },
  { id: 'river-east', axis: 'x', fixed: 48.72, start: 128, end: 146, ceiling: 12, thickness: .5 },
  { id: 'near-east-south', axis: 'x', fixed: 48.72, start: 96, end: 110.8, ceiling: 12, thickness: .5 },
  { id: 'bypass-west-north', axis: 'x', fixed: 48.72, start: 114.4, end: 128, ceiling: 7, thickness: .5 },
  { id: 'bypass-west-south', axis: 'x', fixed: 48.72, start: 146, end: 157.6, ceiling: 7, thickness: .5 },
  { id: 'bypass-east', axis: 'x', fixed: 55.32, start: 112, end: 164, ceiling: 7, thickness: .64 },
  { id: 'far-west-south', axis: 'x', fixed: -48.72, start: 146, end: 160.8, ceiling: 12, thickness: .5 },
  { id: 'far-west-north', axis: 'x', fixed: -48.72, start: 180.8, end: 182, ceiling: 12, thickness: .5 },
  { id: 'far-east', axis: 'x', fixed: 48.72, start: 146, end: 156.8, ceiling: 12, thickness: .5 },
  { id: 'far-north-west', axis: 'n', fixed: 181.68, start: -48, end: -6, ceiling: 12, thickness: .64 },
  { id: 'far-north-east', axis: 'n', fixed: 181.68, start: 6, end: 47, ceiling: 12, thickness: .64 },
  { id: 'exit-west', axis: 'x', fixed: -6.32, start: 182, end: 198, ceiling: 5, thickness: .64 },
  { id: 'exit-east', axis: 'x', fixed: 6.32, start: 182, end: 198, ceiling: 5, thickness: .64 },
  { id: 'exit-mouth-west', axis: 'n', fixed: 197.68, start: -6, end: -1.7, ceiling: 5, thickness: .64 },
  { id: 'exit-mouth-east', axis: 'n', fixed: 197.68, start: 1.7, end: 6, ceiling: 5, thickness: .64 },
  { id: 'exit-mouth-lintel', axis: 'n', fixed: 197.68, start: -1.7, end: 1.7,
    bottom: 3.24, ceiling: 5.52, thickness: .64 },
]);

export const c2R30EnclosureDeepMouth = c2R30DeepMouths['minus140-to-minus165'].from;

export const c2R30EnclosureWestRailSegments = Object.freeze([
  Object.freeze({ id: 'bypass-west-north-rail', x: 49.05, n0: 114.6, n1: 127.6, postSpacing: 3.2 }),
  Object.freeze({ id: 'bypass-west-south-rail', x: 49.05, n0: 146.4, n1: 157.4, postSpacing: 3.2 }),
] as const);

const doorStrips = Object.freeze([
  { id: 'west-workface-door', x: -4.32, n0: 38, n1: 56, ceiling: 6.3 },
  { id: 'east-workface-door', x: 4.32, n0: 68, n1: 90, ceiling: 7 },
  { id: 'collapse-door', x: -48.72, n0: 162, n1: 180, ceiling: 8 },
  { id: 'barracks-door', x: 48.72, n0: 166, n1: 182, ceiling: 7 },
  { id: 'bypass-north-mouth', x: 48.72, n0: 112, n1: 114.4, ceiling: 7 },
  { id: 'bypass-south-mouth', x: 48.72, n0: 157.6, n1: 164, ceiling: 7 },
] as const);

const route: readonly (readonly [number, number])[] = Object.freeze([
  [secondMineAnchors.entry.east, secondMineAnchors.entry.north],
  [0, 112],
  ...secondMineAnchors.bypass.map(point => [point.east, point.north] as const),
  [secondMineAnchors.exit.east, secondMineAnchors.exit.north],
]);

function hash(...values: readonly number[]) {
  let value = 2166136261;
  for (const item of values) value = Math.imul(value ^ Math.round(item * 100), 16777619);
  return value >>> 0;
}
const noise = (...values: readonly number[]) => hash(...values) / 0x1_0000_0000;

function pointBoxDistance(x: number, n: number, box: C2SecondMineBox) {
  const dx = Math.max(box.x - box.w / 2 - x, 0, x - box.x - box.w / 2);
  const dn = Math.max(box.n - box.d / 2 - n, 0, n - box.n - box.d / 2);
  return Math.hypot(dx, dn);
}

function segmentPointDistance(a: readonly [number, number], b: readonly [number, number],
  x: number, n: number) {
  const dx = b[0] - a[0], dn = b[1] - a[1];
  const length = dx * dx + dn * dn;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1,
    ((x - a[0]) * dx + (n - a[1]) * dn) / length));
  return Math.hypot(x - a[0] - t * dx, n - a[1] - t * dn);
}

function boxNearSegment(box: C2SecondMineBox, a: readonly [number, number],
  b: readonly [number, number], clearance: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .4));
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    if (pointBoxDistance(a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t, box) < clearance) return true;
  }
  return false;
}

function overlapsXZ(box: C2SecondMineBox, x0: number, x1: number, n0: number, n1: number) {
  return box.x + box.w / 2 > x0 && box.x - box.w / 2 < x1 &&
    box.n + box.d / 2 > n0 && box.n - box.d / 2 < n1;
}

/**
 * Volume-aware strengthening of the shared 2-D visual guard. Low solids must
 * pass c2SecondMineBoxAllowed at .45 m. The only exceptions are infrastructure
 * vertically separated from travel: ceilings/lintels above 3.35 m and floor
 * courses whose top is at/below -.02 m. Those still cannot enter the river,
 * bypass walking core, doors, anchors or any route at player height.
 */
export function c2R30EnclosureBoxAllowed(box: C2SecondMineBox) {
  if (![box.x, box.y, box.n, box.w, box.h, box.d].every(Number.isFinite) ||
    box.w <= 0 || box.h <= 0 || box.d <= 0) return false;
  if (box.x - box.w / 2 < c2SecondMineBounds.minX ||
    box.x + box.w / 2 > c2SecondMineBounds.maxX ||
    box.n - box.d / 2 < c2SecondMineBounds.minN ||
    box.n + box.d / 2 > c2SecondMineBounds.maxN ||
    box.y - box.h / 2 < c2SecondMineBounds.minY ||
    box.y + box.h / 2 > c2SecondMineBounds.maxY) return false;

  const bottom = box.y - box.h / 2, top = box.y + box.h / 2;
  const overhead = bottom >= 3.35 - 1e-9;
  const flushFloor = top <= -.02 + 1e-9;
  if (!overhead && !flushFloor && !c2SecondMineBoxAllowed(box, .45)) return false;

  // No floor course may become a false riverbed or a water-surface obstruction.
  if (flushFloor && overlapsXZ(box,
    secondMineRiver.x0, secondMineRiver.x1,
    secondMineRiver.n0, secondMineRiver.n1)) return false;

  const occupiesTravelHeight = top > -.02 + 1e-9 && bottom < 3.35 - 1e-9;
  if (occupiesTravelHeight) {
    for (let index = 1; index < route.length; index++) {
      if (boxNearSegment(box, route[index - 1]!, route[index]!, .9)) return false;
    }
    // A rail belongs at the west edge, never in the bypass walking core.
    if (overlapsXZ(box, 49.5, 53.5, 113.5, 162.5)) return false;
    for (const door of doorStrips.slice(0, 4)) {
      if (Math.abs(box.x - door.x) - box.w / 2 < .72 &&
        box.n + box.d / 2 > door.n0 && box.n - box.d / 2 < door.n1) return false;
    }
    for (const centre of [secondMineAnchors.supportCamp, secondMineAnchors.riverCamp,
      secondMineDrySites.workfaceWest, secondMineDrySites.workfaceEast,
      secondMineDrySites.collapse, secondMineDrySites.barracks]) {
      if (pointBoxDistance(centre.east, centre.north, box) < 1.95) return false;
    }
  }
  return true;
}

function pixelTexture() {
  const size = 32, pixels = new Uint8Array(size * size * 4);
  const tones = Object.freeze([42, 58, 74, 90, 106, 122, 138, 154, 170]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const course = Math.floor(y / 4);
    const shiftedX = x + (course % 2) * 3;
    const joint = y % 8 === 0 || (shiftedX + course * 2) % 16 === 0;
    const chip = (shiftedX * 17 + y * 29) % 47 < 4;
    const facet = (Math.floor(x / 4) * 3 + Math.floor(y / 3)) % 9;
    const tone = joint ? 2 : chip ? 8 : facet;
    const value = tones[tone]!;
    pixels.set([value, value, value, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.name = 'town-c2-r30-enclosure-nine-tone-32px';
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

function validRoofRect(value: C2R30EnclosureRoofRect | undefined): value is C2R30EnclosureRoofRect {
  return !!value && [value.minE, value.maxE, value.minN, value.maxN].every(Number.isFinite) &&
    value.minE < value.maxE && value.minN < value.maxN;
}
function roofArea(rect: C2R30EnclosureRoofRect) {
  return (rect.maxE - rect.minE) * (rect.maxN - rect.minN);
}
function roofOverlap(a: C2R30EnclosureRoofRect, b: C2R30EnclosureRoofRect) {
  return Math.min(a.maxE, b.maxE) > Math.max(a.minE, b.minE) &&
    Math.min(a.maxN, b.maxN) > Math.max(a.minN, b.minN);
}

/** Standalone -140 hall enclosure in local ENY: x=east, y=up, z=-north. */
export function buildTownC2R30Enclosure(options: C2R30EnclosureOptions = {}): C2R30EnclosureScene {
  const entry = c2R30EnclosureRooms.find(room => room.id === 'entry')!;
  if (options.entryRoofPieces) {
    const opening = options.entryRoofOpening;
    if (opening && (!validRoofRect(opening) || opening.minE < entry.x0 || opening.maxE > entry.x1 ||
      opening.minN < entry.n0 || opening.maxN > entry.n1)) throw new RangeError('Invalid C2 R30 entry roof opening.');
    const room = { minE: entry.x0, maxE: entry.x1, minN: entry.n0, maxN: entry.n1 };
    const pieces = options.entryRoofPieces;
    if (!pieces.length || pieces.some(piece => !validRoofRect(piece) || piece.minE < room.minE ||
      piece.maxE > room.maxE || piece.minN < room.minN || piece.maxN > room.maxN ||
      (opening && roofOverlap(piece, opening)) || pieces.some(other => other !== piece && roofOverlap(piece, other)))) {
      throw new RangeError('Invalid C2 R30 entry roof partition.');
    }
    const expected = roofArea(room) - (opening ? roofArea(opening) : 0);
    if (Math.abs(pieces.reduce((sum, piece) => sum + roofArea(piece), 0) - expected) > 1e-9) {
      throw new RangeError('C2 R30 entry roof partition does not cover the room.');
    }
  } else if (options.entryRoofOpening) {
    throw new RangeError('C2 R30 entry roof opening requires split pieces.');
  }
  const group = new Group();
  group.name = 'town-c2-r30-enclosure';
  group.userData.coordinateFrame = 'second-mine-local-east-up-north';
  group.userData.visualAndCollisionSource = 'town-c2-r30-enclosure.boxes';
  group.userData.walkHeightAuthority = 'underground-second-mine-layout.secondMineFloor';
  const parts: C2R30EnclosurePart[] = [];

  function add(segment: string, role: C2R30EnclosureRole, family: C2R30EnclosureFamily,
    x: number, n: number, y: number, w: number, d: number, h: number) {
    const box: C2R30EnclosurePart = Object.freeze({
      id: `${segment}/${role}/${parts.length}`, segment, role, family, x, n, y, w, d, h,
    });
    if (!c2R30EnclosureBoxAllowed(box)) {
      throw new RangeError(`C2 R30 enclosure rejected ${box.id}: ${JSON.stringify(box)}`);
    }
    parts.push(box);
  }

  function familyAt(x: number, n: number, salt: number, role: C2R30EnclosureRole) {
    const value = hash(x, n, salt) % 19;
    if (role === 'floor') return value < 5 ? 'wet-stone' : value < 12 ? 'gravel' :
      value < 16 ? 'shale' : 'moss';
    if (role === 'rail' || role === 'post') return value < 13 ? 'iron' : value < 17 ? 'rust' : 'wood';
    return value < 7 ? 'basalt' : value < 12 ? 'shale' :
      value < 15 ? 'granite' : value < 17 ? 'rust' : 'wet-stone';
  }

  // Two-metre overlapping courses close every roof panel, including the river.
  for (const room of c2R30EnclosureRooms) {
    const pieces = room.id === 'entry' && options.entryRoofPieces
      ? options.entryRoofPieces
      : [{ minE: room.x0, maxE: room.x1, minN: room.n0, maxN: room.n1 }];
    for (const piece of pieces) {
      for (let x = piece.minE, column = 0; x < piece.maxE - 1e-9; x += 2, column++) {
        for (let n = piece.minN, row = 0; n < piece.maxN - 1e-9; n += 2, row++) {
          const w = Math.min(2.04, piece.maxE - x), d = Math.min(2.04, piece.maxN - n);
          const cx = x + w / 2, cn = n + d / 2;
          const depth = .52 + noise(cx, cn, 71) * .38;
          const underside = room.ceiling - (hash(cx, cn, 73) % 3) * .06;
          add(`${room.id}-roof`, 'ceiling', familyAt(cx, cn, 79, 'ceiling'),
            cx, cn, underside + depth / 2, w, d, depth);
        }
      }
    }
  }

  // Floor tops sit 2 cm below the unchanged walk datum. They are visible,
  // collidable support geometry, but never a step or a replacement floor rule.
  for (const room of c2R30EnclosureRooms) {
    if (!room.floor) continue;
    for (let x = room.x0, column = 0; x < room.x1 - 1e-9; x += 2, column++) {
      for (let n = room.n0, row = 0; n < room.n1 - 1e-9; n += 2, row++) {
        const w = Math.min(2.04, room.x1 - x), d = Math.min(2.04, room.n1 - n);
        const cx = x + w / 2, cn = n + d / 2;
        add(`${room.id}-floor`, 'floor', familyAt(cx, cn, 101, 'floor'),
          cx, cn, -.17, w, d, .30);
      }
    }
  }

  for (const wall of c2R30EnclosureWalls) {
    for (let cursor = wall.start, column = 0; cursor < wall.end - 1e-9; cursor += 1.6, column++) {
      const length = Math.min(1.64, wall.end - cursor);
      const middle = cursor + length / 2;
      const x = wall.axis === 'x' ? wall.fixed : middle;
      const n = wall.axis === 'x' ? middle : wall.fixed;
      const w = wall.axis === 'x' ? wall.thickness : length;
      const d = wall.axis === 'x' ? length : wall.thickness;
      for (let bottom = wall.bottom ?? 0, row = 0; bottom < wall.ceiling - 1e-9; bottom += 1, row++) {
        const h = Math.min(1.04, wall.ceiling - bottom);
        add(wall.id, 'wall', familyAt(x, n, 127 + row, 'wall'),
          x, n, bottom + h / 2, w, d, h);
      }
    }
  }

  // High lintels finish the surveyed wing doors and the two bypass mouths.
  for (const door of doorStrips) {
    for (let n = door.n0; n < door.n1 - 1e-9; n += 2) {
      const d = Math.min(2.04, door.n1 - n), bottom = 3.35;
      add(door.id, 'portal', familyAt(door.x, n, 149, 'wall'),
        door.x, n + d / 2, bottom + (door.ceiling + .52 - bottom) / 2,
        .68, d, door.ceiling + .52 - bottom);
    }
  }

  // Every west-rail bay has a post at both ends; rails overlap each post.
  for (const segment of c2R30EnclosureWestRailSegments) {
    const bays = Math.ceil((segment.n1 - segment.n0) / segment.postSpacing);
    const spacing = (segment.n1 - segment.n0) / bays;
    for (let index = 0; index <= bays; index++) {
      const n = segment.n0 + index * spacing;
      add(segment.id, 'post', index % 4 === 0 ? 'rust' : 'iron',
        segment.x, n, .59, .24, .24, 1.18);
      add(segment.id, 'post', 'iron', segment.x, n, .10, .38, .38, .20);
    }
    for (let index = 0; index < bays; index++) {
      const n0 = segment.n0 + index * spacing, n1 = n0 + spacing;
      for (const y of [.48, 1.02]) add(segment.id, 'rail', y === 1.02 && index % 3 === 0 ? 'wood' : 'iron',
        segment.x, (n0 + n1) / 2, y, .12, n1 - n0 + .08, .12);
    }
  }

  const boxes = Object.freeze([...parts]);
  // Deliberately the same frozen records: no invisible or approximated collider.
  const colliders = boxes;
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.name = 'town-c2-r30-enclosure-unit-box';
  const texture = pixelTexture();
  const material = new MeshLambertMaterial({
    name: 'town-c2-r30-enclosure-nine-colour-lambert',
    map: texture,
    color: 0xffffff,
    flatShading: true,
  });
  const mesh = new InstancedMesh(geometry, material, boxes.length);
  mesh.name = 'town-c2-r30-enclosure/single-static-batch';
  mesh.castShadow = mesh.receiveShadow = true;
  const matrix = new Matrix4(), tint = new Color();
  boxes.forEach((box, index) => {
    matrix.makeScale(box.w, box.h, box.d);
    matrix.setPosition(box.x, box.y, -box.n);
    mesh.setMatrixAt(index, matrix);
    const variation = .88 + noise(box.x, box.n, 181 + index) * .19;
    const roleTone = box.role === 'ceiling' ? .84 : box.role === 'floor' ? .90 :
      box.role === 'portal' ? .93 : box.role === 'rail' || box.role === 'post' ? 1.04 : .97;
    tint.setHex(c2R30EnclosurePalette[box.family]).multiplyScalar(variation * roleTone);
    mesh.setColorAt(index, tint);
  });
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  group.add(mesh);
  group.userData.colliders = colliders;
  group.updateMatrixWorld(true);
  group.traverse(object => { object.matrixAutoUpdate = false; });

  let disposed = false;
  function stats(): C2R30EnclosureStats {
    return Object.freeze({
      pieceCount: boxes.length,
      colliderCount: colliders.length,
      visiblePieceCount: disposed ? 0 : boxes.length,
      drawCount: disposed ? 0 : 1,
      triangles: disposed ? 0 : boxes.length * 12,
      textureSize: 32,
      textureFilter: 'nearest',
      shading: 'lambert',
      paletteColorCount: familyOrder.length as 9,
      paletteCounts: Object.freeze(counts(boxes.map(box => box.family), familyOrder)),
      roleCounts: Object.freeze(counts(boxes.map(box => box.role), roleOrder)),
      roomCount: c2R30EnclosureRooms.length,
      wallRunCount: c2R30EnclosureWalls.length,
      westRailSegmentCount: c2R30EnclosureWestRailSegments.length,
      staticMatrices: true,
      floorChanges: 0,
      rewards: 0,
      disposed,
    });
  }
  group.userData.stats = stats();
  function acceptsMouth(mouth: C2R30DeepMouth) {
    if (disposed || mouth.layer !== 'minus140' || mouth.axis !== 'north' ||
        mouth.at !== c2R30EnclosureDeepMouth.at || mouth.centre !== c2R30EnclosureDeepMouth.centre ||
        mouth.width !== c2R30EnclosureDeepMouth.width || mouth.height !== c2R30EnclosureDeepMouth.height) return false;
    const half = mouth.width / 2;
    for (let lateral = -half + .02; lateral < half; lateral += .1) {
      for (const height of [.05, .9, 1.8, mouth.height - .05]) {
        if (boxes.some(part => part.role === 'wall' &&
          Math.abs(part.n - mouth.at) - part.d / 2 <= 1e-7 &&
          Math.abs(part.x - mouth.centre - lateral) - part.w / 2 <= 1e-7 &&
          part.y - part.h / 2 <= height && part.y + part.h / 2 >= height)) return false;
      }
    }
    for (const side of [-1, 1]) {
      const lateral = mouth.centre + side * (half + .2);
      if (!boxes.some(part => part.role === 'wall' &&
        Math.abs(part.n - mouth.at) - part.d / 2 <= .02 &&
        Math.abs(part.x - lateral) - part.w / 2 <= .02 && part.y - part.h / 2 <= .9 &&
        part.y + part.h / 2 >= .9)) return false;
    }
    return boxes.some(part => part.id.startsWith('exit-mouth-lintel/') &&
      Math.abs(part.y - part.h / 2 - mouth.height) < 1e-7);
  }
  return Object.freeze({
    group, boxes, colliders, acceptsMouth, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      group.clear();
      group.userData.stats = stats();
    },
  });
}

export const createTownC2R30Enclosure = buildTownC2R30Enclosure;
