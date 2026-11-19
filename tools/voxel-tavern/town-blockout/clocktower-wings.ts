import type { Group } from 'three';
import { addTownWindow } from './town-window';

type Box = (kind: string, x: number, y: number, z: number, w: number, h: number, d: number) => void;
type Volume = (x: number, y: number, z: number, w: number, h: number, d: number) => void;
export const towerHallFloor = .3125;
export const towerWingMezzanine = 4.9;
export const towerWingStairWidth = 1.125;
export const towerWingRidge = 11.225;
const frontWindowY = 2.05;
const frontWindowHeight = 3.45;
const frontWindowWidth = 2.125;
const windowEdges = [6.85, 10.45, 14.05];
const westStair = { x: -14.35, begins: 3.6, ends: -3.7, steps: 21 };
const eastStairInnerX = 7.4;
const eastStairOuterX = 14.45;
const eastNorthTurn = -4.48;
const eastSouthTurn = 4.48;
const halfStair = towerWingStairWidth / 2;
const halfLanding = halfStair + .30;
const wingRiser = .21875;

export function buildTowerWingShell(tower: Group, side: number, inner: number, outer: number, depth: number, box: Box,
  solid: Volume, floor: Volume) {
  const span = outer - inner;
  const wall = .45;
  const top = 8.64;
  const wing = (kind: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    box(kind, side > 0 ? x : -x - w, y, z, w, h, d);
  };
  const wallPiece = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    wing('limestone', x, y, z, w, h, d);
    solid(side > 0 ? x : -x - w, y, z, w, h, d);
  };
  wing('blueStone', inner, 0, -depth, span + .25, .25, depth * 2);
  wing('ivory', inner, .25, -depth, span + .25, .0625, depth * 2);
  floor(side > 0 ? inner : -outer - .25, 0, -depth, span + .25, towerHallFloor, depth * 2);
  wallPiece(inner, towerHallFloor, -depth, span, top - towerHallFloor, wall);
  wallPiece(outer - wall, towerHallFloor, -depth, wall, top - towerHallFloor, depth * 2 - wall);
  wallPiece(inner, towerHallFloor, depth - wall, span, frontWindowY - towerHallFloor, wall);
  const upper = frontWindowY + frontWindowHeight;
  wallPiece(inner, upper, depth - wall, span, top - upper, wall);
  let previous = inner;
  for (const edge of windowEdges) {
    const center = edge + frontWindowWidth / 2;
    wallPiece(previous, frontWindowY, depth - wall, edge - previous, frontWindowHeight, wall);
    previous = edge + frontWindowWidth;
    addTownWindow(tower, {
      x: side * center, y: frontWindowY + frontWindowHeight / 2, z: depth - wall / 2,
      // The sashes open into the room, keeping their travel within the plot.
      yaw: Math.PI, width: frontWindowWidth, height: frontWindowHeight, ground: towerHallFloor,
      approach: [side * center, depth - 1.28], style: 'tavern',
    });
    for (const side of [-1, 1]) {
      wing('ivory', center + side * (frontWindowWidth / 2 + .035) - .06, frontWindowY - .12, depth - .15,
        .12, frontWindowHeight + .12, .15);
    }
    wing('blueStone', edge - .075, frontWindowY - .15, depth - .39, frontWindowWidth + .15, .15, .39);
    wing('ivory', edge - .09, upper, depth - .13, frontWindowWidth + .18, .16, .13);
    for (let i = 0; i < 4; i++) {
      const inset = i * .17;
      wing('ivory', center - .90 + inset, upper + .16 + .107 * i, depth - .12, 1.8 - 2 * inset, .107, .12);
      wing('glow', center - .78 + inset, upper + .176 + .107 * i, depth - .033, 1.56 - 2 * inset, .043, .02);
    }
  }
  // End the side return at the back of the front wall so the last sash stays clear to its far jamb.
  wallPiece(previous, frontWindowY, depth - wall, outer - previous, frontWindowHeight, wall);
  for (const [y, kind] of [[1, 'blueStone'], [7.45, 'brass'], [8.48, 'blueStone']] as const) {
    wing(kind, inner, y, depth - .14, span, .24, .14);
  }
}

