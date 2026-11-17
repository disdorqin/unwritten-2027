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
  const detail = m.detailBox.bind(m);
  const tick = 1 / 64;
  const leaf = '#bd8f5c';
  const aged = '#665061';
  const cinnabar = '#b46a46';

  // Offset strips sit on the wooden face instead of being painted into a texture.
  function faceStrip(paint: string, x: number, y: number, z: number, u: number, w: number, h: number, depth: number, turn: number) {
    const sin = Math.sin(turn), cos = Math.cos(turn);
    detail(paint, x + cos * u + sin * depth, y, z - sin * u + cos * depth, w, h, tick, turn);
  }

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
    // Exposed pegs, stone joints, and a stepped brass flower inset on each south-facing plaque.
    for (const direction of [-1, 1]) {
      for (const zDirection of [-1, 1]) {
        for (const h of [.455, .565]) {
          detail('#8b8c93', x + direction * .313, y + h, z + zDirection * .508, .30, tick, tick);
          detail('#aaa6a0', x + direction * .508, y + h, z + zDirection * .313, tick, tick, .30);
        }
        detail(finish.patina, x + direction * .252, y + 3.46, z + zDirection * .35, .0625, .0625, tick);
        detail(finish.bright, x + direction * .252, y + 3.46, z + zDirection * .36, .044, .044, tick);
      }
      for (const v of [-.39, .39]) {
        detail(finish.bronze, x + direction * .073, y + 2.25 + v, z + .411, .047, tick, tick);
      }
      detail(finish.patina, x + direction * .092, y + 2.25, z + .408, tick, .88, tick);
      detail(finish.bright, x + direction * .122, y + 2.25, z + .407, tick, 1.03, tick);
    }
    for (const v of [-.27, 0, .27]) {
      for (const dir of [-1, 1]) {
        detail(finish.bronze, x + dir * .03125, y + 2.25 + v, z + .423, tick, .047, tick);
        detail(finish.bronze, x, y + 2.25 + v + dir * .03125, z + .423, .047, tick, tick);
      }
      detail(cinnabar, x, y + 2.25 + v, z + .422, .047, .047, tick);
      detail(finish.bright, x, y + 2.25 + v, z + .438, tick, tick, tick);
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
        for (const accent of [-1, 1]) {
          detail(finish.beamShadow, x + (offset + .281) * direction, h - .02, z + accent * .065, tick, .061, tick);
          detail(finish.beamShadow, x + accent * .065, h - .02, z + (offset + .281) * direction, tick, .061, tick);
        }
        detail(finish.bright, x + (offset + .281) * direction, h - .013, z, tick, tick, .118);
        detail(finish.bright, x, h - .013, z + (offset + .281) * direction, .118, tick, tick);
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
    // Four faces share an open lattice of stepped cloud corners. The 1/64 m
    // brass strips stay narrow enough that the warm central panel remains visible.
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI / 2;
      const outer = face + .028;
      for (const corner of [-1, 1]) {
        const edge = corner * foot * .365;
        for (const level of [-1, 1]) {
          const top = y + level * body * .326;
          faceStrip(leaf, x, top, z, edge, foot * .19, tick, outer, angle);
          faceStrip(leaf, x, top - level * body * .067, z, edge + corner * foot * .064, tick, body * .148, outer, angle);
          faceStrip(finish.bronze, x, top - level * body * .13, z, edge + corner * foot * .004, foot * .12, tick, outer, angle);
          faceStrip(leaf, x, top - level * body * .095, z, edge - corner * foot * .043, tick, body * .080, outer, angle);
        }
      }
      for (const v of [-1, 1]) {
        faceStrip(finish.bright, x, y + v * (body * .52 + .114), z, 0, foot * 1.13, tick, foot * .604, angle);
        for (const u of [-1, 1]) {
          faceStrip(finish.bright, x, y + v * (body * .52 + .114), z, u * foot * .45, tick, .049, foot * .611, angle);
        }
      }
    }
    box(finish.bronze, x, y - body * .52, z, foot * 1.14, .11, foot * 1.14);
    box(finish.mold, x, y - body * .52 - .08, z, foot * .75, .10, foot * .75);
    box(finish.red, x, y - body * .52 - .21, z, .085, .24, .085);
    box(finish.bronze, x, y - body * .52 - .34, z, .11, .09, .11);
    for (const [index, u] of [-2, -1, 0, 1, 2].entries()) {
      const drop = (4 - Math.abs(u)) * tick;
      detail(index % 2 ? cinnabar : finish.darkRed, x + u * tick, y - body * .52 - .384 - drop / 2, z, tick, drop, .034);
    }
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
    // The underside relief reads from below, using stepped oak and brass rather than a decal.
    for (const side of [-1, 1]) {
      detail(finish.bronze, x + side * .42, y - .132, z, tick, tick, .43);
      detail(finish.bronze, x, y - .132, z + side * .42, .43, tick, tick);
      for (const corner of [-1, 1]) {
        detail(finish.mold, x + side * .31, y - .142, z + corner * .42, .23, tick, .047);
        detail(finish.mold, x + side * .42, y - .142, z + corner * .31, .047, tick, .23);
        detail(finish.bright, x + side * .39, y - .15, z + corner * .39, .047, tick, .047);
      }
    }
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
    for (const edge of [-1, 1]) {
      detail(finish.bright, x + edge * .872, y + 2.52, z + .254, tick, 2.23, tick);
      for (const v of [-1, 1]) {
        detail(aged, x + edge * .748, y + 2.52 + v * 1.005, z + .259, .21, tick, tick);
        detail(aged, x + edge * .834, y + 2.52 + v * .96, z + .259, tick, .093, tick);
        detail(finish.bronze, x + edge * .918, y + 2.52 + v * 1.155, z + .245, .073, .073, tick);
        detail(finish.bright, x + edge * .918, y + 2.52 + v * 1.155, z + .27, tick, tick, tick);
      }
    }
    for (const side of [-1, 1]) {
      box(finish.bronze, x + side * 1.08, y + 2.51, z + .105, .073, 2.53, .082);
      box(finish.mold, x + side * 1.13, y + 3.88, z + .10, .20, .154, .24);
    }
  }

  function gallerySign(side: number, y: number) {
    const x = side * 2.57;
    const z = 5.22;
    const center = y + 2.91;
    const dark = side < 0 ? '#294757' : '#643a36';
    const months = side < 0 ? '一月至六月' : '七月至十二月';

    box(finish.beamShadow, x, center, z, 3.36, .69, .15);
    for (const edge of [-1, 1]) {
      detail(finish.bronze, x, center + edge * .31, z, 3.26, tick, .18);
      detail(finish.bronze, x + edge * 1.64, center, z, tick, .62, .18);
      box(finish.mold, x + edge * 1.23, y + 3.98, z, .07, 1.61, .07);
      box(finish.bronze, x + edge * 1.23, y + 4.716, z, .23, .09, .19);
      box(finish.bronze, x + edge * 1.23, y + 3.26, z, .18, .095, .16);
      for (const face of [-1, 1]) {
        detail(finish.bright, x + edge * 1.59, center + .255, z + face * .083, .055, .055, tick);
        detail(finish.bright, x + edge * 1.59, center - .255, z + face * .083, .055, .055, tick);
      }
    }
    for (const face of [-1, 1]) {
      const text = side * face < 0 ? `← ${months}` : `${months} →`;
      m.label(text, x, center, z + face * .083, 3.08, .49, face > 0 ? 0 : Math.PI,
        { background: dark, color: '#fff0cd', accent: '#d0a36b' });
    }
  }

  function galleryTaskLight(x: number, y: number, z: number) {
    box(finish.beamShadow, x, y + 4.09, z, .075, 1.36, .075);
    box(finish.mold, x, y + 4.79, z, .22, .11, .22);
    box(finish.beamShadow, x, y + 3.465, z, .42, .14, .34);
    box(finish.bronze, x, y + 3.415, z, .45, .066, .37);
    box('#fff1cd', x, y + 3.373, z, .32, .032, .245, 0, true);
    for (const edge of [-1, 1]) {
      detail(finish.patina, x + edge * .174, y + 3.354, z, .044, tick, .302);
      detail(finish.bright, x + edge * .178, y + 3.435, z + .186, .049, .045, tick);
    }
    m.light(x, y + 3.30, z, '#ffe2b0', 31, 10.5);
  }

  for (const [level, y] of [.28, 5.65].entries()) {
    if (level === 0) {
      for (const side of [-1, 1]) {
        gallerySign(side, y);
        for (const z of [6.15, -.9, -7.92]) galleryTaskLight(side * 10.72, y, z);
      }
    }
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
