import type { Group } from 'three';
import type { Box, Ramp } from './landmark-kit';
import { addOpaqueMuseumLabels } from './museum-label-atlas';
import { createMuseumLabelCanvas } from './museum-label-canvas';

const tierRun = .875;
const tierRise = .35;
const standSouth = 162;

export const theaterPhotoPositions = Array.from({ length: 48 }, (_, index) => {
  const row = Math.floor(index / 12);
  const col = index % 12;
  return { east: 224 + (col - 5.5) * 1.28,
    north: standSouth + (row + .5) * tierRun, height: 12 + (row + 1) * tierRise };
});

type PieceAdder = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => void;

export function addCommunityTheaterDetails(
  group: Group, add: PieceAdder, floors: Box[], ramps: Ramp[], originEast: number, originNorth: number,
) {
  const red = '#873533', amber = '#d49b58', fabric = '#a0473c', stone = '#777780', deck = '#906349';
  // Pleated curtains frame the open proscenium. Paired pairs narrow the curtain near the floor.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 8; index++) {
      const x = side * (8.18 + index * .10);
      const drop = 3.04 - .095 * index;
      add(index % 2 ? red : fabric, x, 4.98 - drop / 2, -4.87 + (index % 2) * .08, .17, drop, .22);
    }
    const x = side * 8.3;
    add('#4b3431', x, 2.9, -6.22, .18, 5.8, .18);
    for (const y of [2.7, 3.65, 4.6]) {
      add(amber, x, y + .25, -6.22, .44, .09, .44);
      add('#ffa455', x, y, -6.22, .38, .42, .38);
      add(red, x, y - .25, -6.22, .36, .11, .36);
    }
  }
  add(red, 0, 5.09, -4.92, 17.5, .30, .31);
  for (let x = -8; x <= 8; x += .4) {
    add(Math.round(x * 5) % 4 === 0 ? amber : fabric, x, .365, -5.748, .23, .24, .038);
  }
  // A continuous painted strip across the original rear panels reads as one backdrop from the forecourt.
  for (let index = 0; index < 38; index++) {
    const x = (index - 18.5) * .38;
    const height = .58 + .38 * Math.sin(index * .53) ** 2;
    add(index % 3 ? '#52797a' : '#658382', x, 2.15 + height / 2, 4.34, .40, height, .032);
    add('#d7b897', x, 2.13, 4.31, .39, .045, .03);
  }

  const localEast = (east: number) => east - originEast;
  const localNorth = (north: number) => originNorth - north;
  for (let index = 0; index < 4; index++) {
    const south = standSouth + index * tierRun;
    const height = (index + 1) * tierRise;
    const z = localNorth(south + tierRun / 2);
    add(stone, localEast(224), height / 2, z, 16, height, tierRun);
    add(deck, localEast(224), height - .045, z, 15.9, .09, tierRun - .04);
    add('#ffa455', localEast(224), height - .065, localNorth(south + .025), 15.88, .045, .04);
    floors.push({
      min: [localEast(216), 0, localNorth(south + tierRun)],
      max: [localEast(232), height, localNorth(south)],
    });
  }

  const rampWest = 204.8, rampEast = 216;
  const rampNorth = 165.5, rampSouth = 164.1;
  const riseTotal = 4 * tierRise;
  const segments = 16;
  const run = (rampEast - rampWest) / segments;
  for (let i = 0; i < segments; i++) {
    const height = riseTotal * (i + 1) / segments;
    add(stone, localEast(rampWest + run * (i + .5)), height / 2,
      localNorth((rampNorth + rampSouth) / 2), run, height, rampNorth - rampSouth);
  }
  // The ramp arrives in a level landing that covers the last tread.
  const rampLandingSouth = 164.625;
  ramps.push({
    min: [localEast(rampWest), 0, localNorth(rampNorth)],
    max: [localEast(rampEast), riseTotal, localNorth(rampSouth)],
    axis: 'x', ascending: 1,
  });
  floors.push({
    min: [localEast(215.75), 0, localNorth(rampNorth)],
    max: [localEast(216), riseTotal, localNorth(rampLandingSouth)],
  });
  for (const east of [218.4, 229.6]) {
    for (const north of [154.4, 156.1, 157.8]) {
      add(deck, localEast(east), .38, localNorth(north), .74, .18, .50);
      for (const support of [-.24, .24]) add(stone, localEast(east + support), .15, localNorth(north), .13, .30, .42);
    }
  }

  if (typeof document !== 'undefined') {
    const signs = [
      { text: '有戏', x: 0, y: 5.42, width: 2.25, height: .65 },
      { text: [...'满镇灯花迎未岁'].join('\n'), x: 8.63, y: 3.24, width: .42, height: 2.58 },
      { text: [...'一台社戏唱丰年'].join('\n'), x: -8.63, y: 3.24, width: .42, height: 2.58 },
    ];
    addOpaqueMuseumLabels(signs.map(({ text, x, y, width, height }) => ({
      source: createMuseumLabelCanvas(text, width, height), parent: group,
      x, y, z: -5.22, width, height, yaw: Math.PI,
    })), [], { mergeSizes: true });
  }
}
