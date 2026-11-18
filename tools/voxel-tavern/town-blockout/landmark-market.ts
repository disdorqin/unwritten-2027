import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, SphereGeometry,
  Vector3, Quaternion,
} from 'three';
import type { Box, TownPlot } from './landmark-kit';
import { addTownWindow } from './town-window';
import { addMarketStallBanners } from './market-stall-banners';
import { marketStallLayouts } from './market-stall-layout';

type Vector = [number, number, number];
type Part = { position: Vector; size: Vector; color: string; shape: 'box' | 'round' | 'cylinder'; rotation?: number; glow?: boolean; riddleSlot?: number };

export type WorkshopRiddleWall = {
  stands: readonly Vector[];
  update(active: number, lit: ReadonlySet<number>): void;
};

const wood = ['#74462d', '#8e5031', '#693823', '#9c6041'];
const trim = '#40251d';
const darkRed = '#772824';
const red = '#a1342d';
const gold = '#d18b38';
const amber = '#ffd68a';
const stone = ['#666875', '#75737f', '#555864', '#81828d'];
const roofTiles = ['#3e4553', '#555b68', '#4b4c59'];
const snow = ['#e8f2fc', '#c9dced', '#dce9f7'];

function collision(x: number, y: number, z: number, w: number, h: number, d: number): Box {
  return { min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] };
}

function rotateWest({ min, max }: Box): Box {
  return { min: [-max[2], min[1], min[0]], max: [-min[2], max[1], max[0]] };
}

function createWorkshop() {
  const parts: Part[] = [];
  const put = (color: string, x: number, y: number, z: number, w: number, h: number, d: number, shape: Part['shape'] = 'box', glow = false, rotation = 0) =>
    parts.push({ position: [x, y, z], size: [w, h, d], color, shape, rotation, glow });
  return { parts, put };
}

type Workshop = ReturnType<typeof createWorkshop>;

export const marketOxSite = {
  id: 'ox',
  stand: [1.80, 0, -9.25],
  object: [1.80, .24, -8.86],
  yaw: Math.PI,
  range: .40,
} as const;

function knitBoxwork({ put }: Workshop, x: number, z: number, width: number, depth: number, doorWidth: number, y = 0) {
  for (let i = Math.floor(-width / 1.1 / 2); i <= width / 1.1 / 2; i++) {
    const px = x + i * 1.05;
    if (Math.abs(px - x) + .51 > width / 2) continue;
    for (const side of [-1, 1]) {
      if (side > 0 && Math.abs(px - x) < doorWidth / 2 + .5) continue;
      put(stone[(i + 32) % stone.length], px, y + .225, z + side * (depth / 2 - .22), 1.027, .45, .44);
    }
  }
  for (let i = Math.floor(-depth / 1.1 / 2); i <= depth / 1.1 / 2; i++) {
    const pz = z + i * 1.05;
    if (Math.abs(pz - z) + .51 > depth / 2) continue;
    for (const side of [-1, 1]) put(stone[(i + 31) % stone.length], x + side * (width / 2 - .22), y + .225, pz, .44, .45, 1.03);
  }
}

function lantern({ put }: Workshop, x: number, y: number, z: number, width = .68, paper = red) {
  // The old lantern guild pairs a luminous paper core with brass end caps and a hanging cord.
  put(trim, x, y + width * .72, z, .035, width * .65, .035);
  put(paper, x, y, z, width, width * .85, width, 'round', true);
  put('#ffd59b', x, y, z, width * .987, width * .09, width * .987, 'cylinder', true);
  for (const s of [-1, 1]) {
    put(gold, x, y + s * width * .4, z, width * .48, width * .12, width * .48, 'cylinder');
    put(darkRed, x, y + s * width * .23, z, width * .91, width * .022, width * .91, 'cylinder');
  }
  put(gold, x, y - width * .54, z, .065, width * .22, .065);
  put(paper, x, y - width * .69, z, .095, width * .125, .095);
}

