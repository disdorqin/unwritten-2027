import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';

export type HousingStyle = 'alpine' | 'courtyard' | 'machiya' | 'shop';
export type DistrictTheme = 'forest' | 'memorial' | 'market' | 'lakeside';

type Block = {
  color: string;
  center: [number, number, number];
  size: [number, number, number];
};

const styles = {
  alpine: [
    ['#875947', '#442f2d', '#c6a688', '#52475c', '#824143'],
    ['#785a4b', '#4b3833', '#bcbca6', '#3d546a', '#306067'],
    ['#a05e49', '#513329', '#d3b298', '#624741', '#855638'],
  ],
  courtyard: [
    ['#d7d6cb', '#483c3b', '#aa7770', '#536179', '#a34042'],
    ['#c3cad1', '#525360', '#839fb1', '#4b586a', '#3c6982'],
    ['#dfd0be', '#5f4941', '#cd9e7d', '#5f4e56', '#a7603d'],
  ],
  machiya: [
    ['#61514e', '#36313a', '#aa8265', '#43495e', '#8e4348'],
    ['#675854', '#42383b', '#a59d85', '#50576a', '#577178'],
    ['#553d3c', '#312e34', '#b17d65', '#534455', '#8b5049'],
  ],
  shop: [
    ['#9a5450', '#534048', '#debea1', '#42485b', '#36666a'],
    ['#ab7d5d', '#624648', '#dbc0a6', '#565368', '#864549'],
    ['#a67470', '#4f4152', '#d5bec6', '#485d70', '#4b647e'],
  ],
} as const;

// Wall, frame, trim, roof and accent colors for the four neighborhoods at their original sites.
const districtPalettes = {
  forest: ['#875841', '#4b3128', '#ba916c', '#43494e', '#86513f'],
  memorial: ['#c0cbd3', '#3b4b5a', '#d0dae0', '#4b5b69', '#4b7185'],
  market: ['#a75141', '#654135', '#d8b58c', '#714f4b', '#953d36'],
  lakeside: ['#b8a88b', '#485b64', '#e0d2b8', '#4b616f', '#47778a'],
} as const satisfies Record<DistrictTheme, readonly [string, string, string, string, string]>;

const geometry = new BoxGeometry();
const blockMaterial = new MeshLambertMaterial();
const glowMaterial = new MeshLambertMaterial({ emissive: '#ec9344', emissiveIntensity: .38 });
const snow = '#e1ecf8';
const shadedSnow = '#cfdfed';

