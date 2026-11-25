import { BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three';
import { sharedHomeLayer, sharedHomeOrigin } from '../../../src/presence/shared-home-space';
import type { Box } from './landmark-kit';
import { townResidentPostcards } from './town-resident-postcards';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

const halfWidth = 7;
const halfDepth = 6;
const ceiling = 3.6;
const doorX = -.82;
const hearth = { x: -3.22, z: -4.85 };
const lamp = { x: 3.86, z: -4.78 };
const timber = '#684039';
const trim = '#a26c49';
const dark = '#38262b';
const brass = '#e1b67c';

type Piece = { x: number; y: number; z: number; width: number; height: number; depth: number; color: string };
type Size = Pick<Piece, 'width' | 'height' | 'depth'>;
type Seat = { label: string; x: number; z: number; yaw: number; approach: number; kind: 'stool' | 'chair' | 'bench' };
type SharedHome = Group & { toggleDeskLamp(): boolean };

const tableStools: Seat[] = [-4.39, -2.02].flatMap((x, side) =>
  [-1.42, -.35, .72].map((z, i) => ({
    label: `长桌${side === 0 ? '西' : '东'}侧 ${i + 1} 号凳`,
    x, z, yaw: side === 0 ? Math.PI / 2 : -Math.PI / 2, approach: .78, kind: 'stool',
  })),
);
const seats: Seat[] = [
  ...tableStools,
  { label: '沙发左座', x: -3.94, z: 4.02, yaw: 0, approach: -.96, kind: 'bench' },
  { label: '沙发右座', x: -2.76, z: 4.02, yaw: 0, approach: -.96, kind: 'bench' },
  { label: '主厅单椅', x: -5.74, z: 3.91, yaw: 0, approach: -.79, kind: 'chair' },
  { label: '壁炉旁单椅', x: -5.59, z: -4.49, yaw: Math.PI / 2, approach: .79, kind: 'chair' },
  { label: '窗边坐榻', x: 2.18, z: -4.62, yaw: Math.PI, approach: -.96, kind: 'bench' },
  { label: '书桌椅', x: 4.60, z: -3.44, yaw: 0, approach: .80, kind: 'chair' },
  { label: '圆桌北椅', x: 5.28, z: 2.35, yaw: Math.PI, approach: .73, kind: 'chair' },
  { label: '圆桌南椅', x: 5.28, z: 4.68, yaw: 0, approach: .73, kind: 'chair' },
];

function bounds(x: number, y: number, z: number, { width, height, depth }: Size): Box {
  return { min: [x - width / 2, y, z - depth / 2], max: [x + width / 2, y + height, z + depth / 2] };
}

function world(x: number, z: number, y = 0) {
  return { x: sharedHomeOrigin.east + x, n: sharedHomeOrigin.north - z, ground: sharedHomeOrigin.height + y };
}

export const sharedHomeSpawn = { ...world(doorX, 4.36), yaw: 0 };

export function sharedHomeWalkable(east: number, north: number) {
  return Math.abs(east - sharedHomeOrigin.east) < halfWidth && Math.abs(north - sharedHomeOrigin.north) < halfDepth;
}

export function sharedHomeHearthWarmth(east: number, north: number, feet: number) {
  return Math.abs(feet - sharedHomeOrigin.height) < 1.4 &&
    (east - sharedHomeOrigin.east - hearth.x) ** 2 + (north - sharedHomeOrigin.north + hearth.z) ** 2 <= 2.5 ** 2;
}

const postcardKey = 'unwritten.postcards.v1';
const postcardLimit = 20;
const postcardLength = 140;
let sessionPostcards: string[] = [];

function readPostcards() {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(postcardKey) ?? '[]');
    if (Array.isArray(data)) {
      sessionPostcards = data.filter((entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0 && entry.length <= postcardLength).slice(-postcardLimit);
    }
  } catch { /* Keep any postcards written during this session. */ }
}