function post({ put }: Workshop, x: number, z: number, height: number, width = .42) {
  put(stone[0], x, .195, z, width * 1.7, .39, width * 1.7);
  put(wood[0], x, height / 2 + .14, z, width, height - .28, width);
  put(wood[2], x, height - .225, z, width * 1.45, .29, width * 1.52);
  put(gold, x, height - .41, z, width * 1.16, .055, width * 1.16);
  put(trim, x, .56, z, width * 1.13, .105, width * 1.13);
}

function window({ put }: Workshop, x: number, z: number, y: number, width: number, depth = .25, height = 1.55) {
  put(trim, x, y, z, width + .24, height + .26, depth);
  const columns = Math.round(width / .46);
  for (let column = 0; column < columns; column++) {
    const px = x + ((column + .5) / columns - .5) * width;
    for (let row = 0; row < 3; row++) {
      const py = y + (row / 3 - 1 / 3) * height;
      put(amber, px, py, z + .025, width / columns - .07, height / 3 - .067, depth + .025, 'box', true);
    }
  }
  put(wood[0], x, y - height / 2 - .09, z + .035, width + .4, .16, depth + .15);
}

function snowRoof({ put }: Workshop, x: number, z: number, width: number, depth: number, wallY: number, rise: number) {
  const rows = Math.ceil(depth / .66);
  const cols = Math.ceil(width / .67);
  const dx = width / cols;
  const dz = depth / rows;
  for (let zi = 0; zi < rows; zi++) {
    const pz = (zi + .5) * dz - depth / 2;
    const t = 1 - Math.abs(pz * 2 / depth);
    const elevation = Math.pow(t, 1.18) * rise;
    for (let xi = 0; xi < cols; xi++) {
      const px = (xi + .5) * dx - width / 2;
      const lift = Math.max(0, Math.abs(px) - width / 2 + 1.1) * .31 * (1 - t);
      const y = wallY + elevation + lift;
      const color = (xi + zi * 2) % 3;
      put(roofTiles[color], x + px, y, z + pz, dx + .015, .34, dz + .085);
      const cap = (xi * 13 + zi * 19) % 9;
      if (cap !== 2 || zi < 2 || zi > rows - 3) {
        put(snow[(xi + zi) % 3], x + px, y + .235 + cap * .008, z + pz, dx + .012, .13 + cap * .016, dz + .068);
      }
      if ((zi === 0 || zi === rows - 1) && xi % 4 === 0) put(wood[1], x + px, y - .22, z + pz, dx * .46, .26, dz + .28);
    }
  }
  put(trim, x, wallY + rise + .11, z, width + .15, .35, .44);
  for (const sign of [-1, 1]) {
    put(gold, x + sign * (width / 2 - .15), wallY + rise + .18, z, .42, .43, .5);
    put(snow[0], x + sign * (width / 2 - .15), wallY + rise + .43, z, .49, .1, .52);
  }
}

export function makeSign(text: string, width: number, height: number, x: number, y: number, z: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#441d1d';
  ctx.fillRect(0, 0, 384, 112);
  ctx.strokeStyle = '#dc9951';
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 9, 364, 94);
  ctx.fillStyle = '#ffdc8d';
  ctx.font = 'bold 56px "Noto Sans CJK SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 59);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ map, emissive: '#ab6c2e', emissiveMap: map, emissiveIntensity: .4, roughness: .8 });
  const sign = new Mesh(new PlaneGeometry(width, height), material);
  sign.position.set(x, y, z);
  return sign;
}

