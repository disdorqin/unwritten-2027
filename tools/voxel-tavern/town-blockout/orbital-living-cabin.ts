import { BoxGeometry, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';

type Point = Readonly<{ x: number; n: number; ground: number }>;
type Bounds = Readonly<{ minX: number; maxX: number; minN: number; maxN: number }>;
type Collision = Bounds & Readonly<{ kind: 'bunk' | 'table' | 'storage' }>;
const living = { minX: -4.65, maxX: 4.65, minN: 0, maxN: 9.6 };
const doorHalfWidth = 1.7;
const apron = -0.8;
const ceiling = 2.95;
const edge = [
  [-doorHalfWidth, apron], [doorHalfWidth, apron], [doorHalfWidth, 0], [living.maxX, 0],
  [living.maxX, living.maxN], [living.minX, living.maxN], [living.minX, 0], [-doorHalfWidth, 0],
] as const;

function clearanceSquared(x: number, n: number, { minX, maxX, minN, maxN }: Bounds) {
  const dx = Math.max(minX - x, x - maxX, 0);
  const dn = Math.max(minN - n, n - maxN, 0);
  return dx ** 2 + dn ** 2;
}

/** S-7 room only. All geometry and inspection points use local X-east / N-north / Y-up. */
export function createOrbitalLivingCabin({ scale = 1 }: { scale?: number } = {}) {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Living cabin needs a positive finite scale');
  const group = new Group();
  group.name = 'orbital-living-cabin';
  group.scale.setScalar(scale);
  group.add(new HemisphereLight(0xd4e7ff, 0x8a6c52, 1.45));
  const geometry = new BoxGeometry();
  const palette = {
    hull: new MeshStandardMaterial({ color: 0x414c56, metalness: .22, roughness: .85 }),
    rib: new MeshStandardMaterial({ color: 0x667889, metalness: .38, roughness: .72 }),
    deck: new MeshStandardMaterial({ color: 0x354450, roughness: .94 }),
    trim: new MeshStandardMaterial({ color: 0x1b2832, roughness: .82 }),
    soft: new MeshStandardMaterial({ color: 0xb2a38d, roughness: 1 }),
    cloth: new MeshStandardMaterial({ color: 0x6b7a82, roughness: 1 }),
    faded: new MeshStandardMaterial({ color: 0x896a60, roughness: 1 }),
    wool: new MeshStandardMaterial({ color: 0xb4a18b, roughness: 1 }),
    stitch: new MeshStandardMaterial({ color: 0x655746, roughness: 1 }),
    gold: new MeshStandardMaterial({ color: 0xba8c50, metalness: .28, roughness: .84 }),
    warm: new MeshBasicMaterial({ color: 0xdab587 }),
  };
  type Surface = keyof typeof palette;
  const obstructions: Collision[] = [];

  function block(parent: Group, surface: Surface, x: number, y: number, n: number,
    width: number, height: number, depth: number) {
    const mesh = new Mesh(geometry, palette[surface]);
    mesh.position.set(x, y, -n);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }

  function obstruction(kind: Collision['kind'], x: number, n: number, width: number, depth: number) {
    obstructions.push({ kind, minX: x - width / 2, maxX: x + width / 2, minN: n - depth / 2, maxN: n + depth / 2 });
  }

  block(group, 'deck', 0, -.09, 4.8, 9.3, .18, 9.6);
  block(group, 'deck', 0, -.09, apron / 2, doorHalfWidth * 2, .18, -apron);
  block(group, 'hull', 0, ceiling + .09, 4.8, 9.64, .18, 9.6).name = 'orbital-cutaway-shell';
  block(group, 'hull', 0, ceiling / 2, 9.68, 9.64, ceiling, .16);
  for (const side of [-1, 1]) {
    block(group, 'hull', side * 4.74, ceiling / 2, 4.8, .18, ceiling, 9.6);
    block(group, 'hull', side * (4.65 + doorHalfWidth) / 2, ceiling / 2, -.09, 4.65 - doorHalfWidth, ceiling, .18);
    block(group, 'rib', side * (doorHalfWidth + .09), ceiling / 2, .035, .18, ceiling, .23);
    block(group, 'rib', side * 4.50, 2.55, 4.8, .095, .1, 9.25);
    block(group, 'warm', side * 4.43, 2.52, 4.8, .06, .04, 4.75);
  }
  block(group, 'rib', 0, ceiling - .13, .05, doorHalfWidth * 2, .26, .27);

  const point = (x: number, n: number, ground = 0): Point => ({ x: x * scale, n: n * scale, ground: ground * scale });
  const scaleBounds = ({ minX, maxX, minN, maxN }: Bounds): Bounds =>
    ({ minX: minX * scale, maxX: maxX * scale, minN: minN * scale, maxN: maxN * scale });
  const bunks = [];
  const centers = [2.08, 4.64, 7.20] as const;
  const names = ['west', 'east'] as const;
  let privateItem: { berth: number; point: Point; view: Point } | undefined;
  for (const [row, side] of [-1, 1].entries()) {
    for (const [index, n] of centers.entries()) {
      const number = row * centers.length + index + 1;
      const x = side * 3.25;
      const berth = new Group();
      berth.name = `orbital-berth-${number}`;
      group.add(berth);
      obstruction('bunk', x, n, 1.28, 2.12);
      block(berth, 'trim', x, .18, n, 1.22, .36, 2.07);
      block(berth, 'rib', x, .38, n, 1.28, .12, 2.12);
      block(berth, 'soft', x, .53, n, 1.16, .18, 2.02);
      block(berth, 'soft', x, .67, n + .68, .76, .11, .38);
      const turnedBack = number === 2;
      if (turnedBack) {
        block(berth, 'faded', x, .66, n - .42, 1.1, .085, 1.0);
        block(berth, 'cloth', x + .23, .71, n + .05, .62, .13, .21);
        block(berth, 'faded', x - .31, .68, n + .23, .47, .085, .34);
      } else {
        block(berth, 'cloth', x, .66, n - .37, 1.1, .08, 1.09);
        block(berth, 'faded', x, .71, n + .12, 1.09, .055, .16);
      }
      const shelfN = n + .82;
      block(berth, 'trim', x, 1.14, shelfN, .96, .1, .52);
      block(berth, 'rib', x + side * .44, 1.39, shelfN, .08, .48, .50);
      block(berth, 'rib', x, 1.40, shelfN + .25, .96, .51, .06);
      const visit = point(side * 1.75, n);
      bunks.push({ number, row: names[row]!, point: point(x, n, .53), visit, turnedBack });
      if (number === 3) {
        const item = new Group();
        item.position.set(x, 1.20, -shelfN);
        berth.add(item);
        block(item, 'wool', 0, .125, 0, .22, .13, .18);
        block(item, 'wool', .132, .162, 0, .10, .10, .11);
        block(item, 'wool', -.135, .13, 0, .055, .047, .068);
        for (const legX of [-.075, .075]) for (const legN of [-.063, .063]) {
          block(item, 'stitch', legX, .035, legN, .035, .067, .035);
        }
        for (const offset of [-.064, -.024, .017, .057]) block(item, 'stitch', offset, .19, .021, .011, .009, .036);
        for (const hornSide of [-1, 1]) {
          for (const [dx, lift, outward] of [[.101, .2, .058], [.089, .222, .076], [.111, .238, .087],
            [.133, .222, .093], [.126, .213, .074]] as const) {
            block(item, 'gold', dx, lift, hornSide * outward, .029, .031, .024);
          }
        }
        privateItem = { berth: number, point: point(x, shelfN, 1.20), view: point(-1.65, shelfN) };
      }
    }
  }
  if (!privateItem) throw new Error('The third berth needs its authored display point');

  block(group, 'rib', 0, .37, 5.95, .18, .74, .56);
  block(group, 'cloth', 0, .79, 5.95, 1.22, .10, .88);
  obstruction('table', 0, 5.95, 1.22, .88);
  for (const n of [5.23, 6.67]) {
    block(group, 'rib', 0, .21, n, 1.24, .42, .32);
    obstruction('table', 0, n, 1.24, .32);
  }
  for (const x of [-.96, -.32, .32, .96]) {
    block(group, 'trim', x, .56, 9.25, .61, 1.12, .52);
    block(group, 'rib', x, .56, 9.53, .61, .055, .06);
    block(group, 'rib', x - .13, 1.86, 9.53, .07, .19, .105);
  }
  obstruction('storage', 0, 9.25, 2.53, .52);

  function floorHeightAt(east: number, north: number) {
    const x = east / scale, n = north / scale;
    if (!Number.isFinite(x) || !Number.isFinite(n) || n < apron || n > living.maxN) return;
    if (Math.abs(x) <= (n < 0 ? doorHalfWidth : living.maxX)) return 0;
  }

  function isWalkable(east: number, north: number, radius = .27) {
    if (!Number.isFinite(radius) || radius < 0 || floorHeightAt(east, north) === undefined) return false;
    const x = east / scale, n = north / scale, radiusSquared = (radius / scale) ** 2;
    if (edge.some(([ax, an], index) => {
      const [bx, bn] = edge[(index + 1) % edge.length]!;
      return clearanceSquared(x, n, { minX: Math.min(ax, bx), maxX: Math.max(ax, bx),
        minN: Math.min(an, bn), maxN: Math.max(an, bn) }) < radiusSquared;
    })) return false;
    return !obstructions.some(bounds => clearanceSquared(x, n, bounds) <= radiusSquared);
  }

  const port = { frame: point(0, 0), approach: point(0, -.45), arrival: { ...point(0, .57), yaw: 0 } };
  return {
    group, port, rooms: { living: scaleBounds(living) }, bunks, privateItem,
    walkRoute: [port.approach, port.frame, port.arrival, ...bunks.slice(0, 3).map(bunk => bunk.visit),
      privateItem.view, point(-1.75, 8.60), point(1.75, 8.60), ...bunks.slice(3).reverse().map(bunk => bunk.visit),
      port.arrival, port.frame, port.approach],
    collisions: obstructions.map(({ kind, ...bounds }) => ({ kind, ...scaleBounds(bounds) })),
    floorHeightAt, isWalkable,
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      for (const material of Object.values(palette)) material.dispose();
      group.clear();
    },
  };
}