function openPostcardWall(context: Pick<TownActivityContext, 'open'>) {
  readPostcards();
  const panel = context.open('屋舍明信片墙', '把想留在小镇的一句话写成明信片。贴在这面墙上的文字会保存在本机。');
  const residentTitle = document.createElement('h3');
  residentTitle.textContent = '镇民明信片';
  const residents = document.createElement('ol');
  residents.className = 'town-mail-list';
  for (const { author, place, body } of townResidentPostcards) {
    const card = document.createElement('li');
    const byline = document.createElement('strong');
    byline.textContent = `${author} · ${place}`;
    const message = document.createElement('div');
    message.textContent = body;
    card.append(byline, message);
    residents.append(card);
  }
  const playerTitle = document.createElement('h3');
  playerTitle.textContent = '我留下的明信片';
  const list = document.createElement('ol');
  list.className = 'town-mail-list';
  const form = document.createElement('form');
  form.className = 'town-mail-form';
  const field = document.createElement('textarea');
  field.setAttribute('aria-label', '明信片正文');
  field.maxLength = postcardLength;
  field.required = true;
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '张贴明信片';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');

  function view() {
    list.replaceChildren(...sessionPostcards.slice().reverse().map(postcard => {
      const line = document.createElement('li');
      line.textContent = postcard;
      return line;
    }));
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const postcard = field.value.trim();
    if (!postcard || postcard.length > postcardLength) return;
    sessionPostcards = [...sessionPostcards.slice(1 - postcardLimit), postcard];
    try {
      localStorage.setItem(postcardKey, JSON.stringify(sessionPostcards));
      status.textContent = '明信片已贴上。';
    } catch {
      status.textContent = '明信片已贴上，本次离开页面后无法保留。';
    }
    field.value = '';
    view();
  });
  form.append(field, submit, status);
  panel.append(residentTitle, residents, playerTitle, list, form);
  view();
}

export function createSharedHomeSpots(
  context: Pick<TownActivityContext, 'sit' | 'face' | 'announce' | 'open'>,
  leave: () => void,
  photo: (filename: string) => void,
  room: SharedHome,
  openDoorBook: () => void,
): TownActivitySpot[] {
  const spots: TownActivitySpot[] = seats.map(({ label, x, z, yaw, approach }) => ({
    ...world(x - Math.sin(yaw) * approach, z + Math.cos(yaw) * approach), label: `就座 · ${label}`, range: .65,
    run() {
      const seat = world(x, z);
      context.sit({ x: seat.x, n: seat.n, eyeY: seat.ground + 1.41, yaw });
    },
  }));
  spots.push(
    { ...world(doorX, 5.39), range: .81, label: '出门 · 返回来时的屋门', run: leave },
    { ...world(.59, 4.42), range: .78, label: '百门册 · 选一扇门出去', run: openDoorBook },
    { ...world(hearth.x, -3.83), range: .85, label: '烤火 · 壁炉回暖',
      run() {
        const at = world(hearth.x, -5.52, 1.06);
        context.face(at.x, at.n, at.ground);
        context.announce('靠近壁炉，冻纹会慢慢消退。');
      },
    },
    { ...world(.15, 1.95), range: .75, label: '留影 · 保存屋舍照片',
      run() {
        const at = world(-3.55, -3.56, 1.48);
        context.face(at.x, at.n, at.ground);
        photo('UNWRITTEN-2027-shared-home.png');
      },
    },
    { ...world(1.80, 5.03), range: .78, label: '翻看或写明信片', run: () => openPostcardWall(context) },
    { ...world(3.35, -3.99), range: .72, label: '留一盏灯 · 开关台灯',
      run() { context.announce(room.toggleDeskLamp() ? '给屋舍留了一盏灯。' : '窗边的台灯熄了。'); },
    },
  );
  return spots;
}

