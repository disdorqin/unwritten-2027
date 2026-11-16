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