function furnishBench(s: Workshop, x: number, z: number, direction = 1) {
  const { put } = s;
  for (const dx of [-.98, .98]) for (const dz of [-.37, .37]) put(wood[0], x + dx, .61, z + dz, .19, 1.22, .19);
  put(wood[3], x, 1.23, z, 2.47, .2, 1.12);
  put(darkRed, x - .45, 1.35, z, .6, .045, .88);
  put('#e8d1aa', x - .38, 1.38, z, .45, .037, .55);
  put(gold, x + .56, 1.43, z + .2 * direction, .32, .14, .32, 'cylinder');
  put(amber, x + .56, 1.59, z + .2 * direction, .26, .26, .26, 'round', true);
  for (let i = 0; i < 4; i++) put('#a78655', x - .15 + i * .13, 1.35, z - .22, .051, .053, .53);
}

function buildGuild() {
  const s = createWorkshop();
  const { put } = s;
  const width = 17.8;
  const houseDepth = 12;
  const rear = -6.45;
  const front = 5.15;
  const ceiling = 5.3;
  const facadeWindows = [-6.92, -3.8, 3.8, 6.92];
  const frames = [-8.55, -5.27, -2.12, 2.12, 5.27, 8.55];
  const sashY = 2.83;
  const sashWidth = 2.57;
  const sashHeight = 1.61;
  const sill = sashY - sashHeight / 2;
  const head = sashY + sashHeight / 2;
  knitBoxwork(s, 0, -.5, width + .4, houseDepth + .45, 3.8);
  // The porch and central gate of the old guild remain, turned west onto the planned lane.
  for (let i = -10; i <= 10; i++) {
    const x = i * .83;
    put(wood[(i + 44) % 4], x, .075, .85, .81, .15, 14.88);
    put(darkRed, x, 2.65, rear, .83, 4.41, .38);
    if (Math.abs(x) > 2.15) {
      put(i % 4 ? wood[0] : red, x, (.28 + sill) / 2, front, .83, sill - .28, .34);
      put(wood[2], x, (head + 4.95) / 2, front, .83, 4.95 - head, .34);
    }
  }
  for (const x of [-8.78, 8.78]) {
    for (let i = 0; i < 16; i++) put(wood[i % 4], x, 2.65, -6.25 + i * .72, .35, 4.39, .73);
    put(trim, x, 4.85, -.54, .48, .32, 12);
  }
  for (const x of frames) {
    post(s, x, front, 5.18, .41);
    post(s, x, 7.33, 4.56, .38);
    put(wood[2], x, 4.49, 6.12, .34, .29, 3.15);
    put(trim, x, 5.09, rear, .48, .68, .64);
    if (Math.abs(x) !== 2.12) lantern(s, x, 3.88, 7.48, Math.abs(x) < 6 ? .78 : .62);
  }
  const windowMullions = [[-8.63, -6.92 - sashWidth / 2], [-6.92 + sashWidth / 2, -3.8 - sashWidth / 2], [-3.8 + sashWidth / 2, -2.25]];
  for (const [a, b] of windowMullions) for (const side of [-1, 1]) {
    put(wood[0], side * (a + b) / 2, sashY, front, b - a, sashHeight, .34);
  }
  for (const x of facadeWindows) {
    for (const edge of [-1, 1]) {
      put(trim, x + edge * (sashWidth / 2 + .067), sashY, front + .21, .14, sashHeight + .2, .22);
      put(wood[0], x, sashY + edge * (sashHeight / 2 + .07), front + .23, sashWidth + .27, .14, .32);
    }
    window(s, x, rear - .21, 2.83, 2.49, .21, 1.62);
    furnishBench(s, x, -2.4, x > 0 ? 1 : -1);
    furnishBench(s, x, 1.6, x > 0 ? -1 : 1);
  }
  put(trim, 0, 5.05, front, width + .32, .45, .62);
  put(trim, 0, 4.47, 7.37, width + .8, .43, .57);
  put(wood[3], 0, 4.18, 7.49, width - .88, .095, .15);
  put(trim, 0, 4.73, rear, width + .38, .45, .58);
  put(trim, 0, 4.77, .25, width - .49, .36, .38);
  put(darkRed, 0, .18, 2.56, 2.65, .038, 10.6);
  put(gold, -1.29, .21, 2.56, .055, .028, 10.6);
  put(gold, 1.29, .21, 2.56, .055, .028, 10.6);
  put(stone[0], 0, .07, 7.89, 4.45, .14, 1.07);
  put(stone[1], 0, .14, 7.4, 4.24, .14, .73);
  for (const x of [-7.7, -4.55, 4.55, 7.7]) {
    put(darkRed, x, 2.18, 7.78, .65, 1.7, .06);
    put(gold, x, 2.22, 7.825, .27, .28, .06, 'round');
    put(gold, x, 1.34, 7.78, .61, .075, .064);
  }
  for (const z of [-4.55, -1.7, 1.05, 3.8]) {
    lantern(s, -.92, 3.8, z, .62, '#e16f30');
    lantern(s, .92, 3.8, z, .51, red);
  }
  snowRoof(s, 0, -.33, 19.4, 13.4, ceiling, 2.36);
  snowRoof(s, 0, 6.52, 20.2, 3.48, 4.64, .56);
  for (const z of [-6.67, 6.22]) put(darkRed, 0, 5.6, z, 3.3, .22, .28);
  put(stone[2], -5.6, 7.47, -2.53, .75, 2.28, .77);
  put(stone[0], -5.6, 8.52, -2.53, .94, .28, .97);
  put(snow[0], -5.6, 8.71, -2.53, .92, .15, .97);

  const stands: Vector[] = [];
  put(trim, 0, 2.9, rear + .28, 15.25, .18, .21);
  put(wood[2], 0, 1.85, rear + .21, 15.18, 1.85, .12);
  for (let slot = 0; slot < 10; slot++) {
    const x = -6.75 + slot * 1.5;
    const z = rear + .45;
    const firstPart = s.parts.length;
    put(gold, x, 2.65, z, .06, .42, .055);
    put(darkRed, x, 2.42, z, .33, .075, .33, 'cylinder');
    put(darkRed, x, 1.90, z, .34, .075, .34, 'cylinder');
    put('#9b3024', x, 2.16, z, .55, .49, .50, 'round', true);
    put('#e8d1aa', x, 1.65, z + .075, .22, .26, .06);
    for (let index = firstPart; index < s.parts.length; index++) s.parts[index].riddleSlot = slot;
    stands.push([x, .15, -4.70]);
  }
  const building = batchParts(s.parts, { stands, rearWallZ: rear });
  building.add(makeSign('春灯工坊', 3.7, .86, 0, 4.49, 7.76));
  building.rotation.y = -Math.PI / 2;
  const walls = [
    collision(0, 0, rear, width, 5, .38),
    ...[-8.78, 8.78].map(x => collision(x, 0, -.7, .35, 5, 11.56)),
    ...frames.flatMap(x => [
      collision(x, 0, front, .41, 5.18, .41),
      collision(x, 0, 7.33, .38, 4.56, .38),
      collision(x, 0, front, .70, .39, .70),
      collision(x, 0, 7.33, .65, .39, .65),
    ]),
    ...[-1, 1].flatMap(side => windowMullions.map(([a, b]) =>
      collision(side * (a + b) / 2, sill, front, b - a, sashHeight, .34))),
    ...[-5.44, 5.44].flatMap(x => [
      collision(x, 0, front, 6.38, sill, .38),
      collision(x, head, front, 6.38, 4.95 - head, .38),
    ]),
    ...facadeWindows.flatMap(x => [-2.4, 1.6].map(z => collision(x, 0, z, 2.47, 1.33, 1.12))),
  ];
  for (const x of facadeWindows) {
    addTownWindow(building, {
      x, y: sashY, z: front + .065, width: sashWidth, height: sashHeight, yaw: 0, ground: .15, style: 'tavern',
    });
  }
  building.userData.colliders = walls.map(rotateWest);
  building.userData.floors = [
    collision(0, 0, .85, 17.43, .15, 14.88),
    collision(0, 0, 7.89, 4.45, .14, 1.07),
    collision(0, .07, 7.40, 4.24, .14, .73),
  ].map(rotateWest);
  return building;
}

