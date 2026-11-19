import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { housePortalPlaque } from './town-house-portals';

export type HousingStyle = 'alpine' | 'courtyard' | 'machiya' | 'shop';
export type DistrictTheme = 'forest' | 'memorial' | 'market' | 'lakeside';
export type CentralResidentialCard = 6 | 8 | 9 | 11 | 12 | 13 | 15 | 19 | 20;

const districtHousingCards = {
  forest: [
    { roof: 'gable', window: 'lattice' },
    { roof: 'hip', window: 'sash' },
    { roof: 'cross-gable', window: 'casement' },
  ],
  memorial: [
    { roof: 'clerestory', window: 'picture' },
    { roof: 'twin-clerestory', window: 'sash' },
    { roof: 'parapet', window: 'casement' },
  ],
  market: [
    { roof: 'stepped-parapet', window: 'lattice' },
    { roof: 'parapet', window: 'sash' },
    { roof: 'pavilion', window: 'casement' },
  ],
  lakeside: [
    { roof: 'hip', window: 'picture' },
    { roof: 'gable', window: 'casement' },
    { roof: 'cross-gable', window: 'sash' },
  ],
} as const;

export function districtHousingCard<T extends DistrictTheme>(theme: T, variant: number): typeof districtHousingCards[T][number] {
  return districtHousingCards[theme][Math.abs(Math.trunc(variant)) % districtHousingCards[theme].length];
}

export const districtWindowPanes = { picture: 1, sash: 2, casement: 3, lattice: 4 } as const;

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

