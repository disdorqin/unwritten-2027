import type { MuseumBuilder } from './museum-kit';

type Point = [number, number, number];
const rock = ['#6a7382', '#7b889a', '#8894a4', '#98a2ac'];
const snow = ['#c5d6ea', '#d4e2f0', '#e5edf6'];
const petals = ['#8d323c', '#a5424d', '#bd5662', '#cf6b76', '#d98790'];
const bark = ['#513935', '#654638', '#795641'];

export function addMuseumForecourt(m: MuseumBuilder) {
  const { box, beam, solid, label } = m;

  function stoneGeometry(x: number, z: number, scale: number, turn = 0) {
    for (let row = 0; row < 5; row++) {
      const w = [1.0, .93, .77, .60, .43][row];
      const y = .11 + .16 * row;
      const drift = (row - 2) * .058;
      box(rock[row % rock.length], x + Math.cos(turn) * drift * scale, y * scale,
        z + Math.sin(turn) * drift * scale, w * scale, .17 * scale, w * .78 * scale, turn);
    }
    const mantle: [number, number, number, number, number][] = [
      [-.13, .60, .09, .43, .40], [.15, .57, .11, .32, .36], [0, .88, .05, .42, .37],
      [-.19, .69, -.08, .30, .27], [.04, .75, -.19, .30, .21],
    ];
    for (const [dx, y, dz, w, d] of mantle) {
      const east = Math.cos(turn) * dx + Math.sin(turn) * dz;
      const south = -Math.sin(turn) * dx + Math.cos(turn) * dz;
      box(snow[Math.round(y * 6) % snow.length], x + east * scale, y * scale, z + south * scale,
        w * scale, .075 * scale, d * scale, turn);
    }
  }

  function winterTree(x: number, z: number, scale: number, turn: number) {
    const transform = (a: number, y: number, b: number): Point => [
      x + (Math.cos(turn) * a + Math.sin(turn) * b) * scale,
      y * scale,
      z + (-Math.sin(turn) * a + Math.cos(turn) * b) * scale,
    ];
    const trunk: Point[] = [[0, -.08, 0], [-.05, .8, .02], [.22, 1.52, -.08], [.29, 2.02, -.12]];
    let span = .31;
    for (let i = 1; i < trunk.length; i++) {
      beam(bark[i - 1], transform(...trunk[i - 1]), transform(...trunk[i]), span * scale);
      span *= .72;
    }
    const branches: [number, number, number, number, number][] = [
      [-1.38, 2.09, -.26, 1, .31], [-1.08, 2.38, .65, 2, .63], [.86, 2.69, .84, 2, .35],
      [1.46, 2.29, -.28, 2, .76], [.9, 2.68, -.95, 3, 1.11], [-.65, 2.73, -.85, 3, .44],
      [-.29, 3.13, .22, 3, .80],
    ];
    for (const [j, [a, y, b, root, phase]] of branches.entries()) {
      const bend: Point = [a * .56 + trunk[root][0] * .44, y - .49, b * .57 + trunk[root][2] * .43];
      beam(bark[0], transform(...trunk[root]), transform(...bend), .13 * scale);
      beam(bark[1], transform(...bend), transform(a, y, b), .066 * scale);
      for (let k = 0; k < 3; k++) {
        const angle = phase + k * 2.26;
        const tip: Point = [a + Math.cos(angle) * .48, y + k * .11, b + Math.sin(angle) * .51];
        beam(bark[2], transform(a * .88, y - .16, b * .87), transform(...tip), .037 * scale);
        for (let c = 0; c < 5; c++) {
          const theta = angle + c * 2.51;
          const spread = c === 0 ? .05 : .28 + .026 * c;
          const at = transform(tip[0] + Math.cos(theta) * spread, tip[1] + Math.sin(c * 1.7) * .14, tip[2] + Math.sin(theta) * spread);
          const size = (.17 + ((j * 3 + k + c * 2) % 5) * .028) * scale;
          box(petals[(j + c + k) % petals.length], ...at, size * 1.18, size * .71, size, turn + theta);
          if ((j + c * 4 + k) % 7 === 1) {
            box(snow[1], at[0], at[1] + size * .38, at[2], size * .86, size * .12, size * .61, turn + theta);
          }
        }
      }
    }
    m.collider(x, .55 * scale, z, .37 * scale, 1.18 * scale, .36 * scale);
    stoneGeometry(x + .55 * scale, z + .24 * scale, .67 * scale, turn);
    stoneGeometry(x - .71 * scale, z + .35 * scale, .52 * scale, turn + .6);
  }

  function pathLamp(x: number, z: number, size: number, accent: boolean) {
    const layer = (paint: string, y: number, w: number, h: number, d = w, emit = false) =>
      box(paint, x, y * size, z, w * size, h * size, d * size, 0, emit);
    layer(rock[0], .095, 1.10, .22);
    layer(rock[2], .25, .91, .13);
    layer(rock[1], .55, .56, .48);
    layer(rock[2], .81, .67, .13);
    layer(rock[0], 1.00, .57, .25);
    layer(rock[2], 1.15, .67, .12);
    layer(rock[1], 1.28, .79, .14);
    layer('#eea757', 1.53, .51, .43, .51, true);
    for (const east of [-1, 1]) {
      for (const south of [-1, 1]) {
        box('#533c3b', x + east * .252 * size, 1.54 * size, z + south * .252 * size,
          .062 * size, .51 * size, .064 * size);
      }
    }
    layer(rock[0], 1.82, .96, .103);
    layer(rock[2], 1.91, .79, .11);
    layer(rock[1], 2.02, .59, .11);
    layer(rock[0], 2.12, .32, .07);
    layer(snow[1], 2.17, .32, .048);
    if (accent) layer('#a97149', .59, .59, .06);
    m.collider(x, .55 * size, z, .84 * size, 1.14 * size, .84 * size);
  }

  function marker(x: number, z: number, title: string, detail: string, rotation: number) {
    solid(rock[0], x, .15, z, 2.11, .32, .91);
    box(rock[2], x, .35, z, 1.88, .14, .77);
    box('#5a4243', x, .94, z, 1.71, 1.14, .59);
    box('#906648', x, 1.50, z, 1.99, .16, .74);
    box(snow[1], x, 1.61, z, 1.66, .078, .57);
    const sign = { background: '#593e36', accent: '#c69a6c', color: '#ffe5bb' };
    label(title, x, 1.07, z + .311, 1.58, .54, rotation, sign);
    label(detail, x, .61, z + .313, 1.48, .30, rotation, { ...sign, border: false });
    m.collider(x, .81, z, 1.69, 1.1, .64);
  }

  function visitBoard(x: number, z: number) {
    const frame = '#644239', lacquer = '#8a4d3e', metal = '#bf9570';
    for (const side of [-1, 1]) {
      const leg = x + side * 1.21;
      box(rock[0], leg, .32, z, .48, .25, .63);
      box(rock[2], leg, .47, z, .42, .13, .54);
      box(frame, leg, 1.53, z, .16, 2.11, .18);
      for (const y of [.69, 2.28]) box(metal, leg, y, z + .10, .13, .09, .04);
    }
    box(frame, x, 1.51, z, 2.43, 1.56, .19);
    box(lacquer, x, 1.52, z + .10, 2.24, 1.40, .064);
    const ink = { background: '#52382e', color: '#ffe3ae', accent: '#bd8b59', border: false };
    label('参观导览', x, 2.06, z + .138, 1.97, .37, 0, ink);
    label('一楼 年度长廊', x, 1.57, z + .138, 1.97, .26, 0, ink);
    label('二楼 网络展 · 露台', x, 1.17, z + .138, 1.97, .26, 0, ink);
    for (const y of [1.81, 1.37]) box(metal, x, y, z + .138, 1.78, .018, .024);
    for (let tile = 0; tile < 11; tile++) {
      const at = x + (tile - 5) * .267;
      box(tile % 2 ? '#374453' : '#495467', at, 2.65, z, .267, .13, .89);
      if (tile % 4 !== 3) box(snow[tile % 3], at, 2.732, z - .084, .24, .041, .63);
    }
    box('#4d433b', x, 2.52, z, 2.98, .14, .72);
    m.collider(x, 1.39, z, 2.86, 2.40, .61);
  }

  function porchBench(x: number, z: number) {
    const iron = '#57464b', wood = '#8d5d49', edge = '#a57858';
    for (const side of [-1, 1]) {
      const leg = x + side * 1.08;
      box(rock[0], leg, .314, z, .31, .25, .74);
      box(iron, leg, .55, z, .15, .43, .45);
      box(wood, leg, 1.04, z - .27, .11, .69, .118);
      box(edge, leg, .94, z + .04, .14, .12, .64);
      box(iron, leg, .82, z + .27, .079, .24, .076);
    }
    for (const dz of [-.20, 0, .2]) {
      box(wood, x, .733, z + dz, 2.50, .106, .184);
      box(edge, x, .746, z + dz + .082, 2.50, .045, .029);
      for (const side of [-1, 1]) box('#c3956b', x + side * 1.07, .79, z + dz, .029, .015, .029);
    }
    box(wood, x, 1.24, z - .284, 2.49, .20, .103);
    box(edge, x, 1.11, z - .254, 2.4, .043, .045);
    for (const side of [-1, 1]) box(snow[0], x + side * 1.12, 1.352, z - .28, .20, .03, .078);
    m.collider(x, .71, z, 2.52, 1.12, .70);
  }

  function winterPlanter(x: number, z: number) {
    box('#624434', x, .47, z, 1.52, .49, .74);
    for (const south of [-1, 1]) {
      for (let plank = 0; plank < 7; plank++) {
        box(bark[plank % bark.length], x + (plank - 3) * .206, .49, z + south * .373, .191, .37, .052);
      }
      box('#927055', x, .701, z + south * .37, 1.60, .11, .13);
    }
    for (const side of [-1, 1]) box('#927055', x + side * .74, .701, z, .13, .11, .74);
    box(snow[1], x, .696, z, 1.33, .08, .60);
    for (const [i, at] of [-.49, -.21, .1, .43].entries()) {
      const tip: Point = [x + at + (i % 2 ? .08 : -.08), .91 + (i % 3) * .044, z + (i % 2 ? .17 : -.11)];
      beam(bark[0], [x + at, .71, z], tip, .034);
      box(petals[(i + 1) % petals.length], ...tip, .135, .098, .14, i * 1.3);
    }
    m.collider(x, .45, z, 1.56, .52, .79);
  }

  // Fixtures along the facade sit beyond the column bays, with both court approaches clear.
  visitBoard(12.62, 14.06);
  for (const side of [-1, 1]) {
    porchBench(15.64 * side, 14.5);
    winterPlanter(17.91 * side, 14.86);
  }

  // Stone edging and paving are kept away from the center approach and stair footprint.
  for (const direction of [-1, 1]) {
    for (let segment = 0; segment < 8; segment++) {
      const x = (7.8 + segment * 1.47) * direction;
      const z = 18.1 + Math.sin(segment * .5) * .16;
      box(rock[segment % rock.length], x, .21, z, 1.42, .40, .31);
      box(rock[(segment + 2) % rock.length], x, .42, z, 1.44, .09, .44);
      for (const drift of [-.45, .17, .42]) {
        if (Math.cos(segment * 1.8 + drift) > .65) continue;
        box(snow[(segment + 1) % snow.length], x + drift, .49, z + Math.sin(drift) * .13, .31, .055, .39);
      }
    }
    pathLamp(6.2 * direction, 17.85, .80, true);
    pathLamp(18.65 * direction, 17.85, .79, false);
    for (const drift of [[8.7, 15.86, 1.03, .4], [11.72, 17.1, 1.57, 1.4], [15.35, 17.53, 1.05, 3.21], [17.1, 15.2, 1.30, 0]]) {
      const [x, z, scale, rotation] = drift;
      stoneGeometry(x * direction, z, scale, rotation * direction);
    }
  }
  winterTree(-11.7, 16.52, 1.02, .91);
  winterTree(11.7, 16.48, 1.14, 2.04);
  winterTree(24.30, 6.74, 1.47, 3.54);
  winterTree(-24.9, -12.7, 1.30, 2.71);
  winterTree(24.4, -12.45, 1.27, 0.88);
  pathLamp(22.9, 16.4, .91, true);
  pathLamp(23.4, -.9, .75, false);
  pathLamp(-27.1, 7.3, .79, false);
  marker(7.06, 15.6, '参观路线', '一楼 年度展', 0);
  marker(-7.11, 15.6, '参观路线', '二楼 网络记忆', 0);
  for (const [x, z, size, turn] of [[26.8, 12.2, 1.57, .5], [24.95, 13.5, 1.12, .2], [25.1, -.7, 1.24, .6],
    [25.8, -10.4, 1.76, 2.3], [-26.5, -.7, 1.08, 1.3], [-25.2, -8.1, 1.16, 1.6], [-27.1, 14.6, 1.038, 0.3]]) {
    stoneGeometry(x, z, size, turn);
  }
}
