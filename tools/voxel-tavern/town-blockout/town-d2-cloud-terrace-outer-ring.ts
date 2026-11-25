import {
  BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, MeshLambertMaterial, Object3D, StaticDrawUsage,
} from 'three';
import { buildSwitchbackCenterline } from './front-ridge-switchback-road';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';

/**
 * D2 cloud-terrace outer-ring landscape, from the cloud card lines 41-49
 * and mountain card lines 130-139. Visual-only voxel scenery: no text,
 * lights, gameplay authority, height field or collision is added.
 *
 * World convention: x=east, y=height, z=-north. Every structure is anchored
 * to sampleNorthRidge350; the 64 m terrace, runway, switchback corridor and
 * reserved north rock wall are excluded by footprint, not just by centre.
 */
export const TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS = Object.freeze({
  west: 270, east: 378, south: 600, north: 700,
});
export const TOWN_D2_CLOUD_TERRACE_OUTER_RING_SEED = 0xd2c10d;
export const TOWN_D2_CLOUD_TERRACE_ROAD_CLEARANCE = 5.15;

const PLATFORM = Object.freeze({ west: 288, east: 352, south: 618, north: 682 });
const RUNWAY = Object.freeze({ west: 310.5, east: 351.5, south: 659.8, north: 664.2 });
const NORTH_WALL = Object.freeze({ west: 290, east: 350, south: 690, north: 770 });
const EXCLUSION_MARGIN = .12;

export type TownD2CloudTerraceMaterialFamily = 'stone' | 'timber' | 'pine' | 'shrub' | 'snow';
export type TownD2CloudTerraceOuterRingKind =
  | 'terrace-rock-step'
  | 'viewing-niche'
  | 'transition-pine'
  | 'transition-shrub'
  | 'snowdrift'
  | 'lantern-remnant';

export type TownD2CloudTerraceOuterRingPlacement = Readonly<{
  id: string;
  structureId: string;
  kind: TownD2CloudTerraceOuterRingKind;
  material: TownD2CloudTerraceMaterialFamily;
  east: number;
  north: number;
  /** Canonical terrain sample at this piece's centre. */
  height: number;
  /** Terrain sample at the parent structure's anchor. */
  anchorEast: number;
  anchorNorth: number;
  anchorHeight: number;
  x: number;
  y: number;
  z: number;
  base: number;
  width: number;
  tall: number;
  depth: number;
  yaw: number;
  grounded: boolean;
}>;

type Rect = Readonly<{ west: number; east: number; south: number; north: number }>;
type Footprint = Readonly<{ east: number; north: number; halfEast: number; halfNorth: number; radius: number }>;
type Reservation = Readonly<{ id: string; footprint: Footprint }>;
type PieceInput = Readonly<{
  kind: TownD2CloudTerraceOuterRingKind;
  material: TownD2CloudTerraceMaterialFamily;
  east: number;
  north: number;
  width: number;
  tall: number;
  depth: number;
  yaw?: number;
  base?: number;
  grounded?: boolean;
}>;

const PALETTE: Readonly<Record<TownD2CloudTerraceMaterialFamily, readonly string[]>> = {
  stone: ['#8a8378', '#756f66', '#9a9385', '#686d68', '#aaa18f', '#615f59'],
  timber: ['#5d4630', '#71543b', '#493a2d', '#826246'],
  pine: ['#44503c', '#536348', '#394638', '#607052', '#2f4035'],
  shrub: ['#57684c', '#667455', '#495b43', '#758164'],
  snow: ['#e8ecf0', '#d6e4f2', '#cbd9e2', '#f4f6f7', '#bfceda'],
};

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function footprint(east: number, north: number, width: number, depth: number, yaw = 0): Footprint {
  const cosine = Math.abs(Math.cos(yaw));
  const sine = Math.abs(Math.sin(yaw));
  const halfEast = (cosine * width + sine * depth) / 2;
  const halfNorth = (sine * width + cosine * depth) / 2;
  return { east, north, halfEast, halfNorth, radius: Math.hypot(halfEast, halfNorth) };
}

