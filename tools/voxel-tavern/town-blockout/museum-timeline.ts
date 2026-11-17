import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import type { MuseumBuilder } from './museum-kit';
import { buildWestDetail } from './museum-detail-west';
import { buildEastDetail } from './museum-detail-east';

export const monthStops = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  x: i < 6 ? -10.18 : 10.18,
  z: i < 6 ? 7.55 - i * 3.5 : -9.95 + (i - 6) * 3.5,
}));

const timber = '#492d27';
const maple = '#956041';
const brass = '#bc8c52';
const brassBright = '#e2bd78';
const paper = '#d9be90';
const wall = '#866447';
const lamp = '#ffe3aa';
const red = '#a23c37';
const jade = '#4a807c';
const archival = '#7c5762';

const monthTheme = [
  ['冬日与新年', '#40677c', '#b7bdbe'],
  ['冰雪赛场', '#34536e', '#bfd9db'],
  ['公共生活', '#668278', '#c8ba8d'],
  ['科学与观测', '#2d495f', '#abb9c8'],
  ['在路上', '#70765c', '#bda77e'],
  ['赛事与城市', '#6b7861', '#cfbda3'],
  ['舞台与艺术', '#7a4348', '#e3aa7b'],
  ['夏日生活', '#557379', '#c7c99e'],
  ['书页与开学季', '#605d58', '#e2c49c'],
  ['银幕与影像', '#664257', '#bf827b'],
  ['网络档案', '#414d67', '#77aea4'],
  ['岁末回望', '#77433e', '#d9ae82'],
] as const;

export const monthModels = [
  '哈尔滨冰灯宫', '冬奥冰场与人形机器人', '崇明春植', '探月飞船与月面',
  '天舟货运舱', '国际足球揭幕球场', '世界人工智能大会', '贵州村超球场',
  '网络安全工作台', '秋日水乡', '乌镇互联网展亭', '岁末空白台历',
] as const;

const museumCaseCenter = 12.19;
export const museumReadingSeat = { x: -4.66, z: -4.82 } as const;

export function addMonthExhibit(m: MuseumBuilder, { month, x, z }: typeof monthStops[number]) {
  const side = Math.sign(x);
  const build = month <= 6 ? buildWestDetail : buildEastDetail;
  build(month, (lateral, heightBase, along, width, height, depth, paint, emit = false) =>
    m.detailBox(paint, side * (museumCaseCenter - lateral), heightBase, z + along, width, height, depth, 0, emit));
}

