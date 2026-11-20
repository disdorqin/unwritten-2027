import {
  BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PlaneGeometry, SRGBColorSpace,
} from 'three';
import { undergroundCampDiningTables } from '../../../src/shared/underground-camp-pickaxe';

type Point = readonly [x: number, y: number, z: number];
type Span = { from: Point; to: Point; zone: string };
type Passage = { zone: string; floor: number; clearance: number };
type MineSupport = {
  route: readonly Span[];
  anchors: { campRecovery: { position: Point } };
  queryPassage(x: number, z: number, radius: number, bodyHeight: number): Passage | undefined;
};
type Options = {
  mine: MineSupport;
  camp: { side: 'left' | 'right'; length: number; extension: number };
  walker: { radius: number; standingHeight: number };
};
type Bounds = { min: Point; max: Point };
type Prop = Bounds & { id: string; color: string };
type Sign = { text: string; position: Point; size: readonly [number, number]; rotation: number; color: string };

const wood = '#49382d';
const board = '#69503a';
const wornWood = '#806247';
const iron = '#2a2f30';
const masonry = ['#4f4b47', '#59534c', '#615a51', '#514e49'];
const linen = '#aca18b';
const clay = '#b6a68a';

export const undergroundCampInscriptions = {
  canteen: '慢些吃',
  memorial: '慢些走',
} as const;

const roomTraces = [
  'tucked-bedding', 'open-cabinet-and-glove', 'height-marks',
  'scarf-and-unreadable-paper', 'chest-and-tea', 'ajar-and-empty',
] as const;