function hangFestoon(s: Workshop, x0: number, x1: number, z: number, y: number) {
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = x0 + (x1 - x0) * t;
    const height = y - Math.sin(t * Math.PI) * .59;
    s.put(trim, x, height, z, (x1 - x0) / 20 + .08, .055, .055, 'box', false, Math.atan2(-Math.cos(t * Math.PI) * .59 * Math.PI, x1 - x0));
    if (i % 3 === 1) lantern(s, x, height - .59, z, .53, i % 2 ? red : '#dd762e');
  }
}

function makeStall(s: Workshop, x: number, z: number, width: number, color: string, index: number) {
  const { put } = s;
  const depth = 4.8;
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) post(s, x + dx * (width / 2 - .20), z + dz * 2.15, 3.95, .28);
  for (let i = 0; i < Math.round(width / .42); i++) {
    const px = x - width / 2 + (i + .5) * .42;
    put(wood[(i + index) % 4], px, 1.83, z - depth / 2, .43, 3.58, .22);
    put(wood[(i + index + 2) % 4], px, .66, z + 1.38, .43, 1.25, .37);
  }
  window(s, x, z - 2.29, 2.44, 2.68, .18, 1.2);
  put(wood[2], x, 1.26, z + 1.32, width - .39, .21, 1.15);
  put(wood[1], x, 1.42, z + 1.39, width - .25, .19, 1.04);
  for (const dx of [-1, 1]) {
    put(trim, x + dx * (width / 2 - .12), 3.82, z, .27, .35, depth + .42);
    lantern(s, x + dx * (width / 2 - .82), 3.18, z + 2.43, .57);
  }
  // Retain the old fair's alternating striped stalls and counter trays, with thicker snow from B23.
  const stripeCount = Math.ceil(width / .53);
  const stripeWidth = (width + .68) / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const px = x - (width + .68) / 2 + (i + .5) * stripeWidth;
    put(i % 3 === 1 ? '#dec09c' : color, px, 3.81, z + 2.12, stripeWidth + .01, .38, .38);
  }
  snowRoof(s, x, z, width + .6, depth + .56, 4.05, 1.2);
  put(color, x, .94, z + 1.915, 1.55, .92, .075);
  put(gold, x, .99, z + 1.96, .29, .29, .04, 'round');
  for (let i = 0; i < 7; i++) {
    const px = x - width * .37 + i * width * .123;
    put(wood[1], px, 1.56, z + 1.19, .59, .11, .61);
    for (let j = 0; j < 3; j++) {
      put(['#dd5331', '#ecc884', '#b86721', '#f6dec1'][(i + j + index) % 4], px - .163 + j * .17, 1.69, z + 1.21, .21, .23, .2, 'round');
    }
  }
  for (const dx of [-1, 1]) {
    const bx = x + dx * (width / 2 + .25);
    put(wood[1], bx, .515, z + 1.8, .78, 1.03, .78, 'cylinder');
    for (const h of [.24, .81]) put(trim, bx, h, z + 1.8, .81, .064, .81, 'cylinder');
    put(snow[1], bx, 1.055, z + 1.8, .75, .072, .75, 'cylinder');
  }
}

