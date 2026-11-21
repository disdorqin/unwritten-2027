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
  }
  // Roof ridge and tiny icicles hanging safely above pedestrian head height.
  p.push(piece(0, 2.36, 0, .22, .085, 2.2, freshSnow));
  for (const z of [-.74, -.37, 0, .37, .74]) {
    p.push(piece(0, 2.395, z, .25, .045, .075, warmSnow));
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
  return p;
})();
