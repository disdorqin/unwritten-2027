import type { UndergroundMineGateStage } from '../presence/underground-mine-gate.js';
import {firstMineDeepWorks,isCanonicalDeepWorks} from './town-c-first-mine-deep-works.js';

type Point = readonly [x: number, y: number, z: number];
type Surface = 'rock' | 'rail' | 'water';
type Room = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floor: number;
  ceiling: number;
  water?: number;
}>;

type Options = Readonly<{
  seam: Point;
  openingWidth: number;
  openingHeight: number;
  layerStartZ: number;
  crystalGate?: boolean;
}>;

const layerLength = 140;
const layerHalfWidth = 100;
const waterDepth = .12;

function orderedEdges(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function fitsMeshPrecision(values: number[]) {
  return values.every((value, i) => Number.isFinite(Math.fround(value)) &&
    (i === 0 || Math.fround(value) > Math.fround(values[i - 1])));
}

/** Local +Z continues beyond the original camp. Coordinates retain the camp floor datum. */
export function createUndergroundMineExpansionShell({
  seam: [shaftX, floor, seamZ],
  openingWidth,
  openingHeight,
  layerStartZ,
  crystalGate = false,
}: Options) {
  const endZ = layerStartZ + layerLength;
  const depth = endZ - seamZ;
  const halfOpening = openingWidth / 2;
  const halfGallery = Math.max(4.2, halfOpening);
  if (![shaftX, floor, seamZ, openingWidth, openingHeight, layerStartZ].every(Number.isFinite) ||
      openingWidth <= 0 || openingHeight <= 0 || halfGallery >= 72 ||
      seamZ < layerStartZ || depth < 36) {
    throw new RangeError('The mine expansion cannot fit this camp opening and layer envelope');
  }

  const openingLeft = shaftX - halfOpening;
  const openingRight = shaftX + halfOpening;
  const galleryLeft = shaftX - halfGallery;
  const galleryRight = shaftX + halfGallery;
  const bounds = { minX: shaftX - layerHalfWidth, maxX: shaftX + layerHalfWidth, minZ: seamZ, maxZ: endZ };
  const collarEnd = seamZ + 4;
  const westStart = seamZ + depth * .28;
  const westEnd = seamZ + depth * .38;
  const eastStart = seamZ + depth * .46;
  const eastEnd = seamZ + depth * .57;
  const waterStart = seamZ + depth * .72;
  const waterEnd = endZ - 3;
  const galleryCeiling = floor + 7.2;
  const openingCeiling = floor + openingHeight;
  const waterFloor = floor - waterDepth;
  const collarStart = crystalGate ? endZ - 1.2 : endZ;
  const gate = crystalGate ? {
    position: [shaftX, floor, collarStart] as Point,
    width: openingWidth,
    height: Math.min(openingHeight, galleryCeiling - floor),
    thickness: .16,
  } : undefined;

  const deepWorks=isCanonicalDeepWorks(bounds,floor,crystalGate)&&openingWidth===4&&openingHeight===3.5;
  const rooms: readonly Room[] = [
    { minX: openingLeft, maxX: openingRight, minZ: seamZ, maxZ: collarEnd, floor, ceiling: openingCeiling },
    { minX: galleryLeft, maxX: galleryRight, minZ: collarEnd, maxZ: collarStart, floor, ceiling: galleryCeiling },
    ...(gate ? [{ minX: openingLeft, maxX: openingRight, minZ: collarStart, maxZ: endZ,
      floor, ceiling: floor + gate.height }] : []),
    { minX: shaftX - 72, maxX: galleryLeft, minZ: westStart, maxZ: westEnd, floor, ceiling: floor + 6.4 },
    { minX: bounds.minX, maxX: shaftX - 72, minZ: westStart - 1.8, maxZ: westEnd + 1.8, floor, ceiling: floor + 6.8 },
    { minX: galleryRight, maxX: shaftX + 72, minZ: eastStart, maxZ: eastEnd, floor, ceiling: floor + 6.6 },
    { minX: shaftX + 72, maxX: bounds.maxX, minZ: eastStart - 1.8, maxZ: eastEnd + 1.8, floor, ceiling: floor + 6.9 },
    { minX: galleryRight, maxX: galleryRight + 3.2, minZ: waterStart, maxZ: waterEnd,
      floor: waterFloor, ceiling: floor + 6.1, water: floor },
    ...(deepWorks?firstMineDeepWorks.rooms.map(r=>({...r,minZ:Math.abs(r.minZ-waterStart)<1e-7?waterStart:r.minZ,maxZ:Math.abs(r.maxZ-waterStart)<1e-7?waterStart:r.maxZ,floor,ceiling:floor+r.ceiling})):[]),
  ];
  const railOffset = Math.min(.5, halfOpening / 2);
  const halfRail = Math.min(.04, railOffset / 4);
  const railCenters = [shaftX - railOffset, shaftX + railOffset];
  const xEdges = orderedEdges([
    ...rooms.flatMap(room => [room.minX, room.maxX]),
    ...railCenters.flatMap(center => [center - halfRail, center + halfRail]),
  ]);
  const zEdges = orderedEdges(rooms.flatMap(room => [room.minZ, room.maxZ]));
  if (!fitsMeshPrecision(xEdges) || !fitsMeshPrecision(zEdges) ||
      !fitsMeshPrecision(orderedEdges([floor, openingCeiling, waterFloor, ...rooms.map(room => room.ceiling)])) ||
      !(openingLeft < openingRight && waterFloor < floor && openingCeiling > floor)) {
    throw new RangeError('Mine expansion coordinates exceed geometry precision');
  }

  // Split the plan at every room edge. A shared section between adjacent cells gets
  // only its exposed wall above or below the neighbor, leaving the doorway open.
  const cells = zEdges.slice(0, -1).map((minZ, row) => xEdges.slice(0, -1).map((minX, column) =>
    rooms.find(room => room.minZ <= minZ && room.maxZ >= zEdges[row + 1] &&
      room.minX <= minX && room.maxX >= xEdges[column + 1])));
  const triangles: Record<Surface, number[]> = { rock: [], rail: [], water: [] };

  function quad(surface: Surface, a: Point, b: Point, c: Point, d: Point) {
    triangles[surface].push(...a, ...b, ...c, ...a, ...c, ...d);
  }

  function exposedWall(room: Room, adjacent: Room | undefined, ax: number, az: number, bx: number, bz: number) {
    if (adjacent) {
      face(room.floor, Math.min(room.ceiling, adjacent.floor));
      face(Math.max(room.floor, adjacent.ceiling), room.ceiling);
    } else {
      face(room.floor, room.ceiling);
    }

    function face(bottom: number, top: number) {
      if (bottom < top) quad('rock', [ax, bottom, az], [ax, top, az], [bx, top, bz], [bx, bottom, bz]);
    }
  }

  for (const [row, roomsInRow] of cells.entries()) {
    const start = zEdges[row];
    const end = zEdges[row + 1];
    for (const [column, room] of roomsInRow.entries()) {
      if (!room) continue;
      const left = xEdges[column];
      const right = xEdges[column + 1];
      const overRail = railCenters.some(center => left >= center - halfRail && right <= center + halfRail);
      quad(overRail ? 'rail' : 'rock',
        [left, room.floor, start], [left, room.floor, end], [right, room.floor, end], [right, room.floor, start]);
      quad('rock',
        [left, room.ceiling, start], [right, room.ceiling, start], [right, room.ceiling, end], [left, room.ceiling, end]);
      if (room.water !== undefined) {
        quad('water', [left, room.water, start], [left, room.water, end], [right, room.water, end], [right, room.water, start]);
      }

      exposedWall(room, roomsInRow[column - 1], left, start, left, end);
      exposedWall(room, roomsInRow[column + 1], right, end, right, start);
      if (row > 0) exposedWall(room, cells[row - 1][column], right, start, left, start);
      exposedWall(room, cells[row + 1]?.[column], left, end, right, end);
    }
  }

  type Passage = Readonly<{
    zone: 'mine-expansion';
    floor: number;
    clearance: number;
    waterDepth: number;
    requiresCrouch: false;
    encounter: false;
  }>;

  function gateGap(stage: UndergroundMineGateStage) {
    if (!gate) return 0;
    if (stage === 'open') return gate.height;
    return stage === 'ajar' ? Math.min(.1, gate.height) : 0;
  }

  /** Sweep the same square footprint as the original mine and clip it at the old camp seam. */
  function queryPassage(x: number, z: number, radius: number, bodyHeight: number,
      gateStage: UndergroundMineGateStage = 'closed'): Passage | undefined {
    if (![x, z, radius, bodyHeight].every(Number.isFinite) || radius < 0 || bodyHeight <= 0) return;
    const left = x - radius;
    const right = x + radius;
    const start = z - radius;
    const end = z + radius;
    if (left < bounds.minX || right > bounds.maxX || end < seamZ || end > endZ) return;
    if (start <= seamZ && (left < openingLeft || right > openingRight || bodyHeight > openingHeight)) return;
    const touchesGate = gate && end >= collarStart - gate.thickness / 2 && start <= collarStart + gate.thickness / 2;
    if (touchesGate && (left < openingLeft || right > openingRight)) return;

    const center = rooms.find(room => x >= room.minX && x <= room.maxX &&
      Math.max(z, seamZ) >= room.minZ && z <= room.maxZ);
    if (!center) return;
    let standingFloor = center.floor;
    let ceiling = center.ceiling;
    for (const [row, roomsInRow] of cells.entries()) {
      if (zEdges[row + 1] <= start || zEdges[row] >= end) continue;
      for (const [column, room] of roomsInRow.entries()) {
        if (xEdges[column + 1] <= left || xEdges[column] >= right) continue;
        if (!room) return;
        standingFloor = Math.max(standingFloor, room.floor);
        ceiling = Math.min(ceiling, room.ceiling);
      }
    }
    const clearance = Math.min(ceiling - standingFloor, touchesGate ? gateGap(gateStage) : Infinity);
    if (bodyHeight > clearance + 1e-9) return;
    return {
      zone: 'mine-expansion',
      floor: center.floor,
      clearance,
      waterDepth: center.water === undefined ? 0 : center.water - center.floor,
      requiresCrouch: false,
      encounter: false,
    };
  }

  const gateApproach: Point = [shaftX, floor, endZ - 2];
  const route: readonly Point[] = [
    [shaftX, floor, seamZ],
    [shaftX, floor, collarEnd],
    [shaftX, floor, (westStart + westEnd) / 2],
    [shaftX, floor, (eastStart + eastEnd) / 2],
    [shaftX, floor, waterStart],
    gateApproach,
  ];
  return {
    mesh: {
      rock: new Float32Array(triangles.rock),
      rail: new Float32Array(triangles.rail),
      water: new Float32Array(triangles.water),
    },
    queryPassage,
    route,
    gateApproach,
    deepWorks,
    gate: gate && { ...gate, gapFor: gateGap },
    bounds,
  };
}