export function towerWingRoofCourse(depth: number, course: number) {
  const run = depth / 10;
  const edge = depth - course * run;
  return { innerZ: edge - run, outerZ: edge, baseY: 8.68 + course * .254, thickness: .23 };
}

export function buildTowerWingRoof(side: number, inner: number, outer: number, depth: number, box: Box, solid: Volume) {
  const openingMin = eastStairInnerX - halfLanding - .16;
  const openingMax = eastStairInnerX + halfLanding + .16;
  for (let course = 0; course < 10; course++) {
    const { innerZ, outerZ, baseY: y, thickness } = towerWingRoofCourse(depth, course);
    const run = outerZ - innerZ;
    for (const southFace of [false, true]) {
      if (side > 0 && southFace && course >= 6) continue;
      const z = southFace ? innerZ : -outerZ;
      const opening = side > 0 && !southFace && z + run > eastNorthTurn - halfLanding;
      const overCrossing = opening && z < eastNorthTurn + halfStair && z + run > eastNorthTurn - halfStair;
      const crossingEnd = 11;
      const loweredEdge = overCrossing ? crossingEnd : openingMax;
      const sections = opening
        ? [[inner - .15, openingMin, y], [loweredEdge, outer + .5, y]]
        : [[inner - .15, outer + .5, y]];
      // Step the north roof up over the cross-flight while keeping the final stair opening clear.
      if (overCrossing) sections.push([openingMax, crossingEnd, towerWingRidge - .50]);
      for (const [from, to, roofY] of sections) {
        const x = side > 0 ? from : -to;
        box(course % 3 ? 'roof' : 'roofShadow', x, roofY, z, to - from, thickness, run);
        solid(x, roofY, z, to - from, thickness, run);
        for (let snowX = from; snowX < to - .075; snowX += .7) {
          if ((Math.round(snowX * 10) + course) % 4 === 1) continue;
          const size = Math.min(.65, to - snowX);
          box('snowFeather', side > 0 ? snowX : -snowX - size, roofY + thickness, z + .035, size, .12, run - .1);
        }
      }
    }
  }
  if (side < 0) {
    box('roofGlaze', -outer - .45, towerWingRidge, -.18, outer - inner + .55, .23, .36);
  } else {
    box('roofShadow', inner, 10.1, 2.2, outer - inner, towerWingRidge - 10.1, .6);
    solid(inner, 10.1, 2.2, outer - inner, towerWingRidge - 10.1, .6);
  }
}

type Furnishings = {
  box: Box; solid: Volume;
  deck(x0: number, z0: number, x1: number, z1: number, y: number): void;
  guard(x0: number, z0: number, x1: number, z1: number, y: number): void;
  stair(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, w: number, count: number,
    walkRamp?: boolean, innerOpening?: [from: number, to: number]): void;
  gear(x: number, y: number, z: number, radius: number, teeth: number): void;
  lamp(x: number, y: number, z: number): void;
};

export function furnishWestTowerWing({ box, solid, deck, guard, stair, gear, lamp }: Furnishings) {
  const { x, begins, ends, steps } = westStair;
  const southEdge = 5.60;
  deck(-13.65, -5.92, -5.7, southEdge, towerWingMezzanine);
  deck(-15.6, -5.92, -13.65, ends, towerWingMezzanine);
  guard(-13.65, ends, -13.65, southEdge, towerWingMezzanine);
  stair(x, begins, x, ends, towerHallFloor, (towerWingMezzanine - towerHallFloor) / steps, towerWingStairWidth, steps);
  for (const [height, y] of [[towerHallFloor, 1.75], [towerWingMezzanine, 1.03]]) {
    box('wood', -13.25, height + .32, -5.86, 5.7, 2.6, .26);
    gear(-11.90, height + 1.46, -5.51, .90625, 28);
    gear(-10.32, height + 1.52, -5.47, .625, 22);
    gear(-9.25, height + 1.98, -5.45, .46875, 16);
    box('oakEnd', -13.42, height + .24, -5.77, 6, .16, .47);
    lamp(-8.05, height + y, -5.34);
  }
  box('wood', -12.8, towerHallFloor, 2.1, 2.05, .81, .70);
  box('oakEnd', -12.85, towerHallFloor + .81, 2.06, 2.15, .10, .78);
  solid(-12.85, towerHallFloor, 2.06, 2.15, .91, .78);
  box('copperDark', -12.54, towerHallFloor + .91, 2.18, .30, .29, .42);
  box('iron', -12.36, towerHallFloor + 1.07, 2.27, 1.15, .105, .105);
  for (const x of [-11.68, -11.48, -11.29]) box('oakEnd', x, towerHallFloor + .91, 2.29, .095, .16, .29);
}