function makeHayAnnex({ put }: Workshop) {
  const [x, , objectZ] = marketOxSite.object;
  const z = objectZ + .82;
  for (const offset of [-.76, .76]) put(wood[2], x + offset, .035, z, .16, .07, .98);
  for (let index = 0; index < 7; index++) {
    put(wood[index % 3], x - .87 + index * .29, .105, z, .26, .07, 1.04);
  }
  const bales = [
    { x: x - .48, z: z + .01, bottom: .14, width: .92, height: .43, depth: .91 },
    { x: x + .49, z: z + .08, bottom: .14, width: .90, height: .40, depth: .79 },
    { x: x + .02, z: z + .055, bottom: .57, width: 1.06, height: .34, depth: .78 },
  ];
  for (const bale of bales) {
    const { x, z, bottom, width, height, depth } = bale;
    put('#b78443', x, bottom + height / 2, z, width, height, depth);
    for (let index = 0; index < 3; index++) {
      const y = bottom + height * ((index + .65) / 3.35);
      put(index % 2 ? '#c99851' : '#e0b86c', x + (index - 1) * .027, y, z - depth / 2,
        width - .06 - index * .05, .045, .024);
    }
    for (const offset of [-.27, .27]) {
      put('#705437', x + offset * width, bottom + height / 2, z - depth / 2 - .016, .030, height, .019);
      put('#705437', x + offset * width, bottom + height + .008, z, .030, .016, depth);
    }
  }
  return collision(x, 0, z, 2.04, .93, 1.04);
}

