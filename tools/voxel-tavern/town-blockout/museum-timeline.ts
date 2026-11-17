import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import type { MuseumBuilder } from './museum-kit';

export const monthStops = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  x: i < 6 ? -10.18 : 10.18,
  z: i < 6 ? 7.55 - i * 3.5 : -9.95 + (i - 6) * 3.5,
}));

const timber = '#492d27';
const maple = '#956041';
const dark = '#211a22';
const brass = '#bc8c52';
const brassBright = '#e2bd78';
const paper = '#d9be90';
const wall = '#866447';
const lamp = '#ffe3aa';
const red = '#a23c37';
const jade = '#4a807c';
const archival = '#7c5762';
const blue = '#6582a0';

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

type ArtBox = (lateral: number, y: number, along: number, width: number, height: number, depth: number, paint: string, emit?: boolean) => void;

const modelLabels: Record<number, string> = {
  1: '哈尔滨冰灯 · 示意模型',
  4: '探月飞行 · 示意模型',
  8: '贵州村超 · 球场模型',
};

function buildObject(month: number, box: ArtBox) {
  const y = 1.18;
  switch (month) {
    case 1: {
      const ice = '#89cddc';
      const frost = '#c9f3fa';
      const iceShadow = '#377a9d';
      box(0, y + .048, 0, .98, .096, 1.76, iceShadow);
      box(.013, y + .103, 0, .90, .026, 1.66, frost);
      // Steps meet the gate without intersecting the glass wall of the case.
      for (let step = 0; step < 3; step++) {
        box(.36 - step * .068, y + .122 + step * .025, 0, .09, .035 + step * .05, .34, ice);
      }
      for (const wing of [-1, 1]) {
        box(-.16, y + .234, wing * .25, .43, .26, .24, ice);
        box(.061, y + .245, wing * .248, .026, .12, .082, '#a4caff', true);
        box(-.17, y + .377, wing * .27, .47, .044, .30, frost);
        box(-.16, y + .297, wing * .58, .40, .37, .299, ice);
        box(.046, y + .305, wing * .58, .026, .13, .076, '#f9b7e2', true);
        for (let tier = 0; tier < 3; tier++) {
          box(-.16, y + .502 + tier * .055, wing * .58,
            .43 - tier * .11, .055, .34 - tier * .086, tier % 2 ? ice : frost);
        }
      }
      box(-.18, y + .41, 0, .44, .12, .59, ice);
      for (let tier = 0; tier < 4; tier++) {
        box(-.18, y + .49 + tier * .061, 0, .48 - tier * .09, .061,
          .60 - tier * .123, tier % 2 ? ice : frost);
      }
      box(-.18, y + .73, 0, .08, .074, .08, '#c1d7ff', true);
      for (const edge of [-.61, -.38, .38, .61]) {
        box(.35, y + .166, edge, .095, .098, .092, ice);
        box(.35, y + .23, edge, .071, .038, .071, '#bff3ff', true);
      }
      break;
    }
    case 2:
      box(0, y + .08, 0, .66, .16, 1.54, blue);
      for (const along of [-.5, .47]) {
        box(.05, y + .22, along, .52, .16, .15, '#a73743');
        box(.07, y + .105, along, .59, .05, .069, '#e8f0e8');
        box(-.09, y + .38, along, .25, .21, .20, '#c3bdbc');
        box(-.1, y + .52, along, .19, .16, .19, paper);
      }
      box(.2, y + .18, -.028, .33, .055, .51, '#b1d1da');
      break;
    case 3:
      for (let layer = 0; layer < 6; layer++) {
        box(-.04 + layer * .027, y + .028 + layer * .046, -.31, .54, .035, .80, layer % 2 ? paper : '#c4a679');
      }
      box(.18, y + .295, -.31, .32, .015, .04, archival);
      box(.15, y + .30, -.16, .34, .014, .04, archival);
      box(-.02, y + .11, .47, .38, .22, .27, '#563934');
      box(.05, y + .24, .48, .26, .11, .19, '#b15d49');
      break;
    case 4: {
      const hull = '#e3e6da';
      const navy = '#20304a';
      const moon = '#a8aaa3';
      box(0, y + .043, 0, 1.00, .086, 1.75, navy);
      box(-.04, y + .20, -.43, .06, .24, .06, brass);
      box(-.04, y + .39, -.43, .29, .23, .31, hull);
      box(.105, y + .40, -.43, .052, .164, .232, '#dfaa6e');
      box(.15, y + .405, -.43, .043, .13, .178, '#596b81');
      box(-.216, y + .39, -.43, .069, .163, .213, '#777871');
      for (const wing of [-1, 1]) {
        for (let section = 0; section < 3; section++) {
          const along = -.43 + wing * (.187 + section * .070);
          box(-.021, y + .393, along, .21, .037, .064, '#335689');
          box(.073, y + .415, along, .014, .009, .045, '#85aae8', true);
        }
      }
      box(-.107, y + .541, -.49, .053, .11, .048, brassBright);
      box(-.095, y + .619, -.49, .14, .049, .145, hull);

      // Stepped courses give the Moon a hand-built profile. The recesses are stylized craters.
      box(-.02, y + .164, .438, .38, .11, .38, moon);
      box(-.02, y + .258, .438, .52, .11, .51, moon);
      box(-.02, y + .368, .438, .62, .116, .62, '#c6c5b9');
      box(-.02, y + .477, .438, .52, .11, .53, moon);
      box(-.02, y + .558, .438, .37, .06, .38, '#d5d2be');
      for (const [lateral, height, along, crater] of [[.298, .36, .26, .126], [.292, .383, .54, .16], [.233, .472, .54, .079], [.22, .264, .42, .075]]) {
        box(lateral, y + height, along, .014, crater * .81, crater, '#777a7d');
        box(lateral + .009, y + height - .028, along, .016, .016, crater * .64, '#dad8c6');
      }
      break;
    }
    case 5:
      box(0, y + .07, 0, .71, .14, 1.55, '#506252');
      for (const a of [-.26, .26]) {
        box(a, y + .15, 0, .032, .031, 1.51, '#aeaf9c');
      }
      for (const a of [-.7, -.47, -.25, 0, .25, .47, .7]) {
        box(0, y + .145, a, .56, .025, .063, timber);
      }
      for (const c of [-.38, .35]) {
        box(0, y + .31, c, .40, .25, .65, '#b0c0b9');
        box(0, y + .445, c, .42, .041, .585, '#e3d2a8');
        box(.205, y + .33, c, .028, .105, .49, '#486a79');
        box(.217, y + .245, c, .011, .029, .52, red);
      }
      break;
    case 6:
      box(0, y + .085, 0, .75, .17, 1.53, '#5b7b52');
      for (const a of [-.66, .00, .66]) box(0, y + .172, a, .64, .009, .035, '#d4d1b7');
      for (const a of [-.31, .31]) box(a, y + .172, 0, .029, .012, 1.32, '#d4d1b7');
      for (const a of [-.57, .57]) {
        box(-.13, y + .265, a, .046, .18, .035, paper);
        box(.13, y + .265, a, .046, .18, .035, paper);
        box(0, y + .34, a, .30, .035, .042, paper);
      }
      box(.04, y + .24, .08, .13, .13, .13, '#ecdebb');
      break;
    case 7:
      box(0, y + .12, 0, .74, .24, 1.54, '#583735');
      box(-.21, y + .43, 0, .14, .49, 1.45, '#742d3d');
      box(-.13, y + .69, 0, .46, .12, 1.44, brass);
      for (const a of [-.61, -.48, .48, .61]) box(.096, y + .43, a, .13, .49, .13, red);
      box(.16, y + .28, -.22, .13, .15, .14, paper);
      box(.16, y + .38, -.22, .105, .10, .10, brass);
      box(.16, y + .28, .25, .14, .15, .14, blue);
      box(.16, y + .38, .25, .105, .10, .10, brass);
      break;
    case 8: {
      const grass = '#668b45';
      const darkGrass = '#52703f';
      const line = '#e6efd5';
      box(0, y + .041, 0, 1.08, .082, 1.77, '#58594a');
      for (let strip = 0; strip < 6; strip++) {
        box(.058, y + .096, -.67 + strip * .266, .88, .048, .265, strip % 2 ? grass : darkGrass);
      }
      for (const border of [-.315, .429]) box(border, y + .125, 0, .018, .008, 1.44, line);
      for (const border of [-.72, 0, .72]) box(.057, y + .126, border, .754, .009, .018, line);
      for (const [sx, sz] of [[.115, .048], [.078, .097], [.03, .125]]) {
        for (const side of [-1, 1]) box(.057 + sx * side, y + .128, sz, .024, .01, .028, line);
        for (const side of [-1, 1]) box(.057 + sx * side, y + .128, -sz, .024, .01, .028, line);
      }
      for (const end of [-.737, .737]) {
        for (const post of [-.096, .21]) box(post, y + .16, end, .023, .076, .022, line);
        box(.057, y + .203, end, .32, .024, .022, line);
      }
      for (let tier = 0; tier < 3; tier++) {
        box(-.413 - tier * .035, y + .144 + tier * .064, -.12, .066, .072, 1.14, '#ac9767');
        for (let seat = 0; seat < 8; seat++) {
          box(-.413 - tier * .034, y + .181 + tier * .064, -.61 + seat * .139,
            .048, .022, .079, (seat + tier) % 3 ? red : '#efc778');
        }
      }
      box(.069, y + .148, 0, .033, .033, .033, '#fcf9ed');
      break;
    }
    case 9:
      for (let i = 0; i < 5; i++) {
        box(.03 + i * .026, y + .041 + i * .075, -.39 + .035 * i, .52, .067, .62,
          [red, jade, '#b18455', archival, '#63765f'][i]);
        box(.32 + i * .026, y + .04 + i * .075, -.39 + .035 * i, .03, .043, .42, paper);
      }
      for (let i = 0; i < 4; i++) {
        box(-.08, y + .21, .26 + i * .095, .36, .40, .076, [blue, red, maple, jade][i]);
        box(.114, y + .26, .26 + i * .095, .027, .035, .050, brass);
      }
      break;
    case 10:
      box(0, y + .08, 0, .69, .16, 1.39, maple);
      box(-.02, y + .34, 0, .53, .38, .91, dark);
      box(.28, y + .37, .19, .12, .19, .27, brass);
      box(.35, y + .37, .19, .035, .13, .19, '#aec6d2', true);
      for (const a of [-.29, .29]) {
        box(-.03, y + .579, a, .21, .25, .27, '#697176');
        box(.081, y + .581, a, .022, .069, .069, '#d4b98b');
      }
      break;
    case 11:
      box(0, y + .059, 0, .66, .11, 1.33, '#98754f');
      box(-.125, y + .29, -.31, .24, .47, .57, '#89877b');
      box(.004, y + .31, -.31, .03, .34, .45, '#51665c', true);
      box(.172, y + .13, -.25, .23, .058, .50, '#b9ab83');
      for (let i = 0; i < 4; i++) box(.253, y + .165, -.43 + i * .12, .055, .013, .036, dark);
      box(.034, y + .195, .39, .32, .22, .30, dark);
      for (const a of [.29, .39, .49]) box(.201, y + .22, a, .016, .037, .037, lamp, true);
      break;
    case 12:
      box(0, y + .08, 0, .65, .16, 1.44, red);
      box(0, y + .18, 0, .42, .07, .89, brass);
      box(0, y + .40, 0, .47, .39, .82, maple);
      box(0, y + .63, 0, .54, .086, .91, brass);
      box(.244, y + .43, 0, .021, .16, .21, brassBright);
      box(.268, y + .43, 0, .033, .073, .07, red);
      break;
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
    const cabinet = side * 12.19;
    const [theme, illustrated, accent] = monthTheme[month - 1];
    const across = (local: number) => cabinet - side * local;

    m.solid(timber, cabinet, y + .4, z, 1.44, .8, 2.28);
    m.box(maple, cabinet, y + .11, z, 1.57, .19, 2.41);
    m.box(wall, across(.726), y + .39, z, .048, .46, 2.08);
    m.box(brass, across(.77), y + .39, z, .02, .35, 1.99);
    m.box(timber, across(.788), y + .39, z, .017, .28, 1.9);
    const modelLabel = modelLabels[month];
    if (modelLabel) {
      m.label(modelLabel, across(.802), y + .39, z, 1.86, .25, yaw,
        { background: timber, color: '#ffe1a0', accent: brass });
    }
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
    buildObject(month, (lateral, heightBase, along, width, height, depth, paint, emit = false) =>
      m.box(paint, across(lateral), heightBase, z + along, width, height, depth, 0, emit));
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

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(glassPoints, 3));
  const glassSurface = new Mesh(geometry, new MeshBasicMaterial({
    color: '#baded8', transparent: true, opacity: .115, side: DoubleSide, depthWrite: false, forceSinglePass: true,
  }));
  glassSurface.name = 'Monthly gallery display glazing';
  m.group.add(glassSurface);
}