function overlaps(a: Footprint, rect: Rect, margin = 0) {
  return a.east + a.halfEast > rect.west - margin &&
    a.east - a.halfEast < rect.east + margin &&
    a.north + a.halfNorth > rect.south - margin &&
    a.north - a.halfNorth < rect.north + margin;
}
function footprintsOverlap(a: Footprint, b: Footprint, margin = 0) {
  return a.east + a.halfEast > b.east - b.halfEast - margin &&
    a.east - a.halfEast < b.east + b.halfEast + margin &&
    a.north + a.halfNorth > b.north - b.halfNorth - margin &&
    a.north - a.halfNorth < b.north + b.halfNorth + margin;
}

function pointSegmentDistance(east: number, north: number, a: { east: number; north: number }, b: { east: number; north: number }) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn || 1;
  const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared));
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function terrainFootprintBase(east: number, north: number, width: number, depth: number, yaw = 0, sink = .04) {
  const area = footprint(east, north, width, depth, yaw);
  let lowest = Infinity;
  let highest = -Infinity;
  for (const localEast of [-area.halfEast, 0, area.halfEast]) {
    for (const localNorth of [-area.halfNorth, 0, area.halfNorth]) {
      const height = sampleNorthRidge350(east + localEast, north + localNorth);
      lowest = Math.min(lowest, height);
      highest = Math.max(highest, height);
    }
  }
  return { base: lowest - sink, lowest, highest, variation: highest - lowest };
}

type Vec3 = readonly [number, number, number];

/** Tiny flat-shaded geometry writer: all detail stays inside the original unit footprint. */
class DetailGeometryWriter {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private serial = 0;

  triangle(a: Vec3, b: Vec3, c: Vec3, outward: Vec3) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (normal[0]! * outward[0]! + normal[1]! * outward[1]! + normal[2]! * outward[2]! < 0) [b, c] = [c, b];
    const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!) || 1;
    const grain = ((Math.imul(++this.serial, 0x45d9f3b) >>> 24) / 255) * .035;
    const shade = .9 + Math.abs(normal[1]!) / length * .065 + grain;
    for (const point of [a, b, c]) {
      this.positions.push(point[0], point[1], point[2]);
      this.colors.push(shade, shade, shade);
    }
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, outward: Vec3) {
    this.triangle(a, b, c, outward);
    this.triangle(a, c, d, outward);
  }

  finish(name: string, family: TownD2CloudTerraceMaterialFamily) {
    const geometry = new BufferGeometry();
    geometry.name = name;
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.detailFamily = family;
    return geometry;
  }
}

function beveledBlock(family: 'stone' | 'timber') {
  const writer = new DetailGeometryWriter();
  const bevel = family === 'stone' ? .065 : .045;
  const irregularity = family === 'stone' ? .018 : .006;
  const half = .5, inner = half - bevel;
  const chip = (point: Vec3): Vec3 => point.map((value, axis) => {
    const key = Math.imul(Math.round(value * 1000) + axis * 977, 0x85ebca6b);
    const jitter = (((Math.imul(key ^ (key >>> 13), 0xc2b2ae35) >>> 16) / 65535) - .5) * irregularity;
    return Math.max(-half, Math.min(half, value + jitter));
  }) as unknown as Vec3;
  const point = (axis: number, a: number, b: number, c: number): Vec3 => {
    const result: [number, number, number] = [0, 0, 0];
    result[axis] = a;
    result[(axis + 1) % 3] = b;
    result[(axis + 2) % 3] = c;
    return chip(result);
  };

  for (let axis = 0; axis < 3; axis++) {
    const outward: [number, number, number] = [0, 0, 0];
    for (const sign of [-1, 1]) {
      outward[axis] = sign;
      writer.quad(point(axis, sign * half, -inner, -inner), point(axis, sign * half, inner, -inner),
        point(axis, sign * half, inner, inner), point(axis, sign * half, -inner, inner), outward);
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const signU of [-1, 1]) for (const signV of [-1, 1]) {
      const edge = (along: number, acrossU: number, acrossV: number): Vec3 => {
        const result: [number, number, number] = [0, 0, 0];
        result[axis] = along; result[u] = acrossU; result[v] = acrossV;
        return chip(result);
      };
      const outward: [number, number, number] = [0, 0, 0];
      outward[u] = signU; outward[v] = signV;
      writer.quad(edge(-inner, signU * half, signV * inner), edge(inner, signU * half, signV * inner),
        edge(inner, signU * inner, signV * half), edge(-inner, signU * inner, signV * half), outward);
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    writer.triangle(chip([x * half, y * inner, z * inner]), chip([x * inner, y * half, z * inner]),
      chip([x * inner, y * inner, z * half]), [x, y, z]);
  }
  return writer.finish(`outer-ring-detail-${family}`, family);
}

function radialDetail(
  family: 'pine' | 'shrub' | 'snow',
  levels: readonly (readonly [number, number])[],
  segments: number,
  phase: number,
) {
  const writer = new DetailGeometryWriter();
  const radialPattern = family === 'pine'
    ? [1, .86, 1, .9, .96, .88, 1]
    : family === 'shrub' ? [1, .9, 1.03, .92, 1, .87, .98] : [1, .97, 1, .95, .99, .96, 1, .98];
  const rings = levels.map(([height, radius], level) => Array.from({ length: segments }, (_, segment) => {
    const angle = segment / segments * Math.PI * 2 + (level % 2 ? phase : -phase * .35);
    const ripple = family === 'snow' ? 1 : 1 + Math.sin(segment * 2.3 + level * 1.7) * .025;
    const reach = Math.min(.5, radius * radialPattern[segment % radialPattern.length]! * ripple);
    const y = Math.max(-.5, Math.min(.5, height + (family === 'pine' && segment % 2 ? .012 : 0)));
    return [Math.cos(angle) * reach, y, Math.sin(angle) * reach] as Vec3;
  }));
  for (let level = 0; level < rings.length - 1; level++) {
    const lower = rings[level]!, upper = rings[level + 1]!;
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const angle = (segment + .5) / segments * Math.PI * 2;
      writer.quad(lower[segment]!, lower[next]!, upper[next]!, upper[segment]!,
        [Math.cos(angle), levels[level]![1] - levels[level + 1]![1], Math.sin(angle)]);
    }
  }
  const bottom = rings[0]!, top = rings[rings.length - 1]!;
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    writer.triangle([0, -.5, 0], bottom[next]!, bottom[segment]!, [0, -1, 0]);
    writer.triangle([0, .5, 0], top[segment]!, top[next]!, [0, 1, 0]);
  }
  return writer.finish(`outer-ring-detail-${family}`, family);
}