function buildStalls() {
  const s = createWorkshop();
  marketStallLayouts.forEach(([x, z, width, color], i) => makeStall(s, x, z, width, color, i));
  const hayAnnex = makeHayAnnex(s);
  for (const x of [-16, -7.8, 8.5, 16]) post(s, x, 3.42, 5.38, .26);
  for (const [x0, x1] of [[-16, -7.8], [-7.8, 8.5], [8.5, 16]]) hangFestoon(s, x0, x1, 3.42, 5.17);
  for (const x of [-2.76, 2.76]) {
    post(s, x, 6.67, 4.64, .27);
    lantern(s, x, 3.8, 6.86, .5);
  }
  const root = batchParts(s.parts);
  addMarketStallBanners(root, marketStallLayouts, makeSign('河畔年集', 3.4, .74, 0, 4.35, 6.71));
  root.userData.colliders = [
    ...marketStallLayouts.flatMap(([x, z, width]) => [
      collision(x, 0, z - 2.4, width, 3.6, .22),
      collision(x, 0, z + 1.4, width, 1.51, 1.12),
      ...[-1, 1].flatMap(side => [
        collision(x + side * (width / 2 + .25), 0, z + 1.8, .81, 1.09, .81),
        ...[-2.15, 2.15].map(end => collision(x + side * (width / 2 - .2), 0, z + end, .28, 3.95, .28)),
      ]),
    ]),
    ...[-16, -7.8, 8.5, 16].map(x => collision(x, 0, 3.42, .44, 5.38, .44)),
    ...[-2.76, 2.76].map(x => collision(x, 0, 6.67, .46, 4.64, .46)),
    hayAnnex,
  ];
  root.userData.zodiacOx = marketOxSite;
  return root;
}

