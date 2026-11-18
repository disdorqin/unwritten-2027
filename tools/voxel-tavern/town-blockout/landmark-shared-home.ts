import { BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three';
import { sharedHomeLayer, sharedHomeOrigin } from '../../../src/presence/shared-home-space';
import type { Box } from './landmark-kit';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

const halfWidth = 5.1;
const halfDepth = 4.2;
const ceiling = 4.25;
const hearth = { x: 0, z: -3.16 };
const timber = '#684039';
const trim = '#a26c49';
const dark = '#38262b';
const brass = '#e1b67c';

type Piece = { x: number; y: number; z: number; width: number; height: number; depth: number; color: string };
type Size = Pick<Piece, 'width' | 'height' | 'depth'>;

function box(x: number, y: number, z: number, { width, height, depth }: Size): Box {
  return { min: [x - width / 2, y, z - depth / 2], max: [x + width / 2, y + height, z + depth / 2] };
}

function world(x: number, z: number, y = 0) {
  return { x: sharedHomeOrigin.east + x, n: sharedHomeOrigin.north - z, ground: sharedHomeOrigin.height + y };
}

export const sharedHomeSpawn = { ...world(0, 2.5), yaw: 0 };

export function sharedHomeWalkable(east: number, north: number) {
  return Math.abs(east - sharedHomeOrigin.east) < halfWidth && Math.abs(north - sharedHomeOrigin.north) < halfDepth;
}

export function sharedHomeHearthWarmth(east: number, north: number, feet: number) {
  return Math.abs(feet - sharedHomeOrigin.height) < 1.4 &&
    (east - sharedHomeOrigin.east - hearth.x) ** 2 + (north - sharedHomeOrigin.north + hearth.z) ** 2 < 2.1 ** 2;
}

export function createSharedHomeSpots(
  context: Pick<TownActivityContext, 'sit' | 'face' | 'announce'>,
  leave: () => void,
  photo: (filename: string) => void,
): TownActivitySpot[] {
  const chairs = [
    { label: '就座 · 餐桌北椅', x: -2.72, z: -1.26, approach: -2.05, yaw: Math.PI },
    { label: '就座 · 餐桌南椅', x: -2.72, z: 1.24, approach: 2.01, yaw: 0 },
    { label: '就座 · 壁炉边长凳', x: 1.65, z: -2.86, approach: -2.01, yaw: -Math.PI / 2 },
  ];
  const spots: TownActivitySpot[] = chairs.map(({ label, x, z, approach, yaw }) => ({
    ...world(x, approach), label, range: .63,
    run() {
      const seat = world(x, z);
      context.sit({ x: seat.x, n: seat.n, eyeY: seat.ground + 1.4, yaw });
    },
  }));

  spots.push(
    { ...world(0, 3.48), range: .75, label: '出门 · 返回来时的屋门', run: leave },
    { ...world(-.15, -2.20), range: .75, label: '烤火 · 壁炉回暖',
      run() {
        const at = world(hearth.x, -3.82, 1.1);
        context.face(at.x, at.n, at.ground);
        context.announce('靠近壁炉，冻纹会慢慢消退。');
      },
    },
    { ...world(.96, 1.55), range: .72, label: '留影 · 保存屋舍照片',
      run() {
        const at = world(-.21, -3.58, 1.56);
        context.face(at.x, at.n, at.ground);
        photo('UNWRITTEN-2027-shared-home.png');
      },
    },
  );
  return spots;
}

export function buildSharedHome(): Group {
  const group = new Group();
  group.name = 'shared-home';
  group.layers.set(sharedHomeLayer);
  group.position.set(sharedHomeOrigin.east, sharedHomeOrigin.height, -sharedHomeOrigin.north);

  const solid: Piece[] = [];
  const glow: Piece[] = [];
  const colliders: Box[] = [];
  const floors = [box(0, -.26, 0, { width: halfWidth * 2, height: .26, depth: halfDepth * 2 })];
  function put(x: number, y: number, z: number, width: number, height: number, depth: number, color: string,
    lit = false) {
    (lit ? glow : solid).push({ x, y, z, width, height, depth, color });
  }
  function block(x: number, y: number, z: number, width: number, height: number, depth: number) {
    colliders.push(box(x, y, z, { width, height, depth }));
  }

  const boards = ['#87563e', '#9b6847', '#8b5b42', '#a57251', '#915d43'];
  const plaster = '#b8a17e';
  const skirting = '#704a43';
  put(0, -.26, 0, 10.2, .24, 8.4, dark);
  for (let row = 0; row < 20; row++) {
    const z = -3.99 + row * .42;
    const seam = 2.8 + row % 4 * .31;
    put(-4.94 + seam / 2, -.055, z, seam - .018, .055, .406, boards[row % boards.length]);
    put(-4.94 + seam + 2.26, -.055, z, 4.5, .055, .406, boards[(row + 2) % boards.length]);
    put((seam + 4.53) / 2, -.055, z, 9.88 - seam - 4.53, .055, .406,
      boards[(row + 4) % boards.length]);
  }
  for (const sign of [-1, 1]) {
    const side = sign * 4.97;
    const end = sign * 4.07;
    put(side, 0, 0, .26, ceiling, 8.4, plaster);
    put(0, 0, end, 10.2, ceiling, .26, plaster);
    block(side, 0, 0, .26, ceiling, 8.4);
    block(0, 0, end, 10.2, ceiling, .26);
    for (const [y, depth, tone] of [[0, .16, skirting], [1.10, .09, trim], [3.87, .12, timber]] as const) {
      put(sign * 4.8, y, 0, .16, depth, 7.95, tone);
      put(0, y, sign * 3.91, 9.75, depth, .16, tone);
    }
    for (let i = 0; i < 24; i++) {
      const x = -4.67 + i * .405;
      put(x, .17, sign * 3.933, .384, .92, .06, boards[(i + 2) % boards.length]);
    }
    for (let i = 0; i < 19; i++) {
      const z = -3.63 + i * .403;
      put(sign * 4.83, .17, z, .06, .92, .384, boards[(i + 1) % boards.length]);
    }
  }

  put(0, ceiling, 0, 10.2, .22, 8.4, '#72504d');
  block(0, ceiling, 0, 10.2, .22, 8.4);
  for (let i = 0; i < 8; i++) put(0, 3.93, -3.58 + i * 1.024, 9.73, .32, .18, dark);
  for (const x of [-4.63, 4.63]) {
    for (const z of [-3.74, 3.74]) put(x, 0, z, .32, 4.06, .32, timber);
  }

  put(0, .07, 3.88, 1.37, 2.55, .20, dark);
  for (let i = 0; i < 5; i++) {
    put(-.46 + i * .23, .12, 3.75, .226, 2.35, .12, i % 2 ? '#7b4d39' : '#9b6240');
  }
  for (const y of [.31, 1.72]) put(0, y, 3.665, 1.12, .17, .075, timber);
  for (const x of [-.70, .70]) put(x, 0, 3.78, .20, 2.67, .33, trim);
  put(0, 2.57, 3.78, 1.59, .21, .33, trim);
  put(.43, 1.08, 3.60, .11, .11, .16, brass);
  put(0, 2.91, 3.86, .62, .19, .10, brass, true);
  put(0, 2.95, 3.80, .29, .08, .06, dark);
  put(.14, 2.91, 3.80, .06, .16, .06, dark);

  const hills = [.15, .25, .44, .60, .81, .71, .56, .38, .51, .62, .40, .27];
  for (const x of [-2.90, 2.90]) {
    put(x, 1.60, -3.97, 2.34, 1.65, .09, dark);
    put(x, 1.76, -3.912, 2.05, 1.34, .026, '#527da2', true);
    for (let i = 0; i < hills.length; i++) {
      const y = hills[i];
      const px = x - .95 + .173 * i;
      put(px, 1.76, -3.890, .174, y, .025, i % 4 === 0 ? '#8eafc9' : '#6c91ad', true);
      put(px, 1.76 + y, -3.888, .174, .052, .027, '#bad7e8', true);
    }
    const stars = [[-.70, 2.76], [-.41, 2.93], [-.1, 2.58], [.44, 2.87], [.72, 2.43]];
    for (const [dx, y] of stars) put(x + dx, y, -3.865, .045, .045, .018, '#f8ebd2', true);
    for (const y of [1.63, 2.34, 3.10]) put(x, y, -3.82, 2.32, .10, .20, trim);
    for (const dx of [-1.10, 0, 1.10]) put(x + dx, 1.64, -3.82, .11, 1.56, .20, trim);
    put(x, 1.57, -3.71, 2.45, .11, .47, timber);
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        put(x + sign * (.80 + i * .116), 1.70 + (4 - i) * .035, -3.72 - i % 2 * .041,
          .117, 1.64 - (4 - i) * .035, .105, i % 2 ? '#854b4d' : '#a95d56');
      }
      put(x + sign * 1.08, 2.23, -3.65, .46, .10, .08, brass);
    }
    put(x, 3.31, -3.72, 2.81, .085, .12, brass);
  }

  const bricks = ['#82534e', '#935d50', '#a06a57', '#764644'];
  put(0, .17, -3.80, 2.17, 2.55, .38, '#754d47');
  put(0, 0, -3.41, 2.49, .18, 1.08, '#62575a');
  put(0, .18, -3.75, 1.57, .95, .35, '#271f26');
  for (let row = 0; row < 9; row++) {
    const count = row % 2 ? 5 : 6;
    for (let i = 0; i < count; i++) {
      const bx = (i - (count - 1) / 2) * .363;
      if (row < 4 && Math.abs(bx) < .62) continue;
      put(bx, .18 + row * .247, -3.57, .345, .222, .30, bricks[(i + row) % 4]);
    }
  }
  for (const x of [-.775, .775]) put(x, .18, -3.40, .24, 1.14, .38, '#ac7a65');
  put(0, 1.18, -3.38, 1.77, .23, .41, '#b98263');
  put(0, 1.54, -3.38, 2.39, .18, .62, timber);
  for (const x of [-.75, .75]) {
    put(x, 1.72, -3.32, .095, .22, .098, '#f5ca91');
    put(x, 1.94, -3.32, .065, .12, .065, '#ffd182', true);
  }
  put(0, 2.59, -3.84, .73, 1.58, .32, '#82534e');
  put(0, .20, -3.43, 1.17, .09, .44, '#482d2a');
  put(-.26, .28, -3.41, .12, .14, .39, timber);
  put(.22, .28, -3.41, .12, .14, .39, timber);
  for (const [x, y, z, width, height] of [
    [0, .32, -3.39, 1.08, .15], [-.38, .43, -3.47, .21, .24],
    [-.15, .41, -3.50, .29, .45], [.12, .40, -3.57, .30, .62], [.36, .41, -3.49, .23, .31],
  ]) {
    put(x, y, z, width, height, .19, '#c8633a', true);
    put(x, y + height * .14, z + .09, width * .57, height * .58, .12, '#fdb451', true);
  }
  block(0, 0, -3.55, 2.49, 2.65, 1.12);

  put(-2.71, .82, 0, 1.66, .12, 1.09, '#b98056');
  put(-2.71, .70, 0, 1.57, .14, 1.02, timber);
  for (const x of [-3.38, -2.04]) {
    for (const z of [-.41, .41]) put(x, 0, z, .15, .83, .15, timber);
  }
  put(-2.71, .941, .015, 1.00, .019, .30, '#864c58');
  put(-2.91, .96, .07, .42, .03, .30, '#d0a375');
  for (const x of [-3.05, -2.86, -2.68]) {
    put(x, .995, .062, .13, .10, .12, x === -3.05 ? '#c17256' : '#d7a066');
  }
  put(-2.39, .96, -.21, .13, .18, .13, '#ddd0b6');
  put(-2.31, 1.02, -.21, .063, .07, .085, '#ddd0b6');
  block(-2.71, 0, 0, 1.66, .94, 1.09);

  for (const z of [-1.26, 1.24]) {
    const back = z + Math.sign(z) * .27;
    put(-2.72, .40, z, .62, .12, .66, trim);
    put(-2.72, .52, z, .53, .07, .56, '#b36a60');
    for (const x of [-2.96, -2.48]) {
      put(x, 0, z - .23, .094, .42, .094, timber);
      put(x, 0, z + .23, .094, .42, .094, timber);
      put(x, .41, back, .094, .69, .094, timber);
    }
    put(-2.72, .89, back, .58, .18, .11, trim);
    block(-2.72, 0, z, .62, 1.10, .66);
  }
  put(1.65, .38, -2.86, 1.03, .13, .54, trim);
  put(1.65, .51, -2.86, .94, .07, .47, '#b36a60');
  for (const x of [1.24, 2.06]) {
    put(x, 0, -2.86, .12, .40, .41, timber);
  }
  block(1.65, 0, -2.86, 1.03, .58, .54);

  const bed = { x: 3.50, z: -.71 };
  put(bed.x, .16, bed.z, 1.55, .24, 2.28, timber);
  put(bed.x, .40, bed.z, 1.46, .25, 2.16, '#e2d2ab');
  put(bed.x, .65, bed.z + .27, 1.48, .09, 1.56, '#884850');
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const px = bed.x - .615 + col * .246;
      const pz = bed.z - .37 + row * .238;
      put(px, .739, pz, .230, .016, .226, (row + col) % 2 ? '#ac6861' : '#8c4f54');
    }
  }
  put(bed.x, .65, bed.z - .81, 1.11, .16, .43, '#f1e2c4');
  put(bed.x, .16, bed.z - 1.16, 1.56, 1.01, .16, timber);
  put(bed.x, 1.13, bed.z - 1.16, 1.66, .12, .20, trim);
  for (const x of [bed.x - .65, bed.x + .65]) {
    for (const z of [bed.z - .95, bed.z + .95]) put(x, 0, z, .13, .19, .13, timber);
  }
  block(bed.x, 0, bed.z, 1.56, 1.2, 2.38);

  const shelfZ = 2.37;
  put(4.67, 0, shelfZ, .18, 2.62, 2.10, dark);
  for (const z of [shelfZ - .97, shelfZ + .97]) put(4.47, 0, z, .57, 2.65, .14, timber);
  const bindings = ['#ae8060', '#8a5863', '#b6996c', '#576775', '#aa684f'];
  for (let i = 0; i < 5; i++) {
    const y = .19 + i * .55;
    put(4.43, y, shelfZ, .62, .105, 2.12, trim);
    if (i === 4) continue;
    for (let j = 0; j < 9; j++) {
      const z = shelfZ - .77 + j * .179 + (i % 2 ? .025 : 0);
      const h = .21 + (j * 5 + 2 * i) % 6 * .03;
      const color = bindings[(i + j) % 5];
      put(4.36, y + .105, z, .39, h, .126, color);
      put(4.162, y + .13, z, .02, .031, .094, '#d4b384');
    }
  }
  block(4.52, 0, shelfZ, .65, 2.62, 2.12);

  const rugX = .36;
  put(rugX, .002, .34, 2.49, .018, 2.92, '#563f50');
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 13; j++) {
      const border = i <= 1 || i >= 13 || j <= 1 || j >= 11;
      const diamond = Math.abs(i - 7) + Math.abs(j - 6);
      const color = border ? (i + j) % 2 ? '#bd9076' : '#aa695e'
        : diamond === 4 || diamond === 2 ? '#bf8b72' : '#764d59';
      put(rugX - 1.115 + j * .186, .020, -1.0 + i * .191, .181, .006, .185, color);
    }
  }

  put(0, 3.37, .72, .12, .82, .12, timber);
  put(0, 3.26, .72, .90, .13, .77, dark);
  for (const x of [-.34, .34]) {
    for (const z of [.46, .98]) {
      put(x, 3.10, z, .17, .18, .17, brass);
      put(x, 2.91, z, .128, .18, .13, '#ffd18d', true);
    }
  }

  const geometry = new BoxGeometry(1, 1, 1);
  const pieceTransform = new Object3D();
  const color = new Color();
  function batch(pieces: Piece[], lit: boolean) {
    const material = lit ? new MeshBasicMaterial() : new MeshLambertMaterial();
    const mesh = new InstancedMesh(geometry, material, pieces.length);
    mesh.name = lit ? 'shared-home-glow' : 'shared-home-solids';
    mesh.layers.set(sharedHomeLayer);
    pieces.forEach((piece, i) => {
      pieceTransform.position.set(piece.x, piece.y + piece.height / 2, piece.z);
      pieceTransform.scale.set(piece.width, piece.height, piece.depth);
      pieceTransform.updateMatrix();
      mesh.setMatrixAt(i, pieceTransform.matrix);
      mesh.setColorAt(i, color.set(piece.color));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  batch(solid, false);
  batch(glow, true);
  group.userData = { colliders, floors };
  return group;
}