function detailGeometry(family: TownD2CloudTerraceMaterialFamily): BufferGeometry {
  if (family === 'stone' || family === 'timber') return beveledBlock(family);
  if (family === 'pine') return radialDetail(family, [
    [-.5, .34], [-.36, .5], [-.27, .41], [-.06, .46], [.06, .27], [.27, .34], [.5, .015],
  ], 7, .055);
  if (family === 'shrub') return radialDetail(family, [
    [-.5, .3], [-.35, .46], [-.1, .5], [.15, .41], [.36, .27], [.5, .03],
  ], 7, .09);
  return radialDetail(family, [
    [-.5, .38], [-.38, .49], [-.16, .5], [.12, .42], [.35, .2], [.5, .05],
  ], 8, .03);
}

function weatheredColor(placement: TownD2CloudTerraceOuterRingPlacement, index: number, target: Color) {
  const hash = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(Math.round(placement.east * 16), 0x85ebca6b) ^
    Math.imul(Math.round(placement.north * 16), 0xc2b2ae35) ^ Math.imul(Math.round(placement.base * 32), 0x27d4eb2f);
  target.set(PALETTE[placement.material][(hash >>> 0) % PALETTE[placement.material].length]!);
  return target.offsetHSL(0, 0, (((hash >>> 8) & 7) - 3) * .004);
}

