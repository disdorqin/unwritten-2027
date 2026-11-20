import type { MuseumBuilder } from './museum-kit';

// ZA-06 / JX-30 four-zone exhibition (zones 1-2 in this module step).
// Builder coordinates: x/z are pre-scale (x1.125 in finish), y is metres.
// The museum door is on the SOUTH side (builder z +13); circulation spines
// (centre line x=0 and the z=10.2 stair approach) stay clear by design.
// Exhibit text policy: structure and format only — description/date lines
// stay blank pending review; zone titles come from the design document.

export const MUSEUM_MINE_TUNNEL = { x: -18.3, from: 8, to: -11 } as const;
export const MUSEUM_SPECIMEN_COUNT = 8;
export const MUSEUM_PAGE_SLOTS = 12;

const FLOOR = .28;
const ROCK = ['#4a3826', '#5d4630', '#3e2f20', '#54402a'];
const TIMBER = '#6e5136';
const IRON = '#4c606b';

function zoneOne(m: MuseumBuilder) {
  // The meteorite hangs over the centre spine (no collider); the sand
  // table and plinths flank the spine west and east so the hall's main
  // circulation stays open.
  const cz = 7.1;
  m.box('#3a3f46', 0, 4.35, cz, 1.05, .8, .9, .4);
  m.box('#2c3648', -.55, 4.15, cz + .3, .62, .55, .6, .9);
  m.box('#454a52', .5, 4.55, cz - .25, .55, .5, .5, .2);
  m.box('#7fd4c8', -.2, 4.42, cz + .42, .16, .12, .06, 0, true);
  m.box('#7fd4c8', .38, 4.2, cz - .44, .12, .1, .05, 0, true);
  m.box('#7fd4c8', .05, 4.68, cz + .1, .1, .08, .05, 0, true);
  for (const dx of [-.45, .45]) m.box(IRON, dx, 5.35, cz, .05, 1.3, .05);
  m.light(0, 3.4, cz, '#ffe9c4', 60, 13);

  // Founding settlement sand table, west of the spine.
  const cx = -5.5;
  m.solid('#5d4630', cx, FLOOR + .33, cz, 3.6, .66, 2.4);
  m.box('#8a8378', cx, FLOOR + .69, cz, 3.8, .06, 2.6);
  m.box('#a98a56', cx, FLOOR + .76, cz, 2.2, .05, 1.3);
  const houses: [number, number, string][] = [
    [-1.2, -.6, '#8a4a34'], [-.4, -.75, '#44503c'], [.5, -.65, '#8a4a34'], [1.25, -.5, '#5d4630'],
    [-1.3, .55, '#44503c'], [.9, .7, '#8a4a34'], [1.45, .45, '#44503c'],
  ];
  for (const [hx, hz, roof] of houses) {
    m.box('#e8ecf0', cx + hx, FLOOR + .86, cz + hz, .34, .16, .3);
    m.box(roof, cx + hx, FLOOR + .97, cz + hz, .4, .07, .36);
  }
  m.box('#8a8378', cx - .1, FLOOR + 1.0, cz - .95, .16, .5, .16);
  m.box('#b88655', cx - .1, FLOOR + 1.28, cz - .95, .2, .06, .2);
  m.label('建镇聚落 · 沙盘', cx, FLOOR + .45, cz + 1.32, 1.5, .26, 0);

  // Five founding-object plinths: three west around the table, two east
  // mirroring across the spine; descriptions stay blank pending review.
  const plinths: [number, number, string, string][] = [
    [cx - 2.7, cz - 1.9, '#8a4a34', 'pot'], [cx - 2.7, cz + 1.9, '#e08a3c', 'lamp'],
    [cx + 2.7, cz + 1.9, '#44503c', 'cloth'], [4.6, cz - 1.5, '#765044', 'books'],
    [4.6, cz + 1.5, IRON, 'tool'],
  ];
  for (const [px, pz, tint, kind] of plinths) {
    m.solid('#6b5a49', px, FLOOR + .4, pz, .58, .8, .58);
    if (kind === 'pot') m.box(tint, px, FLOOR + .95, pz, .3, .3, .3, .3);
    else if (kind === 'lamp') { m.box(IRON, px, FLOOR + .88, pz, .1, .16, .1); m.box(tint, px, FLOOR + 1.0, pz, .16, .1, .16, 0, true); }
    else if (kind === 'cloth') m.box(tint, px, FLOOR + .9, pz, .42, .18, .36, .2);
    else if (kind === 'books') { m.box(tint, px, FLOOR + .88, pz, .34, .14, .26); m.box('#b88655', px + .03, FLOOR + 1.0, pz, .3, .1, .22, .15); }
    else { m.box('#8a6f4d', px, FLOOR + .92, pz, .07, .3, .07, .5); m.box(tint, px, FLOOR + 1.06, pz, .2, .08, .1); }
    m.label('', px, FLOOR + .52, pz + .31, .5, .2, 0);
  }
  m.label('第一区 · 开镇', 0, 2.3, cz + 3.4, 2.7, .52, 0);
}