function addGalleryFurnishings(m: MuseumBuilder, floor: number) {
  const fine = 1 / 64;
  const aubergine = '#4b3442';
  const brick = '#7c3b3c';
  const parchment = '#eee0b6';
  const indigo = '#40566b';
  const agedGold = '#c69662';
  function cluster(x: number, z: number, yaw = 0) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return (color: string, dx: number, height: number, dz: number, w: number, h: number, d: number, angle = 0, lit = false) => {
      m.detailBox(color, x + dx * cos + dz * sin, floor + height, z - dx * sin + dz * cos, w, h, d, yaw + angle, lit);
    };
  }

  // The aisle runner sits below the guide lights and does not change the walk surface.
  const rug = cluster(0, .55);
  rug(aubergine, 0, fine, 0, 2.89, fine, 15.55);
  rug(brick, 0, fine * 1.75, 0, 2.55, fine * .6, 15.17);
  for (const side of [-1, 1]) {
    for (const inset of [1.33, 1.39]) rug(agedGold, side * inset, fine * 2, 0, fine, fine, 15.37);
    for (const end of [7.59, 7.67]) rug(agedGold, 0, fine * 2, side * end, 2.79, fine, fine);
    for (let index = 0; index < 30; index++) {
      rug('#a4715c', side * 1.22, fine * 2.75, -7.06 + index * .485, .075, fine, .075, Math.PI / 4);
    }
  }
  for (let index = -4; index <= 4; index++) {
    const z = index * 1.56;
    rug(aubergine, 0, fine * 2.75, z, .44, fine, .44, Math.PI / 4);
    rug(agedGold, 0, fine * 3.65, z, .218, fine, .218, Math.PI / 4);
    rug(brick, 0, fine * 4.55, z, .119, fine, .119, Math.PI / 4);
  }

  const archiveX = -4.32, archiveZ = 1.87;
  const archive = cluster(archiveX, archiveZ);
  archive(timber, 0, .93, 0, 2.65, .16, 1.19);
  archive(maple, 0, 1.04, 0, 2.69, .075, 1.22);
  for (const dx of [-1.14, 1.14]) for (const dz of [-.45, .45]) {
    archive(timber, dx, .48, dz, .15, .97, .145);
    archive(brass, dx, .11, dz, .16, .12, .155);
  }
  archive(timber, 0, .47, -.40, 2.26, .073, .116);
  archive(indigo, 0, .84, .572, 1.8, .12, fine);
  m.label('档案整理台', archiveX, floor + .85, archiveZ + .592, 1.35, .12, 0,
    { background: indigo, color: '#f4dfaf', border: false });
  m.collider(archiveX, floor + .54, archiveZ, 2.69, 1.08, 1.22);
  // Paper, film boxes and a hand reader are sculpted separately on the archive desk.
  for (const [i, tint] of [archival, indigo, brick].entries()) {
    archive(tint, -.83 + i * .055, 1.106 + i * .054, -.06 - i * .022, .51, .047, .58, .10 - i * .06);
    archive(parchment, -.815 + i * .055, 1.103 + i * .054, .233 - i * .022, .451, .026, fine, .10 - i * .06);
  }
  archive(timber, -.04, 1.096, .19, .62, .032, .48, -.09);
  for (const side of [-1, 1]) {
    archive(parchment, -.04 + side * .15, 1.119, .19, .282, .02, .452, -.09);
    for (let index = 0; index < 5; index++) {
      archive('#9d7655', -.04 + side * .147, 1.138, .072 + index * .054, .197 - (index === 4 ? .052 : 0), fine, fine, -.09);
    }
  }
  archive(indigo, .90, 1.113, -.24, .56, .072, .438);
  archive('#333441', .90, 1.311, -.26, .29, .331, .286);
  archive('#83664b', .90, 1.386, -.13, .31, .21, .12);
  archive('#333441', .90, 1.386, -.046, .24, .18, .092);
  archive('#7ba3a4', .90, 1.386, .007, .164, .12, fine);
  archive('#bddcce', .92, 1.416, .021, .046, .035, fine);
  archive(agedGold, .99, 1.495, -.25, .073, .027, .072);
  for (const offset of [.56, .81, 1.03]) {
    archive('#705745', offset, 1.10, .323, .16, .044, .17);
    archive(parchment, offset, 1.128, .323, .105, fine, .087);
  }

  const dioramaX = 4.68, dioramaZ = 1.75;
  const street = cluster(dioramaX, dioramaZ);
  street(timber, 0, .36, 0, 2.68, .72, 1.49);
  street(maple, 0, .075, 0, 2.75, .15, 1.55);
  street(brass, 0, .744, 0, 2.72, .075, 1.53);
  street(indigo, 0, .82, 0, 2.54, .079, 1.32);
  m.label('雪镇旧街 · 模型', dioramaX, floor + .472, dioramaZ + .755, 1.77, .25, 0,
    { background: timber, color: '#ffdfa8', accent: brass });
  m.collider(dioramaX, floor + .38, dioramaZ, 2.75, .76, 1.55);
  street('#95a7ad', 0, .89, -.032, 2.32, .086, 1.14);
  street('#627486', 0, .934, -.038, 2.31, fine, .22);
  street('#57778a', -.72, .941, .274, .813, fine, .303);
  for (let i = 0; i < 8; i++) street('#966b4e', -.90 + i * .049, .994, .259, .046, .04, .394);
  for (const [x, z, height, tint] of [[-.70, -.366, .34, brick], [.245, -.348, .46, wall], [.820, .238, .30, indigo]] as const) {
    street(tint, x, .941 + height / 2, z, .42, height, .34);
    street('#362b32', x, .961 + height, z, .51, .047, .417);
    for (let layer = 0; layer < 5; layer++) {
      street(layer === 4 ? '#dce5df' : '#516272', x, .993 + height + layer * .047, z, .49, .055, .422 - layer * .075);
    }
    for (const dx of [-.12, .12]) {
      street(brass, x + dx, 1.087, z + .173, .078, .093, fine);
      street(lamp, x + dx, 1.090, z + .188, .051, .067, fine, 0, true);
    }
  }
  for (const [x, z, height] of [[-1.04, -.21, .34], [-.19, -.37, .26], [.97, -.365, .39], [.17, .32, .25]]) {
    street(timber, x, 1.016, z, .04, .14, .04);
    for (let layer = 0; layer < 5; layer++) {
      const spread = height * (.53 - layer * .076);
      street(layer % 2 ? '#91a9a6' : '#466760', x, 1.09 + height * .13 * layer, z, spread, height * .15, spread, Math.PI / 4);
    }
  }
  for (const x of [-.2, .59]) {
    street(timber, x, 1.035, .128, .028, .197, .028);
    street(lamp, x, 1.148, .128, .059, .062, .059, 0, true);
    street(indigo, x, 1.19, .128, .077, .035, .077);
  }

  const { x: benchX, z: benchZ } = museumReadingSeat;
  const bench = cluster(benchX, benchZ);
  for (const x of [-.95, .95]) for (const z of [-.247, .233]) {
    bench(timber, x, .233, z, .132, .466, .13);
    bench(brass, x, .052, z, .143, .066, .141);
  }
  bench(maple, 0, .451, 0, 2.21, .095, .66);
  bench(timber, 0, .544, -.295, 2.255, .12, .13);
  bench(brick, 0, .527, .012, 1.99, .095, .557);
  bench(aubergine, 0, .942, -.284, 2.11, .32, .09);
  bench(maple, 0, 1.133, -.301, 2.23, .077, .12);
  for (const side of [-1, 1]) {
    bench(timber, side * 1.02, .78, -.284, .113, .71, .115);
    bench(maple, side * 1.02, .781, -.023, .104, .075, .50);
    for (let index = 0; index < 6; index++) {
      bench(agedGold, side * (.115 + index * .145), .584, .273, .041, fine, .029);
    }
  }
  m.collider(benchX, floor + .568, benchZ, 2.27, 1.136, .69);

  const lecternX = 4.75, lecternZ = -4.77, yaw = -.32;
  const lectern = cluster(lecternX, lecternZ, yaw);
  for (const side of [-1, 1]) {
    lectern(timber, side * .59, .466, 0, .101, .932, .116);
    lectern(maple, side * .59, .074, 0, .22, .107, .66);
  }
  lectern(timber, 0, .402, 0, 1.18, .075, .117);
  lectern(timber, 0, 1.192, 0, 1.625, .678, .123);
  lectern(brass, 0, 1.192, .074, 1.555, .602, .047);
  lectern(indigo, 0, 1.192, .106, 1.485, .542, .022);
  m.label('展陈索引', lecternX + Math.sin(yaw) * .129, floor + 1.294, lecternZ + Math.cos(yaw) * .129, 1.32, .176, yaw,
    { background: indigo, color: '#ffdfa8', border: false });
  for (const [dx, tint] of [[-.44, '#8f7d89'], [0, '#758d8a'], [.44, '#b4886c']] as const) {
    lectern(tint, dx, 1.082, .129, .288, .086, fine);
  }
  m.collider(lecternX, floor + .772, lecternZ, 1.76, 1.544, .88);

  // Rear cabinets keep their shallow footprint clear of the rear cross aisle.
  for (const side of [-1, 1]) {
    const x = side * 3.98, z = -13.15;
    const cabinet = cluster(x, z);
    cabinet(timber, 0, .579, 0, 2.83, 1.09, .74);
    cabinet(maple, 0, 1.15, 0, 2.91, .112, .803);
    cabinet(timber, 0, .076, 0, 2.91, .13, .80);
    for (const dx of [-.913, 0, .913]) {
      cabinet(side < 0 ? '#765044' : '#60525c', dx, .52, .383, .842, .57, .06);
      cabinet(agedGold, dx, .633, .427, .126, .038, .054);
      const color = dx < 0 ? indigo : dx > 0 ? brick : jade;
      cabinet(color, dx, 1.249, .027, .628, .085, .475);
      cabinet(parchment, dx - .033, 1.299, .029, .35, fine, .255);
    }
    m.collider(x, floor + .602, z, 2.91, 1.204, .83);
  }
}

