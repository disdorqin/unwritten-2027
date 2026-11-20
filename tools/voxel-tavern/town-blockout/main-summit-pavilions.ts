import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Box } from './landmark-kit';

export const cloudPavilionDimensions = {
  'lower-cloud': { width: 7, depth: 5, eyeY: 1.65 },
  'upper-cloud': { width: 10, depth: 7, eyeY: 1.65 },
} as const;

export type CloudPavilion = keyof typeof cloudPavilionDimensions;
type Batch = 'stone' | 'wood' | 'tile';
type Point = [number, number, number];
type Piece = { position: Point; size: Point; colour: string };

const darkTimber = '#513632';
const warmTimber = '#795344';
const beamTrim = '#a47952';
const copper = '#c59a5e';
const stoneBase = '#526177';
const stoneCourse = '#798693';
const stoneCap = '#b7c3cc';

/** Local +Z faces the view. The entrance is in the centre of the -Z edge at Y=0. */
export function createCloudPavilion(kind: CloudPavilion): Group {
  const { width, depth } = cloudPavilionDimensions[kind];
  const upper = kind === 'upper-cloud';
  const halfWidth = width / 2, halfDepth = depth / 2;
  const edge = .21;
  const eaveY = upper ? 3.48 : 2.98;
  const postEast = halfWidth - .50;
  const postNorth = halfDepth - .51;
  const postZ = upper ? [-postNorth, 0, postNorth] : [-postNorth, postNorth];
  const pieces: Record<Batch, Piece[]> = { stone: [], wood: [], tile: [] };
  const colliders: Box[] = [];

  function put(batch: Batch, colour: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    pieces[batch].push({ position: [x, y, z], size: [w, h, d], colour });
  }

  function collision(x: number, y: number, z: number, w: number, h: number, d: number) {
    colliders.push({ min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] });
  }

  // The ashlar curb and boarding terminate on the same walking plane.
  put('stone', stoneBase, 0, -.30, 0, width - .15, .25, depth - .15);
  put('stone', stoneCourse, 0, -.14, 0, width, .17, depth);
  for (const sign of [-1, 1]) {
    put('stone', stoneCap, 0, -.0275, sign * (halfDepth - edge / 2), width, .055, edge);
    put('stone', stoneCap, sign * (halfWidth - edge / 2), -.0275, 0, edge, .055, depth - 2 * edge);
  }
  const boardCount = upper ? 21 : 15;
  const boardWidth = (width - 2 * edge) / boardCount;
  const boards = ['#806250', '#8b6c58', '#977661', '#73584b'];
  for (let index = 0; index < boardCount; index++) {
    const x = -halfWidth + edge + (index + .5) * boardWidth;
    const seam = (index % 4 - 1.5) * .22;
    for (const [part, [z0, z1]] of [[-halfDepth + edge, seam], [seam, halfDepth - edge]].entries()) {
      put('wood', boards[(index + part) % boards.length], x, -.0285, (z0 + z1) / 2, boardWidth, .057, z1 - z0);
    }
  }

  for (const side of [-1, 1]) {
    const x = side * postEast;
    for (const z of postZ) {
      put('stone', stoneCourse, x, .075, z, .52, .15, .52);
      put('stone', stoneCap, x, .17, z, .43, .04, .43);
      put('wood', warmTimber, x, (eaveY + .1) / 2, z, .32, eaveY - .22, .32);
      put('wood', darkTimber, x, .39, z, .36, .13, .36);
      put('wood', copper, x, eaveY - .61, z, .35, .055, .35);
      put('wood', darkTimber, x, eaveY - .44, z, .48, .16, .46);
      put('wood', beamTrim, x, eaveY - .34, z, .65, .11, .21);
      put('wood', warmTimber, x, eaveY - .23, z, .26, .15, .81);
      put('wood', darkTimber, x, eaveY - .12, z, .78, .16, .61);
      collision(x, 0, z, .52, eaveY, .52);
    }
    put('wood', darkTimber, x, eaveY - .09, 0, .26, .24, depth + .18);
    put('wood', beamTrim, x, eaveY + .035, 0, .285, .065, depth + .24);

    const railX = side * (halfWidth - .25);
    const railLength = depth - .57;
    put('wood', warmTimber, railX, .26, 0, .13, .12, railLength);
    put('wood', darkTimber, railX, .97, 0, .19, .13, railLength + .06);
    const rails = upper ? 9 : 6;
    for (let index = 0; index <= rails; index++) {
      const z = railLength * (index / rails - .5);
      put('wood', index % 2 ? beamTrim : warmTimber, railX, .61, z, .102, .66, .105);
    }
    collision(railX, 0, 0, .19, 1.035, railLength + .06);

    const benchX = side * (halfWidth - .89);
    const benchLength = upper ? 2.45 : 1.62;
    const benchZ = upper ? .52 : .21;
    for (const z of [benchZ - benchLength * .34, benchZ + benchLength * .34]) {
      put('wood', darkTimber, benchX, .195, z, .41, .39, .14);
    }
    put('wood', beamTrim, benchX, .443, benchZ, .54, .108, benchLength);
    if (upper) put('wood', warmTimber, benchX + side * .245, .70, benchZ, .072, .32, benchLength - .05);
    collision(benchX, 0, benchZ, upper ? .57 : .54, upper ? .86 : .497, benchLength);
  }

  for (const side of [-1, 1]) {
    const z = side * postNorth;
    put('wood', darkTimber, 0, eaveY - .09, z, width + .18, .24, .26);
    put('wood', beamTrim, 0, eaveY + .031, z, width + .28, .07, .29);
    collision(0, eaveY - .21, z, width + .18, .24, .26);
  }

  const tilePalette = ['#344758', '#405668', '#526b7c'];
  if (upper) {
    // The lower ring projects beyond the pavilion and the upper hip retreats to its ridge.
    for (let course = 0; course < 4; course++) {
      const w = width + .83 - course * .39;
      const d = depth + .88 - course * .39;
      const y = eaveY + course * .105 + .10;
      for (const side of [-1, 1]) {
        put('tile', tilePalette[course % 3], 0, y, side * (d / 2 - .58), w, .14, 1.17);
        put('tile', tilePalette[(course + 1) % 3], side * (w / 2 - .56), y, 0, 1.13, .14, d - 2.34);
      }
    }
    put('wood', darkTimber, 0, eaveY + .48, 0, width - 1.18, .22, depth - 1.02);
    for (let course = 0; course < 12; course++) {
      const fraction = course / 11;
      const w = width - .45 - fraction * 4.30;
      const d = depth - .40 - fraction * (depth - .78);
      put('tile', tilePalette[course % 3], 0, eaveY + .61 + course * .12, 0, w, .14, d);
    }
    put('tile', tilePalette[0], 0, eaveY + 2.04, 0, width - 4.53, .23, .40);
    for (const side of [-1, 1]) {
      put('tile', tilePalette[1], side * (width - 4.58) / 2, eaveY + 2.17, 0, .44, .24, .49);
      put('tile', stoneCap, side * (width - 4.58) / 2, eaveY + 2.30, 0, .31, .052, .37);
    }
  } else {
    // The smaller saddle roof is a single stepped sweep, with exposed beam ends.
    const roofWidth = width + .69;
    const run = (depth + .73) / 2;
    const band = run / 10;
    for (const side of [-1, 1]) for (let course = 0; course < 10; course++) {
      put('tile', tilePalette[course % 3], 0, eaveY + .11 + course * .116,
        side * (run - (course + .5) * band), roofWidth, .144, band + .04);
    }
    put('tile', tilePalette[0], 0, eaveY + 1.29, 0, roofWidth + .08, .19, .29);
    for (const side of [-1, 1]) {
      put('tile', tilePalette[1], side * (halfWidth + .28), eaveY + 1.40, 0, .30, .13, .31);
    }
  }

  const group = new Group();
  group.name = `cloud-pavilion-${kind}`;
  const tile = new BoxGeometry(1, 1, 1);
  const mark = new Object3D();
  const colour = new Color();
  for (const batch of Object.keys(pieces) as Batch[]) {
    const material = new MeshLambertMaterial();
    material.name = `cloud-pavilion-${batch}`;
    const mesh = new InstancedMesh(tile, material, pieces[batch].length);
    mesh.name = `${group.name}-${batch}`;
    pieces[batch].forEach((piece, index) => {
      mark.position.set(...piece.position);
      mark.scale.set(...piece.size);
      mark.updateMatrix();
      mesh.setMatrixAt(index, mark.matrix);
      mesh.setColorAt(index, colour.set(piece.colour));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData = {
    colliders,
    floors: [{ min: [-halfWidth, -.425, -halfDepth], max: [halfWidth, 0, halfDepth] }] satisfies Box[],
    postCount: postZ.length * 2,
    roofTiers: upper ? 2 : 1,
  };
  return group;
}
