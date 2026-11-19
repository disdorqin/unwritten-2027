import type { Group } from 'three';
import type { Box, Ramp } from './landmark-kit';
import { addOpaqueMuseumLabels } from './museum-label-atlas';
import { createMuseumLabelCanvas } from './museum-label-canvas';
import { plazaPhotoStand } from '../../../src/presence/plaza-photo';

const { run: tierRun, rise: tierRise, south: standSouth } = plazaPhotoStand;

export const theaterPhotoPositions = Array.from({ length: 48 }, (_, index) => {
  const row = Math.floor(index / 12);
  const col = index % 12;
  return { east: plazaPhotoStand.centreEast + (col - 5.5) * 1.28,
    north: standSouth + (row + .5) * tierRun, height: plazaPhotoStand.base + (row + 1) * tierRise };
});

type PieceAdder = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => void;

export function addCommunityTheaterDetails(
  group: Group, add: PieceAdder, floors: Box[], ramps: Ramp[], originEast: number, originNorth: number,
) {
  const red = '#873533', amber = '#d49b58', fabric = '#a0473c', stone = '#777780', deck = '#906349';
  const sky = '#d7b897', distantHill = '#658382', nearHill = '#52797a';
  const frontOfColumns = -5.27;
  const curtainTop = 6.91;
  const curtainDrop = 4.4;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 12; index++) {
      const x = side * (7.72 + index * .10);
      const z = frontOfColumns - (index % 2) * .08;
      add(index % 2 ? red : fabric, x, curtainTop - curtainDrop / 2, z, .17, curtainDrop, .20);
    }
    const x = side * 8.3;
    add('#4b3431', x, 2.9, -6.22, .18, 5.8, .18);
    for (const y of [2.7, 3.65, 4.6]) {
      add(amber, x, y + .25, -6.22, .44, .09, .44);
      add('#ffa455', x, y, -6.22, .38, .42, .38);
      add(red, x, y - .25, -6.22, .36, .11, .36);
    }
  }
  // The unlettered valance ties the curtains together below the beam.
  add('#422e2e', 0, 7.05, frontOfColumns + .10, 17.5, .30, .28);
  add(red, 0, curtainTop - .15, frontOfColumns - .04, 17.5, .30, .16);
  add('#c68d4d', 0, curtainTop - .30, frontOfColumns - .10, 17.5, .04, .05);

  const artBase = .52, artHeight = 4.04;
  const panelCount = 38, panelWidth = .38;
  const panelStart = -(panelCount - 1) * panelWidth / 2;
  const paintZ = 6.10 - .02;
  const edgeWidth = (17.5 - panelCount * panelWidth) / 2;
  for (const side of [-1, 1]) {
    add(red, side * (panelCount * panelWidth + edgeWidth) / 2, artBase + artHeight / 2,
      paintZ, edgeWidth, artHeight, .032);
  }
  // The shared sky is uninterrupted. Stepped silhouettes are built up on the same 0.38 m grid.
  for (let index = 0; index < panelCount; index++) {
    const x = panelStart + index * panelWidth;
    const horizon = Math.max(3, 9 - Math.abs(index - 7), 8 - Math.abs(index - 29));
    const foreground = Math.max(1, 6 - Math.abs(index - 3), 5 - Math.abs(index - 34));
    const temple = Math.abs(index - 22);
    const distantHeight = horizon * panelWidth;
    const nearHeight = foreground * panelWidth;
    add(sky, x, artBase + artHeight / 2, paintZ, panelWidth, artHeight, .032);
    add(distantHill, x, artBase + distantHeight / 2, paintZ - .02, panelWidth, distantHeight, .032);
    add(nearHill, x, artBase + nearHeight / 2, paintZ - .04, panelWidth, nearHeight, .032);
    if (temple <= 3) {
      const roofHeight = (temple <= 1 ? 8 : temple === 2 ? 7 : 6) * panelWidth;
      add(nearHill, x, artBase + roofHeight - panelWidth / 2, paintZ - .06, panelWidth, panelWidth, .032);
      if (temple <= 2) {
        const wallHeight = roofHeight - panelWidth;
        add(nearHill, x, artBase + wallHeight / 2, paintZ - .06, panelWidth, wallHeight, .032);
      }
    }
  }

  // Follow the stepped inner wall faces rather than hanging a plane across the open apron.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 10; index++) {
      const progress = index / 9;
      const x = side * (7.50 + 1.30 * progress - .145);
      const z = -3.90 - progress * 1.30 / Math.tan(Math.PI / 6);
      add(sky, x, artBase + 3.2 / 2, z, .032, 3.2, .25);
      const skyline = side < 0
        ? Math.max(1, 7 - Math.abs(index - 5) * 2)
        : Math.max(1, 4 - Math.abs(index - 2), 5 - Math.abs(index - 7));
      const height = skyline * panelWidth;
      add(distantHill, x - side * .02, artBase + height / 2, z, .032, height, .25);
      if (side < 0) {
        for (const tier of [2, 4, 6]) {
          if (Math.abs(index - 5) * 2 + tier > 8) continue;
          add(nearHill, x - side * .04, artBase + tier * panelWidth, z, .032, .13, .25);
        }
        if (index === 5) add(nearHill, x - side * .04, artBase + height / 2, z, .032, height, .13);
      } else if (index === 2 || index === 7) {
        add(nearHill, x - side * .04, artBase + height - .14, z, .032, .28, .25);
        add(sky, x - side * .06, artBase + panelWidth, z, .032, .13, .13);
      }
    }
  }

  const localEast = (east: number) => east - originEast;
  const localNorth = (north: number) => originNorth - north;
  const { centreEast, halfWidth, rows } = plazaPhotoStand;
  const tierHalfWidth = halfWidth + 2.4;
  const tierWidth = 2 * tierHalfWidth;
  for (let index = 0; index < rows; index++) {
    const south = standSouth + index * tierRun;
    const height = (index + 1) * tierRise;
    const z = localNorth(south + tierRun / 2);
    add(stone, localEast(centreEast), height / 2, z, tierWidth, height, tierRun);
    add(deck, localEast(centreEast), height - .045, z, tierWidth - .10, .09, tierRun - .04);
    add('#ffa455', localEast(centreEast), height - .065, localNorth(south + .025), tierWidth - .12, .045, .04);
    floors.push({
      min: [localEast(centreEast - tierHalfWidth), 0, localNorth(south + tierRun)],
      max: [localEast(centreEast + tierHalfWidth), height, localNorth(south)],
    });
  }

  const rampStart = 204.8, rampEnd = centreEast - halfWidth;
  const rampNorth = 165.5, rampSouth = 164.1, landingSouth = 164.625;
  const riseTotal = rows * tierRise;
  const segments = 16;
  const run = (rampEnd - rampStart) / segments;
  for (const ascending of [1, -1] as const) {
    const rampX = (east: number) => localEast(centreEast + ascending * (east - centreEast));
    for (let index = 0; index < segments; index++) {
      const height = riseTotal * (index + 1) / segments;
      // The fourth tier now covers the northern part of the top tread.
      const treadNorth = index === segments - 1 ? landingSouth : rampNorth;
      add(stone, rampX(rampStart + run * (index + .5)), height / 2,
        localNorth((treadNorth + rampSouth) / 2), run, height, treadNorth - rampSouth);
    }
    const start = rampX(rampStart), end = rampX(rampEnd);
    ramps.push({
      min: [Math.min(start, end), 0, localNorth(rampNorth)],
      max: [Math.max(start, end), riseTotal, localNorth(rampSouth)],
      axis: 'x', ascending,
    });
    const landingEdge = rampX(rampEnd - .25);
    floors.push({
      min: [Math.min(landingEdge, end), 0, localNorth(rampNorth)],
      max: [Math.max(landingEdge, end), riseTotal, localNorth(landingSouth)],
    });
  }
  for (const east of [218.4, 229.6]) {
    for (const north of [154.4, 156.1, 157.8]) {
      add(deck, localEast(east), .38, localNorth(north), .74, .18, .50);
      for (const support of [-.24, .24]) add(stone, localEast(east + support), .15, localNorth(north), .13, .30, .42);
    }
  }

  if (typeof document !== 'undefined') {
    const signs = [
      { text: '有戏', x: 0, y: 7.05, width: 2.25, height: .65 },
      { text: [...'满镇灯花迎未岁'].join('\n'), x: 8.63, y: 3.24 * 1.3, width: .42, height: 2.58 },
      { text: [...'一台社戏唱丰年'].join('\n'), x: -8.63, y: 3.24 * 1.3, width: .42, height: 2.58 },
    ];
    addOpaqueMuseumLabels(signs.map(({ text, x, y, width, height }) => ({
      source: createMuseumLabelCanvas(text, width, height), parent: group,
      x, y, z: -5.46, width: width * 1.3, height: height * 1.3, yaw: Math.PI,
    })), [], { mergeSizes: true });
  }
}