/** Compose the furnished camp against a real mine layout. Coordinates share its elevation and deeper +Z axis. */
export function createUndergroundCampRemains({ mine, camp, walker }: Options) {
  const recovery = mine.anchors.campRecovery.position;
  const spine = mine.route.at(-2);
  const lateral = mine.route.at(-1);
  const { length, side, extension } = camp;
  const { radius, standingHeight } = walker;
  if (!spine || !lateral || spine.zone !== 'camp' || lateral.zone !== 'camp' ||
      ![...recovery, ...spine.from, ...spine.to, length, extension, radius, standingHeight].every(Number.isFinite) ||
      radius <= 0 || standingHeight <= 0 || length < 10 || extension < 5 ||
      (side !== 'right' && side !== 'left')) throw new RangeError('Camp remains require a supported mine hall');
  const sign = side === 'right' ? 1 : -1;
  const floor = recovery[1];
  const start = spine.from[2];
  const artStart = start + (length - 10) / 2;
  const dormShift = extension - 5;
  const mid = start + length / 2;
  const expectedRecovery = [sign * extension / 2, floor, mid];
  if (spine.from[0] !== 0 || spine.to[0] !== 0 || spine.to[2] !== mid ||
      spine.from[1] !== floor || spine.to[1] !== floor ||
      lateral.to.some((component, axis) => component !== recovery[axis]) ||
      recovery.some((component, axis) => component !== expectedRecovery[axis]) ||
      !mine.queryPassage(sign * (1.99 + extension), mid, 0, .1) ||
      !mine.queryPassage(-sign * 1.99, mid, 0, .1) ||
      !mine.queryPassage(0, start + length - .01, 0, .1)) {
    throw new RangeError('Camp remains do not match the mine axis, boundary, or recovery anchor');
  }

  const at = (x: number, y: number, z: number): Point => [sign * x, floor + y, artStart + z];
  const props: Prop[] = [];
  const colliders: (Bounds & { id: string })[] = [];
  const signs: Sign[] = [];
  function extent(x: number, y: number, z: number, width: number, height: number, depth: number): Bounds {
    return {
      min: [sign * x - width / 2, floor + y, artStart + z - depth / 2],
      max: [sign * x + width / 2, floor + y + height, artStart + z + depth / 2],
    };
  }
  function box(id: string, color: string, x: number, y: number, z: number,
      width: number, height: number, depth: number) {
    props.push({ id, color, ...extent(x, y, z, width, height, depth) });
  }
  function solid(id: string, x: number, y: number, z: number, width: number, height: number, depth: number) {
    colliders.push({ id, ...extent(x, y, z, width, height, depth) });
  }
  function partition(index: number, z: number) {
    const id = 'stone-partition-' + index;
    const wallX = dormShift + 5.77;
    solid(id, wallX, 0, z, 2.30, 2.11, .13);
    for (let row = 0; row < 8; row++) {
      // Stagger the seams while keeping an uninterrupted collision face.
      const ends = row % 2 ? [0, .29, .92, 1.61, 2.30] : [0, .55, 1.15, 1.74, 2.30];
      for (let brick = 0; brick < ends.length - 1; brick++) {
        const left = ends[brick], right = ends[brick + 1];
        const color = masonry[(index + row + brick * 3) % masonry.length];
        box(id, color, wallX - 1.15 + (left + right) / 2, .263 * row, z + (brick % 2) * .003,
          right - left - .006, .258, .128);
      }
    }
    box(id, '#343634', wallX, 2.09, z, 2.31, .066, .17);
  }

  const roomSpacing = 1.46;
  const firstPartition = .62;
  for (let index = 0; index <= roomTraces.length; index++) partition(index, firstPartition + roomSpacing * index);
  const rooms = roomTraces.map((trace, index) => {
    const id = 'dorm-' + (index + 1);
    const x = dormShift;
    const z = firstPartition + (index + .5) * roomSpacing;
    const bedZ = z + .31;
    const cabinetZ = z - .34;
    const bed = id + '/bed';
    const cabinet = id + '/cabinet';
    const hooks = id + '/hooks';

    solid(bed, x + 5.92, 0, bedZ, 1.80, .56, .63);
    box(bed, board, x + 5.92, .18, bedZ, 1.78, .20, .62);
    for (const dx of [-.80, .80]) for (const dz of [-.24, .24]) {
      box(bed, wood, x + 5.92 + dx, .005, bedZ + dz, .10, .24, .11);
    }
    box(bed, wornWood, x + 6.74, .354, bedZ, .148, .28, .628);
    box(bed, wood, x + 5.10, .29, bedZ, .12, .16, .619);
    box(bed, index === 5 ? '#796f61' : linen, x + 5.92, .378, bedZ, 1.49, .104, .544);
    if (index !== 5) {
      box(bed, '#c0b29c', x + 6.45, .482, bedZ, .30, .076, .44);
      box(bed, index === 0 ? '#7e5140' : '#66644c', x + 5.71, .482, bedZ, 1.10, .046, .553);
      box(bed, '#928779', x + 6.19, .526, bedZ, .087, .013, .549);
    }
    if (trace === 'ajar-and-empty') {
      for (let mark = 0; mark < 4; mark++) {
        box(hooks, '#363631', x + 6.91, 1.34 + .02 * (mark % 2), z + .25 - mark * .14, .027, .033, .037);
      }
    } else {
      solid(cabinet, x + 6.66, 0, cabinetZ, .49, 1.19, .55);
      box(cabinet, wood, x + 6.75, .055, cabinetZ, .30, 1.09, .54);
      for (const dz of [-.25, .25]) box(cabinet, wornWood, x + 6.64, .056, cabinetZ + dz, .45, 1.11, .052);
      for (const y of [.08, .59, 1.14]) box(cabinet, board, x + 6.63, y, cabinetZ, .464, .053, .497);
      if (trace === 'open-cabinet-and-glove') {
        box(cabinet, board, x + 6.37, .08, cabinetZ + .258, .42, 1.05, .045);
        solid(cabinet, x + 6.37, .08, cabinetZ + .258, .42, 1.05, .045);
        box(id + '/glove', '#7b4b38', x + 6.54, .647, cabinetZ -.045, .11, .034, .19);
        box(id + '/glove', '#9b694d', x + 6.47, .649, cabinetZ + .018, .049, .029, .062);
      } else {
        box(cabinet, board, x + 6.39, .106, cabinetZ, .073, 1.025, .439);
        box(cabinet, iron, x + 6.34, .58, cabinetZ + .133, .047, .04, .069);
      }
      box(hooks, iron, x + 6.87, 1.425, z + .17, .105, .039, .044);
      box(hooks, iron, x + 6.82, 1.442, z + .17, .029, .034, .036);
    }

    if (trace === 'tucked-bedding') {
      box(id + '/folded-corners', '#795240', x + 5.24, .420, bedZ + .259, .145, .063, .012);
      box(id + '/folded-corners', '#795240', x + 5.24, .420, bedZ - .259, .145, .063, .012);
    }
    if (trace === 'height-marks') {
      box(id + '/measuring-board', board, x + 6.88, .92, z - .01, .051, .90, .17);
      for (let mark = 0; mark < 5; mark++) {
        box(id + '/height-marks', '#c8ad87', x + 6.849, 1.16 + .126 * mark, z - .01, .013, .011, .067 + .014 * mark);
      }
    }
    if (trace === 'scarf-and-unreadable-paper') {
      box(id + '/paper', '#bab197', x + 6.918, 1.10, z + .10, .017, .174, .154);
      box(id + '/scarf', '#8e5845', x + 6.84, 1.10, z + .19, .048, .392, .133);
      box(id + '/scarf', '#aa7456', x + 6.81, 1.019, z + .228, .051, .35, .058);
      box(id + '/scarf', '#73574b', x + 6.81, 1.055, z + .232, .054, .027, .063);
    }
    if (trace === 'chest-and-tea') {
      const chest = id + '/tea-chest';
      const chestX = x + 5.03;
      const mugX = chestX - .12;
      solid(chest, chestX, 0, bedZ, .42, .17, .48);
      box(chest, wood, chestX, .012, bedZ, .40, .12, .47);
      box(chest, board, chestX, .132, bedZ, .42, .035, .48);
      box(id + '/tea-mug', '#7f8978', mugX, .167, bedZ + .088, .080, .078, .080);
      box(id + '/tea-mug', '#493c31', mugX, .244, bedZ + .088, .057, .006, .057);
      box(id + '/tea-mug', '#7f8978', mugX, .188, bedZ + .135, .034, .042, .025);
    }
    if (trace === 'ajar-and-empty') {
      const door = id + '/ajar-door';
      // A stepped leaf grazes the partition and leaves a clear standing approach beside it.
      for (let slat = 0; slat < 4; slat++) {
        const doorX = x + 4.64 + .075 * slat;
        const doorZ = z + .62 - .078 * slat;
        solid(door, doorX, .012, doorZ, .125, 1.947, .093);
        box(door, slat % 2 ? wood : board, doorX, .012 + .002 * slat, doorZ, .125, 1.947, .093);
      }
      box(door, iron, x + 4.825, .92, z + .357, .06, .035, .07);
    }
    return {
      id, trace, hasCabinet: index !== 5, hookState: index === 5 ? 'marks' : 'fixed',
      approach: at(x + 5.52, 0, z - .344),
      sit: { position: at(x + 5.52, .525, z + .05), restoresHealth: false },
    };
  });

  const tables = undergroundCampDiningTables.x.map((x, index) => {
    const id = 'canteen-table-' + (index + 1);
    const { depth: z, top } = undergroundCampDiningTables;
    solid(id, x, 0, z, .56, top, 3.00);
    for (let plank = 0; plank < 3; plank++) {
      box(id, plank === 1 ? wornWood : board, x + (plank - 1) * .18, .697, z, .176, .073, 3);
    }
    for (const dz of [-1.27, 1.27]) {
      box(id, wood, x, .04, z + dz, .43, .68, .105);
      box(id, wornWood, x, .10, z + dz, .47, .108, .157);
    }
    box(id, wood, x, .22, z, .098, .099, 2.48);
    for (const [index, dx] of [-.45, .45].entries()) {
      const bench = id + '/bench-' + (index + 1);
      solid(bench, x + dx, 0, z, .19, .415, 2.79);
      box(bench, board, x + dx, .363, z, .19, .052, 2.79);
      for (const dz of [-1.08, 1.08]) box(bench, wood, x + dx, .01, z + dz, .16, .357, .12);
    }
    if (index === 0) box(id + '/scraped-board', '#987756', x + .105, .768, z - .65, .09, .008, .19);
    return { id, position: at(x, top, z) };
  });

  solid('canteen/cold-stove', -1.43, 0, 7.45, 1.03, 1.02, .80);
  for (let row = 0; row < 4; row++) for (let brick = 0; brick < 3; brick++) {
    const brickZ = 7.20 + brick * .25;
    const offset = (row % 2) * .009;
    box('canteen/cold-stove', masonry[(row + brick * 3) % masonry.length],
      -1.435 + offset, row * .228, brickZ, .987, .221, .246);
  }
  box('canteen/cold-stove', '#41423e', -1.43, .912, 7.45, 1.03, .105, .80);
  box('canteen/cold-stove', '#2b2c2a', -.919, .31, 7.45, .033, .295, .418);
  box('canteen/cold-stove', iron, -.894, .48, 7.52, .042, .046, .098);
  box('canteen/cold-stove/flue', iron, -1.78, 1.017, 7.25, .223, 1.35, .223);
  solid('canteen/cold-stove/flue', -1.78, 1.017, 7.25, .223, 1.35, .223);

  function bowl(id: string, x: number, y: number, z: number, inverted = false) {
    box(id, clay, x, y, z, inverted ? .172 : .107, .026, inverted ? .172 : .107);
    box(id, '#a28e73', x, y + .024, z, .145, .030, .145);
    box(id, '#cabb9e', x, y + .052, z, inverted ? .088 : .169, .024, inverted ? .088 : .169);
  }
  bowl('canteen/left-bowl', -1.16, 1.018, 7.54, true);
  solid('canteen/bowl-cupboard', -1.67, 0, 6.29, .59, 1.46, .73);
  box('canteen/bowl-cupboard', wood, -1.83, .068, 6.29, .25, 1.39, .73);
  for (const y of [.116, .53, .94, 1.409]) {
    box('canteen/bowl-cupboard', board, -1.67, y, 6.29, .58, .050, .714);
  }
  for (const z of [5.945, 6.635]) box('canteen/bowl-cupboard', wood, -1.68, .068, z, .57, 1.39, .055);
  for (const y of [.583, .658, .733, .994, 1.069]) bowl('canteen/stacked-bowls', -1.53, y, y > .9 ? 6.18 : 6.37);
  for (let slat = 0; slat < 4; slat++) {
    box('canteen/bowl-cupboard/half-open-leaf', board, -1.38 + slat * .024, .096, 5.966 + slat * .061, .055, 1.31, .064);
    solid('canteen/bowl-cupboard/half-open-leaf', -1.38 + slat * .024, .096, 5.966 + slat * .061, .055, 1.31, .064);
  }
  const blackboardZ = 8.46;
  box('canteen/blackboard', wood, -1.918, 1.43, blackboardZ, .095, .46, .96);
  box('canteen/blackboard', '#323b38', -1.861, 1.473, blackboardZ, .022, .374, .88);
  signs.push({ text: undergroundCampInscriptions.canteen, position: at(-1.845, 1.66, blackboardZ),
    size: [.80, .29], rotation: sign * Math.PI / 2, color: '#c3bcaa' });

  const monumentX = 2.60;
  solid('memorial/slab', monumentX, 0, 9.68, 1.92, 1.95, .36);
  box('memorial/slab', masonry[0], monumentX, .003, 9.68, 1.92, .18, .36);
  box('memorial/slab', masonry[1], monumentX, .181, 9.728, 1.68, 1.63, .26);
  box('memorial/slab', masonry[2], monumentX - .083, 1.809, 9.739, 1.43, .141, .245);
  box('memorial/slab', '#69625a', monumentX, 1.115, 9.591, 1.38, .46, .035);
  signs.push({ text: undergroundCampInscriptions.memorial, position: at(monumentX, 1.361, 9.572),
    size: [1.25, .367], rotation: Math.PI, color: '#343431' });

  const niches = Array.from({ length: 6 }, (_, index) => {
    const id = 'memorial/niche-' + (index + 1);
    const x = monumentX + (index - 2.5) * .437;
    const z = 9.35;
    const hasSpentLamp = index % 2 === 0;
    solid(id, x, 0, z, .421, .504, .49);
    box(id, masonry[2], x, .006, z, .415, .160, .479);
    box(id, masonry[0], x, .163, z + .189, .410, .333, .099);
    for (const dx of [-.17, .17]) box(id, masonry[1], x + dx, .165, z, .072, .338, .474);
    box(id, masonry[2], x, .454, z, .417, .052, .48);
    if (hasSpentLamp) {
      const lamp = id + '/spent-lamp';
      box(lamp, index === 2 ? '#867765' : '#64594b', x, .168, z - .038, .182, .05, .159);
      box(lamp, index === 2 ? '#655d54' : iron, x, .217, z - .038, .118, .137, .103);
      box(lamp, '#75736b', x, .232, z - .093, .078, .094, .018);
      box(lamp, '#46443c', x, .354, z - .038, .158, .039, .142);
    }
    return { id, position: at(x, .166, z - .03), hasSpentLamp, lit: false };
  });

  /** The floor and roof are owned by mine; block any intervening solid prop in the standing footprint. */
  function queryPassage(x: number, z: number, playerRadius: number, bodyHeight: number) {
    if (![x, z, playerRadius, bodyHeight].every(Number.isFinite) || playerRadius < 0 || bodyHeight <= 0) return;
    const passage = mine.queryPassage(x, z, playerRadius, bodyHeight);
    if (!passage || passage.zone !== 'camp') return;
    const blocked = colliders.some(({ min, max }) => {
      if (max[1] <= passage.floor || min[1] >= passage.floor + bodyHeight) return false;
      const dx = Math.max(min[0] - x, x - max[0], 0);
      const dz = Math.max(min[2] - z, z - max[2], 0);
      return dx * dx + dz * dz <= playerRadius * playerRadius;
    });
    if (!blocked) return passage;
  }

  const hallSpine = at(0, 0, 5);
  const dormAisle = dormShift + 3.91;
  const turned = at(dormAisle, 0, 5);
  const leftBowl = { id: 'canteen/left-bowl', position: at(-1.16, 1.056, 7.54), approach: at(-.44, 0, 7.45) };
  const canteenTurn = at(0, 0, 7.45);
  const memorialApproach = at(monumentX, 0, 8.76);
  const route = [
    { id: 'entry', points: [[0, floor, start + radius + .02] as Point, hallSpine, recovery] },
    ...rooms.map(room => ({ id: room.id,
      points: [recovery, turned, [turned[0], floor, room.approach[2]] as Point, room.approach] })),
    { id: 'canteen', points: [recovery, at(0, 0, 6), canteenTurn, leftBowl.approach] },
    { id: 'memorial', points: [recovery, at(monumentX, 0, 7.80), memorialApproach] },
  ];
  for (const { id, points } of route) for (let index = 1; index < points.length; index++) {
    const [x0, , z0] = points[index - 1], [x1, , z1] = points[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .05));
    for (let step = 0; step <= steps; step++) {
      const x = x0 + (x1 - x0) * step / steps;
      const z = z0 + (z1 - z0) * step / steps;
      if (queryPassage(x, z, radius, standingHeight)?.floor !== floor) {
        throw new RangeError('Camp remains walking profile is blocked on ' + id + ' at ' + x + ',' + z);
      }
    }
  }

  const group = new Group();
  group.name = 'underground-mine-camp-remains';
  // Empty mounts follow the mine transform. The host supplies active lights from its visible-light budget.
  function lightMount<T extends { id: string; position: Point }>(anchor: T) {
    const mount = new Group();
    mount.name = 'camp-light/' + anchor.id;
    mount.position.fromArray(anchor.position);
    group.add(mount);
    return { ...anchor, mount };
  }
  const offeringAnchors = niches.filter(niche => !niche.hasSpentLamp).map(({ id, position }) =>
    lightMount({ id, position, radius: 8, tone: 'warm' } as const));
  const guideAnchors = [
    { id: 'hall/guide', foot: hallSpine },
    { id: 'canteen/guide', foot: canteenTurn },
  ].map(({ id, foot: [x, y, z] }) =>
    lightMount({ id, position: [x, y + 2.35, z], radius: 4, tone: 'cool' } as const));
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const batch = new InstancedMesh(geometry, material, props.length);
  batch.name = 'camp-voxel-furnishings';
  const transform = new Object3D();
  const color = new Color();
  for (const [index, { min, max, color: tint }] of props.entries()) {
    transform.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    transform.scale.set(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    transform.updateMatrix();
    batch.setMatrixAt(index, transform.matrix);
    batch.setColorAt(index, color.set(tint));
  }
  batch.instanceMatrix.needsUpdate = true;
  batch.instanceColor!.needsUpdate = true;
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  group.add(batch);

  const textMeshes = signs.flatMap(({ text, position, size, rotation, color }) => {
    if (typeof document === 'undefined') return [];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.font = 'bold 55px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 45);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(...size),
      new MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
    mesh.name = 'camp-inscription/' + text;
    mesh.position.fromArray(position);
    mesh.rotation.y = rotation;
    group.add(mesh);
    return [mesh];
  });

  let disposed = false;
  return {
    group, props, colliders, rooms, route, recovery, queryPassage,
    lighting: { offeringAnchors, guideAnchors },
    dining: { tables, bowl: leftBowl, stoveLit: false, sign: undergroundCampInscriptions.canteen },
    memorial: { position: at(monumentX, 1.361, 9.572), approach: memorialApproach,
      inscription: undergroundCampInscriptions.memorial, niches },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mount } of [...offeringAnchors, ...guideAnchors]) mount.clear();
      group.removeFromParent();
      group.clear();
      batch.dispose();
      geometry.dispose();
      material.dispose();
      for (const mesh of textMeshes) {
        mesh.material.map?.dispose();
        mesh.material.dispose();
        mesh.geometry.dispose();
      }
    },
  };
}