export function buildDistrictHousing(
  style: HousingStyle, width: number, depth: number, variant: number, theme?: DistrictTheme,
  centralCard?: CentralResidentialCard, cardVariant = variant,
): Group {
  const group = new Group();
  const pieces: Block[] = [];
  const windows: Block[] = [];
  const paletteIndex = centralCard === 13 ? 2 : Math.abs(Math.trunc(variant)) % 3;
  const basePalette = styles[style][paletteIndex];
  const facingTheme = theme ?? (style === 'shop' ? 'market' : style === 'courtyard' ? 'memorial' : 'forest');
  const facingPalette = centralCard === 8 ? ['#c6b9ad', '#61554e', '#cfc2b6', '#695d5b', '#8a6860']
    : districtPalettes[facingTheme];
  const [wall, beam, trim, tile, accent] = facingPalette.map((color, i) =>
    '#' + new Color(basePalette[i]).lerp(new Color(color), theme ? .82 : centralCard === 8 ? .67 : .23).getHexString());
  const w = width;
  const d = depth;
  const front = d / 2;
  const back = -front;
  const glassPalette = theme === 'lakeside' ? ['#b9dbec', '#d1e6ed', '#a7cfe4']
    : theme === 'memorial' ? ['#e0e3d5', '#d1e2ea', '#c6d1da'] : ['#ffc181', '#ffd3a1', '#ffbc76'];
  const glow = glassPalette[Math.abs(Math.trunc(variant)) % 3];
  const masonry = theme === 'lakeside' ? '#758892' : style === 'courtyard' ? '#8a919d' : '#66717e';

  function add(color: string, x: number, y: number, z: number, a: number, h: number, b: number, lit = false) {
    (lit ? windows : pieces).push({ color, center: [x, y, z], size: [a, h, b] });
  }

  function wallShell(x: number, y: number, z: number, span: number, height: number, run: number) {
    const thickness = .22;
    for (const side of [-1, 1]) {
      add(wall, x, y, z + side * (run - thickness) / 2, span, height, thickness);
      add(wall, x + side * (span - thickness) / 2, y, z, thickness, height, run - 2 * thickness);
    }
  }

  function residentialWall(x: number, y: number, z: number, span: number, height: number, run: number) {
    if (centralCard === undefined) add(wall, x, y, z, span, height, run);
    else wallShell(x, y, z, span, height, run);
  }

  // Window depth is measured outward from its wall, so all four elevations use the same trim.
  function windowAt(
    x: number, y: number, z: number, size: number, tall: number, facing: 0 | 1 | 2 | 3, lattice = 2,
    frame: 'lattice' | 'sliding' | 'shoji' = 'lattice',
  ) {
    const local = (color: string, u: number, v: number, out: number, a: number, b: number, thickness: number, lit = false) => {
      if (facing === 0) add(color, x + u, y + v, z + out, a, b, thickness, lit);
      if (facing === 1) add(color, x + out, y + v, z - u, thickness, b, a, lit);
      if (facing === 2) add(color, x - u, y + v, z - out, a, b, thickness, lit);
      if (facing === 3) add(color, x - out, y + v, z + u, thickness, b, a, lit);
    };
    local(beam, 0, 0, .07, size + .24, tall + .22, .18);
    local(frame === 'shoji' ? '#f2d6ae' : glow, 0, 0, .17, size, tall, .047, true);
    for (let i = 1; i < lattice; i++) {
      local(beam, (i / lattice - .5) * size, 0, .218, frame === 'shoji' ? .13 : .077, tall, .045);
    }
    if (lattice > 1) local(beam, 0, -.04, .219, size, .083, .05);
    if (frame === 'sliding') {
      local(trim, 0, tall / 2, .28, size + .12, .095, .10);
      local(trim, 0, -tall / 2, .28, size + .12, .095, .10);
      for (const side of [-1, 1]) {
        local(beam, side * size * .04, 0, .273, .093, tall, .08);
        local(accent, side * size * .34, tall * .30, .194, size * .30, tall * .40, .039);
        local(trim, side * size * .07, -.05, .325, .086, .20, .05);
      }
    } else if (frame === 'shoji') {
      for (const side of [-1, 1]) {
        local(trim, 0, side * tall * .23, .231, size, .065, .055);
        local(beam, side * size / 2, 0, .232, .16, tall, .08);
      }
      local(beam, 0, -tall * .39, .242, size, tall * .22, .072);
    }
    local(trim, 0, -tall / 2 - .12, .19, size + .36, .14, .34);
    if (theme) local(shadedSnow, 0, -tall / 2 - .042, .19, size + .30, .045, .29);
  }

  function door(x: number, z: number, size: number, y = .28) {
    group.userData.houseDoorEast = x;
    const boardDoor = centralCard === 20;
    const plaqueScale = boardDoor ? 1.24 : 1;
    const plaqueAnchor = housePortalPlaque[0];
    for (const mark of housePortalPlaque) {
      add(mark.color, x + mark.x + (mark.x - plaqueAnchor.x) * (plaqueScale - 1),
        y + 1.05 + mark.y + (mark.y - plaqueAnchor.y) * (plaqueScale - 1), z + .385 + mark.z,
        mark.w * plaqueScale, mark.h * plaqueScale, mark.d);
    }
    add(beam, x, y + 1.18, z + .09, size + .35, 2.36, .23);
    if (boardDoor) {
      for (const side of [-1, 1]) {
        add(accent, x + side * size / 4, y + 1.08, z + .235, size / 2 - .055, 2.14, .12);
        for (const offset of [-.13, 0, .13]) {
          add(beam, x + (side / 4 + offset) * size, y + 1.08, z + .307, .042, 2.12, .035);
        }
        for (const hingeY of [.56, 1.58]) {
          add(trim, x + side * size * .37, y + hingeY, z + .316, size * .22, .077, .08);
        }
        add(trim, x + side * .19, y + 1.06, z + .36, .115, .15, .086);
      }
    } else {
      add(accent, x, y + 1.08, z + .235, size, 2.16, .12);
      add(beam, x, y + 1.15, z + .305, .09, 2.14, .04);
      for (const side of [-1, 1]) {
        add(trim, x + side * .22, y + 1.06, z + .35, .10, .12, .08);
        add(glow, x + side * size * .30, y + 1.63, z + .306, size * .29, .53, .04, true);
      }
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
    overhang = .83, cladding: string = wall, hippedEnd = 0) {
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
      // Hip the lower end faces, then hold their depth so the upper faces read as a gable.
      const endInset = hippedEnd * Math.min(fraction * 2, 1);
      const courseRun = run + 2 * overhang - 2 * endInset;
      if (centralCard === undefined) {
        runBlock(cladding, 0, y - .035, 0, fill, rise / bands + .025, Math.min(run, courseRun));
        runBlock(tile, 0, y + .027, 0, a, rise / bands + .17, courseRun);
      } else {
        const edge = Math.min(a / 2, (span + 2 * overhang) / bands * .58);
        for (const side of [-1, 1]) {
          runBlock(tile, side * (a - edge) / 2, y + .027, 0, edge, rise / bands + .17, courseRun);
        }
        if (hippedEnd && a > 2 * edge) {
          const end = Math.min(courseRun / 2, hippedEnd / bands * 2.1);
          for (const side of [-1, 1]) {
            runBlock(tile, 0, y + .027, side * (courseRun - end) / 2, a - 2 * edge, rise / bands + .17, end);
          }
        }
      }
      if (i > 0) {
        for (const side of [-1, 1]) {
          const shoulder = Math.min(a / 2 - .18, (span + 2 * overhang) / bands * .59);
          if (shoulder > .04) {
            runBlock(i % 4 === 0 ? shadedSnow : snow, side * (a / 2 - shoulder / 2 - .06),
              y + rise / bands / 2 + .075, .01, shoulder, .16, courseRun - .17);
          }
        }
      } else {
        for (const side of [-1, 1]) {
          runBlock(beam, 0, y - .19, side * (run / 2 + overhang - .07), a, .18, .24);
        }
      }
    }
    const ridgeRun = run + 2 * overhang - 2 * hippedEnd;
    runBlock(tile, 0, eave + rise + .053, 0, .42, .22, ridgeRun + .14);
    runBlock(snow, 0, eave + rise + .18, 0, .37, .10, ridgeRun + .09);
    // The sloped faces above extend beyond the wall. Expose the gable boards just beyond the end wall.
    for (let i = 0; i < bands; i++) {
      const fraction = (i + .37) / bands;
      const face = span * (1 - fraction);
      const endInset = hippedEnd * Math.min(fraction * 2, 1);
      for (const side of [-1, 1]) {
        runBlock(cladding, 0, eave + (i + .5) * rise / bands, side * (run / 2 + overhang - endInset + .015),
          face, rise / bands + .015, .04);
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

  function stackWood(x: number, z: number, depth = .63) {
    for (let row = 0; row < 3; row++) {
      for (let log = 0; log < 4 - row; log++) {
        const left = x + (log - (3 - row) / 2) * .24;
        const y = .32 + row * .18;
        add(beam, left, y, z, .22, .165, depth);
        add(trim, left, y, z + depth / 2 + .011, .17, .126, .03);
      }
    }
  }

  function dryingRack(x: number, z: number) {
    for (const side of [-1, 1]) add(beam, x + side * .48, .94, z, .10, 1.88, .13);
    add(beam, x, 1.76, z, 1.12, .077, .09);
    for (const side of [-1, 1]) {
      add(side === -1 ? accent : trim, x + side * .25, 1.36, z + .08, .36, .73, .08);
    }
  }

  function waterJar(x: number, z: number) {
    add(masonry, x, .14, z, .65, .28, .28);
    add(beam, x, .44, z, .63, .32, .27);
    add(trim, x, .65, z, .52, .13, .24);
    add('#748a9d', x, .725, z, .43, .027, .19);
  }

  function lowFence(x: number, z: number) {
    for (const side of [-1, 1]) add(beam, x + side * .40, .37, z, .12, .74, .12);
    for (const y of [.25, .52]) add(trim, x, y, z, .90, .11, .09);
    add(shadedSnow, x, .599, z, .88, .04, .11);
  }

  function planter(x: number, z: number) {
    add(beam, x, .18, z, .64, .36, .25);
    add(masonry, x, .374, z, .55, .04, .22);
    for (const side of [-1, 1]) {
      add('#527362', x + side * .13, .46, z, .19, .20, .14);
      add(shadedSnow, x + side * .13, .574, z, .12, .04, .13);
    }
  }

  function finishFrontage(entryX: number, frontage: number) {
    const side = entryX > 0 ? -1 : 1;
    const x = side * w * .38;
    // Keep the furnishing off the existing centered approach and inside the front setback.
    if (centralCard === 11) {
      lowFence(-x, frontage + .13);
      return;
    }
    stackWood(x, frontage + .13, .21);
    waterJar(x - side * 1.02, frontage + .12);
    if (centralCard === 19) return; // The projecting sign is its third frontage category.
    planter(x - side * 1.88, frontage + .13);
  }

  function sideWindows(y: number, tall = 1.25) {
    for (const facing of [1, 3] as const) {
      const x = width / 2 * (facing === 1 ? 1 : -1);
      for (const z of [-depth * .24, depth * .23]) {
        const sliding = centralCard === 6;
        windowAt(x, y, z, Math.min(1.5, depth * .23), tall, facing, sliding ? 4 : 2, sliding ? 'sliding' : 'lattice');
      }
    }
    for (const x of [-width * .27, width * .27]) windowAt(x, y, back, Math.min(1.55, width * .24), tall, 2);
  }

  // The four expansion elevations are rebuilt within the original lot envelope.
  // Every piece enters the existing opaque or emissive instance batch.
  function districtSnowRoof(
    roof: 'gable' | 'hip' | 'cross-gable', eave: number, rise: number, edge: number, cladding: string,
    paneCount: number,
  ) {
    if (roof === 'cross-gable') {
      gable(0, 0, d, w, eave, rise, 'x', edge, cladding);
      const span = Math.min(w * .42, d * .49);
      const run = d * .40;
      const streetGable = front - run / 2;
      gable(0, streetGable, span, run, eave, rise * .63, 'z', edge, cladding);
      windowAt(0, eave + rise * .24, front + edge, span * .48, .82, 0, paneCount);
    } else if (roof === 'hip') {
      gable(0, 0, w, d, eave, rise, 'z', edge, cladding, Math.min(w * .26, d * .31));
    } else {
      gable(0, 0, w, d, eave, rise, 'z', edge, cladding);
      windowAt(0, eave + rise * .29, front + edge, Math.min(1.90, w * .22), .89, 0, paneCount);
    }
  }

  function themedFacing(district: DistrictTheme) {
    const split = Math.abs(variant % 3);
    const card = districtHousingCard(district, cardVariant);
    const panes = districtWindowPanes[card.window];
    const eave = district === 'forest' ? 4.55 + split * .56
      : district === 'lakeside' ? 4.5 + split * .52
      : district === 'memorial' ? 4.62 + split * .68 : 5.5 + split * .4;
    const entry = Math.min(1.65, w * .22);
    plinth(0, 0, w, d);
    add(wall, 0, (eave + .38) / 2, 0, w, eave - .38, d);
    door(0, front, entry);
    stoop(0, front, entry + .16);

    for (const facing of [1, 3] as const) {
      const x = (facing === 1 ? 1 : -1) * w / 2;
      for (const z of [-d * .25, d * .24]) {
        windowAt(x, 2, z, Math.min(1.62, d * .22), 1.38, facing, panes);
      }
    }
    for (const sign of [-1, 1]) {
      windowAt(sign * w * .27, 2, back, Math.min(1.7, w * .24), 1.36, 2, panes);
      lantern(sign * (entry / 2 + .58), 2.51, front + .4, .31);
    }
    const frontageX = w * .38;
    if (district === 'forest') {
      stackWood(-frontageX, front + .10, .19);
      waterJar(frontageX, front + .10);
    } else if (district === 'market') {
      lowFence(-frontageX, front + .12);
      waterJar(frontageX, front + .10);
    } else {
      lowFence(-frontageX, front + .12);
      planter(frontageX, front + .10);
    }

    if (district === 'forest') {
      // Horizontal timber courses wrap every side. Pale end-grain separates the lap joints.
      for (let y = .57, row = 0; y < eave - .18; y += .41, row++) {
        const log = row % 3 === 0 ? beam : trim;
        for (const sign of [-1, 1]) {
          add(log, 0, y, sign * (front + .028), w + .22, .21, .22);
          add(log, sign * (w / 2 + .026), y, 0, .22, .20, d + .18);
          if (row % 2 === 0) add(trim, sign * (w / 2 + .075), y, front + .148, .27, .17, .07);
        }
      }
      const porchWidth = Math.min(4.92, w * .64);
      slopedCanopy(0, front, porchWidth, 3.16, 1.05);
      for (const sign of [-1, 1]) {
        add(beam, sign * (porchWidth / 2 - .21), 1.64, front + .89, .24, 3.04, .24);
        windowAt(sign * w * .288, 1.88, front, Math.min(1.9, w * .23), 1.4, 0, panes);
      }
      const rise = Math.min(4.8, w * .41);
      const { roof } = districtHousingCard('forest', cardVariant);
      districtSnowRoof(roof, eave, rise, .72, trim, panes);
      chimney(-w * .23, eave + rise * .52, back * .42, 1.72);
    } else if (district === 'memorial') {
      // Concrete frames, a glazed cantilever, and an offset clerestory define the modern row.
      add(tile, 0, eave + .16, 0, w + .66, .34, d + .58);
      add(snow, 0, eave + .39, 0, w + .56, .13, d + .49);
      if (card.roof === 'parapet') {
        for (const side of [-1, 1]) {
          add(beam, 0, eave + .51, side * (front - .12), w + .25, .34, .29);
          add(shadedSnow, 0, eave + .70, side * (front - .12), w + .25, .06, .33);
          add(beam, side * (w / 2 - .12), eave + .51, 0, .29, .34, d - .32);
        }
      } else {
        const towers = card.roof === 'twin-clerestory' ? [-w * .24, w * .24] : [-w * .24];
        for (const x of towers) {
          add(beam, x, eave + .83, -.12 * d, w * .38, .88, d * .58);
          add(trim, x, eave + 1.34, -.12 * d, w * .40, .15, d * .60);
          add(snow, x, eave + 1.46, -.12 * d, w * .37, .095, d * .56);
          windowAt(x, eave + .83, d * .17, w * .25, .44, 0, panes);
        }
      }
      const canopyWidth = w * .88;
      add(beam, 0, 3.31, front + .54, canopyWidth, .17, 1.15);
      add('#9fbaca', 0, 3.405, front + .53, canopyWidth - .17, .076, 1.00);
      add(shadedSnow, 0, 3.454, front + .23, canopyWidth - .28, .04, .39);
      const glassWidth = Math.min(2.65, w * .28);
      for (const sign of [-1, 1]) {
        const x = sign * w * .269;
        add(trim, sign * (w / 2 - .16), eave / 2, front + .10, .29, eave, .26);
        windowAt(x, 1.84, front, glassWidth, 2.11, 0, panes);
        windowAt(x, (eave + 3.44) / 2, front, glassWidth * .94, Math.min(1.38, eave - 3.5), 0, panes);
      }
      add(beam, 0, eave - .14, front + .1, w + .07, .18, .23);
    } else if (district === 'market') {
      // Three brick arches read at street distance, with front joints tying them into the brickwork.
      for (let y = .55; y < eave - .16; y += .34) {
        for (const sign of [-1, 1]) add(beam, 0, y, sign * (front + .023), w, .032, .056);
      }
      for (const x of [-w * .31, 0, w * .31]) {
        const radius = x === 0 ? entry / 2 + .29 : Math.min(w * .104, 1.35);
        const spring = x === 0 ? 2.67 : 2.30;
        for (const sign of [-1, 1]) {
          add(trim, x + sign * radius, (spring + .38) / 2, front + .145, .20, spring - .38, .28);
          for (let i = 0; i < 4; i++) {
            const angle = (i + .45) * Math.PI / 8;
            add(trim, x + sign * radius * Math.cos(angle), spring + radius * .66 * Math.sin(angle),
              front + .175, .27, .25, .32);
          }
        }
        add(shadedSnow, x, spring + radius * .68, front + .186, .30, .25, .35);
        if (x) windowAt(x, 1.57, front, radius * 1.51, 1.22, 0, panes);
        windowAt(x, eave - 1.23, front, Math.min(1.61, w * .18), 1.30, 0, panes);
      }
      add(tile, 0, eave + .11, 0, w + .61, .28, d + .59);
      add(snow, 0, eave + .30, 0, w + .53, .11, d + .50);
      if (card.roof === 'pavilion') {
        const span = w * .55;
        const run = d * .56;
        add(beam, 0, eave + .60, 0, span, .50, run);
        gable(0, 0, span, run, eave + .84, .66, 'z', .27, wall, run * .21);
      }
      const parapetCourses = card.roof === 'stepped-parapet' ? 3 : 1;
      for (let row = 0; row < parapetCourses; row++) {
        const span = w * (.99 - row * .21);
        add(wall, 0, eave + .41 + row * .35, front - .06, span, .44, .51);
        add(trim, 0, eave + .65 + row * .35, front - .04, span + .14, .13, .61);
        add(shadedSnow, 0, eave + .75 + row * .35, front - .04, span + .09, .07, .54);
      }
      chimney(w * .28, eave + .18, back * .49, 1.44);
    } else {
      // Staggered lake-stone courses sit below tall blue glass and a light, lower roof.
      for (let row = 0; row < 4; row++) {
        const count = 7;
        const span = w / count;
        const offset = row % 2 * span / 2;
        for (let i = 0; i <= count; i++) {
          const start = Math.max(-w / 2, -w / 2 + (i - 1) * span + offset);
          const end = Math.min(w / 2, -w / 2 + i * span + offset);
          if (end - start < .1) continue;
          const tint = ['#8d9597', '#a5a09a', '#bab0a0'][(row + i + split) % 3];
          add(tint, (start + end) / 2, .57 + row * .30, front + .05, end - start - .052, .25, .14);
        }
        for (const sign of [-1, 1]) {
          add(masonry, sign * w / 2, .57 + row * .30, 0, .21, .247, d + .11);
        }
      }
      for (const sign of [-1, 1]) {
        windowAt(sign * w * .272, 2.07, front, Math.min(2.64, w * .27), 2.43, 0, panes);
        add(trim, sign * w * .34, eave - .15, front + .11, w * .25, .16, .20);
      }
      const rise = Math.min(3.5, w * .285);
      const { roof } = districtHousingCard('lakeside', cardVariant);
      districtSnowRoof(roof, eave, rise, .48, wall, panes);
      chimney(-w * .24, eave + rise * .50, back * .44, 1.42);
    }
  }

  if (theme) themedFacing(theme);
  else if (style === 'alpine') {
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
  } else if (style === 'courtyard') {
    const wingWidth = w * .25;
    const wingDepth = d * .82;
    const wing = w * .373;
    const wingZ = (d - wingDepth) / 2;
    const middleWidth = w - 2 * wingWidth;
    const recessed = front - Math.min(d * .22, 2.8);
    const highest = variant % 2 === 0 ? 5.7 : 5.1;
    add(masonry, 0, .19, 0, w + .18, .38, d + .19);
    residentialWall(0, highest / 2 + .12, (recessed + back) / 2, middleWidth, highest - .20, recessed - back);
    if (centralCard !== undefined) finishFrontage(0, front);
    add(trim, 0, 3.04, recessed, middleWidth + .1, .22, .21);
    const gateWidth = Math.min(middleWidth * .62, 2.45);
    door(0, recessed, gateWidth);
    stoop(0, recessed, gateWidth + .55);
    slopedCanopy(0, recessed, middleWidth * .94, 3.68, 1.05);
    const stoneStep = d < 8 ? .44 : .61;
    for (let z = recessed + .73; z < front + .35; z += stoneStep) {
      add(variant % 2 === 0 ? '#8894a6' : '#a1a3af', 0, .403, z, gateWidth + .75, .061, stoneStep * .93);
    }
    const middleRise = Math.min(1.72, d * .23);
    const middleZ = (recessed + back) / 2;
    gable(0, middleZ, recessed - back, middleWidth, highest, middleRise, 'x', .55, trim);
    if (centralCard === 20) {
      for (const side of [-1, 1]) {
        const finialX = side * (middleWidth / 2 + .43);
        add(trim, finialX, highest + middleRise + .09, middleZ, .31, .23, .53);
        add(beam, finialX - side * .25, highest + middleRise + .08, middleZ, .25, .17, .47);
      }
    }
    if (centralCard === 11) {
      stackWood(-middleWidth * .34, recessed + .64);
      dryingRack(middleWidth * .35, recessed + .63);
    }
    for (const side of [-1, 1]) {
      const x = side * wing;
      plinth(x, wingZ, wingWidth, wingDepth);
      residentialWall(x, 2.28, wingZ, wingWidth, 3.86, wingDepth);
      add(masonry, x, .64, front, wingWidth, .49, .22);
      windowAt(x, 2.05, front, Math.min(wingWidth * .62, 1.38), 1.42, 0, 3);
      windowAt(x, 2.04, wingZ - wingDepth / 2, Math.min(wingWidth * .65, 1.39), 1.33, 2, 3);
      windowAt(side * w / 2, 1.98, wingZ + wingDepth * .19, Math.min(wingDepth * .23, 1.39), 1.37, side === 1 ? 1 : 3, 3);
      gable(x, wingZ, wingDepth, wingWidth, 4.26, 1.42, 'x', .51, beam, centralCard === 8 ? wingWidth * .28 : 0);
      if (centralCard !== 8) {
        const curved = centralCard === 11;
        const courses = curved ? 7 : 4;
        // Use the same parapet height for the rounded firewall as for the four-step wall.
        for (let level = 0; level < courses; level++) {
          const fraction = level / courses;
          const profile = curved ? Math.sqrt(1 - fraction * fraction) : 1 - level * .23;
          const run = wingDepth * profile + .22;
          const blockHeight = curved ? .42 : .65;
          const rise = curved ? level * (3 * .51) / (courses - 1) : level * .51;
          const y = 4.38 + rise + (.65 - blockHeight) / 2;
          add(wall, side * (w / 2 + .18), y, wingZ, .59, blockHeight, run);
          add(tile, side * (w / 2 + .19), y + blockHeight / 2 + .015, wingZ, .74, .16, run + .23);
          add(snow, side * (w / 2 + .19), y + blockHeight / 2 + .125, wingZ, .66, .08, run + .19);
        }
      }
      lantern(side * (middleWidth * .34), 2.83, recessed + .48, .43);
    }
    windowAt(0, 4.13, recessed, Math.min(middleWidth * .58, 2.06), 1.21, 0, 4);
  } else if (style === 'machiya') {
    plinth(0, 0, w, d);
    const eave = variant % 2 === 0 ? 5.82 : 5.24;
    const rise = Math.min(2.35, d * .25);
    residentialWall(0, eave / 2 + .18, 0, w, eave - .17, d);
    if (centralCard !== undefined) finishFrontage(0, front);
    for (const z of [front, back]) {
      for (let x = -w / 2 + .18; x < w / 2; x += .44) add(beam, x, eave / 2 + .18, z + Math.sign(z) * .043, .075, eave - .4, .11);
      for (const y of [3.08, eave - .22]) add(beam, 0, y, z, w + .10, .29, .31);
    }
    for (const side of [-1, 1]) {
      add(beam, side * (w / 2 - .15), eave / 2 + .12, front + .17, .29, eave - .23, .44);
      const x = side * w * .274;
      const shoji = centralCard === 15;
      windowAt(x, 1.76, front, Math.min(2.35, w * .285), 1.65, 0, shoji ? 4 : 8, shoji ? 'shoji' : 'lattice');
      windowAt(x, (eave + 3.4) / 2, front, Math.min(2.22, w * .26), 1.17, 0, shoji ? 4 : 6, shoji ? 'shoji' : 'lattice');
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
    if (centralCard === 12) {
      const entrySpan = Math.min(1.64, w * .27) + .65;
      const sideSpan = (w - entrySpan) / 2;
      for (const side of [-1, 1]) slopedCanopy(side * (entrySpan + sideSpan) / 2, front, sideSpan, 3.26, 1.13);
      slopedCanopy(0, front - .04, entrySpan, 3.45, 1.18);
      for (let tileIndex = -3; tileIndex <= 3; tileIndex++) {
        add(trim, tileIndex * entrySpan / 7, 3.04, front + 1.095, entrySpan / 8, .13, .16);
      }
      const dormerSpan = w * .24;
      const dormerRun = d * .26;
      const dormerX = w * .14;
      const dormerZ = front * .60;
      const sill = eave + rise * .40;
      wallShell(dormerX, sill + .32, dormerZ, dormerSpan, .64, dormerRun);
      gable(dormerX, dormerZ, dormerSpan, dormerRun, sill + .64, rise * .32, 'z', .24, trim);
      windowAt(dormerX, sill + .39, dormerZ + dormerRun / 2, dormerSpan * .54, .47, 0, 4);
    } else slopedCanopy(0, front, w, 3.26, centralCard === 15 ? 1.20 : 1.13);
    gable(0, 0, d, w, eave, rise, 'x', .82, beam);
    if (centralCard === 6) {
      for (const side of [-1, 1]) {
        const end = side * (w / 2 + .69);
        const ridge = eave + rise;
        add(beam, end, ridge + .28, 0, .25, .38, .51);
        add(tile, end, ridge + .43, 0, .21, .17, .35);
        for (const shoulder of [-1, 1]) {
          add(trim, end, ridge + .12, shoulder * .23, .26, .16, .19);
        }
      }
    } else if (centralCard === 9) {
      for (const x of [-w * .29, 0, w * .29]) {
        windowAt(x, eave - .43, front + .04, w * .16, .27, 0, 6);
      }
      chimney(w * .31, eave + rise * .46, back * .52, rise * .58 + .46);
    } else if (centralCard === 15) {
      const chainX = w * .42;
      for (let link = 0; link < 8; link++) {
        const y = 2.71 - link * .29;
        const z = front + 1.16;
        add(beam, chainX, y, z, .14, .24, .11);
        add(trim, chainX, y, z + .057, .055, .13, .018);
      }
      add(masonry, chainX, .20, front + 1.07, .40, .26, .36);
    }
    for (const side of [-1, 1]) {
      const x = side * w * .41;
      lantern(x, 2.62, front + .71, .32);
      add(beam, x, .78, front + .80, .25, 1.56, .26);
      add(trim, x, .16, front + .8, .34, .32, .35);
    }
  } else if (style === 'shop') {
    const eave = variant % 2 === 0 ? 6.05 : 5.28;
    plinth(0, 0, w, d);
    residentialWall(0, eave / 2 + .16, 0, w, eave - .21, d);
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
    if (centralCard !== undefined) finishFrontage(gateX, front);
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
    if (centralCard === 19) {
      add(tile, 0, eave + .03, 0, w + 1.38, .29, d + 1.38);
      add(snow, 0, eave + .23, 0, w + 1.26, .12, d + 1.26);
      const coping = '#8c6557';
      for (const side of [-1, 1]) {
        add(beam, 0, eave + .58, side * front, w, .64, .33);
        add(beam, side * w / 2, eave + .58, 0, .33, .64, d - .33);
        add(coping, 0, eave + .95, side * front, w + .31, .23, .47);
        add(coping, side * w / 2, eave + .95, 0, .47, .23, d - .47);
        add(shadedSnow, 0, eave + 1.11, side * front, w + .20, .08, .37);
      }
      const signX = gateX + w * .11;
      add(beam, signX, 3.42, front + .43, .11, .14, .90);
      add(beam, signX, 3.18, front + .70, .07, .42, .066);
      add(beam, signX, 2.77, front + .70, .18, .56, .64);
      add(accent, signX, 2.77, front + .70, .194, .43, .49);
      add(trim, signX, 2.97, front + .70, .21, .11, .54);
    } else {
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
    }
    chimney(w * .29, eave + .15, back * .48, 1.47);
    if (centralCard === 13) {
      chimney(-w * .27, eave + .24, back * .61, 1.26);
      for (let i = 0; i < 7; i++) {
        const length = .17 + (i * 5 % 4) * .055;
        add('#b9d9ea', (i - 3) * w / 8, eave - length / 2, front + .30, .078, length, .087);
      }
    }
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