export function furnishEastTowerWing({ box, deck, guard, stair, lamp }: Furnishings) {
  const landing = (x: number, z: number, y: number) => deck(x - halfLanding, z - halfLanding, x + halfLanding, z + halfLanding, y);
  const firstY = towerHallFloor + 12 * wingRiser;
  const secondY = firstY + 12 * wingRiser;
  const thirdY = secondY + 12 * wingRiser;
  stair(eastStairInnerX, eastSouthTurn, eastStairOuterX - halfLanding, eastSouthTurn,
    towerHallFloor, wingRiser, towerWingStairWidth, 12);
  landing(eastStairOuterX, eastSouthTurn, firstY);

  // The ninth tread on the east run opens as a real transfer platform at the mezzanine.
  const mezzNorth = -2.10, mezzSouth = -.96;
  const mezzStep = firstY + 9 * wingRiser;
  const mezzEdge = 13.78;
  const [shelfWest, shelfNorth, shelfSouth] = [8.09, -3.62, 3.62];
  deck(shelfWest, shelfNorth, mezzEdge, shelfSouth, towerWingMezzanine);
  deck(mezzEdge, mezzNorth, eastStairOuterX + halfStair, mezzSouth, mezzStep);
  guard(shelfWest, shelfNorth, mezzEdge, shelfNorth, towerWingMezzanine);
  guard(shelfWest, shelfSouth, mezzEdge, shelfSouth, towerWingMezzanine);
  guard(shelfWest, shelfNorth, shelfWest, shelfSouth, towerWingMezzanine);
  guard(mezzEdge, shelfNorth, mezzEdge, mezzNorth, towerWingMezzanine);
  guard(mezzEdge, mezzSouth, mezzEdge, shelfSouth, towerWingMezzanine);
  guard(eastStairOuterX + halfStair, mezzNorth, eastStairOuterX + halfStair, mezzSouth, mezzStep);
  stair(eastStairOuterX, eastSouthTurn - halfLanding, eastStairOuterX, mezzSouth,
    firstY, wingRiser, towerWingStairWidth, 8);
  stair(eastStairOuterX, mezzNorth, eastStairOuterX, eastNorthTurn + halfLanding,
    mezzStep, wingRiser, towerWingStairWidth, 3);
  landing(eastStairOuterX, eastNorthTurn, secondY);

  stair(eastStairOuterX - halfLanding, eastNorthTurn, eastStairInnerX + halfLanding, eastNorthTurn,
    secondY, wingRiser, towerWingStairWidth, 12);
  landing(eastStairInnerX, eastNorthTurn, thirdY);
  stair(eastStairInnerX, eastNorthTurn + halfLanding, eastStairInnerX, 0,
    thirdY, wingRiser, towerWingStairWidth, 13);
  // The ridge deck is the 50th surface. Its rise is fixed by the roof ridge rather than another full riser.
  const deckWest = 5.4, deckEast = 16.25, deckSouth = 2.2;
  deck(deckWest, 0, deckEast, deckSouth, towerWingRidge);
  guard(deckWest, 0, eastStairInnerX - halfLanding, 0, towerWingRidge);
  guard(eastStairInnerX + halfLanding, 0, deckEast, 0, towerWingRidge);
  guard(deckWest, deckSouth, deckEast, deckSouth, towerWingRidge);
  guard(deckEast, 0, deckEast, deckSouth, towerWingRidge);
  guard(deckWest, 0, deckWest, deckSouth, towerWingRidge);
  box('brass', 8.28, towerWingRidge + .08, 1.34, 7.36, .06, .12);
  for (const [x, y, z] of [
    [eastStairOuterX, firstY + 1.8, eastSouthTurn],
    [eastStairOuterX, secondY + 1.8, eastNorthTurn],
    [eastStairInnerX, thirdY + 1.8, eastNorthTurn],
    [15.82, towerWingRidge + .12, 1.90],
  ]) lamp(x, y, z);
}
