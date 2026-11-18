import type { TownPlot } from './landmark-kit';
import type { TownActivityContext, TownActivitySpot, TownSeat } from './town-activity';

type Point = [number, number, number];
type Bounds = [number, number, number, number, number, number];
type Chair = {
  label: string;
  at: Point;
  yaw: number;
  approach: [number, number];
  source?: [number, number, number]; // The baked chair's east, south and heading.
};

const north = 0;
const south = Math.PI;
const west = -Math.PI / 2;
const chairs: readonly Chair[] = [
  { label: '一楼西侧餐椅一', at: [-2.375, 3, .5625], yaw: west, approach: [-1.625, .5625], source: [-4.25, -.875, south] },
  { label: '一楼西侧餐椅二', at: [-3.875, 3, 1.875], yaw: north, approach: [-3.1, 1.675], source: [-3.5, 1.5, north] },
  { label: '一楼中央餐椅一', at: [1.875, 3, 1.0625], yaw: west, approach: [2.625, 1.0625], source: [0, -.125, south] },
  { label: '一楼中央餐椅二', at: [.75, 3, 2.25], yaw: north, approach: [1.52, 2.35] },
  { label: '一楼琴边餐椅一', at: [-2.75, 3, 2.4375], yaw: south, approach: [-1.97, 2.42], source: [-3.75, 2.875, south] },
  { label: '一楼琴边餐椅二', at: [-1.25, 3, 3.6875], yaw: west, approach: [-.47, 3.6875], source: [-3, 5.25, north] },
  { label: '一楼琴椅', at: [-4.875, 3.25, 4.5], yaw: north, approach: [-4.1, 4.64], source: [-4.875, 4.625, north] },
  { label: '二楼阅览桌餐椅一', at: [-4.25, 8, -3.125], yaw: south, approach: [-3.5, -3.125] },
  { label: '二楼阅览桌餐椅二', at: [-3.5, 8, -.75], yaw: north, approach: [-2.75, -.75] },
  { label: '二楼靠栏餐椅一', at: [.25, 8, .875], yaw: south, approach: [1, .875] },
  { label: '二楼靠栏餐椅二', at: [1, 8, 3.25], yaw: north, approach: [1.75, 3.25] },
];

const stools = Array.from({ length: 6 }, (_, index) => -4.5 + index * 1.125);
const tables = [
  { source: [-4.75, 3, -.25, -3, 4.5, .875] as Bounds, dx: 0, dz: .375 },
  { source: [-4.25, 3, 3.5, -2.5, 4.5, 4.625] as Bounds, dx: .625, dz: -.375 },
];

export function tavernModelToPlot(plot: TownPlot) {
  const sx = plot.footprint[0] / 17.7;
  const sz = plot.footprint[1] / 18;
  return (x: number, y: number, z: number): Point => [x * sx, (y - 2) * .9, (z - 1) * sz];
}

function offset(box: Bounds, dx: number, dz: number): Bounds {
  return [box[0] + dx, box[1], box[2] + dz, box[3] + dx, box[4], box[5] + dz];
}

function chairParts(x: number, y: number, z: number, yaw: number) {
  const parts: { material: string; box: Bounds }[] = [];
  const add = (material: string, px: number, py: number, pz: number, w: number, h: number, d: number) => {
    parts.push({ material, box: [px, py, pz, px + w, py + h, pz + d] });
  };
  for (const dx of [-.375, .25]) for (const dz of [-.375, .25]) add('wood', x + dx, y, z + dz, .125, .5, .125);
  add('plank', x - .4375, y + .5, z - .4375, .875, .125, .875);
  const back = z + (yaw === north ? .25 : -.375);
  for (const dx of [-.375, .25]) add('wood', x + dx, y + .625, back, .125, .75, .125);
  for (const dy of [.875, 1.1875]) add('plank', x - .375, y + dy, back, .75, .125, .125);
  return parts;
}

