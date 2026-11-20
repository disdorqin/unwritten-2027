import { createUndergroundMineExpansionShell } from './underground-mine-expansion-shell.js';

export const undergroundMineDepth = -90;
export const undergroundMineGalleryWidth = 4;
export const undergroundMineGalleryHeight = 3.5;

export type UndergroundMineSpec = {
  pool: { length: number; width: number; depth: number; shaftAperture?: { width: number; length: number } };
  shoreLength: number;
  gallery: { length: number; drop: number; railGauge: number; railWidth: number };
  collapse: { length: number; width: number; height: number };
  camp: { length: number; side: 'left' | 'right'; extension: number; openBackForExpansion?: boolean };
  walker: { radius: number; standingHeight: number; crouchingHeight: number; maxGrade: number };
};

type Point = readonly [x: number, y: number, z: number];
type Zone = 'pool' | 'shore' | 'gallery' | 'collapse' | 'camp';
type Surface = 'rock' | 'rail' | 'water';
type Span = {
  zone: Zone;
  start: number;
  end: number;
  left: number;
  right: number;
  floorStart: number;
  floorEnd: number;
  height: number;
};

function validate(spec: UndergroundMineSpec) {
  const { pool, shoreLength, gallery, collapse, camp, walker } = spec;
  const quantities = [
    pool.length, pool.width, pool.depth, shoreLength,
    gallery.length, gallery.drop, gallery.railGauge, gallery.railWidth,
    collapse.length, collapse.width, collapse.height, camp.length, camp.extension,
    walker.radius, walker.standingHeight, walker.crouchingHeight, walker.maxGrade,
  ];
  if (!quantities.every(value => Number.isFinite(value) && value > 0) ||
      (camp.side !== 'left' && camp.side !== 'right')) {
    throw new RangeError('Invalid first mine layout dimensions');
  }

  const diameter = 2 * walker.radius;
  const aperture = pool.shaftAperture;
  if (aperture && !(Number.isFinite(aperture.width) && Number.isFinite(aperture.length) &&
      aperture.width > diameter && aperture.width < pool.width &&
      aperture.length > diameter && aperture.length < pool.length)) {
    throw new RangeError('The first mine shaft aperture cannot fit the pool and walking profile');
  }
  const shoreGrade = pool.depth / shoreLength;
  const galleryGrade = gallery.drop / gallery.length;
  const slopedClearance = Math.max(shoreGrade, galleryGrade) * diameter;
  // At first contact the leading edge is under the slot while the trailing edge is on the slope.
  const collapseApproachRise = Math.min(gallery.drop, galleryGrade * diameter);
  if (Math.min(pool.width, collapse.width, undergroundMineGalleryWidth) <= diameter ||
      pool.length <= diameter || camp.length <= diameter ||
      walker.crouchingHeight >= walker.standingHeight ||
      collapse.width >= undergroundMineGalleryWidth ||
      collapse.height < walker.crouchingHeight || collapse.height >= walker.standingHeight ||
      walker.standingHeight + slopedClearance > undergroundMineGalleryHeight ||
      walker.crouchingHeight + collapseApproachRise > collapse.height ||
      gallery.railGauge <= gallery.railWidth ||
      gallery.railGauge + gallery.railWidth >= undergroundMineGalleryWidth ||
      shoreGrade > walker.maxGrade || galleryGrade > walker.maxGrade) {
    throw new RangeError('First mine layout cannot fit the supplied walking profile');
  }
}

function floorAt(span: Span, z: number) {
  const along = (z - span.start) / (span.end - span.start);
  return span.floorStart + (span.floorEnd - span.floorStart) * along;
}

