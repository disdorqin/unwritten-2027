import { createMuseumBuilder, type MuseumBuilder } from './museum-kit';
import { addMuseumShell } from './museum-shell';
import { addMuseumTimeline } from './museum-timeline';
import { addMuseumNetwork } from './museum-network';
import { addMuseumTerrace } from './museum-terrace';
import { addMuseumTrim } from './museum-trim';
import { addMuseumForecourt } from './museum-forecourt';

const tiles = ['#88807c', '#958478', '#7b7473', '#a18c7c', '#867971', '#958985'];
const trim = '#674534';
const corridor = '#b28353';

function addFloors(m: MuseumBuilder) {
  function tiled(top: number, xmin: number, xmax: number, zmin: number, zmax: number) {
    m.box('#564e4d', (xmin + xmax) / 2, top - .14, (zmin + zmax) / 2, xmax - xmin, .26, zmax - zmin);
    m.floor((xmin + xmax) / 2, top, (zmin + zmax) / 2, xmax - xmin, zmax - zmin);
    for (let z = zmin, row = 0; z < zmax; z += 1.1, row++) {
      for (let x = xmin, col = 0; x < xmax; x += 1.5, col++) {
        const w = Math.min(1.5, xmax - x), d = Math.min(1.1, zmax - z);
        m.box(tiles[(row * 17 + col * 13 + row * col) % tiles.length], x + w / 2, top - .018, z + d / 2, w - .023, .036, d - .025);
      }
    }
  }
  tiled(.28, -20, 20, -14, 13.2);
  tiled(5.65, -20, 14.6, -14, 13.1);
  tiled(5.65, 14.6, 20, -14, -8.8);
  tiled(5.65, 14.6, 20, 8.8, 13.1);
  tiled(.11, -9, 9, 13.2, 18.6);
  for (const x of [-2.05, 2.05]) {
    m.box(corridor, x, .288, 1.8, .055, .017, 23.2);
    m.box('#783c39', x, 5.66, 1.8, .11, .022, 21.7);
  }
  m.box('#794546', 0, 5.66, 4.8, 3.3, .022, 12.4);
}

function addStairs(m: MuseumBuilder) {
  // The slope used for walking stays continuous under the individual tread meshes.
  function flight(cx: number, width: number, north: number, south: number, top: number, bottom: number, finish: string, exterior = false) {
    const count = Math.ceil((top - bottom) / .195);
    const depth = (south - north) / count;
    const edge = exterior ? '#b2beca' : '#be9b70';
    for (let i = 0; i < count; i++) {
      const z = north + (i + .5) * depth;
      const y = top - i * (top - bottom) / count;
      m.box(finish, cx, y - .13, z, width, .26, depth + .006);
      m.box(exterior ? '#687282' : '#765c50', cx, y - .105, z + depth / 2, width - .04, .19, .035);
      m.box(edge, cx, y + .002, z + depth * .375, width - .06, .012, .068);
      for (const side of [-1, 1]) {
        m.box(exterior ? '#8e9cab' : '#a1856e', cx + side * (width / 2 - .26), y + .005,
          z, .20, .016, depth * .87);
      }
    }
    m.ramps.push({ min: [cx - width / 2, bottom, north], max: [cx + width / 2, top, south], axis: 'z', ascending: -1 });
    for (const side of [-1, 1]) {
      const x = cx + side * (width / 2 - .12);
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const y = top - t * (top - bottom);
        const z = north + t * (south - north);
        m.box('#685654', x, y + .45, z, .18, .9, .22);
        m.box(exterior ? '#9caab8' : '#ac926e', x, y + .94, z, .27, .12, .27);
        for (const height of [.18, .66]) {
          m.box(exterior ? '#aeb9c5' : '#ad8156', x, y + height, z, .19, .045, .223);
        }
        if (i === 0 || i === 6) {
          m.box(exterior ? '#c7d6df' : '#d7a55f', x, y + 1.015, z, .21, .03, .21);
        }
      }
      m.beam(trim, [x, top + 1.0, north], [x, bottom + 1.0, south], .15);
      m.collider(x, bottom + (top - bottom) / 2 + .7, (north + south) / 2, .21, top - bottom + 1.5, south - north);
    }
  }
  flight(16.98, 4.55, -8.8, 8.55, 5.65, .28, '#8e7770');
  m.solid(trim, 14.53, 6.2, 0, .14, 1.1, 17.7);
  m.solid(trim, 16.94, 6.2, 8.78, 4.72, 1.1, .15);
  m.box('#8d7970', -24, 5.57, 10.23, 4, .16, .6);
  m.floor(-24, 5.65, 10.23, 4, .6);
  flight(-24, 4, 10.49, 18.62, 5.65, .03, '#7b787c', true);
  for (const z of [-9.02, 10.29]) {
    const x = z < 0 ? 16.98 : -24;
    for (let offset = -1.5; offset <= 1.5; offset += .2) {
      m.box(z < 0 ? '#a68258' : '#b1bac6', x + offset, 5.662, z, .11, .017, .16);
    }
  }
}

function addWayfinding(m: MuseumBuilder) {
  const brass = '#ad7e4f';
  const wood = '#4a2f28';
  function plaque(text: string, x: number, y: number, z: number, width: number, angle = 0) {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    m.box(brass, x, y, z, width + .13, .64, .115, angle);
    m.box(wood, x + dx * .07, y, z + dz * .07, width, .54, .047, angle);
    m.label(text, x + dx * .098, y, z + dz * .098, width - .09, .47, angle);
  }

  for (const x of [15.55, 18.41]) {
    m.box(wood, x, 4.33, 9.4, .076, 2.07, .076);
    m.box(brass, x, 3.31, 9.4, .12, .16, .105);
  }
  plaque('上二楼 · 网络记忆展', 16.98, 3.14, 9.4, 3.76);
  plaque('← 网络记忆展', 16.98, 8.23, -13.39, 3.24);
  plaque('钟楼观景露台', -19.74, 8.33, -4, 2.67, Math.PI / 2);
  m.box(wood, -27, 6.43, 9.67, .18, 1.56, .16);
  plaque('← 外梯回前庭', -27, 7.09, 9.62, 1.72, Math.PI);
}

export function buildMuseumLandmark() {
  const m = createMuseumBuilder();
  addFloors(m);
  addMuseumShell(m);
  addStairs(m);
  addMuseumTimeline(m);
  addMuseumNetwork(m);
  addMuseumTerrace(m);
  addMuseumTrim(m);
  addMuseumForecourt(m);
  addWayfinding(m);
  return m.finish();
}