function fragments([x0, y0, z0, x1, y1, z1]: Bounds): Bounds[] {
  const parts: Bounds[] = [];
  for (let x = Math.floor(x0); x < x1; x++) {
    for (let y = Math.floor(y0); y < y1; y++) {
      for (let z = Math.floor(z0); z < z1; z++) {
        parts.push([Math.max(x0, x), Math.max(y0, y), Math.max(z0, z),
          Math.min(x1, x + 1), Math.min(y1, y + 1), Math.min(z1, z + 1)]);
      }
    }
  }
  return parts;
}

function seatPartKey(material: string, box: Bounds) { return `${material}:${box.join(',')}`; }

// Relocate only the voxel fragments from the original furniture construction.
const movedChairParts = new Map<string, Bounds>();
for (const { at: [x, y, z], yaw, source } of chairs) {
  if (!source) continue;
  const [ox, oz, oldYaw] = source;
  const cos = Math.round(Math.cos(oldYaw - yaw));
  const sin = Math.round(Math.sin(oldYaw - yaw));
  for (const { material, box } of chairParts(ox, y, oz, oldYaw)) {
    for (const fragment of fragments(box)) {
      const [left, bottom, near, right, top, far] = fragment;
      const corners = [[left, near], [left, far], [right, near], [right, far]];
      const xs = corners.map(([px, pz]) => x + (px - ox) * cos + (pz - oz) * sin);
      const zs = corners.map(([px, pz]) => z - (px - ox) * sin + (pz - oz) * cos);
      movedChairParts.set(seatPartKey(material, fragment),
        [Math.min(...xs), bottom, Math.min(...zs), Math.max(...xs), top, Math.max(...zs)]);
    }
  }
}

export function relocateTavernFurniture(material: string, box: Bounds): Bounds {
  const movedChair = movedChairParts.get(seatPartKey(material, box));
  if (movedChair) return movedChair;
  const table = tables.find(({ source }) => source.every((limit, index) => index < 3 ? box[index] >= limit : box[index] <= limit));
  return table ? offset(box, table.dx, table.dz) : box;
}

export const tavernFurnitureColliders: Bounds[] = [
  ...tables.map(({ source, dx, dz }) => offset([source[0], 3, source[2], source[3], 4.02, source[5]], dx, dz)),
  ...chairs.map(({ at: [x, y, z] }): Bounds => [x - .4375, y, z - .4375, x + .4375, y + 1.375, z + .4375]),
  ...stools.map((x): Bounds => [x - .3125, 3, -1.25, x + .3125, 3.75, -.625]),
];

const barStoolZ = -.9375;
const eyeAboveSeat = .98;

export function tavernSeatPlacements(plot: TownPlot) {
  const [east, north, base] = plot.origin;
  const transform = tavernModelToPlot(plot);
  function world(point: Point) {
    const [x, y, z] = transform(...point);
    return { x: east + x, n: north - z, y: base + y };
  }
  function seat(label: string, at: Point, top: number, approach: Point, yaw: number, range = .53) {
    const { x, n, y: ground } = world(approach);
    const seated = world([at[0], top, at[2]]);
    const pose: TownSeat = { x: seated.x, n: seated.n, eyeY: seated.y + eyeAboveSeat, yaw };
    return { label, x, n, ground, range, seatY: seated.y, pose };
  }
  return [
    ...stools.map((x, i) => seat(`吧台第 ${i + 1} 张吧凳`, [x, 3, barStoolZ], 3.75, [x, 3, -.21], 0, .54)),
    ...chairs.map(({ label, at, approach, yaw }) => seat(label, at, at[1] + .625, [approach[0], at[1], approach[1]], yaw)),
    seat('二楼阅览长凳', [-5.25, 8, 1.36], 8.75, [-3.87, 8, 1.36], Math.PI / 2, .75),
  ];
}

export function createTavernSeatSpots(
  plot: TownPlot, context: Pick<TownActivityContext, 'sit'>,
  canStand: (east: number, north: number, ground: number) => boolean,
): TownActivitySpot[] {
  return tavernSeatPlacements(plot)
    .filter(({ x, n, ground }) => canStand(x, n, ground))
    .map(({ label, x, n, ground, range, pose }) => ({
      label: `就座 · ${label}`, x, n, ground, range, run: () => context.sit(pose),
    }));
}