export function buildSharedHome(): SharedHome {
  const group = new Group();
  group.name = 'shared-home';
  group.layers.set(sharedHomeLayer);
  group.position.set(sharedHomeOrigin.east, sharedHomeOrigin.height, -sharedHomeOrigin.north);

  const solid: Piece[] = [];
  const glow: Piece[] = [];
  const colliders: Box[] = [];
  const floors = [bounds(0, -.24, 0, { width: halfWidth * 2, height: .24, depth: halfDepth * 2 })];
  function put(x: number, y: number, z: number, width: number, height: number, depth: number, color: string, lit = false) {
    (lit ? glow : solid).push({ x, y, z, width, height, depth, color });
  }
  function block(x: number, y: number, z: number, width: number, height: number, depth: number) {
    colliders.push(bounds(x, y, z, { width, height, depth }));
  }
  function table(x: number, z: number, width: number, depth: number) {
    put(x, .77, z, width, .13, depth, '#b98056');
    put(x, .66, z, width - .08, .12, depth - .08, timber);
    for (const dx of [-(width / 2 - .13), width / 2 - .13]) {
      for (const dz of [-(depth / 2 - .13), depth / 2 - .13]) put(x + dx, 0, z + dz, .15, .78, .15, timber);
    }
    block(x, 0, z, width, .90, depth);
  }

  const boards = ['#87563e', '#9b6847', '#8b5b42', '#a57251', '#915d43'];
  const plaster = '#b8a17e';
  const skirting = '#704a43';
  put(0, -.24, 0, 14, .20, 12, dark);
  for (let row = 0; row < 20; row++) {
    const z = -5.70 + row * .60;
    const split = .38 + (row % 5 - 2) * .77;
    put((split - 6.86) / 2, -.046, z, split + 6.84, .046, .582, boards[row % boards.length]);
    put((split + 6.86) / 2, -.046, z, 6.84 - split, .046, .582, boards[(row + 2) % boards.length]);
  }
  for (const sign of [-1, 1]) {
    put(sign * 6.88, 0, 0, .24, ceiling, 12, plaster);
    put(0, 0, sign * 5.88, 14, ceiling, .24, plaster);
    block(sign * 6.88, 0, 0, .24, ceiling, 12);
    block(0, 0, sign * 5.88, 14, ceiling, .24);
    for (const [y, height, tone] of [[0, .15, skirting], [1.02, .095, trim], [3.31, .13, timber]] as const) {
      put(sign * 6.72, y, 0, .16, height, 11.52, tone);
      put(0, y, sign * 5.72, 13.64, height, .16, tone);
    }
    for (let i = 0; i < 11; i++) {
      put(-6.11 + i * 1.22, .15, sign * 5.76, 1.20, .87, .07, boards[(i + 2) % boards.length]);
      if (i > 8) continue;
      put(sign * 6.76, .15, -5.04 + i * 1.25, .07, .87, 1.23, boards[(i + 1) % boards.length]);
    }
  }
  for (const x of [-6.64, 6.64]) {
    for (const z of [-5.64, 5.64]) put(x, 0, z, .32, ceiling, .32, timber);
  }
  put(0, ceiling, 0, 14, .18, 12, '#745552');
  block(0, ceiling, 0, 14, .18, 12);
  for (const z of [-4.25, -1.45, 1.45, 4.25]) put(0, 3.33, z, 13.66, .27, .21, dark);

  put(doorX, .05, 5.75, 1.43, 2.50, .17, dark);
  for (let i = 0; i < 6; i++) put(doorX - .55 + i * .22, .11, 5.64, .212, 2.36, .15, boards[i % 5]);
  for (const y of [.30, 1.70]) put(doorX, y, 5.546, 1.21, .19, .06, timber);
  for (const dx of [-.76, .76]) put(doorX + dx, 0, 5.66, .18, 2.67, .32, trim);
  put(doorX, 2.57, 5.66, 1.72, .18, .32, trim);
  put(doorX + .48, 1.06, 5.48, .11, .11, .15, brass);
  put(doorX, 2.90, 5.72, .67, .19, .10, brass, true);

  table(.59, 5.33, .78, .51);
  put(.59, .90, 5.30, .61, .055, .38, '#782e38');
  put(.59, .955, 5.30, .58, .065, .35, '#fcdfaa');
  for (const side of [-1, 1]) {
    put(.59 + side * .15, 1.02, 5.30, .285, .025, .34, '#fff1c9');
    for (let row = 0; row < 3; row++) put(.59 + side * .15, 1.045, 5.19 + row * .09, .20, .008, .018, '#8a6048');
  }
  put(.59, 1.02, 5.30, .028, .03, .37, brass);

  const hills = [.14, .29, .48, .67, .58, .39, .54, .32];
  for (const x of [-5.32, 2.65]) {
    put(x, 1.48, -5.77, 2.38, 1.56, .10, dark);
    put(x, 1.58, -5.707, 2.10, 1.36, .026, '#4b708f', true);
    put(x, 1.59, -5.687, 2.09, .37, .022, '#a0c4d6', true);
    for (let i = 0; i < hills.length; i++) {
      put(x - .916 + .262 * i, 1.82, -5.675, .261, hills[i], .02, '#729ab2', true);
    }
    for (const [dx, base] of [[-.58, 1.76], [.36, 1.70]]) {
      put(x + dx, base, -5.650, .043, .26, .02, '#824c43');
      for (const [level, width] of [[.13, .31], [.22, .23], [.33, .14]]) {
        put(x + dx, base + level, -5.637, width, .13, .019, '#547b87', true);
      }
    }
    put(x + .74, 1.86, -5.626, .075, .095, .02, '#ffd6a0', true);
    put(x - .82, 2.79, -5.659, .061, .052, .02, '#fff1cb', true);
    for (const y of [1.54, 2.18, 2.94]) put(x, y, -5.56, 2.33, .098, .17, trim);
    for (const dx of [-1.12, 0, 1.12]) put(x + dx, 1.56, -5.56, .11, 1.47, .17, trim);
    put(x, 1.45, -5.49, 2.48, .12, .37, timber);
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 3; i++) put(x + sign * (.88 + i * .17), 1.60, -5.48 - i % 2 * .028,
        .171, 1.51, .10, i % 2 ? '#854b4d' : '#a95d56');
      put(x + sign * 1.05, 2.03, -5.40, .44, .08, .08, brass);
    }
    put(x, 3.11, -5.48, 2.69, .078, .10, brass);
  }

  const bricks = ['#82534e', '#935d50', '#a06a57', '#764644'];
  put(hearth.x, .16, -5.62, 2.12, 2.29, .34, '#754d47');
  put(hearth.x, 0, -5.29, 2.43, .17, 1.08, '#62575a');
  put(hearth.x, .17, -5.57, 1.56, .93, .31, '#271f26');
  for (let row = 0; row < 8; row++) {
    const count = row % 2 ? 5 : 6;
    for (let i = 0; i < count; i++) {
      const bx = (i - (count - 1) / 2) * .357;
      if (row < 4 && Math.abs(bx) < .60) continue;
      put(hearth.x + bx, .18 + row * .247, -5.42, .34, .222, .30, bricks[(i + row) % 4]);
    }
  }
  for (const dx of [-.765, .765]) put(hearth.x + dx, .18, -5.28, .23, 1.12, .36, '#ac7a65');
  put(hearth.x, 1.17, -5.28, 1.73, .21, .40, '#b98263');
  put(hearth.x, 1.53, -5.27, 2.40, .17, .57, timber);
  put(hearth.x, 2.08, -5.65, .73, 1.51, .32, '#82534e');
  put(hearth.x, .20, -5.30, 1.13, .10, .41, '#482d2a');
  const embers = glow.length;
  for (const [dx, y, z, width, height] of [
    [0, .30, -5.29, 1.06, .13], [-.37, .41, -5.35, .21, .23],
    [-.15, .41, -5.39, .28, .42], [.12, .41, -5.43, .27, .59], [.36, .41, -5.36, .22, .31],
  ]) {
    put(hearth.x + dx, y, z, width, height, .18, '#c8633a', true);
    put(hearth.x + dx, y + height * .16, z + .086, width * .57, height * .58, .11, '#fdb451', true);
  }
  const emberCount = glow.length - embers;
  block(hearth.x, 0, -5.32, 2.43, 2.46, 1.15);
  for (let i = 0; i < 6; i++) {
    put(-1.49 + (i % 3) * .14, .05 + Math.floor(i / 3) * .16, -5.39, .132, .15, .43, boards[i % 5]);
  }

  table(-3.20, -.35, 1.28, 3.14);
  put(-3.20, .905, -.35, .48, .021, 2.41, '#864c58');
  for (const z of [-1.23, -.36, .54]) {
    put(-3.20, .93, z, .36, .037, .26, '#d0a375');
    put(-3.16, .968, z, .14, .15, .13, '#ddd0b6');
  }
  table(-3.36, 2.02, 1.23, .46);
  table(4.53, -4.72, 1.49, .86);
  put(4.64, .91, -4.65, .39, .06, .31, '#596b73');

  put(lamp.x, .91, lamp.z, .23, .065, .22, timber);
  put(lamp.x, .973, lamp.z, .054, .37, .056, brass);
  put(lamp.x, 1.33, lamp.z, .27, .16, .23, '#996a4a');
  const lampIndex = glow.length;
  put(lamp.x, 1.285, lamp.z, .21, .057, .188, '#ffd093', true);

  const circleX = 5.28;
  const circleZ = 3.54;
  for (const [width, depth] of [[1.09, .52], [.52, 1.09], [.90, .88]]) {
    put(circleX, .78, circleZ, width, .12, depth, '#b98056');
  }
  put(circleX, 0, circleZ, .21, .81, .21, timber);
  put(circleX, .012, circleZ, .59, .075, .59, timber);
  block(circleX, 0, circleZ, 1.09, .90, 1.09);

  for (const { x, z, yaw, kind } of seats) {
    if (kind === 'bench') continue;
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    put(x, .40, z, .63, .14, .64, trim);
    put(x, .54, z, .55, .045, .56, '#b36a60');
    for (const dx of [-.23, .23]) {
      for (const dz of [-.23, .23]) put(x + dx, 0, z + dz, .095, .42, .095, timber);
    }
    const chair = kind === 'chair';
    if (chair) {
      const backX = x - sine * .28;
      const backZ = z + cosine * .28;
      const northSouth = Math.abs(cosine) > .5;
      put(backX, .49, backZ, northSouth ? .58 : .095, .54, northSouth ? .095 : .58, timber);
    }
    block(x, 0, z, .64, chair ? 1.05 : .585, .66);
  }
  put(-3.35, .08, 4.02, 2.63, .46, .91, timber);
  put(-3.35, .52, 4.29, 2.63, .58, .37, '#754655');
  for (const x of [-3.94, -2.76]) put(x, .53, 3.91, 1.14, .14, .62, '#a87578');
  for (const x of [-4.56, -2.14]) put(x, .46, 4.01, .20, .32, .91, '#925d6b');
  block(-3.35, 0, 4.02, 2.63, 1.12, .91);
  put(2.18, .0, -4.62, 1.64, .49, .62, timber);
  put(2.18, .49, -4.62, 1.62, .11, .60, '#ab8273');
  block(2.18, 0, -4.62, 1.64, .60, .62);

  const bed = { x: 3.60, z: -.04 };
  put(bed.x, .11, bed.z, 1.65, .27, 2.49, timber);
  put(bed.x, .38, bed.z, 1.54, .25, 2.35, '#e2d2ab');
  put(bed.x, .63, bed.z + .21, 1.55, .11, 1.79, '#894c55');
  for (let i = 0; i < 8; i++) {
    put(bed.x, .74, bed.z - .59 + .205 * i, 1.46, .018, .14, i % 2 ? '#ad6a62' : '#9e6263');
  }
  put(bed.x, .64, bed.z - .85, 1.17, .16, .42, '#f1e2c4');
  put(bed.x, .11, bed.z - 1.21, 1.66, 1.04, .17, timber);
  for (const x of [bed.x - .65, bed.x + .65]) {
    for (const z of [bed.z - .99, bed.z + .99]) put(x, 0, z, .13, .17, .13, timber);
  }
  block(bed.x, 0, bed.z, 1.66, 1.18, 2.5);
  put(4.85, 0, -1.18, .57, .63, .57, timber);
  put(4.56, .34, -1.18, .061, .06, .12, brass);
  block(4.85, 0, -1.18, .57, .63, .57);
  put(4.85, .63, -1.18, .31, .052, .29, trim);
  put(4.85, .682, -1.18, .073, .17, .073, brass);
  put(4.85, .852, -1.18, .27, .17, .25, '#e7ad73', true);
  for (const offset of [-.117, .117]) {
    put(4.85 + offset, .852, -1.18, .038, .17, .27, dark);
    put(4.85, .852, -1.18 + offset, .29, .028, .036, trim);
  }
  put(4.85, 1.022, -1.18, .23, .043, .21, brass);

  const shelfZ = -2.69;
  put(6.65, 0, shelfZ, .17, 2.53, 2.85, dark);
  for (const z of [shelfZ - 1.36, shelfZ + 1.36]) put(6.40, 0, z, .57, 2.57, .14, timber);
  const bindings = ['#ae8060', '#8a5863', '#b6996c', '#576775', '#aa684f'];
  for (let i = 0; i < 5; i++) {
    const y = .17 + i * .52;
    put(6.34, y, shelfZ, .61, .105, 2.80, trim);
    if (i === 4) continue;
    for (let j = 0; j < 9; j++) {
      put(6.25, y + .105, shelfZ - 1.06 + j * .241, .39, .21 + (j * 5 + 2 * i) % 6 * .026, .157,
        bindings[(i + j) % 5]);
    }
  }
  block(6.43, 0, shelfZ, .67, 2.57, 2.80);

  put(-3.22, .004, -.05, 4.98, .018, 5.03, '#694854');
  for (const side of [-1, 1]) {
    put(-3.22 + side * 2.36, .023, -.05, .15, .007, 4.88, '#b9806d');
    put(-3.22, .023, -.05 + side * 2.39, 4.94, .007, .15, '#b9806d');
  }
  put(.05, .003, 4.37, 2.43, .02, 1.49, '#9b686b');
  for (let i = 0; i < 5; i++) put(-.94 + i * .49, .025, 4.37, .17, .008, 1.31, '#b98271');
  const artX = -6.64;
  put(artX, 1.63, .02, .12, 1.30, 2.11, '#824c59');
  for (let i = 0; i < 8; i++) {
    const height = .19 + (i % 4) * .18;
    put(artX + .074, 2.11 - height * .5, -.82 + i * .238, .03, height, .19, i % 2 ? '#d3ac77' : '#ad786b');
  }
  for (const z of [-.99, 1.03]) put(artX + .07, 1.56, z, .039, 1.45, .076, '#d3ac77');
  const postcardBoardX = 1.80;
  put(postcardBoardX, 1.26, 5.64, 2.08, 1.17, .11, timber);
  put(postcardBoardX, 1.35, 5.567, 1.89, 1.00, .07, '#af8a64');
  for (const [dx, y] of [[-.67, 1.52], [-.25, 1.66], [.20, 1.46], [.66, 1.73]]) {
    put(postcardBoardX + dx, y, 5.518, .32, .22, .032, '#f0dfbc');
    put(postcardBoardX + dx, y + .17, 5.499, .058, .04, .022, '#a66160');
  }

  // The east wall has a large central frame for the midnight group photo.
  const photoFrames = [
    { z: .75, y: 1.77, span: 1.40, height: .90, rim: brass },
    { z: -.45, y: 1.96, span: .66, height: .52, rim: timber },
    { z: 1.95, y: 1.96, span: .66, height: .52, rim: timber },
    { z: .75, y: 1.20, span: .74, height: .43, rim: timber },
  ];
  const rimWidth = .055;
  for (const { z, y, span, height, rim } of photoFrames) {
    put(6.738, y, z, .044, height, span, '#bfab8d');
    for (const offset of [-1, 1]) {
      put(6.710, y + (offset > 0 ? height - rimWidth : 0), z, .062, rimWidth, span, rim);
      put(6.710, y + rimWidth, z + offset * (span - rimWidth) / 2,
        .062, height - 2 * rimWidth, rimWidth, rim);
    }
  }

  for (const [x, z] of [[-5.45, -5.61], [5.14, -5.63], [3.94, 5.64]]) {
    put(x, 2.01, z, .19, .15, .18, brass);
    put(x, 2.16, z, .088, .21, .090, '#f7d599');
    put(x, 2.38, z, .060, .106, .064, '#ffcc78', true);
  }
  for (const [x, z] of [[-6.17, 5.26], [6.19, 5.30]]) {
    put(x, 0, z, .34, .29, .35, '#a7715f');
    for (const shift of [-.11, .04, .13]) put(x + shift, .27, z, .13, .41 - Math.abs(shift), .16, '#5d7869');
  }
  const chandelierX = -3.19;
  put(chandelierX, 2.90, -.35, .81, .13, .63, dark);
  put(chandelierX, 3.02, -.35, .098, .57, .10, timber);
  for (const x of [chandelierX - .29, chandelierX + .29]) {
    for (const z of [-.57, -.15]) {
      put(x, 2.81, z, .156, .11, .15, brass);
      put(x, 2.72, z, .12, .11, .11, '#ffd18d', true);
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
    return mesh;
  }
  batch(solid, false);
  const lightBatch = batch(glow, true);
  let lampOn = true;
  let flameFrame = -1;
  lightBatch.onBeforeRender = () => {
    const next = Math.floor(performance.now() / 95);
    if (next === flameFrame) return;
    flameFrame = next;
    for (let i = 0; i < emberCount; i++) {
      const flare = .87 + .13 * Math.sin(next * .8 + i * 1.3);
      lightBatch.setColorAt(embers + i, color.set(glow[embers + i].color).multiplyScalar(flare));
    }
    lightBatch.instanceColor!.needsUpdate = true;
  };
  group.userData = { colliders, floors };
  return Object.assign(group, {
    toggleDeskLamp() {
      lampOn = !lampOn;
      lightBatch.setColorAt(lampIndex, color.set(lampOn ? glow[lampIndex].color : '#55382e'));
      lightBatch.instanceColor!.needsUpdate = true;
      return lampOn;
    },
  });
}
