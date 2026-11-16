import type { MuseumBuilder } from './museum-kit';

type Point = [number, number, number];

export const terraceStop = { x: -25.85, z: 4.35 };

const floorY = 5.65;
const palette = {
  stone: '#747b89', deepStone: '#515768', lightStone: '#9ba1ac', darkJoint: '#575868',
  snow: '#dbeaf7', crust: '#b5cce2', slate: '#363f59', glaze: '#5d6076',
  beam: '#663929', trim: '#a2613a', walnut: '#43261f', gold: '#d29148',
  warmGlass: '#ffbb61', litGlass: '#ffe4a0', red: '#962e39', coral: '#e25360',
  blossom: '#bb344c', paleBlossom: '#ff9c9f', stem: '#653940', brass: '#9b6836',
  ceramic: '#3f6679', fabric: '#cf9b64', paper: '#eadabc',
};
const floorTones = ['#8b8183', '#918684', '#968987', '#857e83', '#908284', '#9c8b81'];

export function addMuseumTerrace(m: MuseumBuilder) {
  const { box, beam, panel, floor, collider, label, light } = m;
  const p = palette;
  function eaveTop(x: number) {
    const t = (x + 28) / 8.25;
    return 9.54 + 1.83 * t + 1.24 * (1 - t) ** 5;
  }

  // The west door crosses the join between the two slabs at the same elevation.
  floor(-23.92, floorY, -1, 8.16, 22);
  box(p.deepStone, -23.92, floorY - .57, -1, 8.14, .96, 22);
  box(p.lightStone, -23.92, floorY - .18, -1, 8.15, .16, 22);
  box(p.darkJoint, -23.92, floorY - .065, -1, 8.07, .13, 21.97);
  for (let row = 0; row < 22; row++) {
    for (let col = 0; col < 8; col++) {
      const tone = floorTones[(row * 11 + col * 7 + (row % 3) * col) % floorTones.length];
      box(tone, -27.46 + (col + .5) * .935, floorY - .018, -11.5 + row, .916, .041, .973);
    }
  }
  for (const x of [-27.72, -20.12]) {
    box(p.lightStone, x, floorY - .016, -1, .42, .046, 21.92);
    box(p.brass, x + (x < -24 ? .25 : -.25), floorY + .009, -1, .027, .018, 21.85);
  }
  box(p.trim, -20.03, floorY + .016, -4, .18, .04, 3.72);

  // Exterior piers continue the gallery’s timber columns down to the lower slope.
  for (const z of [-10.75, -4.85, 1.05, 6.95]) {
    box(p.deepStone, -27.18, .30, z, 1.45, .66, 1.46);
    box(p.stone, -27.18, 2.75, z, .97, 4.85, .97);
    for (const y of [1.30, 2.17, 3.03, 3.92, 4.78]) {
      box(p.deepStone, -27.18, y, z, .994, .045, .993);
    }
    box(p.lightStone, -27.18, 5.06, z, 1.38, .22, 1.40);
    if (z !== 6.95) collider(-27.18, 2.60, z, 1.45, 5.2, 1.46);
  }

  function rail(ax: number, az: number, bx: number, bz: number) {
    const length = Math.hypot(bx - ax, bz - az);
    const angle = Math.atan2(az - bz, bx - ax);
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const alongX = ax !== bx;
    const posts = Math.max(1, Math.round(length / 2.72));
    box(p.deepStone, x, floorY + .105, z, length, .22, .48, angle);
    box(p.stone, x, floorY + .29, z, length, .22, .31, angle);
    box(p.deepStone, x, floorY + .63, z, length, .15, .29, angle);
    box(p.lightStone, x, floorY + .79, z, length, .17, .45, angle);
    box(p.crust, x, floorY + .887, z, length, .064, .375, angle);
    collider(x, floorY + .50, z, alongX ? length : .50, 1.0, alongX ? .50 : length);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      box(p.stone, px, floorY + .412, pz, .51, .81, .51);
      box(p.lightStone, px, floorY + .84, pz, .61, .17, .60);
      box(p.snow, px, floorY + .943, pz, .59, .064, .56);
      if (i < posts) {
        const span = length / posts;
        for (let k = 1; k <= 4; k++) {
          const d = k / 5 * span;
          const dx = alongX ? d : 0;
          const dz = alongX ? 0 : d;
          box(p.lightStone, px + dx, floorY + .49, pz + dz, .165, .45, .178);
          box(p.stone, px + dx, floorY + .55, pz + dz, .233, .12, .232, Math.PI / 4);
          box(p.deepStone, px + dx, floorY + .37, pz + dz, .246, .078, .234);
        }
      }
    }
  }
  rail(-27.76, -11.76, -27.76, 9.77);
  rail(-27.76, -11.76, -20.08, -11.76);
  rail(-27.76, 9.77, -26.26, 9.77);
  rail(-21.77, 9.77, -20.08, 9.77);

  const roofProfiles = [-27.96, -27.35, -26.63, -25.72, -24.41, -23.05, -21.62, -19.86];
  for (let i = 1; i < roofProfiles.length; i++) {
    const a = roofProfiles[i - 1];
    const b = roofProfiles[i];
    panel(p.slate, [a, eaveTop(a), -12.56], [a, eaveTop(a), 10.44], [b, eaveTop(b), 10.44], [b, eaveTop(b), -12.56]);
    panel(p.walnut, [b, eaveTop(b) - .23, -12.56], [b, eaveTop(b) - .23, 10.44], [a, eaveTop(a) - .23, 10.44], [a, eaveTop(a) - .23, -12.56]);
    beam(i % 2 ? p.trim : p.beam, [a, eaveTop(a) - .08, -12.53], [b, eaveTop(b) - .08, -12.53], .23);
    beam(p.trim, [a, eaveTop(a) - .08, 10.42], [b, eaveTop(b) - .08, 10.42], .23);
    for (let j = 0; j < 42; j++) {
      const z = -12.27 + .54 * j;
      const covered = (j * 7 + i * 11) % 19 !== 5;
      beam(covered ? ((j + i) % 5 === 0 ? p.crust : p.snow) : p.glaze,
        [a + .02, eaveTop(a) + (covered ? .155 : .08), z],
        [b - .01, eaveTop(b) + (covered ? .155 : .08), z], covered ? .43 : .22);
    }
  }
  beam(p.beam, [-27.75, eaveTop(-27.75) - .18, -12.52], [-27.75, eaveTop(-27.75) - .18, 10.43], .27);
  beam(p.trim, [-27.7, eaveTop(-27.7) - .38, -12.52], [-27.7, eaveTop(-27.7) - .38, 10.43], .14);
  for (const z of [-12.4, 10.31]) {
    for (let i = 0; i < 4; i++) {
      const x = -27.83 + i * .36;
      box(i % 2 ? p.gold : p.trim, x, eaveTop(x) + .16, z, .23, .3, .31);
    }
  }

  for (const z of [-10.75, -4.85, 1.05, 6.95]) {
    const x = -27.18;
    box(p.deepStone, x, 5.81, z, .81, .34, .82);
    box(p.lightStone, x, 6.02, z, .70, .15, .71);
    box(p.beam, x, 7.85, z, .47, 3.64, .48);
    box(p.trim, x - .249, 7.83, z - .15, .027, 3.47, .046);
    collider(x, 7.2, z, .78, 3.1, .79);
    for (let i = 0; i < 4; i++) {
      const y = 9.20 + i * .18;
      box(i % 2 ? p.trim : p.beam, x + .12 * i, y, z, .66 + i * .29, .19, .95 + .21 * i);
      for (const side of [-1, 1]) box(p.gold, x - .344, y, z + side * (.30 + i * .076), .037, .093, .11);
    }
    beam(p.beam, [x - .51, 9.69, z], [-19.84, 10.76, z], .31);
    beam(p.trim, [x - .5, 9.51, z - .18], [-19.84, 10.55, z - .18], .08);
    beam(p.trim, [x - .5, 9.51, z + .18], [-19.84, 10.55, z + .18], .08);
  }
  for (const x of [-26.68, -25.68, -24.47, -23.21, -21.85, -20.47]) {
    beam(p.beam, [x, eaveTop(x) - .27, -12.52], [x, eaveTop(x) - .27, 10.45], .17);
  }

  function lantern(x: number, y: number, z: number, size: number, suspended = false) {
    box(p.walnut, x, y - .56 * size, z, size, .13 * size, size);
    box(p.warmGlass, x, y, z, size * .75, size, size * .75, 0, true);
    box(p.litGlass, x, y, z, size * .79, size * .67, size * .63, 0, true);
    for (const dx of [-.393, .393]) for (const dz of [-.393, .393]) {
      box(p.trim, x + dx * size, y, z + dz * size, .095 * size, 1.08 * size, .095 * size);
    }
    box(p.walnut, x, y + .56 * size, z, size, .15 * size, size);
    box(p.gold, x, y + .67 * size, z, .715 * size, .095 * size, .715 * size);
    if (suspended) {
      box(p.walnut, x, (y + .7 * size + eaveTop(x) - .28) / 2, z, .072, eaveTop(x) - .28 - y - .7 * size, .072);
      box(p.red, x, y - .81 * size, z, .085 * size, .38 * size, .085 * size);
    }
  }
  for (const z of [-9.15, -2.44, 3.6, 8.54]) lantern(-25.04, 8.78, z, .70, true);
  for (const z of [-9.05, -3.68, 1.72, 7.05]) lantern(-27.74, floorY + 1.23, z, .63);
  light(-24.65, 8.15, -2.1, p.warmGlass, 85, 15);

  function flowerVase(x: number, y: number, z: number, size: number, variant: number) {
    box(p.walnut, x, y + .042 * size, z, .58 * size, .084 * size, .58 * size, .18);
    box(variant % 2 ? p.brass : p.ceramic, x, y + .29 * size, z, .53 * size, .44 * size, .49 * size, .18);
    box(p.gold, x, y + .47 * size, z, .46 * size, .06 * size, .45 * size, .18);
    box(variant % 2 ? p.brass : p.ceramic, x, y + .53 * size, z, .32 * size, .13 * size, .32 * size);
    for (let j = 0; j < 8; j++) {
      const angle = j * Math.PI * (3 - Math.sqrt(5)) + variant;
      const radius = (.24 + .072 * (j % 5)) * size;
      const dx = Math.cos(angle) * radius;
      const dz = Math.sin(angle) * radius;
      const tip: Point = [x + dx, y + (.99 + .08 * (j % 4)) * size, z + dz];
      beam(p.stem, [x + .04 * size, y + .54 * size, z], tip, .027 * size);
      box(j % 2 ? p.coral : p.blossom, ...tip, .17 * size, .10 * size, .15 * size, angle);
      box(p.paleBlossom, tip[0] + .06 * size, tip[1] + .046 * size, tip[2], .065 * size, .034 * size, .072 * size, angle);
      box(p.blossom, tip[0] - .08 * size, tip[1] - .085 * size, tip[2] - .055 * size, .084 * size, .065 * size, .092 * size, angle);
    }
  }

  function bench(x: number, z: number) {
    box(p.walnut, x, floorY + .29, z, .72, .17, 2.26);
    box(p.beam, x, floorY + .52, z, .72, .17, 2.31);
    box(p.fabric, x - .035, floorY + .647, z, .65, .1, 2.24);
    for (const dz of [-1.0, 1.0]) {
      box(p.trim, x, floorY + .27, z + dz, .69, .37, .16);
      box(p.trim, x, floorY + .83, z + dz, .72, .11, .105);
    }
    box(p.beam, x + .29, floorY + .93, z, .16, .49, 2.31);
    for (const dz of [-.65, 0, .65]) {
      box(dz === 0 ? p.paper : p.red, x + .153, floorY + .78, z + dz, .23, .32, .41, -.14);
      box(p.gold, x + .027, floorY + .78, z + dz, .019, .20, .012);
    }
    collider(x, floorY + .61, z, .78, 1.22, 2.32);
  }
  bench(-20.62, -8.89);
  bench(-20.62, 2.71);
  for (const z of [-10.8, -6.95, .14, 4.63]) {
    box(p.walnut, -20.58, floorY + .43, z, .71, .87, .75);
    box(p.trim, -20.58, floorY + .895, z, .77, .105, .82);
    flowerVase(-20.60, floorY + .95, z, .83, z > 0 ? 2 : 1);
    collider(-20.58, floorY + .51, z, .79, 1.03, .83);
  }

  function chair(x: number, z: number, facing: number) {
    const dx = Math.sin(facing);
    const dz = Math.cos(facing);
    const point = (u: number, v: number) => [x + dz * u + dx * v, z - dx * u + dz * v];
    for (const u of [-.242, .242]) for (const v of [-.24, .235]) {
      const [px, pz] = point(u, v);
      box(p.walnut, px, floorY + .24, pz, .074, .48, .074, facing);
    }
    box(p.trim, x, floorY + .485, z, .57, .12, .56, facing);
    const [bx, bz] = point(0, -.241);
    box(p.beam, bx, floorY + .94, bz, .59, .095, .076, facing);
    for (const u of [-.25, -.12, 0, .12, .25]) {
      const [px, pz] = point(u, -.242);
      box(p.walnut, px, floorY + .71, pz, .052, .45, .061, facing);
    }
    collider(x, floorY + .51, z, .60, 1.02, .59);
  }

  const tableX = -23.33;
  const tableZ = -8.14;
  for (const dx of [-.53, .53]) for (const dz of [-.52, .52]) {
    box(p.walnut, tableX + dx, floorY + .4, tableZ + dz, .10, .8, .11);
  }
  box(p.beam, tableX, floorY + .77, tableZ, 1.22, .23, 1.19);
  box(p.trim, tableX, floorY + .94, tableZ, 1.39, .14, 1.37);
  box(p.red, tableX, floorY + 1.019, tableZ + .13, 1.38, .019, .43);
  flowerVase(tableX + .39, floorY + 1.01, tableZ - .33, .48, 5);
  lantern(tableX - .41, floorY + 1.21, tableZ - .37, .28);
  for (const offset of [-.36, .08, .40]) {
    box(p.ceramic, tableX + offset, floorY + 1.07, tableZ + .31, .127, .106, .122);
    box(p.gold, tableX + offset, floorY + 1.127, tableZ + .31, .138, .025, .132);
  }
  chair(tableX, tableZ - .99, 0);
  chair(tableX, tableZ + .98, Math.PI);
  chair(tableX + .99, tableZ, -Math.PI / 2);
  collider(tableX, floorY + .49, tableZ, 1.4, 1.0, 1.39);

  const plaqueX = -27.25;
  const plaqueZ = 4.25;
  box(p.deepStone, plaqueX, floorY + .14, plaqueZ, .72, .29, .77);
  box(p.beam, plaqueX, floorY + .54, plaqueZ, .28, .86, .39);
  box(p.trim, plaqueX, floorY + 1.03, plaqueZ, .20, .47, 1.18);
  box(p.walnut, plaqueX + .118, floorY + 1.03, plaqueZ, .049, .384, 1.09);
  label('钟楼观景台', plaqueX + .147, floorY + 1.033, plaqueZ, 1.035, .30, Math.PI / 2);
  collider(plaqueX, floorY + .65, plaqueZ, .72, 1.3, 1.18);
}
