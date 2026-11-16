import type { MuseumBuilder } from './museum-kit';

const finish = {
  beam: '#59392e', beamEdge: '#825637', beamShadow: '#432e29', board: '#614737',
  mold: '#9c713e', bronze: '#c7934b', bright: '#e6b560', patina: '#8f663d',
  granite: '#687180', stoneTop: '#a6a2a0', stoneLine: '#737785',
  plaster: '#cab095', red: '#993d36', darkRed: '#763430', paper: '#e0b889',
  amber: '#ffd386', lampCore: '#ffe1a1',
};

export function addMuseumTrim(m: MuseumBuilder) {
  const box = m.box.bind(m);

  function column(x: number, y: number, z: number) {
    // Layered footings separate the joinery from the granite walking surface.
    m.solid(finish.granite, x, y + .16, z, 1.22, .32, 1.22);
    m.solid(finish.stoneTop, x, y + .35, z, 1.12, .12, 1.12);
    box(finish.stoneLine, x, y + .505, z, 1.02, .19, 1.02);
    box(finish.stoneTop, x, y + .63, z, .98, .08, .98);
    box(finish.beamShadow, x, y + .76, z, .79, .18, .79);
    m.solid(finish.beam, x, y + 2.42, z, .68, 3.3, .68);

    for (const direction of [-1, 1]) {
      box(finish.beamEdge, x + direction * .29, y + 2.36, z + .347, .048, 3.06, .023);
      box(finish.beamEdge, x + direction * .347, y + 2.36, z - .27, .023, 3.06, .044);
    }
    box(finish.darkRed, x, y + 2.25, z + .354, .29, 1.16, .05);
    box(finish.beamShadow, x, y + 2.25, z + .385, .215, .99, .04);
    for (const dz of [-1, 1]) {
      for (const dx of [-1, 1]) {
        box(finish.bronze, x + dx * .105, y + 2.25 + dz * .49, z + .407, .08, .065, .023);
      }
    }
    for (let row = 0; row < 4; row++) {
      const h = y + 1.96 + row * .19;
      box(finish.bronze, x, h, z + .411, .047, .047, .025, Math.PI / 4);
    }

    // All four arms step towards the beam with gold end-grain and a shadow reveal.
    box(finish.mold, x, y + 3.8, z, .92, .17, .92);
    for (const direction of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const offset = .34 + i * .20;
        const h = y + 3.83 + i * .20;
        box(finish.beamEdge, x + offset * direction, h, z, .53, .17, .32);
        box(finish.beamEdge, x, h, z + offset * direction, .32, .17, .53);
        box(finish.bronze, x + (offset + .26) * direction, h - .02, z, .035, .10, .21);
        box(finish.bronze, x, h - .02, z + (offset + .26) * direction, .21, .10, .035);
      }
    }
    box(finish.mold, x, y + 4.39, z, 1.11, .16, 1.11);
  }

  function lantern(x: number, y: number, z: number, size: number) {
    const foot = size * .61;
    const body = size * .75;
    const face = size * .34;
    const metal = size * .068;
    box(finish.beamShadow, x, y + body * .5 + .27, z, .11, .52, .11);
    box(finish.mold, x, y + body * .5 + .10, z, foot * 1.31, .13, foot * 1.31);
    box(finish.bronze, x, y + body * .5 + .04, z, foot * 1.19, .075, foot * 1.19);
    box(finish.beamShadow, x, y, z, foot * 1.05, body, foot * 1.05);
    for (const direction of [-1, 1]) {
      box(finish.lampCore, x, y, z + direction * face, foot * .91, body * .79, .035, 0, true);
      box(finish.amber, x + direction * face, y, z, .035, body * .79, foot * .91, 0, true);
      for (const h of [y - body * .28, y + body * .28]) {
        box(finish.bronze, x, h, z + direction * (face + .024), foot, metal, metal);
        box(finish.bronze, x + direction * (face + .024), h, z, metal, metal, foot);
      }
      box(finish.patina, x, y, z + direction * (face + .023), metal * .71, body * .78, metal);
      box(finish.patina, x + direction * (face + .023), y, z, metal, body * .78, metal * .71);
      for (const corner of [-1, 1]) {
        box(finish.beamShadow, x + direction * face, y, z + corner * face, metal, body, metal);
      }
    }
    box(finish.bronze, x, y - body * .52, z, foot * 1.14, .11, foot * 1.14);
    box(finish.mold, x, y - body * .52 - .08, z, foot * .75, .10, foot * .75);
    box(finish.red, x, y - body * .52 - .21, z, .085, .24, .085);
    box(finish.bronze, x, y - body * .52 - .34, z, .11, .09, .11);
  }

  function coffer(x: number, y: number, z: number, w: number, d: number, carved: boolean) {
    box(finish.board, x, y, z, w, .075, d);
    for (const side of [-1, 1]) {
      box(finish.beamEdge, x + side * (w / 2 - .15), y - .075, z, .26, .13, d);
      box(finish.beamEdge, x, y - .075, z + side * (d / 2 - .15), w, .13, .26);
      const innerX = x + side * (w / 2 - .32);
      const innerZ = z + side * (d / 2 - .32);
      box(finish.mold, innerX, y - .043, z, .044, .043, d - .42);
      box(finish.mold, x, y - .043, innerZ, w - .42, .043, .044);
      for (const end of [-1, 1]) {
        box(finish.mold, innerX, y - .10, z + end * (d / 2 - .32), .38, .073, .38);
      }
    }
    if (!carved) return;
    box(finish.beamShadow, x, y - .085, z, 1.19, .11, 1.19, Math.PI / 4);
    box(finish.mold, x, y - .151, z, .85, .071, .85, Math.PI / 4);
    box(finish.beam, x, y - .192, z, .72, .028, .72, Math.PI / 4);
    for (const direction of [-1, 1]) {
      box(finish.bronze, x + direction * .18, y - .215, z, .19, .028, .19, Math.PI / 4);
      box(finish.bronze, x, y - .216, z + direction * .18, .19, .028, .19, Math.PI / 4);
    }
    box(finish.bright, x, y - .229, z, .19, .035, .19, Math.PI / 4);
  }

  function rearPanel(x: number, y: number) {
    const z = -13.16;
    box(finish.beamShadow, x, y + 2.52, z, 2.15, 2.7, .27);
    box(finish.mold, x, y + 2.52, z + .172, 1.94, 2.44, .095);
    box(finish.paper, x, y + 2.52, z + .228, 1.72, 2.22, .045);
    for (let line = 0; line < 5; line++) {
      const h = y + 1.63 + line * .31;
      const dx = (line % 2 ? .27 : -.22) * Math.sign(x);
      box(line % 2 ? finish.patina : finish.darkRed, x + dx, h, z + .263, .6, .036, .03);
      box(finish.patina, x + dx * 1.1, h + .09, z + .263, .23, .031, .03);
    }
    box(finish.bronze, x, y + 3.35, z + .27, .31, .31, .025, Math.PI / 4);
    box(finish.red, x, y + 3.35, z + .29, .18, .18, .025, Math.PI / 4);
    for (const side of [-1, 1]) {
      box(finish.bronze, x + side * 1.08, y + 2.51, z + .105, .073, 2.53, .082);
      box(finish.mold, x + side * 1.13, y + 3.88, z + .10, .20, .154, .24);
    }
  }

  for (const [level, y] of [.28, 5.65].entries()) {
    for (const x of [-7, 7]) {
      for (const z of [9, 1, -7]) column(x, y, z);
      rearPanel(x, y);
    }

    const right = level === 0 ? 14.25 : 19.15;
    const left = -19.15;
    for (const x of [-18, -12, -7, 0, 7, 12, ...(level === 1 ? [18] : [])]) {
      box(finish.beamShadow, x, y + 4.68, -.38, .35, .33, 25.3);
      box(finish.beamEdge, x - .106, y + 4.49, -.38, .065, .105, 25.25);
      box(finish.mold, x + .119, y + 4.53, -.38, .032, .039, 25.24);
    }
    for (const z of [11.5, 9, 5, 1, -3, -7, -11, -13]) {
      box(finish.beamShadow, (left + right) / 2, y + 4.64, z, right - left, .31, .45);
      box(finish.beamEdge, (left + right) / 2, y + 4.46, z + .158, right - left, .095, .09);
      for (const x of [-12, -7, 0, 7, 12]) {
        box(finish.mold, x, y + 4.43, z, .54, .09, .57);
        box(finish.bronze, x, y + 4.373, z, .29, .033, .32);
      }
    }
    const aisles: [number, number][] = [[-15, 5.48], [-9.48, 4.28], [-3.5, 6.32], [3.5, 6.32], [9.48, 4.28]];
    if (level === 1) aisles.push([15, 5.48]);
    for (const [i, [x, width]] of aisles.entries()) {
      for (const z of [7, 3, -1, -5, -9]) coffer(x, y + 4.88, z, width, 3.24, i === 2 || i === 3);
    }
    for (const z of [9, 1, -7]) lantern(0, y + 3.86, z, level ? 1.08 : 1.17);
    for (const x of [-9.45, 9.45]) {
      for (const z of [7.3, -.7, -8.7]) lantern(x, y + 4.07, z, .61);
    }
    m.light(-3.8, y + 3.97, 6.7, '#ffbc77', 104, 17);
    m.light(4.6, y + 3.97, -6.1, '#ffbd80', 116, 17);
  }
}
