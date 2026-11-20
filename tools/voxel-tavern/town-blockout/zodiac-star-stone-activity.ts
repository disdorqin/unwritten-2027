import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { TownActivity, TownActivitySpot } from './town-activity';

export type ZodiacStarStonePoint = Readonly<{
  area: string;
  east: number;
  north: number;
  height: number;
}>;

type VisibleStone = Readonly<{
  id: string;
  revision: number;
  phase: 'origin' | 'held' | 'dropped' | 'ring';
  origin?: ZodiacStarStonePoint;
  dropPosition?: ZodiacStarStonePoint;
  pickupLockedUntilMs?: number;
}>;

export type ZodiacStarStoneView = Readonly<{
  area: string;
  /** Only the host's authorized visible projection for this viewer. */
  progress: Readonly<{ ringCount: number; stones: readonly VisibleStone[] }>;
  /** The current authenticated viewer's inventory from the host. */
  carriedStones: readonly Readonly<{ id: string; revision: number }>[];
  ring?: Readonly<{ position: ZodiacStarStonePoint; approach: ZodiacStarStonePoint }>;
}>;

export type ZodiacStarStoneRequest = Readonly<{
  kind: 'pickup' | 'deposit';
  stoneId: string;
  revision: number;
}>;

type Options = Readonly<{
  range: number;
  serverNow(): number;
  submit(request: ZodiacStarStoneRequest): void;
}>;

const ringCapacity = 12;
const stoneColors = [0x71c4ba, 0x6a98da, 0xc786ca, 0xe9a66c, 0x9abe77, 0xa89adf, 0xe39193, 0xd6bd6a];

function pointInArea(point: ZodiacStarStonePoint | undefined, area: string): point is ZodiacStarStonePoint {
  return point?.area === area && Number.isFinite(point.east) && Number.isFinite(point.north)
    && Number.isFinite(point.height);
}

function place(group: Group, point: ZodiacStarStonePoint) {
  group.position.set(point.east, point.height, -point.north);
}

function stoneColorIndex(id: string) {
  let hash = 0;
  for (const char of id) hash = (31 * hash + char.charCodeAt(0)) >>> 0;
  return hash % stoneColors.length;
}