function zoneTwo(m: MuseumBuilder) {
  const { x, from, to } = MUSEUM_MINE_TUNNEL;
  const mid = (from + to) / 2, len = from - to;
  // Rock walls along the west side: solid core plus proud segment faces.
  for (const wx of [x - 1.6, x + 1.6]) {
    m.solid('#42301f', wx, FLOOR + 1.35, mid, .35, 2.7, len + .8);
    for (let z = to - .2; z < from; z += 2.2) {
      m.box(ROCK[Math.abs(Math.round(z * 10)) % ROCK.length], wx + (wx < x ? .19 : -.19), FLOOR + 1.35, z + 1.1, .05, 2.55, 2.05, (z % 3) * .01);
    }
  }
  // Timber sets and roof planks.
  for (let z = from - .6; z > to; z -= 2.75) {
    for (const px of [x - .82, x + .82]) m.solid(TIMBER, px, FLOOR + 1.3, z, .18, 2.6, .18);
    m.box(TIMBER, x, FLOOR + 2.68, z, 1.85, .16, .2);
  }
  for (let z = to; z < from; z += 1.1) m.box('#59483e', x, FLOOR + 2.86, z + .55, 2.3, .07, 1.0);
  // Rails, sleepers and one mine cart.
  for (const rx of [x - .38, x + .38]) m.box('#6b6f75', rx, FLOOR + .045, mid, .07, .05, len - 1.2);
  for (let z = to + .8; z < from - .5; z += 1.35) m.box('#4c3a28', x, FLOOR + .02, z, 1.05, .03, .5);
  const cartZ = -2.2, cartX = x - .6;
  m.solid('#6e5136', cartX, FLOOR + .48, cartZ, .85, .62, 1.5);
  m.box('#59402a', cartX, FLOOR + .82, cartZ, .91, .1, 1.56);
  for (const [wx, wz] of [[-.3, -.55], [.3, -.55], [-.3, .55], [.3, .55]] as const)
    m.box('#2e2a26', cartX + wx, FLOOR + .17, cartZ + wz, .09, .3, .3);
  m.box('#8a8378', cartX, FLOOR + .95, cartZ - .25, .4, .18, .42, .4);
  m.box('#7a6a52', cartX + .15, FLOOR + .93, cartZ + .28, .3, .14, .34, .9);
  m.box('#7fd4c8', cartX - .18, FLOOR + .97, cartZ + .05, .1, .08, .12, 0, true);
  // Eight specimens on the west wall; name plates blank pending review.
  const specimens = ['#7fd4c8', '#c8ccd2', '#8a6f4d', '#6f7d72', '#9a8a70', '#5d6a7a', '#b0a58e', '#7a5a40'];
  specimens.forEach((tint, i) => {
    const sz = 5.5 - i * 1.57;
    m.box('#5d4630', x - 1.32, FLOOR + .78, sz, .3, .08, .8);
    m.box(tint, x - 1.32, FLOOR + .95, sz, .26, .3, .4, i * .35, i === 0);
    m.label('', x - 1.14, FLOOR + .5, sz, .8, .28, Math.PI / 2);
  });
  // Shift board at the south entry; warm lamp pools along the run.
  m.box('#59483e', x - 1.35, FLOOR + 1.75, from - 1.15, .06, .8, 1.15);
  m.label('班次牌', x - 1.3, FLOOR + 1.75, from - 1.15, 1.0, .34, Math.PI / 2);
  for (const lz of [4, -2, -8]) m.light(x, FLOOR + 2.1, lz, '#f7c69c', 30, 8.5);
  m.label('第二区 · 矿工岁月', x, 2.2, from + .55, 3.0, .52, 0);
}

function thresholds(m: MuseumBuilder) {
  // Portal frame at the tunnel's south mouth, seated on the wall lines.
  const { x, from } = MUSEUM_MINE_TUNNEL;
  for (const px of [x - .82, x + .82]) m.box(TIMBER, px, FLOOR + 1.3, from + .1, .24, 2.6, .24);
  m.box(TIMBER, x, FLOOR + 2.68, from + .1, 1.9, .16, .24);
}