export function addMuseumTimeline(m: MuseumBuilder) {
  const y = .28;
  const glassPoints: number[] = [];
  function glass(a: [number, number, number], b: [number, number, number],
    c: [number, number, number], d: [number, number, number]) {
    glassPoints.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  function lantern(x: number, z: number, y: number, size: number) {
    m.box(timber, x, y + .55, z, .11, .42, .11);
    m.box(brass, x, y + .32, z, size * 1.08, .105, size * 1.08);
    m.box(lamp, x, y, z, size * .78, .56, size * .78, 0, true);
    m.box(brass, x, y - .32, z, size * 1.08, .11, size * 1.08);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      m.box(timber, x + dx * size * .43, y, z + dz * size * .43, .055, .61, .055);
    }
    m.box(red, x, y - .49, z, .074, .25, .074);
  }
  function display({ month, x, z }: typeof monthStops[number]) {
    const side = Math.sign(x);
    const yaw = -side * Math.PI / 2;
    const backdrop = side * 13.28;
    const cabinet = side * museumCaseCenter;
    const [theme, illustrated, accent] = monthTheme[month - 1];
    const across = (local: number) => cabinet - side * local;

    m.solid(timber, cabinet, y + .4, z, 1.44, .8, 2.28);
    m.box(maple, cabinet, y + .11, z, 1.57, .19, 2.41);
    m.box(wall, across(.726), y + .39, z, .048, .46, 2.08);
    m.box(brass, across(.77), y + .39, z, .02, .35, 1.99);
    m.box(timber, across(.788), y + .39, z, .017, .28, 1.9);
    m.label(`${monthModels[month - 1]} · 示意`, across(.802), y + .39, z, 1.9, .25, yaw,
      { background: timber, color: '#ffe1a0', accent: brass });
    m.box(brass, cabinet, y + .79, z, 1.60, .095, 2.42);
    m.box(timber, cabinet, y + .868, z, 1.34, .083, 2.21);
    m.box(paper, across(-.03), y + .918, z, 1.09, .021, 1.91);
    for (const local of [-.625, .625]) {
      m.box(brass, across(local), y + 1.73, z, .065, .067, 2.14);
      m.box(lamp, across(local), y + 1.69, z, .019, .019, 2.02, 0, true);
      for (const end of [-1.04, 1.04]) {
        m.box(brass, across(local), y + 1.31, z + end, .056, .86, .056);
      }
    }
    for (const end of [-1.05, 1.05]) m.box(brass, cabinet, y + 1.73, z + end, 1.25, .067, .065);
    const a = across(.625);
    const b = across(-.625);
    glass([a, y + .94, z - 1.04], [a, y + .94, z + 1.04], [a, y + 1.73, z + 1.04], [a, y + 1.73, z - 1.04]);
    glass([a, y + 1.73, z - 1.04], [a, y + 1.73, z + 1.04], [b, y + 1.73, z + 1.04], [b, y + 1.73, z - 1.04]);

    m.solid(timber, backdrop, y + 1.88, z, .25, 3.73, 2.61);
    m.box(wall, backdrop - side * .145, y + 2.22, z, .043, 2.67, 2.36);
    m.box(brass, backdrop - side * .174, y + 2.48, z, .03, 1.75, 2.07);
    m.box(paper, backdrop - side * .196, y + 2.47, z, .026, 1.67, 1.99);
    for (const dx of [-.47, .47]) {
      m.box(illustrated, backdrop - side * .214, y + 2.36, z + dx, .027, .76, .77);
      m.box(accent, backdrop - side * .232, y + 2.17, z + dx, .025, .18, .67);
      for (let k = 0; k < 3; k++) {
        m.box(accent, backdrop - side * .235, y + 2.28 + k * .11, z + dx - .16 + .10 * k,
          .024, .055, .17 + k * .06);
      }
    }
    m.label(`${String(month).padStart(2, '0')} 月`, backdrop - side * .25, y + 3.13, z, 1.81, .47, yaw,
      { background: timber, color: '#ffe1a0', accent: brass });
    m.label(theme, backdrop - side * .257, y + 2.73, z, 1.92, .27, yaw,
      { background: paper, color: '#503629', border: false });
    for (const dx of [-1.2, 1.2]) {
      m.box(brass, backdrop - side * .17, y + 3.51, z + dx, .12, .119, .10);
      m.box(maple, backdrop - side * .20, y + .65, z + dx, .13, .94, .098);
    }
    m.box(timber, backdrop - side * .22, y + 3.66, z, .49, .16, 2.68);
    m.box(lamp, backdrop - side * .34, y + 3.55, z, .105, .027, 2.22, 0, true);
    addMonthExhibit(m, { month, x, z });
  }
  monthStops.forEach(display);

  for (const side of [-1, 1]) {
    m.box(brass, side * 9.26, y + .009, -1.16, .067, .019, 21.26);
    m.box('#9c6b4a', side * 9.5, y + .009, -1.16, .032, .021, 21.26);
    for (const { x, z } of monthStops.filter(p => Math.sign(p.x) === side)) {
      m.box(brass, side * 9.80, y + .012, z, 1.05, .024, .085);
      m.box(brassBright, side * 9.26, y + .026, z, .31, .036, .31, Math.PI / 4);
    }
    m.box(timber, side * 9.52, 3.33, 9.65, 3.48, .63, .18);
    m.box(brass, side * 9.52, 3.35, 9.75, 3.30, .46, .042);
    m.label(side === -1 ? '一月 — 六月' : '七月 — 十二月', side * 9.52, 3.34, 9.79, 3.29, .48, 0,
      { background: timber, color: '#ffdfa0', accent: brass });
    for (const dx of [-1.38, 1.38]) m.box(maple, side * 9.52 + dx, 4.18, 9.64, .07, 1.33, .07);
    for (const z of [-9, -2.4, 4.2, 10.35]) lantern(side * 7.1, z, 4.11, .56);
  }
  m.box(brass, 0, y + .009, -11.8, 18.56, .021, .056);
  for (const x of [-4.4, -2.2, 0, 2.2, 4.4]) {
    m.box(brass, x, y + .011, -11.8, .21, .023, .21, Math.PI / 4);
  }
  m.light(-7.4, 4.37, 3.85, '#ffce8a', 38, 16);
  m.light(7.4, 4.37, -6.9, '#ffbe85', 36, 15);

  const rx = 5.4, rz = 6.8;
  m.solid(timber, rx, y + .43, rz, 2.67, .86, 2.31);
  m.box(maple, rx, y + .106, rz, 2.87, .19, 2.48);
  m.box(brass, rx, y + .82, rz, 2.85, .081, 2.46);
  m.box(timber, rx, y + .89, rz, 2.67, .06, 2.32);
  m.box('#aa704d', rx, y + .42, rz + 1.164, 2.44, .46, .026);
  m.label('光阴藏珍', rx, y + .45, rz + 1.195, 1.63, .38, 0,
    { background: timber, color: '#ffdf9c', accent: brass });
  for (const dx of [-1.28, 1.28]) for (const dz of [-1.10, 1.10]) {
    m.box(brass, rx + dx, y + 2.02, rz + dz, .078, 2.22, .078);
  }
  for (const dz of [-1.10, 1.10]) m.box(brass, rx, y + 3.09, rz + dz, 2.64, .065, .067);
  for (const dx of [-1.28, 1.28]) m.box(brass, rx + dx, y + 3.09, rz, .065, .065, 2.21);
  glass([rx - 1.28, y + .94, rz + 1.10], [rx + 1.28, y + .94, rz + 1.10], [rx + 1.28, y + 3.09, rz + 1.10], [rx - 1.28, y + 3.09, rz + 1.10]);
  glass([rx + 1.28, y + .94, rz + 1.10], [rx + 1.28, y + .94, rz - 1.10], [rx + 1.28, y + 3.09, rz - 1.10], [rx + 1.28, y + 3.09, rz + 1.10]);
  m.box('#85443d', rx, y + .97, rz, 1.84, .095, 1.66);
  m.box('#615b4b', rx, y + 1.19, rz, 1.37, .4, 1.31);
  m.box('#aaa47c', rx, y + 1.43, rz, 1.05, .09, .90);
  m.box('#52736c', rx, y + 1.78, rz, .73, .61, .72, Math.PI / 4);
  m.box('#716a4f', rx, y + 2.10, rz, .95, .097, .93, Math.PI / 4);
  m.box(brass, rx, y + 2.47, rz, .37, .08, .32);
  for (const dx of [-.55, .55]) {
    m.box(brass, rx + dx, y + 1.82, rz, .085, .58, .49, 0);
    m.box(jade, rx + dx, y + 2.12, rz, .087, .117, .55, 0);
    m.box(lamp, rx + dx, y + 2.98, rz - 1.03, .09, .39, .09, 0, true);
  }

  const deskX = -5.42, deskZ = 6.79;
  m.solid(timber, deskX, y + .5, deskZ, 2.76, 1, .91);
  m.box(maple, deskX, y + .13, deskZ, 2.92, .18, 1.02);
  m.box(maple, deskX, y + .97, deskZ, 2.98, .12, 1.04);
  m.box(brass, deskX, y + .78, deskZ + .47, 2.40, .04, .05);
  for (const dx of [-.86, 0, .86]) {
    m.box(brass, deskX + dx, y + .44, deskZ + .47, .76, .46, .035);
    m.box(wall, deskX + dx, y + .44, deskZ + .493, .68, .38, .025);
    m.box(timber, deskX + dx, y + .44, deskZ + .506, .58, .29, .022);
  }
  m.label('参观接待', deskX, y + 1.26, deskZ + .26, 1.21, .31, 0,
    { background: timber, color: '#ffdfa6', accent: brass });
  for (const dx of [-.44, -.32, -.20]) {
    m.box(paper, deskX + dx, y + 1.055, deskZ + .13, .19, .019, .37, -.22);
  }
  m.box(archival, deskX + .59, y + 1.04, deskZ + .01, .46, .07, .57, .23);
  m.box(paper, deskX + .59, y + 1.084, deskZ + .01, .37, .029, .49, .23);
  m.box(brass, deskX - 1.04, y + 1.085, deskZ + .24, .24, .12, .24);
  m.box(brassBright, deskX - 1.04, y + 1.174, deskZ + .24, .09, .09, .09);
  lantern(deskX + 1.06, deskZ -.22, y + 1.42, .31);

  for (const x of [-4.22, 4.22]) {
    const z = 11.21;
    m.solid(timber, x, y + .26, z, .59, .52, .59);
    m.box(brass, x, y + .49, z, .67, .09, .67);
    m.box('#743b34', x, y + .62, z, .52, .22, .50);
    for (const [dx, dz, height] of [[-.29, -.12, .65], [-.14, .27, .48], [.24, -.19, .78], [.19, .15, .51]]) {
      const tip: [number, number, number] = [x + dx, y + .72 + height, z + dz];
      m.beam('#756049', [x, y + .68, z], tip, .037);
      m.box(red, tip[0], tip[1], tip[2], .14, .14, .14, Math.PI / 4);
      m.box('#d77074', tip[0] + .045, tip[1] - .085, tip[2] + .059, .117, .11, .106);
      m.box('#aa514d', tip[0] - .064, tip[1] - .14, tip[2] - .038, .104, .12, .112);
    }
  }

  addGalleryFurnishings(m, y);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(glassPoints, 3));
  const glassSurface = new Mesh(geometry, new MeshBasicMaterial({
    color: '#baded8', transparent: true, opacity: .115, side: DoubleSide, depthWrite: false, forceSinglePass: true,
  }));
  glassSurface.name = 'Monthly gallery display glazing';
  m.group.add(glassSurface);
}
