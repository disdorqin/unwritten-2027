import type { Group } from 'three';
import { addTownWindow } from './town-window';

type Box = (kind: string, x: number, y: number, z: number, w: number, h: number, d: number) => void;
type Volume = (x: number, y: number, z: number, w: number, h: number, d: number) => void;
export const towerHallFloor = .3125;
export const towerWingMezzanine = 4.9;
export const towerWingStairWidth = 1.125;
const frontWindowY = 2.05;
const frontWindowHeight = 2.25;
const frontWindowWidth = 1.75;
const windowCenters = [6.85, 10.45, 14.05].map(x => x + 2.125 / 2);
const westStair = { x: -14.35, begins: 3.6, ends: -3.7, steps: 21 };
const eastStair = [[7.4, 4.48], [14.45, 4.48], [14.45, -4.48], [7.4, -4.48], [7.4, 4.48]] as const;

export function buildTowerWingShell(tower: Group, side: number, inner: number, outer: number, depth: number, box: Box,
  solid: Volume, floor: Volume) {
  const span = outer - inner;
  const wall = .38;
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
  wallPiece(outer - wall, towerHallFloor, -depth, wall, top - towerHallFloor, depth * 2);
  // The west plinth retains the former exterior recovery along the front of the tower.
  const sillDepth = side < 0 ? 1.44 : wall;
  wallPiece(inner, towerHallFloor, depth - sillDepth, span - wall, frontWindowY - towerHallFloor, sillDepth);
  const upper = frontWindowY + frontWindowHeight;
  wallPiece(inner, upper, depth - wall, span - wall, top - upper, wall);
  let previous = inner;
  for (const center of windowCenters) {
    const edge = center - frontWindowWidth / 2;
    wallPiece(previous, frontWindowY, depth - wall, edge - previous, frontWindowHeight, wall);
    previous = center + frontWindowWidth / 2;
    addTownWindow(tower, {
      x: side * center, y: frontWindowY + frontWindowHeight / 2, z: depth - wall / 2,
      yaw: 0, width: frontWindowWidth, height: frontWindowHeight, ground: towerHallFloor,
      approach: [side * center, depth - 1.7], style: 'tavern',
    });
    for (const edge of [-1, 1]) {
      wing('ivory', center + edge * frontWindowWidth / 2 - .08, frontWindowY - .12, depth - .055, .16, 2.50, .15);
    }
    wing('blueStone', center - 1.06, frontWindowY - .15, depth - .23, 2.12, .15, .45);
    wing('ivory', center - 1.02, upper, depth - .09, 2.04, .16, .22);
    for (let i = 0; i < 4; i++) {
      const inset = i * .17;
      wing('ivory', center - .90 + inset, upper + .16 + .107 * i, depth - .083, 1.8 - 2 * inset, .107, .17);
    }
  }
  wallPiece(previous, frontWindowY, depth - wall, outer - wall - previous, frontWindowHeight, wall);
  for (const [y, kind] of [[1, 'blueStone'], [7.45, 'brass'], [8.48, 'blueStone']] as const) {
    wing(kind, inner, y, depth - .14, span, .24, .18);
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
  deck(-13.65, -5.92, -5.7, 5.93, towerWingMezzanine);
  deck(-15.6, -5.92, -13.65, ends, towerWingMezzanine);
  guard(-13.65, ends, -13.65, 5.93, towerWingMezzanine);
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
  const rise = .21875;
  const flights = [12, 12, 12, 14];
  const half = towerWingStairWidth / 2;
  const landingHalf = half + .30;
  // The central mezzanine is independent of the open stairwell around it.
  const shelves = [8.09, -3.62, 13.78, 3.62] as const;
  deck(...shelves, towerWingMezzanine);
  for (const edge of [-3.62, 3.62]) guard(shelves[0], edge, shelves[2], edge, towerWingMezzanine);
  guard(shelves[0], shelves[1], shelves[0], shelves[3], towerWingMezzanine);
  guard(shelves[2], shelves[1], shelves[2], -2.70, towerWingMezzanine);
  guard(shelves[2], -.72, shelves[2], shelves[3], towerWingMezzanine);
  let y = towerHallFloor;
  for (const [index, steps] of flights.entries()) {
    const [x0, z0] = eastStair[index], [x1, z1] = eastStair[index + 1];
    const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
    const entry = index === 0 ? 0 : landingHalf;
    stair(x0 + dx * entry, z0 + dz * entry, x1 - dx * landingHalf, z1 - dz * landingHalf,
      y, rise, towerWingStairWidth, steps, false, index === 1 ? [.59, .78] : undefined);
    y += rise * steps;
    deck(x1 - landingHalf, z1 - landingHalf, x1 + landingHalf, z1 + landingHalf, y);
    lamp(x1, y + 1.8, z1);
  }
  const [landingX, landingZ] = eastStair.at(-1)!;
  deck(landingX - half, landingZ + half, 16.25, 6.55, y);
  guard(landingX - half, landingZ + half, landingX - half, 6.55, y);
  guard(landingX - half, 6.55, 16.25, 6.55, y);
  guard(16.25, 6.55, 16.25, landingZ + half, y);
  guard(landingX + half, landingZ + half, 16.25, landingZ + half, y);
  box('brass', 8.28, y + .08, 5.88, 7.36, .06, .12);
  lamp(15.82, y + .12, 6.25);
}
