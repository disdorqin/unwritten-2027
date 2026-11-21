/** A single-draw voxel kit for B-window sleds and their roadside hire shelters.
 * Units are metres; +Z is the nose, +Y up. One part = one instance of the shared cube.
 * No loose geometry allocations per frame. These are scenery meshes, not new colliders.
 */
export type SledPiece = readonly [
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  color: string,
  roofSlope?: number,
];

function piece(x: number, y: number, z: number, sx: number, sy: number, sz: number,
               color: string, slope?: number): SledPiece {
  return [[x, y, z], [sx, sy, sz], color, slope];
}

const wood = '#784936';
const woodShade = '#573a31';
const bronze = '#bb8852';
const warmSnow = '#e8e4d9';
const freshSnow = '#f4f6f8';
const darkRed = '#984645';
const vermilion = '#b95443';
const tin = '#9cabb0';

/** R1 chassis bulk, R2 remaining joinery, R3 silhouette fixes; only static cuboids. */
export const sledDetailParts: readonly SledPiece[] = (() => {
  const p: SledPiece[] = [];
  // Two bronze-shod runners: forebody curls rise in small voxel steps.
  for (const side of [-1, 1]) {
    const x = side * .30;
    p.push(piece(x, .017, -.05, .10, .045, 1.83, tin));
    p.push(piece(x, .065, -.82, .14, .05, .17, woodShade));
    p.push(piece(x, .1, .91, .12, .10, .21, bronze));
    for (let j = 0; j < 6; j++) {
      p.push(piece(x, .12 + j * .055, .99 + j * .037, .115, .08, .11,
        j % 2 ? bronze : tin));
    }
    // Three transverse bearing brackets under the passenger deck.
    for (const z of [-.49, -.05, .39]) {
      p.push(piece(x, .18, z, .10, .2, .13, woodShade));
      p.push(piece(x, .30, z, .15, .055, .14, bronze));
    }
    // Side rails, red enamel inlay and four exposed joinery pegs.
    p.push(piece(side * .365, .38, -.07, .06, .12, 1.14, woodShade));
    p.push(piece(side * .405, .44, -.07, .025, .034, 1.03, vermilion));
    for (const z of [-.46, -.18, .12, .40]) {
      p.push(piece(side * .392, .40, z, .04, .065, .055, bronze));
    }
    // Swept grab handles behind the seat, kept clear of the driver's sightline.
    p.push(piece(side * .29, .76, -.68, .09, .39, .09, woodShade));
    p.push(piece(side * .29, .95, -.62, .09, .08, .2, bronze));
  }
  // Individually readable wooden deck planks and snow-filled seams.
  for (let j = 0; j < 7; j++) {
    const z = -.51 + j * .155;
    p.push(piece(0, .415, z, .69, .046, .128, j % 2 ? '#9d6542' : '#ad7149'));
    p.push(piece(0, .444, z + .064, .64, .012, .009, woodShade));
  }
  // R4: stepped plank-grain, edge piping and hand-finished hardware. Keep
  // the tread free of raised transverse pieces so the rider's feet still read.
  for (let j = 0; j < 7; j++) {
    const z = -.51 + j * .155;
    p.push(piece(-.23, .441, z - .017, .115, .009, .011,
      j % 3 ? '#bf8556' : '#77503d'));
    p.push(piece(.19, .441, z + .021, .15, .009, .011,
      j % 2 ? '#bd845a' : '#89583d'));
    for (const x of [-.315, .315]) {
      p.push(piece(x, .452, z, .019, .012, .023, bronze));
    }
  }
  for (const side of [-1, 1]) {
    // A laminated silhouette around each curled runner and the tail binding.
    p.push(piece(side * .31, .08, -.52, .024, .025, .86, '#c49a6e'));
    p.push(piece(side * .312, .075, .56, .024, .028, .32, '#bd986e'));
    p.push(piece(side * .31, .14, -.87, .14, .035, .042, darkRed));
    for (const z of [-.67, -.2, .25, .68]) {
      p.push(piece(side * .325, .10, z, .044, .04, .045, tin));
    }
  }
  // Padded bench, lower footrest, slatted back and brass seat nails.
  p.push(piece(0, .49, -.21, .64, .075, .38, '#a64b45'));
  p.push(piece(0, .48, .45, .57, .055, .12, woodShade));
  for (let j = 0; j < 5; j++) {
    p.push(piece(-.235 + j * .1175, .665, -.715, .10, .32, .055,
      j % 2 ? wood : '#915c3b'));
  }
  for (const side of [-1, 1]) {
    p.push(piece(side * .245, .525, -.22, .035, .013, .32, bronze));
    p.push(piece(side * .245, .81, -.746, .04, .04, .065, bronze));
  }
  // Quilted upholstery with fine warm piping instead of a featureless slab.
  for (const z of [-.34, -.22, -.10]) {
    p.push(piece(0, .532, z, .56, .010, .012, '#d07e6b'));
    for (const x of [-.2, 0, .2]) {
      p.push(piece(x, .538, z + .044, .023, .011, .022, bronze));
    }
  }
  for (const x of [-.31, .31]) {
    p.push(piece(x, .535, -.21, .016, .014, .39, '#d7aa78'));
  }
  // Protective front apron, painted crest and a genuine open nose silhouette.
  p.push(piece(0, .37, .585, .60, .15, .065, darkRed));
  p.push(piece(0, .39, .628, .27, .08, .025, bronze));
  p.push(piece(0, .395, .646, .075, .065, .018, warmSnow));
  return p;
})();