function batchParts(parts: Part[], riddleWall?: { stands: readonly Vector[]; rearWallZ: number }) {
  const group = new Group();
  const shapes = {
    box: new BoxGeometry(1, 1, 1),
    round: new SphereGeometry(.5, 10, 8),
    cylinder: new CylinderGeometry(.5, .5, 1, 10),
  };
  const byMaterial = new Map<string, Part[]>();
  for (const part of parts) {
    const key = [part.shape, part.glow ? (part.color === amber ? 'gold' : 'orange') : 'opaque'].join('/');
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key)!.push(part);
  }
  const q = new Quaternion();
  const axis = new Vector3(0, 0, 1);
  const matrix = new Matrix4();
  const pos = new Vector3();
  const size = new Vector3();
  const updateRiddleBatches: WorkshopRiddleWall['update'][] = [];
  for (const batch of byMaterial.values()) {
    const { color, shape, glow } = batch[0];
    const material = new MeshStandardMaterial({
      roughness: .92,
      emissive: glow ? new Color(color === amber ? '#ffbb67' : '#d84822') : 0,
      emissiveIntensity: glow ? (color === amber ? 1.25 : .72) : 0,
    });
    const mesh = new InstancedMesh(shapes[shape], material, batch.length);
    for (const [index, part] of batch.entries()) {
      q.setFromAxisAngle(axis, part.rotation ?? 0);
      matrix.compose(pos.set(...part.position), q, size.set(...part.size));
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new Color(part.color));
    }
    const riddleIndices = batch.flatMap((part, index) => part.riddleSlot === undefined ? [] : [{ slot: part.riddleSlot, index }]);
    if (riddleWall && riddleIndices.length) {
      const firstRiddle = riddleIndices[0].index;
      let selectedCount = batch.length;
      const emission = glow
        ? new InstancedBufferAttribute(new Float32Array(batch.length).fill(1), 1).setUsage(DynamicDrawUsage)
        : undefined;
      if (emission) {
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.setAttribute('riddleGlow', emission);
        const eye = new Vector3();
        const minimum = new Vector3(Infinity, Infinity, Infinity);
        const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const { index } of riddleIndices) {
          const { position: [x, y, z], size: [w, h, d] } = batch[index];
          minimum.min(new Vector3(x - w / 2, y - h / 2, z - d / 2));
          maximum.max(new Vector3(x + w / 2, y + h / 2, z + d / 2));
        }
        const corners = [minimum.x, maximum.x].flatMap(x =>
          [minimum.y, maximum.y].flatMap(y => [minimum.z, maximum.z].map(z => new Vector3(x, y, z))));
        mesh.onBeforeRender = (_renderer, _scene, camera) => {
          group.worldToLocal(camera.getWorldPosition(eye));
          const plane = riddleWall.rearWallZ;
          // The original rear planks form a continuous opaque rectangle at this depth.
          // All projected corners must sit inside it before any globe is skipped.
          const hidden = eye.z < plane && minimum.z > plane && corners.every(corner => {
            const t = (plane - eye.z) / (corner.z - eye.z);
            const x = eye.x + (corner.x - eye.x) * t;
            const y = eye.y + (corner.y - eye.y) * t;
            return Math.abs(x) < 8.70 && y > .46 && y < 4.84;
          });
          mesh.count = hidden ? firstRiddle : selectedCount;
        };
        material.onBeforeCompile = shader => {
          shader.vertexShader = 'attribute float riddleGlow; varying float vRiddleGlow;\n' + shader.vertexShader
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiddleGlow = riddleGlow;');
          shader.fragmentShader = 'varying float vRiddleGlow;\n' + shader.fragmentShader
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vRiddleGlow;');
        };
      }
      updateRiddleBatches.push((active, lit) => {
        // Slots are appended in numerical order after the workshop's existing fixtures.
        // An inactive slot submits neither its paper globe nor its cord, caps and riddle tag.
        const count = riddleIndices.find(({ slot }) => slot >= active)?.index ?? batch.length;
        if (selectedCount !== count) {
          selectedCount = count;
          mesh.count = count;
          // Invalidate the panoramic batch's cache, which is keyed to the instance matrix version.
          mesh.instanceMatrix.needsUpdate = true;
        }
        if (!emission) return;
        let changed = false;
        for (const { slot, index } of riddleIndices) {
          const value = lit.has(slot) ? 1.8 : 0;
          if (Math.abs(emission.getX(index) - value) < .0001) continue;
          emission.setX(index, value);
          changed = true;
        }
        if (changed) emission.needsUpdate = true;
      });
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (riddleWall) {
    const wall: WorkshopRiddleWall = {
      stands: riddleWall.stands,
      update(active, lit) {
        for (const update of updateRiddleBatches) update(active, lit);
      },
    };
    wall.update(6, new Set());
    group.userData.riddleWall = wall;
  }
  return group;
}

export function buildMarketLandmark(plot: TownPlot): Group {
  return plot.id === 'lantern-workshop' ? buildGuild() : buildStalls();
}