export function buildDistrictHousing(style: HousingStyle, width: number, depth: number, variant: number, theme?: DistrictTheme): Group {
  const group = new Group();
  const pieces: Block[] = [];
  const windows: Block[] = [];
  const basePalette = styles[style][Math.abs(Math.trunc(variant)) % 3];
  const [wall, beam, trim, tile, accent] = theme
    ? districtPalettes[theme].map((color, i) => '#' + new Color(basePalette[i]).lerp(new Color(color), .82).getHexString())
    : basePalette;
  const w = width;
  const d = depth;
  const front = d / 2;
  const back = -front;
  const glow = ['#ffc181', '#ffd3a1', '#ffbc76'][Math.abs(Math.trunc(variant)) % 3];
  const masonry = theme === 'lakeside' ? '#758892' : style === 'courtyard' ? '#8a919d' : '#66717e';

  function add(color: string, x: number, y: number, z: number, a: number, h: number, b: number, lit = false) {
    (lit ? windows : pieces).push({ color, center: [x, y, z], size: [a, h, b] });
  }

  // Window depth is measured outward from its wall, so all four elevations use the same trim.
  function windowAt(x: number, y: number, z: number, size: number, tall: number, facing: 0 | 1 | 2 | 3, lattice = 2) {
    const local = (color: string, u: number, v: number, out: number, a: number, b: number, thickness: number, lit = false) => {
      if (facing === 0) add(color, x + u, y + v, z + out, a, b, thickness, lit);
      if (facing === 1) add(color, x + out, y + v, z - u, thickness, b, a, lit);
      if (facing === 2) add(color, x - u, y + v, z - out, a, b, thickness, lit);
      if (facing === 3) add(color, x - out, y + v, z + u, thickness, b, a, lit);
    };
    local(beam, 0, 0, .07, size + .24, tall + .22, .18);
    local(glow, 0, 0, .17, size, tall, .047, true);
    for (let i = 1; i < lattice; i++) {
      local(beam, (i / lattice - .5) * size, 0, .218, .077, tall, .045);
    }
    local(beam, 0, -.04, .219, size, .083, .05);
    local(trim, 0, -tall / 2 - .12, .19, size + .36, .14, .34);
  }

  function door(x: number, z: number, size: number, y = .28) {
    add(beam, x, y + 1.18, z + .09, size + .35, 2.36, .23);
    add(accent, x, y + 1.08, z + .235, size, 2.16, .12);
    add(beam, x, y + 1.15, z + .305, .09, 2.14, .04);
    for (const s of [-1, 1]) {
      add(trim, x + s * .22, y + 1.06, z + .35, .10, .12, .08);
      add(glow, x + s * size * .30, y + 1.63, z + .306, size * .29, .53, .04, true);
    }
    add(trim, x, y + 2.36, z + .19, size + .48, .15, .26);
  }

  function lantern(x: number, y: number, z: number, size = .35) {
    add(beam, x, y + size * .75, z, .07, size * .71, .07);
    add('#d95b42', x, y, z, size * .92, size * 1.2, size * .92);
    add('#ffb466', x, y, z + size * .45, size * .65, size * .96, .035, true);
    for (const side of [-1, 1]) {
      add('#694136', x, y + side * size * .62, z, size, .08, size);
    }
  }

  function plinth(x: number, z: number, a: number, b: number) {
    add(masonry, x, .18, z, a + .26, .36, b + .24);
    add(shadedSnow, x, .378, z, a + .32, .057, b + .3);
  }

  function stoop(x: number, z: number, size: number) {
    add(masonry, x, .09, z + .65, size + .4, .18, 1.14);
    add(masonry, x, .244, z + .34, size + .5, .19, .72);
    add(shadedSnow, x, .2, z + 1.18, size + .43, .05, .09);
  }

  function chimney(x: number, y: number, z: number, h = 2.35) {
    add(masonry, x, y + h / 2, z, .65, h, .73);
    for (let it = .4; it < h - .16; it += .35) add('#a1a8b0', x, y + it, z + .368, .67, .039, .035);
    add(tile, x, y + h, z, .84, .19, .87);
    add(snow, x, y + h + .11, z, .80, .083, .85);
  }

  function gable(x: number, z: number, span: number, run: number, eave: number, rise: number, axis: 'z' | 'x',
    overhang = .83, cladding: string = wall) {
    const bands = Math.max(6, Math.ceil(rise / .31));
    const runBlock = (color: string, u: number, y: number, v: number, a: number, h: number, b: number) => {
      if (axis === 'z') add(color, x + u, y, z + v, a, h, b);
      else add(color, x + v, y, z + u, b, h, a);
    };
    for (let i = 0; i < bands; i++) {
      const fraction = i / bands;
      const a = (span + 2 * overhang) * (1 - fraction);
      const y = eave + (i + .5) * rise / bands;
      const fill = span * (1 - fraction);
      runBlock(cladding, 0, y - .035, 0, fill, rise / bands + .025, run);
      runBlock(tile, 0, y + .027, 0, a, rise / bands + .17, run + 2 * overhang);
      if (i > 0) {
        for (const side of [-1, 1]) {
          const shoulder = Math.min(a / 2 - .18, (span + 2 * overhang) / bands * .59);
          if (shoulder > .04) {
            runBlock(i % 4 === 0 ? shadedSnow : snow, side * (a / 2 - shoulder / 2 - .06),
              y + rise / bands / 2 + .075, .01, shoulder, .16, run + 2 * overhang - .17);
          }
        }
      } else {
        for (const side of [-1, 1]) {
          runBlock(beam, 0, y - .19, side * (run / 2 + overhang - .07), a, .18, .24);
        }
      }
    }
    runBlock(tile, 0, eave + rise + .053, 0, .42, .22, run + 2 * overhang + .14);
    runBlock(snow, 0, eave + rise + .18, 0, .37, .10, run + 2 * overhang + .09);
    // The sloped faces above extend beyond the wall. Expose the gable boards just beyond the end wall.
    for (let i = 0; i < bands; i++) {
      const face = span * (1 - (i + .37) / bands);
      for (const side of [-1, 1]) {
        runBlock(cladding, 0, eave + (i + .5) * rise / bands, side * (run / 2 + overhang + .015), face,
          rise / bands + .015, .04);
      }
    }
  }

  function slopedCanopy(x: number, z: number, span: number, y: number, depth: number) {
    for (let step = 0; step < 4; step++) {
      const run = depth / 4;
      const offset = run * (step + .5);
      add(tile, x, y - step * .13, z + offset, span + step * .065, .165, run + .09);
      add(step === 3 ? shadedSnow : snow, x, y - step * .13 + .105, z + offset, span - .13, .079, run + .015);
    }
    add(beam, x, y - .44, z + depth - .045, span + .37, .16, .18);
  }

  function sideWindows(y: number, tall = 1.25) {
    for (const facing of [1, 3] as const) {
      const x = width / 2 * (facing === 1 ? 1 : -1);
      for (const z of [-depth * .24, depth * .23]) {
        windowAt(x, y, z, Math.min(1.5, depth * .23), tall, facing);
      }
    }
    for (const x of [-width * .27, width * .27]) windowAt(x, y, back, Math.min(1.55, width * .24), tall, 2);
  }

  if (style === 'alpine') {
    const eave = variant % 2 === 0 ? 5.48 : 4.35;
    const rise = Math.min(5.1, w * .48);
    plinth(0, 0, w, d);
    add(wall, 0, eave / 2 + .12, 0, w, eave - .18, d);
    for (const z of [front, back]) {
      for (const x of [-w / 2 + .09, w / 2 - .09]) add(beam, x, eave / 2, z, .29, eave, .30);
      for (let y = .67; y < 2.89; y += .38) add(beam, 0, y, z, w, .056, .085);
      for (const y of [2.94, eave - .16]) add(beam, 0, y, z, w + .07, .23, .28);
    }
    for (const side of [-1, 1]) {
      for (let y = .67; y < 2.9; y += .38) add(beam, side * w / 2, y, 0, .085, .052, d);
      windowAt(side * w * .27, 1.69, front, Math.min(w * .23, 1.8), 1.25, 0);
      const shutter = side * (w * .27 + Math.min(w * .117, .91) + .28);
      add(accent, shutter, 1.72, front + .164, .42, 1.24, .14);
      if (eave > 5) windowAt(side * w * .26, 4.15, front, Math.min(w * .22, 1.75), 1.38, 0);
    }
    sideWindows(1.72);
    if (eave > 5) sideWindows(4.15, 1.37);
    door(0, front, Math.min(1.58, w * .25));
    stoop(0, front, Math.min(1.9, w * .30));
    if (eave > 5) {
      const balconyWidth = w * .78;
      add(beam, 0, 3.05, front + .54, balconyWidth, .23, 1.18);
      add(shadedSnow, 0, 3.18, front + .55, balconyWidth - .04, .059, 1.13);
      add(beam, 0, 4.04, front + 1.06, balconyWidth + .07, .14, .14);
      for (let x = -balconyWidth / 2; x <= balconyWidth / 2; x += .45) add(trim, x, 3.62, front + 1.04, .092, .90, .10);
    }
    gable(0, 0, w, d, eave, rise, 'z', .79, trim);
    windowAt(0, eave + Math.min(.95, rise * .32), front + .82, Math.min(1.32, w * .2), .79, 0, 2);
    for (const z of [front, back]) add(beam, 0, eave + rise * .64, z + Math.sign(z) * .82, .18, rise * .54, .13);
    chimney(-w * .24, eave + rise * .42, back * .43, rise * .44 + .88);
    lantern(-w * .22, 2.72, front + .59);
  }

  if (style === 'courtyard') {
    const wingWidth = w * .25;
    const wingDepth = d * .82;
    const wing = w * .373;
    const wingZ = (d - wingDepth) / 2;
    const middleWidth = w - 2 * wingWidth;
    const recessed = front - Math.min(d * .22, 2.8);
    const highest = variant % 2 === 0 ? 5.7 : 5.1;
    add(masonry, 0, .19, 0, w + .18, .38, d + .19);
    add(wall, 0, highest / 2 + .12, (recessed + back) / 2, middleWidth, highest - .20, recessed - back);
    add(trim, 0, 3.04, recessed, middleWidth + .1, .22, .21);
    const gateWidth = Math.min(middleWidth * .62, 2.45);
    door(0, recessed, gateWidth);
    stoop(0, recessed, gateWidth + .55);
    slopedCanopy(0, recessed, middleWidth * .94, 3.68, 1.05);
    const stoneStep = d < 8 ? .44 : .61;
    for (let z = recessed + .73; z < front + .35; z += stoneStep) {
      add(variant % 2 === 0 ? '#8894a6' : '#a1a3af', 0, .403, z, gateWidth + .75, .061, stoneStep * .93);
    }
    gable(0, (recessed + back) / 2, recessed - back, middleWidth, highest, Math.min(1.72, d * .23), 'x', .55, trim);
    for (const side of [-1, 1]) {
      const x = side * wing;
      plinth(x, wingZ, wingWidth, wingDepth);
      add(wall, x, 2.28, wingZ, wingWidth, 3.86, wingDepth);
      add(masonry, x, .64, front, wingWidth, .49, .22);
      windowAt(x, 2.05, front, Math.min(wingWidth * .62, 1.38), 1.42, 0, 3);
      windowAt(x, 2.04, wingZ - wingDepth / 2, Math.min(wingWidth * .65, 1.39), 1.33, 2, 3);
      windowAt(side * w / 2, 1.98, wingZ + wingDepth * .19, Math.min(wingDepth * .23, 1.39), 1.37, side === 1 ? 1 : 3, 3);
      gable(x, wingZ, wingDepth, wingWidth, 4.26, 1.42, 'x', .51, beam);
      // Horse-head parapet at each outer wall rises toward the roof ridge.
      for (let s = 0; s < 4; s++) {
        const run = wingDepth * (1 - s * .23) + .22;
        const y = 4.38 + s * .51;
        add(wall, side * (w / 2 + .18), y, wingZ, .59, .65, run);
        add(tile, side * (w / 2 + .19), y + .34, wingZ, .74, .16, run + .23);
        add(snow, side * (w / 2 + .19), y + .45, wingZ, .66, .08, run + .19);
      }
      lantern(side * (middleWidth * .34), 2.83, recessed + .48, .43);
    }
    windowAt(0, 4.13, recessed, Math.min(middleWidth * .58, 2.06), 1.21, 0, 4);
  }

  if (style === 'machiya') {
    plinth(0, 0, w, d);
    const eave = variant % 2 === 0 ? 5.82 : 5.24;
    const rise = Math.min(2.35, d * .25);
    add(wall, 0, eave / 2 + .18, 0, w, eave - .17, d);
    for (const z of [front, back]) {
      for (let x = -w / 2 + .18; x < w / 2; x += .44) add(beam, x, eave / 2 + .18, z + Math.sign(z) * .043, .075, eave - .4, .11);
      for (const y of [3.08, eave - .22]) add(beam, 0, y, z, w + .10, .29, .31);
    }
    for (const side of [-1, 1]) {
      add(beam, side * (w / 2 - .15), eave / 2 + .12, front + .17, .29, eave - .23, .44);
      const x = side * w * .274;
      windowAt(x, 1.76, front, Math.min(2.35, w * .285), 1.65, 0, 8);
      windowAt(x, (eave + 3.4) / 2, front, Math.min(2.22, w * .26), 1.17, 0, 6);
      add(accent, x, 2.47, front + .32, Math.min(2.57, w * .31), .33, .18);
      for (let i = 1; i <= 5; i++) {
        const offset = (i - 3) * Math.min(w * .04, .33);
        add(trim, x + offset, 2.48, front + .432, .076, .17, .04);
      }
    }
    sideWindows(1.74, 1.39);
    sideWindows((eave + 3.4) / 2, 1.12);
    door(0, front, Math.min(1.42, w * .24));
    stoop(0, front, Math.min(1.64, w * .27));
    slopedCanopy(0, front, w, 3.26, 1.13);
    gable(0, 0, d, w, eave, rise, 'x', .82, beam);
    for (const side of [-1, 1]) {
      const x = side * w * .41;
      lantern(x, 2.62, front + .71, .32);
      add(beam, x, .78, front + .80, .25, 1.56, .26);
      add(trim, x, .16, front + .8, .34, .32, .35);
    }
  }

  if (style === 'shop') {
    const eave = variant % 2 === 0 ? 6.05 : 5.28;
    plinth(0, 0, w, d);
    add(wall, 0, eave / 2 + .16, 0, w, eave - .21, d);
    for (let y = .68; y <= eave - .12; y += .33) {
      for (const s of [-1, 1]) {
        add(beam, 0, y, front * s, w, .041, .069);
        add(beam, w / 2 * s, y, 0, .061, .041, d);
      }
      if (Math.round(y * 10) % 2 === 0) {
        for (const s of [-1, 1]) add(trim, s * (w / 2 - .19), y + .10, front + .047, .41, .19, .14);
      }
    }
    add(trim, 0, 3.13, front + .106, w + .17, .27, .35);
    const shopWindow = Math.min(w * .53, 4.05);
    const shopX = -w * .18;
    const gateX = w * .31;
    windowAt(shopX, 1.70, front + .11, shopWindow, 1.72, 0, 5);
    for (let it = 0; it < 6; it++) {
      const x = shopX + (it - 2.5) * shopWindow / 6.7;
      add(it % 2 === 0 ? '#bb5b51' : '#e6b974', x, 1.22 + .04 * (it % 3), front + .328, .22, .31 + .10 * (it % 3), .05);
    }
    add(accent, shopX, 2.94, front + .136, shopWindow + .46, .33, .25);
    slopedCanopy(shopX, front, shopWindow + .7, 2.79, .91);
    door(gateX, front, Math.min(1.33, w * .22));
    stoop(gateX, front, Math.min(1.53, w * .25));
    lantern(gateX, 2.99, front + .49, .37);
    for (const x of [-w * .29, 0, w * .29]) {
      const y = 4.08 + (eave - 5.28) * .48;
      windowAt(x, y, front, Math.min(1.52, w * .21), 1.30, 0);
      add(trim, x, y + .76, front + .116, Math.min(1.68, w * .24), .17, .25);
    }
    sideWindows(1.83, 1.39);
    sideWindows(4.3, 1.21);
    add(beam, 0, eave + .03, 0, w + .61, .29, d + .61);
    add(snow, 0, eave + .22, 0, w + .53, .12, d + .50);
    add(wall, 0, eave + .39, front - .03, w, .69, .39);
    add(trim, 0, eave + .78, front - .03, w + .15, .20, .48);
    add(shadedSnow, 0, eave + .91, front, w + .08, .11, .47);
    const rise = 1.1 + (variant % 2 === 0 ? .35 : 0);
    for (let step = 0; step < 3; step++) {
      const a = w * (.57 - .15 * step);
      const y = eave + .83 + (step + .5) * rise / 3;
      add(wall, 0, y, front - .04, a, rise / 3, .51);
      add(trim, 0, y + rise / 6, front - .02, a + .16, .16, .59);
      add(snow, 0, y + rise / 6 + .11, front, a + .14, .087, .52);
    }
    for (const side of [-1, 1]) {
      add(beam, side * (w / 2 - .24), eave + .66, front, .44, .93, .49);
      add(snow, side * (w / 2 - .24), eave + 1.18, front, .55, .13, .59);
    }
    chimney(w * .29, eave + .15, back * .48, 1.47);
  }

  const dummy = new Object3D();
  const color = new Color();
  for (const [blocks, material] of [[pieces, blockMaterial], [windows, glowMaterial]] as const) {
    if (blocks.length === 0) continue;
    const mesh = new InstancedMesh(geometry, material, blocks.length);
    blocks.forEach((block, i) => {
      dummy.position.set(...block.center);
      dummy.scale.set(...block.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(block.color));
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