export function createTownD2CloudTerraceOuterRing(options: Readonly<{ seed?: number }> = {}) {
  const seed = options.seed ?? TOWN_D2_CLOUD_TERRACE_OUTER_RING_SEED;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Cloud-terrace outer-ring seed must be an unsigned 32-bit integer.');
  }
  const random = makeRandom(seed);
  const between = (low: number, high: number) => low + (high - low) * random();
  const group = new Group();
  group.name = 'town-d2-cloud-terrace-outer-ring';

  // Heights are irrelevant to this plan-distance gate. Zero samplers keep
  // the test/creation path independent of the host terrain grid.
  const centreline = buildSwitchbackCenterline(() => 0, () => 0);
  const bounds = TOWN_D2_CLOUD_TERRACE_OUTER_RING_BOUNDS;
  const roadSegments: Array<Readonly<{ a: { east: number; north: number }; b: { east: number; north: number } }>> = [];
  for (let i = 1; i < centreline.length; i++) {
    const a = centreline[i - 1]!, b = centreline[i]!;
    if (Math.max(a.east, b.east) < bounds.west - 8 || Math.min(a.east, b.east) > bounds.east + 8 ||
        Math.max(a.north, b.north) < bounds.south - 8 || Math.min(a.north, b.north) > bounds.north + 8) continue;
    roadSegments.push({ a, b });
  }
  const distanceToRoad = (east: number, north: number) => {
    let distance = Infinity;
    for (const segment of roadSegments) {
      distance = Math.min(distance, pointSegmentDistance(east, north, segment.a, segment.b));
    }
    return distance;
  };

  const reservations: Reservation[] = [];
  const placements: TownD2CloudTerraceOuterRingPlacement[] = [];
  let structureSerial = 0;
  let pieceSerial = 0;

  function clearFootprint(area: Footprint, structureId: string) {
    if (![area.east, area.north, area.halfEast, area.halfNorth, area.radius].every(Number.isFinite)) return false;
    if (area.east - area.halfEast < bounds.west || area.east + area.halfEast > bounds.east ||
        area.north - area.halfNorth < bounds.south || area.north + area.halfNorth > bounds.north) return false;
    if (overlaps(area, PLATFORM, EXCLUSION_MARGIN) || overlaps(area, RUNWAY, EXCLUSION_MARGIN) ||
        overlaps(area, NORTH_WALL, EXCLUSION_MARGIN)) return false;
    if (distanceToRoad(area.east, area.north) - area.radius < TOWN_D2_CLOUD_TERRACE_ROAD_CLEARANCE) return false;
    return reservations.every(reservation => reservation.id === structureId || !footprintsOverlap(area, reservation.footprint, .08));
  }

  function reserve(structureId: string, east: number, north: number, width: number, depth: number, yaw = 0) {
    const area = footprint(east, north, width, depth, yaw);
    if (!clearFootprint(area, structureId)) return false;
    reservations.push({ id: structureId, footprint: area });
    return true;
  }

  function addPiece(structureId: string, anchorEast: number, anchorNorth: number, input: PieceInput) {
    const yaw = input.yaw ?? 0;
    const area = footprint(input.east, input.north, input.width, input.depth, yaw);
    if (!clearFootprint(area, structureId)) return false;
    if (![input.east, input.north, input.width, input.tall, input.depth, yaw].every(Number.isFinite) ||
        Math.min(input.width, input.tall, input.depth) <= 0) return false;
    const height = sampleNorthRidge350(input.east, input.north);
    // Small pieces meet the canonical surface at their own centre. Large
    // retained structures pass an explicit stepped foundation instead.
    const base = input.base ?? height - .04;
    const placement: TownD2CloudTerraceOuterRingPlacement = Object.freeze({
      id: `town-d2-cloud-outer-${String(++pieceSerial).padStart(4, '0')}`,
      structureId,
      kind: input.kind,
      material: input.material,
      east: input.east,
      north: input.north,
      height,
      anchorEast,
      anchorNorth,
      anchorHeight: sampleNorthRidge350(anchorEast, anchorNorth),
      x: input.east,
      y: base + input.tall / 2,
      z: -input.north,
      base,
      width: input.width,
      tall: input.tall,
      depth: input.depth,
      yaw,
      grounded: input.grounded ?? true,
    });
    placements.push(placement);
    return true;
  }

  function rockStep(east: number, north: number) {
    const id = `town-d2-cloud-outer-rock-${++structureSerial}`;
    if (!reserve(id, east, north, 2.25, 2.25)) return;
    // The terrace sampler has a real five-metre rim cliff. Five narrow
    // columns follow that profile instead of one 20 m tall bounding box.
    const columnWidth = .43;
    let middleTop = sampleNorthRidge350(east, north);
    for (let column = -2; column <= 2; column++) {
      const columnEast = east + column * .44;
      const localGround = sampleNorthRidge350(columnEast, north);
      const localVariation = Math.abs(sampleNorthRidge350(columnEast + columnWidth / 2, north) -
        sampleNorthRidge350(columnEast - columnWidth / 2, north));
      const tall = Math.max(.62, Math.min(2.4, .58 + localVariation * .55));
      const base = localGround - .32;
      addPiece(id, east, north, {
        kind: 'terrace-rock-step', material: 'stone', east: columnEast, north,
        width: columnWidth, tall, depth: between(1.45, 1.9),
        yaw: between(-.08, .08), base,
      });
      if (column === 0) middleTop = base + tall;
    }
    const upperHeight = between(.34, .52);
    addPiece(id, east, north, {
      kind: 'terrace-rock-step', material: 'stone', east, north,
      width: .72, tall: upperHeight, depth: between(.85, 1.2),
      yaw: between(-.2, .2), base: middleTop, grounded: false,
    });
    if (random() < .62) {
      addPiece(id, east, north, {
        kind: 'snowdrift', material: 'snow', east: east + between(-.12, .12), north: north + between(-.12, .12),
        width: .58, tall: between(.1, .18), depth: between(.58, .88),
        yaw: between(-.2, .2), base: middleTop + upperHeight, grounded: false,
      });
    }
  }

  function viewingNiche(east: number, north: number, facing: 'west' | 'east' | 'north' | 'south') {
    const id = `town-d2-cloud-outer-niche-${++structureSerial}`;
    if (!reserve(id, east, north, 3.8, 3.8)) return;
    const ground = terrainFootprintBase(east, north, 3.8, 3.8);
    const base = ground.base;
    const wallHeight = 2.05 + ground.variation;
    const sideHeight = 1.82 + ground.variation;
    const horizontal = facing === 'west' || facing === 'east';
    const inward = facing === 'west' ? 1 : facing === 'east' ? -1 : facing === 'north' ? -1 : 1;
    const backEast = horizontal ? east + inward * 1.15 : east;
    const backNorth = horizontal ? north : north + inward * 1.15;
    addPiece(id, east, north, {
      kind: 'viewing-niche', material: 'stone', east: backEast, north: backNorth,
      width: horizontal ? .55 : 2.85, tall: wallHeight, depth: horizontal ? 2.85 : .55, base,
    });
    for (const side of [-1, 1]) {
      addPiece(id, east, north, {
        kind: 'viewing-niche', material: 'stone',
        east: horizontal ? east : east + side * 1.15,
        north: horizontal ? north + side * 1.15 : north,
        width: horizontal ? 2.85 : .55, tall: sideHeight, depth: horizontal ? .55 : 2.85, base,
      });
    }
    addPiece(id, east, north, {
      kind: 'viewing-niche', material: 'stone', east, north,
      width: 3.25, tall: .24 + ground.variation, depth: 3.25, base: base - .08,
    });
    addPiece(id, east, north, {
      kind: 'viewing-niche', material: 'stone', east: backEast - inward * .45, north: backNorth - (horizontal ? 0 : inward * .45),
      width: horizontal ? .9 : 1.05, tall: .43, depth: horizontal ? 1.05 : .9, base: base + .24, grounded: false,
    });
    addPiece(id, east, north, {
      kind: 'viewing-niche', material: 'stone', east, north,
      width: 3.15, tall: .38, depth: 3.15, base: base + 1.86 + ground.variation, grounded: false,
    });
    addPiece(id, east, north, {
      kind: 'snowdrift', material: 'snow', east: east + between(-.25, .25), north: north + between(-.2, .2),
      width: 2.25, tall: .12, depth: 2.4, base: base + 2.24 + ground.variation, grounded: false,
    });
  }

  function transitionPine(east: number, north: number) {
    const id = `town-d2-cloud-outer-pine-${++structureSerial}`;
    if (!reserve(id, east, north, 4.1, 4.1)) return;
    const groundHeight = sampleNorthRidge350(east, north);
    const base = groundHeight - .08;
    const height = between(4.8, 7.1);
    const trunkHeight = height * .62;
    addPiece(id, east, north, {
      kind: 'transition-pine', material: 'timber', east, north,
      width: between(.3, .46), tall: trunkHeight, depth: between(.3, .46), base,
    });
    const tiers = [
      { base: .27, width: 2.85, tall: .31 },
      { base: .49, width: 2.2, tall: .28 },
      { base: .69, width: 1.48, tall: .25 },
    ];
    tiers.forEach((tier, index) => {
      const tierEast = east + (index === 2 ? between(-.12, .12) : 0);
      const tierNorth = north + (index === 2 ? between(-.12, .12) : 0);
      addPiece(id, east, north, {
        kind: 'transition-pine', material: 'pine', east: tierEast, north: tierNorth,
        width: tier.width * height / 6.2, tall: tier.tall * height, depth: tier.width * height / 6.2,
        yaw: between(-.12, .12) + index * .17, base: base + tier.base * height, grounded: false,
      });
      if (index > 0) {
        addPiece(id, east, north, {
          kind: 'snowdrift', material: 'snow', east: tierEast + .08, north: tierNorth - .06,
          width: tier.width * height / 7.8, tall: .1, depth: tier.width * height / 8.4,
          yaw: index * .17, base: base + (tier.base + tier.tall) * height - .04, grounded: false,
        });
      }
    });
  }

  function transitionShrub(east: number, north: number) {
    const id = `town-d2-cloud-outer-shrub-${++structureSerial}`;
    if (!reserve(id, east, north, 2.15, 2.15)) return;
    const base = sampleNorthRidge350(east, north) - .04;
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + between(-.25, .25);
      const offset = i === 0 ? 0 : between(.35, .62);
      const size = between(.62, 1.02);
      addPiece(id, east, north, {
        kind: 'transition-shrub', material: 'shrub',
        east: east + Math.cos(angle) * offset, north: north + Math.sin(angle) * offset,
        width: size, tall: size * between(.65, .95), depth: size,
        yaw: between(-.4, .4),
      });
    }
    if (random() < .45) {
      addPiece(id, east, north, {
        kind: 'snowdrift', material: 'snow', east: east + .12, north: north - .08,
        width: 1.15, tall: .1, depth: .9, base: base + .68, grounded: false,
      });
    }
  }

  function snowdrift(east: number, north: number) {
    const id = `town-d2-cloud-outer-snow-${++structureSerial}`;
    if (!reserve(id, east, north, 2.45, 2.1)) return;
    for (let i = 0; i < 3; i++) {
      const width = between(.8, 1.45), depth = between(.65, 1.2);
      const localEast = (i - 1) * between(.25, .55);
      const localNorth = between(-.28, .28);
      addPiece(id, east, north, {
        kind: 'snowdrift', material: 'snow', east: east + localEast, north: north + localNorth,
        width, tall: between(.18, .38), depth,
        yaw: between(-.3, .3),
      });
    }
  }

  function lanternRemnant(east: number, north: number) {
    const id = `town-d2-cloud-outer-lantern-${++structureSerial}`;
    if (!reserve(id, east, north, 1.85, 1.85)) return;
    const base = sampleNorthRidge350(east, north) - .04;
    const broken = random() < .68;
    addPiece(id, east, north, {
      kind: 'lantern-remnant', material: 'stone', east, north,
      width: .92, tall: .22, depth: .92, base,
    });
    addPiece(id, east, north, {
      kind: 'lantern-remnant', material: 'stone', east, north,
      width: .42, tall: broken ? between(.42, .72) : between(.9, 1.15),
      depth: .42, yaw: between(-.15, .15), base: base + .22, grounded: false,
    });
    if (broken) {
      addPiece(id, east, north, {
        kind: 'lantern-remnant', material: 'stone', east: east + .52, north: north + .24,
        width: .68, tall: .2, depth: .62, yaw: between(.35, .8),
      });
    } else {
      addPiece(id, east, north, {
        kind: 'lantern-remnant', material: 'stone', east, north,
        width: .88, tall: .2, depth: .88, yaw: Math.PI / 4, base: base + 1.12, grounded: false,
      });
      addPiece(id, east, north, {
        kind: 'snowdrift', material: 'snow', east: east + .08, north: north - .05,
        width: .48, tall: .09, depth: .48, yaw: Math.PI / 4, base: base + 1.32, grounded: false,
      });
    }
  }

  // Four stepped terrace lips. The south lip is split around the gate leg.
  for (let north = 620; north <= 680; north += 2.6) {
    rockStep(285.4, north);
    rockStep(354.6, north);
  }
  for (let east = 290; east <= 350; east += 2.6) rockStep(east, 684.25);
  for (let east = 290; east <= 308; east += 2.6) rockStep(east, 615.35);
  for (let east = 356; east <= 376; east += 2.6) rockStep(east, 615.35);

  // Hollow, open-faced stone lookouts; never fill the opening with a box.
  viewingNiche(275, 641, 'west');
  viewingNiche(365, 641, 'east');
  viewingNiche(319, 602, 'south');
  viewingNiche(280.5, 609.5, 'south');
  viewingNiche(369.5, 609.5, 'south');

  const pineSites = [
    [275.5, 624], [276.5, 672], [365.5, 623], [366.5, 674], [274.5, 650], [375.5, 650],
    [282.5, 605.5], [362.5, 605.5], [273.5, 695], [375.5, 695], [357.5, 687.5], [287.5, 687.5],
  ] as const;
  pineSites.forEach(([east, north]) => transitionPine(east, north));

  const lanternSites = [
    [278.5, 657], [364.5, 657], [300, 606.5], [374, 632], [275, 680], [366, 680],
  ] as const;
  lanternSites.forEach(([east, north]) => lanternRemnant(east, north));

  // Deterministic transition infill. Reservations prevent independent
  // shrubs/drifts from occupying a niche opening or interleaving a stair.
  for (let i = 0; i < 150; i++) {
    const east = between(bounds.west + 1.2, bounds.east - 1.2);
    const north = between(bounds.south + 1.2, bounds.north - 1.2);
    const chance = random();
    if (chance < .36) transitionShrub(east, north);
    else if (chance < .69) snowdrift(east, north);
    else if (chance < .84) transitionPine(east, north);
    else rockStep(east, north);
  }

  const geometries = new Map<TownD2CloudTerraceMaterialFamily, BufferGeometry>();
  const materials = new Map<TownD2CloudTerraceMaterialFamily, MeshLambertMaterial>();
  const batches: InstancedMesh[] = [];
  const dummy = new Object3D();
  const tint = new Color();
  for (const family of Object.keys(PALETTE) as TownD2CloudTerraceMaterialFamily[]) {
    const geometry = detailGeometry(family);
    geometries.set(family, geometry);
    const material = new MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
    materials.set(family, material);
    const subset = placements.filter(placement => placement.material === family);
    const batch = new InstancedMesh(geometry, material, Math.max(1, subset.length));
    batch.name = `town-d2-cloud-terrace-outer-${family}`;
    subset.forEach((placement, index) => {
      dummy.position.set(placement.x, placement.y, placement.z);
      dummy.rotation.set(0, placement.yaw, 0);
      dummy.scale.set(placement.width, placement.tall, placement.depth);
      dummy.updateMatrix();
      batch.setMatrixAt(index, dummy.matrix);
      batch.setColorAt(index, weatheredColor(placement, index, tint));
    });
    batch.count = subset.length;
    batch.instanceMatrix.setUsage(StaticDrawUsage);
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    group.add(batch);
    batches.push(batch);
  }

  const byKind = {} as Record<TownD2CloudTerraceOuterRingKind, number>;
  const byMaterial = {} as Record<TownD2CloudTerraceMaterialFamily, number>;
  for (const placement of placements) {
    byKind[placement.kind] = (byKind[placement.kind] ?? 0) + 1;
    byMaterial[placement.material] = (byMaterial[placement.material] ?? 0) + 1;
  }
  const triangleCount = batches.reduce((sum, batch) => {
    const trianglesPerInstance = (batch.geometry.index?.count ?? batch.geometry.getAttribute('position').count) / 3;
    return sum + trianglesPerInstance * batch.count;
  }, 0);
  const stats = Object.freeze({
    seed,
    placements: placements.length,
    placementCount: placements.length,
    instances: placements.length,
    instanceCount: placements.length,
    draws: batches.length,
    drawCalls: batches.length,
    meshes: batches.length,
    meshCount: batches.length,
    materialFamilies: Object.freeze([...materials.keys()]),
    materialFamilyCount: materials.size,
    geometryVariants: geometries.size,
    triangleCount,
    byKind: Object.freeze(byKind),
    byMaterial: Object.freeze(byMaterial),
    bounds: Object.freeze({ ...bounds }),
    roadClearance: TOWN_D2_CLOUD_TERRACE_ROAD_CLEARANCE,
    visualOnly: true,
  });
  const publicPlacements = Object.freeze([...placements]);
  group.userData = {
    seed,
    bounds,
    stats,
    visualOnly: true,
    includesWorldCollision: false,
    includesLights: false,
    includesText: false,
    modifiesHeightAt: false,
    terrainSampler: 'sampleNorthRidge350',
  };

  let disposed = false;
  return {
    group,
    placements: publicPlacements,
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      batches.forEach(batch => batch.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.userData.disposed = true;
    },
  };
}