export function createZodiacStarStoneActivity(scene: Scene, options: Options): TownActivity & {
  sync(view: ZodiacStarStoneView): void;
  ringCount(): number;
  dispose(): void;
} {
  if (!Number.isFinite(options.range) || options.range <= 0) throw new RangeError('Invalid star stone activity range');

  const objects = new Group();
  objects.name = 'zodiac-star-stones';
  scene.add(objects);

  const block = new BoxGeometry(1, 1, 1);
  const crystal = new CylinderGeometry(.58, .85, 1, 6);
  const disc = new CylinderGeometry(1, 1, 1, 24);
  const stone = new MeshStandardMaterial({ color: 0x5c606b, roughness: .88 });
  const brass = new MeshStandardMaterial({ color: 0xb88948, roughness: .57, metalness: .34 });
  const recess = new MeshStandardMaterial({ color: 0x252830, roughness: .92 });
  const inlay = new MeshStandardMaterial({ color: 0xffe4ab, roughness: .48 });
  const gems = stoneColors.map(color => new MeshStandardMaterial({
    color, roughness: .47, metalness: .12, emissive: color, emissiveIntensity: .12,
  }));

  const spots: TownActivitySpot[] = [];
  let ringCount = 0;
  let viewKey: string | undefined;
  let generation = 0;
  let disposed = false;

  function piece(parent: Group, material: MeshStandardMaterial, shape: BoxGeometry | CylinderGeometry,
    width: number, height: number, depth: number, y: number) {
    const mesh = new Mesh(shape, material);
    mesh.position.y = y;
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }

  function socket(parent: Group) {
    piece(parent, stone, block, .62, .10, .56, .05);
    piece(parent, brass, block, .49, .08, .43, .14);
    piece(parent, recess, block, .36, .018, .32, .186);
  }

  function plate(parent: Group, color: MeshStandardMaterial, height: number) {
    const group = new Group();
    group.position.y = height;
    parent.add(group);
    piece(group, color, crystal, .31, .38, .17, .19).rotation.y = Math.PI / 6;
    for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const arm = piece(group, inlay, block, angle % (Math.PI / 2) === 0 ? .105 : .070, .018, .013, .223);
      arm.rotation.z = angle;
      arm.position.z = .117;
    }
  }

  function addRing(position: ZodiacStarStonePoint) {
    const group = new Group();
    group.name = 'star-stone-ring';
    place(group, position);
    piece(group, stone, disc, .86, .18, .86, .09);
    piece(group, recess, disc, .69, .48, .69, .42);
    piece(group, brass, disc, 1.08, .11, 1.08, .715);
    piece(group, stone, disc, 1.02, .05, 1.02, .795);
    piece(group, recess, disc, .44, .027, .44, .833);
    for (let index = 0; index < ringCapacity; index++) {
      const angle = index * 2 * Math.PI / ringCapacity;
      const seat = new Group();
      seat.name = index < ringCount ? 'star-stone-ring-filled' : 'star-stone-ring-empty';
      seat.position.set(.79 * Math.sin(angle), .83, .79 * Math.cos(angle));
      seat.rotation.y = angle;
      group.add(seat);
      piece(seat, brass, block, .28, .048, .25, .024);
      piece(seat, recess, block, .21, .012, .19, .054);
      if (index < ringCount) {
        piece(seat, inlay, crystal, .13, .15, .13, .129).rotation.y = Math.PI / 6;
      }
    }
    objects.add(group);
  }

  function addSpot(point: ZodiacStarStonePoint, label: string, request: ZodiacStarStoneRequest,
    pickupLockedUntilMs?: number) {
    const attachedGeneration = generation;
    const available = () => attachedGeneration === generation
      && (pickupLockedUntilMs === undefined || options.serverNow() >= pickupLockedUntilMs);
    spots.push({
      x: point.east, n: point.north, ground: point.height, range: options.range, label, available,
      run() {
        if (available()) options.submit(request);
      },
    });
  }

  return {
    // The same list can be passed to nearestTownActivity on every input frame.
    spots,
    ringCount: () => ringCount,
    sync({ area, progress, carriedStones, ring }) {
      if (disposed) return;
      ringCount = Number.isInteger(progress.ringCount) ? Math.max(0, Math.min(progress.ringCount, ringCapacity)) : 0;
      const stones = progress.stones.map(stone => ({
        id: stone.id,
        revision: stone.revision,
        occupied: stone.phase === 'origin',
        origin: pointInArea(stone.origin, area) ? stone.origin : undefined,
        drop: stone.phase === 'dropped' && pointInArea(stone.dropPosition, area) ? stone.dropPosition : undefined,
        lockedUntil: stone.phase === 'dropped' ? stone.pickupLockedUntilMs : undefined,
      })).filter(stone => stone.origin || stone.drop);
      const ringPosition = pointInArea(ring?.position, area) ? ring.position : undefined;
      const ringApproach = ringPosition && pointInArea(ring?.approach, area) ? ring.approach : undefined;
      const toDeposit = ringApproach && carriedStones[0];
      const nextKey = JSON.stringify([stones, ringPosition, ringPosition ? ringCount : undefined, ringApproach, toDeposit]);
      if (nextKey === viewKey) return;
      viewKey = nextKey;
      generation++;
      spots.length = 0;
      objects.clear();

      for (const { id, revision, occupied, origin, drop, lockedUntil } of stones) {
        const color = gems[stoneColorIndex(id)];
        if (origin) {
          const group = new Group();
          group.name = occupied ? 'star-stone-occupied-seat' : 'star-stone-empty-seat';
          place(group, origin);
          socket(group);
          objects.add(group);
          if (occupied) {
            plate(group, color, .195);
            addSpot(origin, '拾取星石', { kind: 'pickup', stoneId: id, revision });
          }
        }
        if (drop) {
          const group = new Group();
          group.name = 'star-stone-dropped';
          place(group, drop);
          plate(group, color, .018);
          objects.add(group);
          addSpot(drop, '拾取星石', { kind: 'pickup', stoneId: id, revision }, lockedUntil);
        }
      }
      if (ringPosition) addRing(ringPosition);
      if (ringApproach && toDeposit) {
        addSpot(ringApproach, '将星石镶入环中', { kind: 'deposit', stoneId: toDeposit.id, revision: toDeposit.revision });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      spots.length = 0;
      objects.clear();
      objects.removeFromParent();
      for (const resource of [block, crystal, disc, stone, brass, recess, inlay, ...gems]) resource.dispose();
    },
  };
}