/** Roadside depot architecture: timber framing, snow-capped pitched roof,
 * hanging lanterns and small equipment. Open south side remains fully legible.
 */
export const sledDepotParts: readonly SledPiece[] = (() => {
  const p: SledPiece[] = [];
  // Four posts and tenon/beam joints. Shelter extents: 2.3m wide, 2.15m deep.
  for (const x of [-.94, .94]) for (const z of [-.79, .79]) {
    p.push(piece(x, 1.03, z, .13, 2.04, .13, woodShade));
    p.push(piece(x, .14, z, .19, .28, .18, wood));
    p.push(piece(x, 1.90, z, .19, .11, .20, bronze));
    p.push(piece(x * .91, 1.75, z, .09, .29, .14, wood));
  }
  for (const z of [-.79, .79]) {
    p.push(piece(0, 1.94, z, 2.15, .15, .11, wood));
    p.push(piece(0, 2.23, z, .15, .27, .14, bronze));
  }
  for (const x of [-.94, .94]) {
    p.push(piece(x, 1.89, 0, .13, .10, 1.69, wood));
    p.push(piece(x, .17, 0, .10, .09, 1.62, woodShade));
  }
  // R4 clay-town carpentry: visible knee-braces, gable lattice and wooden
  // panel seams, all outside the unobstructed centre entrance.
  for (const side of [-1, 1]) {
    const x = side * .94;
    for (const z of [-.79, .79]) {
      p.push(piece(x - side * .135, 1.74, z, .34, .045, .075, '#a1714c', side * .40));
      p.push(piece(x, 1.74, z - Math.sign(z) * .14, .075, .045, .34, wood));
      p.push(piece(x, 1.39, z, .17, .07, .15, '#b08055'));
    }
    for (const y of [.71, 1.13]) {
      p.push(piece(x, y, -.39, .045, .075, .71, '#a1714c'));
    }
    for (const z of [-.61, -.39, -.17]) {
      p.push(piece(x, .94, z, .045, .48, .04, z === -.39 ? bronze : wood));
    }
    // Snow piled against the closed rear corners; the open front stays empty.
    p.push(piece(side * 1.01, .11, -.77, .32, .11, .25, warmSnow));
  }
  // Two sloping roofs. Exposed tiles are separate rather than a solid snow slab.
  for (const side of [-1, 1]) {
    const slope = -side * .29;
    p.push(piece(side * .57, 2.17, 0, 1.23, .10, 2.13, woodShade, slope));
    p.push(piece(side * .57, 2.23, 0, 1.22, .045, 2.12, '#6e6570', slope));
    for (let j = 0; j < 9; j++) {
      const z = -.92 + j * .23;
      p.push(piece(side * .57, 2.273, z, 1.18, .04, .194,
        j % 3 === 0 ? warmSnow : freshSnow, slope));
    }
    p.push(piece(side * 1.145, 2.03, 0, .09, .12, 2.19, wood));
    p.push(piece(side * 1.14, 2.07, -.96, .09, .09, .12, freshSnow));
    p.push(piece(side * 1.14, 2.07, .96, .09, .09, .12, freshSnow));
    // Individual tile noses and irregular snow drifts define the eave line
    // from ground-level views, without adding draw calls or new materials.
    for (let j = 0; j < 9; j++) {
      const z = -.92 + j * .23;
      p.push(piece(side * .95, 2.108 + (j % 3) * .007, z,
        .13, .026, .185, j % 4 === 0 ? '#e8e4d9' : '#eff3f5', slope));
      if (j % 3 === 0) {
        p.push(piece(side * .73, 2.291, z, .29, .028, .10,
          j === 0 ? warmSnow : freshSnow, slope));
      }
    }
  }
  // Roof ridge and tiny icicles hanging safely above pedestrian head height.
  p.push(piece(0, 2.36, 0, .22, .085, 2.2, freshSnow));
  for (const z of [-.74, -.37, 0, .37, .74]) {
    p.push(piece(0, 2.395, z, .25, .045, .075, warmSnow));
  }
  // Wind-polished eave caps, rafters and a repeated stepped ridge crest.
  for (const z of [-1.015, 1.015]) {
    p.push(piece(0, 2.25, z, .31, .085, .10, wood));
    for (const side of [-1, 1]) {
      p.push(piece(side * .56, 2.08, z, .12, .08, .10, bronze));
      p.push(piece(side * 1.07, 2.035, z, .16, .085, .13, woodShade));
    }
  }
  // Framed signboard and struts on the back gable; opening to the front stays clear.
  p.push(piece(0, 1.61, -.814, .93, .34, .065, wood));
  p.push(piece(0, 1.60, -.855, .83, .22, .035, darkRed));
  for (const x of [-.44, .44]) {
    p.push(piece(x, 1.61, -.854, .035, .32, .075, bronze));
  }
  p.push(piece(0, 1.77, -.864, .95, .055, .09, bronze));
  p.push(piece(0, 1.44, -.864, .95, .055, .09, bronze));
  // Lanterns on either side: rim, distinct shade and hanging tassel.
  for (const x of [-.68, .68]) {
    p.push(piece(x, 1.73, .65, .026, .19, .025, bronze));
    p.push(piece(x, 1.60, .65, .20, .24, .18, vermilion));
    p.push(piece(x, 1.72, .65, .23, .035, .21, bronze));
    p.push(piece(x, 1.48, .65, .23, .035, .21, bronze));
    p.push(piece(x, 1.38, .65, .032, .15, .03, darkRed));
    p.push(piece(x, 1.29, .65, .038, .14, .034, bronze));
  }
  // Back wall only: low supply shelf with crates, shovels and boots.
  p.push(piece(0, .45, -.76, 1.42, .08, .24, wood));
  for (const x of [-.46, 0, .46]) {
    p.push(piece(x, .56, -.76, .30, .22, .23, '#a4744a'));
    p.push(piece(x, .68, -.76, .31, .035, .24, woodShade));
    p.push(piece(x, .59, -.628, .045, .19, .03, bronze));
  }
  p.push(piece(-.73, .56, -.70, .045, 1.09, .045, '#9a8160'));
  p.push(piece(-.73, .11, -.60, .24, .10, .14, tin));
  p.push(piece(.76, .49, -.70, .055, .96, .055, '#9a8160'));
  p.push(piece(.76, .12, -.59, .16, .14, .18, tin));
  // R4 shelf narrative: wrapped spare rope, polished fittings and a wool roll.
  // All placed at the back so that the south-facing walk-in corridor is free.
  for (const x of [-.40, .40]) {
    p.push(piece(x, .76, -.76, .20, .075, .19, '#b68b60'));
    p.push(piece(x, .81, -.76, .18, .035, .17, darkRed));
    for (const z of [-.83, -.72]) {
      p.push(piece(x, .85, z, .16, .023, .027, bronze));
    }
  }
  for (const y of [.26, .35, .44]) {
    p.push(piece(.58, y, -.62, .14, .038, .17, woodShade));
    p.push(piece(.58, y, -.62, .07, .04, .19, bronze));
  }
  for (const x of [-.22, .22]) {
    p.push(piece(x, .93, -.83, .10, .13, .12, '#c3a27f'));
    p.push(piece(x, 1.01, -.83, .11, .025, .13, darkRed));
  }
  return p;
})();
