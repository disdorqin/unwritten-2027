import { createMuseumBuilder } from './museum-kit';
import { museumHorizontalScale } from './museum-scale';
import { stationSignCopy, TOWN_STATION_NAME } from './station-sign-copy';
import { railHallGuide } from './town-rail-copy';
import { createChronicleFace, stationChronicleStone } from './town-chronicle-landmarks';

type Point = readonly [number, number, number];

const brick = '#794435';
const brickHighlights = ['#895142', '#965747', '#713c35'];
const stone = '#a09987';
const roof = '#36444d';
const wood = '#654331';
const dark = '#3d2a26';
const iron = '#303b40';
const brass = '#c19456';
const snow = '#dce7f0';
const glow = '#eaa852';

const stationLocalPoint = ([x, y, z]: Point): Point => [x / museumHorizontalScale, y, z / museumHorizontalScale];
export const railwayStationStops = {
  ticketCounter: stationLocalPoint([-12.7, .14, -.14]),
  timetable: stationLocalPoint([12.8, .14, -4.7]),
  guide: stationLocalPoint([-18.6, .14, 2.1]),
};

function stationBuilder() {
  const builder = createMuseumBuilder({ mergeLabelSizes: true });
  const u = 1 / museumHorizontalScale;
  const local = stationLocalPoint;
  return {
    box: (paint: string, x: number, y: number, z: number, w: number, h: number, d: number, emissive = false) =>
      builder.box(paint, x * u, y, z * u, w * u, h, d * u, 0, emissive),
    solid: (paint: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
      builder.solid(paint, x * u, y, z * u, w * u, h, d * u),
    floor: (x: number, y: number, z: number, w: number, d: number) =>
      builder.floor(x * u, y, z * u, w * u, d * u),
    beam: (paint: string, a: Point, b: Point, size: number) =>
      builder.beam(paint, local(a), local(b), size),
    panel: (paint: string, a: Point, b: Point, c: Point, d: Point) =>
      builder.panel(paint, local(a), local(b), local(c), local(d)),
    sign: (title: string, x: number, y: number, z: number, w: number, h: number, angle = 0, background = '#292f32') =>
      builder.label(title, x * u, y, z * u, w * u, h, angle, { background, color: '#fff', accent: '#d6ae6a' }),
    chronicleFace: (x: number, y: number, z: number, w: number, h: number) =>
      builder.chronicleFace(createChronicleFace('station'), x * u, y, z * u, w * u, h),
    finish: builder.finish,
  };
}

type StationBuilder = ReturnType<typeof stationBuilder>;

function walkSurface(b: StationBuilder, paint: string, x: number, top: number, z: number, w: number, d: number) {
  b.box(paint, x, top - .18, z, w, .36, d);
  b.floor(x, top, z, w, d);
}

function lamp(b: StationBuilder, x: number, y: number, z: number) {
  b.box(dark, x, y - .4, z, .58, .12, .58);
  b.box(glow, x, y - .11, z, .39, .51, .39, true);
  b.box(dark, x, y + .2, z, .56, .17, .56);
  b.box(brass, x, y + .35, z, .12, .2, .12);
  for (const dx of [-.21, .21]) for (const dz of [-.21, .21]) {
    b.box(iron, x + dx, y - .11, z + dz, .045, .53, .045);
  }
}

function bench(b: StationBuilder, x: number, z: number, y: number, width: number, facing: 1 | -1) {
  b.solid(wood, x, y + .51, z, width, .18, .76);
  b.solid(dark, x, y + .85, z - facing * .35, width, .11, .14);
  b.box(wood, x, y + 1.13, z - facing * .35, width, .17, .14);
  for (const dx of [-.39, .39]) {
    b.box(iron, x + width * dx, y + .28, z, .19, .46, .54);
    b.box(iron, x + width * dx, y + .69, z - facing * .16, .15, .09, .71);
    b.box(iron, x + width * dx, y + .83, z - facing * .35, .15, .76, .14);
  }
}

function pier(b: StationBuilder, x: number, z: number, base: number, top: number, size: number) {
  b.solid(brick, x, (base + top) / 2, z, size, top - base, size);
  b.box(stone, x, base + .2, z, size + .24, .36, size + .24);
  b.box(stone, x, top - .16, z, size + .23, .28, size + .23);
}

function archedWindow(b: StationBuilder, x: number, y: number, z: number, width: number, height: number) {
  b.box(dark, x, y, z, width + .4, height + .32, .14);
  b.box(glow, x, y, z + .013, width, height, .16, true);
  b.box(glow, x, y + height / 2 + .21, z + .013, width * .78, .45, .16, true);
  b.box(glow, x, y + height / 2 + .51, z + .013, width * .48, .19, .16, true);
  b.box(wood, x, y + .23, z + .04, .1, height + .67, .29);
  b.box(wood, x, y - .22, z + .04, width, .09, .29);
  b.box(stone, x, y - height / 2 - .13, z, width + .65, .17, .48);
  for (const side of [-1, 1]) {
    b.box(stone, x + side * width * .52, y + height / 2 + .15, z, .26, .39, .37);
    b.box(stone, x + side * width * .41, y + height / 2 + .47, z, .29, .27, .37);
    b.box(stone, x + side * width * .27, y + height / 2 + .65, z, .22, .23, .37);
  }
  b.box(brass, x, y + height / 2 + .72, z, .31, .3, .44);
}

function stationWall(b: StationBuilder, from: number, to: number, z: number, h: number) {
  const x = (from + to) / 2;
  const width = to - from;
  b.solid(brick, x, h / 2, z, width, h, .54);
  for (const side of [-1, 1]) {
    b.box(stone, x, .56, z + side * .25, width, .51, .2);
    b.box(stone, x, h - .35, z + side * .27, width, .25, .31);
    for (let row = 0; row < 13; row++) {
      for (let column = 0; column < Math.ceil(width / 1.18); column++) {
        const brickX = from + .51 + column * 1.18 + row % 2 * .58;
        if (brickX > to - .46 || (column + row * 5) % 4 === 0) continue;
        b.box(brickHighlights[(row + column) % brickHighlights.length], brickX, 1.0 + row * .42, z + side * .278, 1.08, .32, .05);
      }
    }
  }
}

function gableRoof(b: StationBuilder, x: number, z: number, width: number, depth: number, eave: number, rise: number) {
  const left = x - width / 2, right = x + width / 2;
  const north = z - depth / 2, south = z + depth / 2;
  const peak = eave + rise;
  for (const side of [-1, 1]) {
    const edge = side === 1 ? right : left;
    b.panel(roof, [x, peak, north], [edge, eave, north], [edge, eave, south], [x, peak, south]);
    const snowEdge = x + (edge - x) * .86;
    const snowY = peak - rise * .86 + .075;
    b.panel(snow, [x, peak + .075, north + .45], [snowEdge, snowY, north + .45],
      [snowEdge, snowY, south - .45], [x, peak + .075, south - .45]);
    for (let line = 1; line <= 8; line++) {
      const t = line / 9, xRib = x + (edge - x) * t, y = peak - (rise * t);
      b.box('#46545c', xRib, y + .09, z, .065, .105, depth);
    }
    b.box(iron, edge, eave - .04, z, .22, .27, depth + .22);
  }
  for (const face of [north, south]) {
    b.beam(wood, [left, eave, face], [x, peak, face], .31);
    b.beam(wood, [x, peak, face], [right, eave, face], .31);
    b.panel(brick, [left, eave, face], [x, peak, face], [right, eave, face], [left, eave, face]);
  }
  b.box(iron, x, peak + .12, z, .24, .19, depth + .21);
}

export function buildRailwayStation() {
  const b = stationBuilder();
  // South approach reaches the original road at z=17. The concourse runs straight through to the rear portico.
  walkSurface(b, '#737878', 0, .14, 13.4, 52, 7.2);
  walkSurface(b, '#847f70', 0, .14, 1.25, 44, 17.1);
  walkSurface(b, '#766f62', 0, .14, -11.85, 53, 9.6);
  walkSurface(b, '#737878', -26.5, .14, -5.5, 5, 13.5);
  for (const x of [-24, -16, -8, 8, 16, 24]) {
    b.box('#979887', x, .156, 14.1, 7.7, .032, .08);
  }
  for (const z of [10.1, 12.7, 15.1]) {
    b.box('#979887', 0, .153, z, 51.7, .027, .09);
  }
  for (const face of [9.35, -7.05]) {
    stationWall(b, -22, -3.2, face, 7.3);
    stationWall(b, 3.2, 22, face, 7.3);
    b.solid(brick, 0, 5.85, face, 6.5, 2.9, .56);
    b.box(stone, 0, 4.42, face, 7.15, .25, .95);
    for (const x of [-19.9, -14.3, -8, 8, 14.3, 19.9]) {
      archedWindow(b, x, 3.49, face + .33, 2.44, 2.78);
      archedWindow(b, x, 3.49, face - .33, 2.44, 2.78);
    }
    for (const x of [-3.52, 3.52]) {
      b.box(stone, x, 2.3, face, .5, 4.36, 1.0);
      b.box(brass, x, 3.55, face + .66, .16, .59, .22);
      lamp(b, x, 3.78, face + .81);
    }
  }
  for (const x of [-22, 22]) {
    const side = Math.sign(x);
    b.solid(brick, x, 3.65, 1.15, .58, 7.3, 16.41);
    b.box(stone, x + side * .15, .61, 1.15, .39, .6, 16.7);
    b.box(stone, x + side * .21, 6.95, 1.15, .41, .23, 16.8);
    for (const z of [-4.7, -.8, 3.1, 7]) {
      b.box(dark, x + side * .33, 3.4, z, .12, 3.04, 1.84);
      b.box(glow, x + side * .41, 3.4, z, .11, 2.72, 1.56, true);
      b.box(wood, x + side * .5, 3.4, z, .18, 2.78, .11);
      b.box(wood, x + side * .5, 3.55, z, .18, .10, 1.56);
      b.box(stone, x + side * .4, 1.94, z, .44, .22, 2.05);
    }
  }

  for (const [x, w, y, rise] of [[-15.1, 15.1, 7.34, 3.6], [15.1, 15.1, 7.34, 3.6], [0, 15.2, 8.22, 4.9]]) {
    gableRoof(b, x, 1.15, w, 18.7, y, rise);
  }
  for (const z of [-7.08, 9.41]) b.box(brick, 0, 7.74, z, 14.9, .95, .61);
  b.sign(TOWN_STATION_NAME, 0, 6.45, 9.76, 10.8, 1.36);
  b.sign(stationSignCopy.englishName, 0, 7.74, 9.75, 11.4, .65);
  b.sign(stationSignCopy.townSubtitle, 0, 5.3, 9.76, 10.4, .72);
  b.sign(stationSignCopy.entrance, 5.05, 4.04, 9.676, 2.05, .58);
  b.sign(stationSignCopy.exit, 0, 5.32, -7.37, 10.1, 1.09, Math.PI);
  const clockZ = 10.58;
  b.box(dark, 0, 9.59, clockZ, 3.9, 2.77, .51);
  b.box(brass, 0, 9.59, clockZ + .28, 2.82, 2.26, .24);
  b.sign('◷', 0, 9.59, clockZ + .414, 2.22, 1.85, 0);

  // Open cold-weather canopy and lit benches leave a continuous north to west walkway.
  for (const x of [-23.7, -15, -7.5, 7.5, 15, 23.7]) pier(b, x, -15.3, .14, 5.7, .61);
  for (const [paint, y, width, depth] of [[iron, 5.69, 51.2, 8.6], [roof, 5.88, 51.4, 8.7], [snow, 6.02, 50.9, 8.05]] as const) {
    b.box(paint, 0, y, -11.8, width, .17, depth);
  }
  b.box(brass, 0, 5.6, -16.09, 51.4, .09, .15);
  b.box('#ebc163', 0, .15, -16.02, 51.4, .026, .16);
  for (const [x, text] of [[-11.25, stationSignCopy.platformSafety], [11.25, stationSignCopy.waiting]] as const) {
    b.box(dark, x, 2.82, -15.21, 7.68, .83, .43);
    b.sign(text, x, 2.82, -14.985, 7.34, .73);
  }
  for (const x of [-19, -11.3, 0, 11.3, 19]) lamp(b, x, 5.35, -13.4);
  for (const x of [-17, 17]) bench(b, x, -9.2, .14, 5.8, -1);

  // Ticket windows and waiting bays are placed at either side of the walk-through aisle.
  b.sign('售票  ·  TICKETS', -12.8, 3.72, -1.81, 7.1, .96);
  b.box(dark, 12.8, 3.8, -6.7, 8.7, 1.68, .18);
  b.sign(stationSignCopy.timetable, 12.8, 3.8, -6.59, 8.3, 1.36);
  const mirror = stationChronicleStone;
  b.solid(stone, mirror.x, .35, mirror.z, 4.13, .42, .62);
  b.solid(iron, mirror.x, 1.64, mirror.z, 3.85, 2.23, .28);
  b.box(brass, mirror.x, 2.795, mirror.z, 3.98, .09, .34);
  b.chronicleFace(mirror.x, 1.83, mirror.z + .152, 3.62, 1.26);
  b.box(dark, -21.62, 3.42, 2.1, .21, 2.88, 5.96);
  b.sign(railHallGuide.title, -21.5, 4.47, 2.1, 5.6, .56, Math.PI / 2);
  b.sign(railHallGuide.board, -21.5, 3.1, 2.1, 5.6, 2.02, Math.PI / 2);
  b.solid(brick, -12.7, .73, -2.14, 9.1, 1.18, 1.1);
  b.box(wood, -12.7, 1.39, -2.08, 9.35, .18, 1.35);
  for (const x of [-15.5, -12.7, -9.9]) {
    b.box(dark, x, 2.62, -2.52, 2.2, 2.15, .18);
    b.box(glow, x, 2.68, -2.41, 1.85, 1.61, .12, true);
    b.box(wood, x, 2.72, -2.27, .13, 1.69, .14);
  }
  for (const x of [-14, 13.5, 19]) {
    bench(b, x, 5.85, .14, 4.1, -1);
    lamp(b, x, 5.8, 4.35);
  }
  bench(b, 13.7, -2.8, .14, 5.6, 1);

  for (const x of [-23.6, -6.5, 6.5, 23.6]) {
    b.solid(iron, x, 1.8, 13.5, .21, 3.31, .21);
    b.box(stone, x, .28, 13.5, .57, .26, .57);
    lamp(b, x, 3.48, 13.5);
  }
  const station = b.finish(true);
  station.userData.stops = railwayStationStops;
  return station;
}

export function buildCoasterStation() {
  const b = stationBuilder();
  // Rail is centered at x=0. The west board point is x=-4.5, z=0.
  walkSurface(b, '#77776b', -7.8, .18, 0, 12.4, 42.4);
  walkSurface(b, '#85766a', 7.3, .18, 0, 10.6, 39.6);
  for (const midpoint of [-15.5, -7.5, 0, 7.5, 15.5]) {
    b.box('#ae955c', -1.73, .195, midpoint, .19, .027, 6.4);
    b.box('#ae955c', 2.13, .195, midpoint, .19, .027, 6.4);
  }
  walkSurface(b, '#746e62', -10.5, .09, 0, 7, 6.9);
  for (const z of [-19, -11.6, 11.6, 19]) {
    for (const x of [-12.4, 8.6]) {
      pier(b, x, z, .18, 5.35, .57);
      lamp(b, x + .58, 3.78, z);
    }
  }
  for (const z of [-19, 19]) {
    b.box(wood, -1.9, 5.39, z, 21.8, .31, .33);
    b.beam(wood, [-12.4, 4.86, z], [-9.4, 5.46, z], .24);
    b.beam(wood, [8.6, 4.86, z], [5.6, 5.46, z], .24);
  }
  for (const x of [-12.4, 8.6]) b.box(wood, x, 5.42, 0, .34, .34, 38.8);

  const left = -13.55, right = 9.7, spine = -1.85, lip = 5.55, crown = 7.85;
  for (const side of [-1, 1]) {
    const edge = side === -1 ? left : right;
    b.panel(roof, [spine, crown, -21], [edge, lip, -21], [edge, lip, 21], [spine, crown, 21]);
    const snowEdge = spine + (edge - spine) * .88;
    const snowY = crown + .065 - (crown - lip) * .88;
    b.panel(snow, [spine, crown + .065, -20.4], [snowEdge, snowY, -20.4], [snowEdge, snowY, 20.4], [spine, crown + .065, 20.4]);
    b.box(iron, edge, lip, 0, .25, .22, 42.2);
    for (const z of [-20.5, -13.8, -6.8, 0, 6.8, 13.8, 20.5]) {
      b.beam(wood, [edge, lip - .16, z], [spine, crown - .16, z], .24);
    }
  }
  b.box(iron, spine, crown + .045, 0, .28, .21, 42.2);
  for (const z of [-15, 15]) {
    b.solid(brick, -12.65, 1.5, z, .29, 2.61, 5.15);
    b.box(glow, -12.46, 2.04, z, .122, .79, 3.14, true);
    b.box(stone, -12.46, 1.61, z, .39, .13, 3.35);
    for (const dz of [-1.09, 0, 1.09]) b.box(wood, -12.35, 2.03, z + dz, .18, .83, .12);
    bench(b, -8.4, z, .18, 4.5, z < 0 ? 1 : -1);
    bench(b, 6.2, z, .18, 3.6, z < 0 ? 1 : -1);
  }
  for (const z of [-3.55, 3.55]) {
    pier(b, -12.25, z, .18, 4.77, .56);
    lamp(b, -12.95, 3.04, z);
  }
  b.box(wood, -12.25, 4.78, 0, .37, .33, 7.7);
  b.sign(stationSignCopy.coasterEntrance, -12.52, 4.19, 0, 6.48, 1.07, -Math.PI / 2, '#8f242b');
  b.sign('上车点  ·  环镇线', -4.55, 3.98, -4.64, 5.7, .88);
  for (const z of [-8.8, 8.8]) {
    b.solid(wood, -11.26, .49, z, 1.21, .67, 1.28);
    b.box(wood, -11.26, .85, z, 1.28, .12, 1.38);
  }
  return b.finish();
}
