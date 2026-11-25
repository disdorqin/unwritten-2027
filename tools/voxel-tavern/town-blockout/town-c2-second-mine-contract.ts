import {
  secondMineAnchors, secondMineRiver, secondMineRooms,
} from '../../../src/shared/underground-second-mine-layout.js';
import { secondMineDrySites } from '../../../src/shared/underground-second-mine-dry-wings.js';

export type C2SecondMineBox = Readonly<{
  x: number;
  y: number;
  n: number;
  w: number;
  h: number;
  d: number;
}>;

export const c2SecondMineBounds = Object.freeze({
  minX: -66, maxX: 66, minN: 0, maxN: 198, minY: -.7, maxY: 13,
});

export const c2SecondMineZones = Object.freeze({
  upperWest: Object.freeze({ x0: -28, x1: -4, n0: 38, n1: 56 }),
  upperEast: Object.freeze({ x0: 4, x1: 32, n0: 68, n1: 90 }),
  nearBank: Object.freeze({ x0: -48, x1: 48, n0: 96, n1: 128 }),
  farBank: Object.freeze({ x0: -48, x1: 48, n0: 146, n1: 182 }),
  bypass: Object.freeze({ x0: 48, x1: 55, n0: 112, n1: 164 }),
  collapse: Object.freeze({ x0: -66, x1: -48, n0: 162, n1: 180 }),
  barracks: Object.freeze({ x0: 48, x1: 66, n0: 166, n1: 182 }),
});

const route: readonly (readonly [number, number])[] = Object.freeze([
  [secondMineAnchors.entry.east, secondMineAnchors.entry.north],
  [0, 112],
  ...secondMineAnchors.bypass.map(point => [point.east, point.north] as const),
  [secondMineAnchors.exit.east, secondMineAnchors.exit.north],
]);

const doorStrips = Object.freeze([
  { x: -4, n0: 38, n1: 56 },
  { x: 4, n0: 68, n1: 90 },
  { x: -48, n0: 162, n1: 180 },
  { x: 48, n0: 166, n1: 182 },
] as const);

const reservedCentres = Object.freeze([
  secondMineAnchors.supportCamp,
  secondMineAnchors.riverCamp,
  secondMineDrySites.workfaceWest,
  secondMineDrySites.workfaceEast,
  secondMineDrySites.collapse,
  secondMineDrySites.barracks,
] as const);

const visualClearance = .45;
const anchorClearance = 1.5;

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
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .5));
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const n = a[1] + (b[1] - a[1]) * t;
    if (pointBoxDistance(x, n, box) < clearance) return true;
  }
  return false;
}

export function c2SecondMineRoomAt(x: number, n: number) {
  return secondMineRooms.find(room => x >= room.x0 && x <= room.x1 && n >= room.n0 && n <= room.n1);
}

/** Visual pre-placement guard only; it does not grant passage, collision or domain authority. */
export function c2SecondMineBoxAllowed(box: C2SecondMineBox, clearance = visualClearance) {
  if (![box.x, box.y, box.n, box.w, box.h, box.d, clearance].every(Number.isFinite) ||
    box.w <= 0 || box.h <= 0 || box.d <= 0 || clearance < 0) return false;
  if (box.x - box.w / 2 < c2SecondMineBounds.minX ||
    box.x + box.w / 2 > c2SecondMineBounds.maxX ||
    box.n - box.d / 2 < c2SecondMineBounds.minN ||
    box.n + box.d / 2 > c2SecondMineBounds.maxN ||
    box.y < c2SecondMineBounds.minY || box.y + box.h > c2SecondMineBounds.maxY) return false;

  const riverMinX = secondMineRiver.x0 - clearance, riverMaxX = secondMineRiver.x1 + clearance;
  const riverMinN = secondMineRiver.n0 - clearance, riverMaxN = secondMineRiver.n1 + clearance;
  if (box.x + box.w / 2 > riverMinX && box.x - box.w / 2 < riverMaxX &&
    box.n + box.d / 2 > riverMinN && box.n - box.d / 2 < riverMaxN) return false;

  for (let index = 1; index < route.length; index++) {
    if (boxNearSegment(box, route[index - 1]!, route[index]!, clearance + .27)) return false;
  }
  if (box.n + box.d / 2 > 127 && box.n - box.d / 2 < 147 &&
    Math.abs(box.x) - box.w / 2 < 5 + clearance) return false;

  for (const door of doorStrips) {
    if (box.y - box.h / 2 < 3.2 && Math.abs(box.x - door.x) - box.w / 2 < clearance + .27 &&
      box.n + box.d / 2 > door.n0 - clearance && box.n - box.d / 2 < door.n1 + clearance) return false;
  }
  for (const centre of reservedCentres) {
    if (pointBoxDistance(centre.east, centre.north, box) < anchorClearance + clearance) return false;
  }
  return true;
}
