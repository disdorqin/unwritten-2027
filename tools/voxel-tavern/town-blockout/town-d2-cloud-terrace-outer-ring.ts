import {
  BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D, StaticDrawUsage,
  type BufferGeometry,
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
  stone: ['#8a8378', '#756f66', '#9a9385', '#686d68'],
  timber: ['#5d4630', '#71543b', '#493a2d'],
  pine: ['#44503c', '#536348', '#394638'],
  shrub: ['#57684c', '#667455', '#495b43'],
  snow: ['#e8ecf0', '#d6e4f2', '#cbd9e2'],
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

  const geometry: BufferGeometry = new BoxGeometry(1, 1, 1);
  const materials = new Map<TownD2CloudTerraceMaterialFamily, MeshLambertMaterial>();
  const batches: InstancedMesh[] = [];
  const dummy = new Object3D();
  const tint = new Color();
  for (const family of Object.keys(PALETTE) as TownD2CloudTerraceMaterialFamily[]) {
    const material = new MeshLambertMaterial({ color: '#ffffff' });
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
      batch.setColorAt(index, tint.set(PALETTE[family][index % PALETTE[family].length]!));
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
      geometry.dispose();
      materials.forEach(material => material.dispose());
      group.userData.disposed = true;
    },
  };
}