function zoneThree(m: MuseumBuilder) {
  // Restored cordon across the north band; the scene is viewable but the
  // fence line itself cannot be crossed. Darkest zone: no lights added.
  const fenceZ = -9.6;
  m.solid('#6e5136', -4.2, FLOOR + .52, fenceZ, 4.4, 1.05, .12);
  for (let x = -6.3; x <= -2.1; x += 1.05) m.box('#59402a', x, FLOOR + .58, fenceZ, .12, 1.16, .12);
  for (const ry of [.38, .82]) m.box('#7a5c3d', -4.2, FLOOR + ry, fenceZ, 4.4, .07, .05);
  m.box('#59483e', -4.2, FLOOR + 1.32, fenceZ + .06, 1.05, .62, .05);
  m.label('布告', -4.2, FLOOR + 1.32, fenceZ + .1, .9, .3, 0);
  // Luggage pile behind the cordon.
  const pile: [number, number, number, string, number][] = [
    [-5.3, .55, -11.3, '#765044', .15], [-4.4, .55, -11.5, '#5d4630', -.1], [-4.85, 1.05, -11.4, '#6e5136', .3],
    [-3.5, .5, -11.2, '#44503c', .05], [-5.6, .45, -10.9, '#8a6f4d', -.25],
  ];
  for (const [lx, ly, lz, tint, r] of pile) m.box(tint, lx, FLOOR + ly, lz, .78, .5, .55, r);
  m.box('#b88655', -4.4, FLOOR + .82, -11.5, .5, .04, .06);
  // A row of empty chairs facing the hall; one blank plate for the row.
  for (const cx of [-6.1, -5.2, -3.4, -2.5]) {
    m.box('#6e5136', cx, FLOOR + .24, -10.7, .46, .06, .44);
    m.box('#6e5136', cx, FLOOR + .55, -10.94, .46, .62, .06);
    for (const [dx, dz] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]] as const)
      m.box('#59402a', cx + dx, FLOOR + .12, -10.7 + dz, .06, .24, .06);
  }
  m.label('', -4.3, FLOOR + .5, -10.35, .8, .26, 0);
  // The one wrong exhibit: a dark slab at the zone's east edge, leaning on
  // a half-grade plinth. No number, no label, no light, no interaction.
  // Face scratches are meaningless short strokes, never a sheep pattern.
  m.solid('#6a655c', -2.0, FLOOR + .25, -10.9, 1.15, .5, .8);
  m.box('#2e2c2c', -2.0, FLOOR + 1.28, -10.86, 1.0, 1.62, .16, .3);
  const strokes: [number, number, number, number][] = [
    [-.22, 1.62, .3, .05], [.08, 1.5, .2, -.04], [-.1, 1.32, .34, .03],
    [.18, 1.18, .16, .06], [-.24, 1.05, .22, -.05], [.02, .9, .26, .04],
  ];
  for (const [sx, sy, sw, sr] of strokes) m.box('#8f8a80', -2.0 + sx, FLOOR + sy, -10.76, sw, .035, .02, sr);
  m.label('第三区 · 封锁与离别', -4.2, 2.3, -8.7, 3.2, .52, 0);
}

function corridor(m: MuseumBuilder) {
  // One lamp in the bare passage between zones three and four.
  m.box('#59402a', -1.2, FLOOR + 1.0, -10.6, .09, 2.0, .09);
  m.box('#e08a3c', -1.2, FLOOR + 2.05, -10.6, .17, .12, .17, 0, true);
  m.light(-1.2, FLOOR + 2.0, -10.6, '#f7c69c', 12, 5);
}

function zoneFour(m: MuseumBuilder) {
  // Page-grid wall on the north wall: twelve empty slots awaiting pages.
  for (let i = 0; i < MUSEUM_PAGE_SLOTS; i++) {
    const px = 5.9 + i * .48;
    m.box('#573a34', px, 1.72, -12.44, .44, 1.18, .07);
    m.box('#e8e2d2', px, 1.72, -12.39, .36, 1.06, .02);
    m.box('#b88655', px + .14, 1.06, -12.39, .1, .07, .02);
  }
  m.label('页格墙', 8.55, 2.62, -12.4, 1.6, .34, 0);
  // Guest book lectern at the zone's east exit.
  m.solid('#5d4630', 11.3, FLOOR + .5, -9.9, .55, 1.0, .45);
  m.box('#e8e2d2', 11.3, FLOOR + 1.06, -9.9, .44, .05, .34, .12);
  m.box('#8a4a34', 11.3, FLOOR + 1.03, -9.9, .48, .03, .38, .12);
  m.label('留言簿', 11.3, FLOOR + .62, -9.64, .8, .24, 0);
  for (const lx of [6.8, 9.8]) m.light(lx, 3.1, -10.6, '#dfe9f2', 40, 10);
  m.label('第四区 · 未写之页', 4.6, 2.4, -8.55, 3.0, .52, 0);
}

function socialMarks(m: MuseumBuilder) {
  // JG4: three brass standing discs for the town-history route (in front
  // of the sand table, mid-tunnel, in front of the page wall) and two
  // photo-spot floor rings (under the meteorite, before the page wall).
  // Zone three deliberately has no photo spot.
  for (const [dx, dz] of [[-5.5, 9.3], [-18.3, -2.2], [7.5, -11.2]] as const)
    m.box('#b88655', dx, FLOOR + .015, dz, .42, .03, .42, Math.PI / 4);
  for (const [rx, rz] of [[0, 7.1], [7.5, -11.2]] as const) {
    m.box('#b88655', rx, FLOOR + .012, rz - .55, 1.2, .024, .07);
    m.box('#b88655', rx, FLOOR + .012, rz + .55, 1.2, .024, .07);
    m.box('#b88655', rx - .55, FLOOR + .012, rz, .07, .024, 1.2);
    m.box('#b88655', rx + .55, FLOOR + .012, rz, .07, .024, 1.2);
  }
}

export function addMuseumZones(m: MuseumBuilder) {
  zoneOne(m);
  zoneTwo(m);
  thresholds(m);
  zoneThree(m);
  corridor(m);
  zoneFour(m);
  socialMarks(m);
}