/** Local +Z runs deeper into the mine. Y is in town elevation metres and the pool surface is −90. */
export function createUndergroundMineLayout(spec: UndergroundMineSpec) {
  validate(spec);
  const { pool, shoreLength, gallery, collapse, camp, walker } = spec;
  const level = undergroundMineDepth;
  const campFloor = level - gallery.drop;
  const halfGallery = undergroundMineGalleryWidth / 2;
  const roomHeight = undergroundMineGalleryHeight;
  let nextStart = 0;

  function addSpan(zone: Zone, length: number, left: number, right: number,
      floorStart: number, floorEnd: number, height: number): Span {
    const start = nextStart;
    nextStart += length;
    if (!Number.isFinite(nextStart) || nextStart <= start) throw new RangeError('Invalid first mine span');
    return { zone, start, end: nextStart, left, right, floorStart, floorEnd, height };
  }

  const poolFloor = level - pool.depth;
  const poolSpan = addSpan('pool', pool.length, -pool.width / 2, pool.width / 2,
    poolFloor, poolFloor, roomHeight + pool.depth);
  const shore = addSpan('shore', shoreLength, -halfGallery, halfGallery, poolFloor, level, roomHeight + pool.depth);
  const main = addSpan('gallery', gallery.length, -halfGallery, halfGallery, level, campFloor, roomHeight);
  const gap = addSpan('collapse', collapse.length, -collapse.width / 2, collapse.width / 2,
    campFloor, campFloor, collapse.height);
  const campSpan = addSpan('camp', camp.length,
    camp.side === 'left' ? -halfGallery - camp.extension : -halfGallery,
    camp.side === 'right' ? halfGallery + camp.extension : halfGallery, campFloor, campFloor, roomHeight);
  const spans = [poolSpan, shore, main, gap, campSpan];
  const campBackOpening = camp.openBackForExpansion ? {
    seam: [0, campFloor, campSpan.end] as Point,
    openingWidth: undergroundMineGalleryWidth,
    openingHeight: roomHeight,
  } : undefined;
  const expansion = campBackOpening && createUndergroundMineExpansionShell({
    ...campBackOpening,
    layerStartZ: poolSpan.start,
  });
  const poolLanding: Point = [0, level, pool.length / 2];
  const aperture = pool.shaftAperture;
  const poolShaftOpening = aperture && {
    roofY: poolFloor + poolSpan.height,
    minX: -aperture.width / 2,
    maxX: aperture.width / 2,
    minZ: poolLanding[2] - aperture.length / 2,
    maxZ: poolLanding[2] + aperture.length / 2,
  };

  const triangles: Record<Surface, number[]> = { rock: [], rail: [], water: [] };

  function quad(surface: Surface, a: Point, b: Point, c: Point, d: Point) {
    triangles[surface].push(...a, ...b, ...c, ...a, ...c, ...d);
  }

  function floorStrip(span: Span, left: number, right: number, surface: Surface) {
    const { start, end, floorStart, floorEnd } = span;
    quad(surface, [left, floorStart, start], [left, floorEnd, end],
      [right, floorEnd, end], [right, floorStart, start]);
  }

  function ceilingStrip(y: number, left: number, right: number, start: number, end: number) {
    quad('rock', [left, y, start], [right, y, start], [right, y, end], [left, y, end]);
  }

  function faceAt(z: number, left: number, right: number, bottom: number, top: number, toPositiveZ: boolean) {
    if (right <= left || top <= bottom) return;
    const a: Point = [left, bottom, z];
    const b: Point = [right, bottom, z];
    const c: Point = [right, top, z];
    const d: Point = [left, top, z];
    if (toPositiveZ) quad('rock', a, b, c, d);
    else quad('rock', a, d, c, b);
  }

  for (const span of spans) {
    const { start, end, left, right, floorStart, floorEnd, height } = span;
    if (span === main) {
      const halfGauge = gallery.railGauge / 2;
      const halfRail = gallery.railWidth / 2;
      const edges = [left, -halfGauge - halfRail, -halfGauge + halfRail,
        halfGauge - halfRail, halfGauge + halfRail, right];
      for (let i = 0; i < edges.length - 1; i++) {
        floorStrip(span, edges[i], edges[i + 1], i % 2 === 0 ? 'rock' : 'rail');
      }
    } else {
      floorStrip(span, left, right, 'rock');
    }

    const topStart = floorStart + height;
    const topEnd = floorEnd + height;
    quad('rock', [left, floorStart, start], [left, topStart, start],
      [left, topEnd, end], [left, floorEnd, end]);
    quad('rock', [right, floorStart, start], [right, floorEnd, end],
      [right, topEnd, end], [right, topStart, start]);
    if (span === poolSpan && poolShaftOpening) {
      const { roofY, minX, maxX, minZ, maxZ } = poolShaftOpening;
      ceilingStrip(roofY, left, right, start, minZ);
      ceilingStrip(roofY, left, right, maxZ, end);
      ceilingStrip(roofY, left, minX, minZ, maxZ);
      ceilingStrip(roofY, maxX, right, minZ, maxZ);
    } else {
      quad('rock', [left, topStart, start], [right, topStart, start],
        [right, topEnd, end], [left, topEnd, end]);
    }

    if (span === poolSpan || span === shore) {
      // Render an independent water surface. Traversal uses the continuous bed below it.
      floorStrip({ ...span, floorStart: level, floorEnd: level }, left, right, 'water');
    }
  }

  faceAt(poolSpan.start, poolSpan.left, poolSpan.right, poolFloor, poolFloor + poolSpan.height, true);
  if (campBackOpening) {
    faceAt(campSpan.end, campSpan.left, -halfGallery, campFloor, campFloor + campSpan.height, false);
    faceAt(campSpan.end, halfGallery, campSpan.right, campFloor, campFloor + campSpan.height, false);
  } else {
    faceAt(campSpan.end, campSpan.left, campSpan.right, campFloor, campFloor + campSpan.height, false);
  }
  for (let index = 1; index < spans.length; index++) {
    const before = spans[index - 1];
    const after = spans[index];
    const y = after.floorStart;
    const z = after.start;
    const overlapLeft = Math.max(before.left, after.left);
    const overlapRight = Math.min(before.right, after.right);

    faceAt(z, before.left, overlapLeft, y, y + before.height, false);
    faceAt(z, overlapRight, before.right, y, y + before.height, false);
    faceAt(z, after.left, overlapLeft, y, y + after.height, true);
    faceAt(z, overlapRight, after.right, y, y + after.height, true);
    faceAt(z, overlapLeft, overlapRight, y + Math.min(before.height, after.height),
      y + Math.max(before.height, after.height), after.height > before.height);
  }

  const campMidpoint = (campSpan.start + campSpan.end) / 2;
  const campSafe: Point = [(campSpan.left + campSpan.right) / 2, campFloor, campMidpoint];
  const route = spans.map(span => ({
    zone: span.zone,
    from: [0, span.floorStart, span === poolSpan ? poolLanding[2] : span.start] as Point,
    to: [0, span.floorEnd, span === campSpan ? campMidpoint : span.end] as Point,
    requiresJump: false,
    requiresCrouch: span === gap,
    encounter: false,
  }));
  route.push({
    zone: 'camp', from: route[route.length - 1].to, to: campSafe,
    requiresJump: false, requiresCrouch: false, encounter: false,
  });

  /** Sweeps the player's footprint across joins and retains the most limiting floor and ceiling. */
  function queryPassage(x: number, z: number, radius: number, bodyHeight: number) {
    if (![x, z, radius, bodyHeight].every(Number.isFinite) || radius < 0 || bodyHeight <= 0 ||
        z - radius < poolSpan.start) return;
    const touchesExpansion = expansion && z + radius >= campSpan.end;
    const rear = touchesExpansion ? expansion.queryPassage(x, z, radius, bodyHeight) : undefined;
    if ((touchesExpansion || z + radius > campSpan.end) && !rear) return;
    if (rear && z - radius >= campSpan.end) return rear;
    const center = spans.find(span => z < span.end) ?? campSpan;
    let highestFloor = -Infinity;
    let lowestCeiling = Infinity;
    for (const span of spans) {
      const first = Math.max(span.start, z - radius);
      const last = Math.min(span.end, z + radius);
      if (first > last) continue;
      if (x - radius < span.left || x + radius > span.right) return;
      const near = floorAt(span, first);
      const far = floorAt(span, last);
      highestFloor = Math.max(highestFloor, near, far);
      lowestCeiling = Math.min(lowestCeiling, Math.min(near, far) + span.height);
    }
    if (rear) {
      highestFloor = Math.max(highestFloor, rear.floor);
      lowestCeiling = Math.min(lowestCeiling, rear.floor + rear.clearance);
    }
    const clearance = lowestCeiling - highestFloor;
    // Allow rounding when the sloped floor and the slot ceiling just fit the walker.
    const usableClearance = clearance + 1e-9;
    if (usableClearance < bodyHeight) return;
    const y = floorAt(center, z);
    return {
      zone: center.zone,
      floor: y,
      clearance,
      waterDepth: center === poolSpan || center === shore ? Math.max(0, level - y) : 0,
      requiresCrouch: usableClearance < walker.standingHeight,
      encounter: false,
    };
  }

  function meshSurface(surface: Surface) {
    const original = triangles[surface];
    const extended = expansion?.mesh[surface];
    const output = new Float32Array(original.length + (extended?.length ?? 0));
    output.set(original);
    if (extended) output.set(extended, original.length);
    return output;
  }
  const mesh = { rock: meshSurface('rock'), rail: meshSurface('rail'), water: meshSurface('water') };
  if (!Object.values(mesh).every(positions => positions.every(Number.isFinite))) {
    throw new RangeError('First mine coordinates exceed geometry precision');
  }

  return {
    mesh,
    route,
    expansion,
    crouchInterval: [gap.start - walker.radius, gap.end + walker.radius] as const,
    anchors: {
      poolLanding,
      poolShaftOpening,
      campBackOpening,
      shoreExit: [0, level, shore.end] as Point,
      campRecovery: {
        position: campSafe,
        kind: 'campfire' as const,
        scope: 'underground-mine-first-layer' as const,
      },
    },
    queryPassage,
  };
}
