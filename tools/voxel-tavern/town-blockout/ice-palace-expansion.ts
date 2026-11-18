import { BoxGeometry, CylinderGeometry, Mesh, MeshLambertMaterial, type BufferGeometry, type Group } from 'three';
import type { Box } from './landmark-kit';

type Finish = 'foundation' | 'deepIce' | 'blueIce' | 'ice' | 'paleIce' | 'snow' | 'recess' | 'glint' | 'brass' | 'lantern';
type Parts = {
  add(shape: BufferGeometry, x: number, y: number, z: number, finish: Finish, yaw: number): void;
  block(x: number, y: number, z: number, w: number, h: number, d: number, finish: Finish): void;
  solid(x: number, bottom: number, z: number, w: number, h: number, d: number, finish: Finish): void;
  floor(x: number, top: number, z: number, w: number, d: number, depth: number, finish: Finish): void;
};

export const icePalaceInteriorAnchors = {
  throneDoor: [19.35, .15, -6.7],
  throneSeat: [18.96, 2.05, -4.92],
  levers: { pine: [-8.5, .12, -15.2], sailboat: [-4.5, .12, -15.2], lighthouse: [-.6, .12, -15.2] },
  mirrors: [[3, .12, -12.5], [5.8, .12, -12.5]],
  bells: { low: [9.7, 24.5, -12.65], mid: [12.3, 24.5, -12.65], high: [11, 24.5, -13.9] },
  vaultLever: [6.5, .12, -10.65],
  vaultExit: [13.38, .15, -6.75],
  vaultFinish: [15.7, .15, -6.7],
  towerFinish: [11, 24.5, -11.85],
} as const;

export const icePalaceDoorBounds = {
  throne: { min: [20.29, .12, -7.45], max: [21.27, 2.65, -5.95] },
  gallery: { min: [2.20, .12, -13.77], max: [3.80, 2.63, -13.43] },
  stair: { min: [7.34, .12, -11.38], max: [7.64, 2.63, -9.92] },
  vault: { min: [12.04, .15, -7.70], max: [12.34, 2.65, -6.30] },
} satisfies Record<string, Box>;

export type IcePalaceDoor = keyof typeof icePalaceDoorBounds;

export function addIcePalaceDoorPanels(group: Group) {
  const material = new MeshLambertMaterial({ color: '#528aa8', emissive: '#253a51', emissiveIntensity: .45 });
  const panels = {} as Record<IcePalaceDoor, Mesh>;
  for (const name of Object.keys(icePalaceDoorBounds) as IcePalaceDoor[]) {
    const { min, max } = icePalaceDoorBounds[name];
    const width = max[0] - min[0], height = max[1] - min[1], depth = max[2] - min[2];
    const panel = new Mesh(new BoxGeometry(width, height, depth), material);
    panel.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    panel.name = `Ice palace ${name} door`;
    group.add(panel);
    panels[name] = panel;
  }
  return panels;
}

export function addIcePalaceWings({ add, block, solid, floor }: Parts) {
  for (const side of [-1, 1]) {
    const z = side * 15.47;
    floor(1, .12, z, 30, 3.75, .17, 'ice');
    block(1, 4.42, z, 30.4, .30, 4.08, 'blueIce');
    block(1, 4.60, z, 30.2, .16, 4.10, 'snow');
    for (let x = -13.8; x <= 15.9; x += 2.9) {
      if (Math.abs(x - (side === 1 ? 2 : 3)) < 1.75) continue;
      solid(x, .12, side * 13.65, .24, 4.18, .27, 'ice');
      block(x, 3.7, side * 13.65, .33, .22, .42, 'glint');
    }
    block(1, 4.24, side * 13.57, 30.05, .32, .32, 'paleIce');
    for (const x of side < 0 ? [-12, 8] : [-12, -8, -4, 0, 4, 8]) {
      const exhibitZ = side * 16.44;
      solid(x, .12, exhibitZ, 1.23, .48, .92, 'deepIce');
      block(x, .62, exhibitZ, 1.37, .14, .99, 'paleIce');
      for (let layer = 0; layer < 3; layer++) {
        const width = 0.69 - layer * .19;
        block(x + Math.sin(x) * layer * .045, .78 + layer * .21, exhibitZ,
          width, .22, .58 - layer * .13, layer % 2 ? 'blueIce' : 'ice');
      }
      block(x, .80, exhibitZ - side * .46, .36, .12, .025, 'glint');
    }
    for (const x of [-10.5, -2.5, 5.5, 13.5]) {
      block(x, 3.50, z, .09, .8, .09, 'paleIce');
      block(x, 3.04, z, .28, .28, .28, 'lantern');
      block(x, 2.88, z, .38, .075, .38, 'ice');
    }
  }

  for (const x of [.60, 3.40]) {
    solid(x, .12, 17.35, .34, 4.10, .54, 'deepIce');
    block(x, 3.35, 17.70, .41, .64, .23, 'glint');
  }
  block(2, 4.38, 17.35, 3.42, .66, .81, 'paleIce');
  block(2, 4.77, 17.35, 4.12, .18, 1.07, 'snow');
  for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
    const shape = new BoxGeometry(.12, .72, .06);
    shape.rotateZ(angle);
    add(shape, 2, 4.40, 17.80, 'glint', 0);
  }
}

export function addIcePalaceChambers({ block, solid, floor }: Parts) {
  // West and north faces of the throne annex use exterior masonry.
  floor(22.57, .15, -6.7, 2.62, 3.25, .17, 'deepIce');
  solid(23.84, .12, -6.7, .26, 2.95, 3.25, 'ice');
  for (const z of [-8.34, -5.06]) solid(22.56, .12, z, 2.65, 2.95, .26, 'ice');
  block(22.6, 3.13, -6.7, 2.86, .22, 3.53, 'paleIce');
  block(23.52, 1.58, -6.70, .05, .74, 1.05, 'glint');

  // The gallery opening sits between exhibits, facing the northern cloister.
  floor(4.43, .12, -12.72, 5.65, 1.93, .16, 'ice');
  for (const x of [1.60, 7.25]) solid(x, .12, -12.72, .28, 2.82, 1.95, 'ice');
  solid(4.43, .12, -11.75, 5.65, 2.82, .24, 'blueIce');
  solid(1.91, .12, -13.60, .58, 2.55, .34, 'blueIce');
  solid(5.52, .12, -13.60, 3.44, 2.55, .34, 'blueIce');
  block(4.44, 3.08, -12.72, 5.88, .22, 2.15, 'paleIce');
  for (const x of [3, 5.8]) {
    block(x, 1.04, -12.85, .08, .82, .64, 'paleIce');
    block(x + .045, 1.04, -12.85, .02, .66, .51, 'glint');
  }
  block(6.56, 1.34, -12.15, .08, .81, .61, 'glint');
  block(4.43, 1.47, -11.91, 1.14, .62, .045, 'brass');

  // The stair room and the front of the timed vault share a ground-level route.
  floor(5.95, .12, -10.34, 3, 2.93, .16, 'deepIce');
  solid(6.0, .12, -11.84, 3.0, 2.60, .27, 'blueIce');
  solid(6.0, .12, -8.84, 3.0, 2.60, .27, 'blueIce');
  solid(4.48, .12, -10.34, .34, 2.60, 2.99, 'blueIce');
  solid(7.49, .12, -11.61, .30, 2.60, .46, 'blueIce');
  solid(7.49, .12, -9.32, .30, 2.60, 1.2, 'blueIce');
  block(5.95, 2.85, -10.35, 3.2, .18, 3.16, 'paleIce');
  block(6.5, .53, -11.15, .28, .82, .24, 'brass');

  floor(14.66, .15, -7.08, 4.89, 2.95, .16, 'deepIce');
  for (const z of [-8.55, -5.59]) solid(14.66, .15, z, 4.89, 2.58, .26, 'blueIce');
  solid(16.95, .15, -7.08, .26, 2.58, 2.95, 'ice');
  solid(12.19, .15, -8.13, .30, 2.58, .86, 'blueIce');
  solid(12.19, .15, -5.94, .30, 2.58, .72, 'blueIce');
  block(14.66, 2.86, -7.08, 5.02, .22, 3.04, 'paleIce');
  solid(16.19, .15, -7.45, 1.1, .79, .89, 'deepIce');
  block(16.19, .99, -7.45, 1.21, .11, .95, 'snow');
  for (const [offset, height] of [[-.32, .38], [0, .61], [.32, .38]] as const) {
    block(16.19 + offset, 1.04 + height / 2, -7.45, .17, height, .15, 'glint');
  }
}

const tower = { x: 11, z: -12.65, platform: 24.5, radius: 3.1 };
const rise = .27;
const run = .58;
const entryHeight = 3.09;

export function addIcePalaceMainTower({ add, block, solid, floor }: Parts) {
  const { x, z, platform, radius } = tower;
  for (const side of [-1, 1]) {
    if (side === -1) {
      solid(x - 2.98, .12, z - .8, .24, 24.38, 3.9, 'blueIce');
      solid(x - 2.98, 2.63, z + 1.95, .24, 21.87, 1.6, 'blueIce');
      solid(x, .12, z - 2.98, 5.75, 24.38, .24, 'blueIce');
    } else {
      solid(x + 2.98, .12, z, .24, 24.38, 5.5, 'blueIce');
      const south = z + 2.98;
      solid(10.10, 2.63, south, 4.26, 21.87, .24, 'blueIce');
      solid(10.85, .12, south, 2.76, 2.51, .24, 'blueIce');
      solid(13.08, 5.55, south, 1.74, 18.95, .24, 'blueIce');
      solid(13.08, .12, south, 1.74, 2.90, .24, 'blueIce');
      solid(14.00, .12, south, .20, 24.38, .24, 'blueIce');
    }
  }
  for (const east of [-1, 1]) for (const north of [-1, 1]) {
    const openArch = east === -1 && north === 1;
    const base = openArch ? 2.63 : .12;
    add(new BoxGeometry(.49, 24.5 - base, .24), x + east * 2.82, (24.5 + base) / 2,
      z + north * 2.82, 'blueIce', east * north * Math.PI / 4);
  }
  for (let side = 0; side < 8; side++) {
    const theta = (side + .5) * Math.PI / 4;
    const panelRadius = radius * Math.cos(Math.PI / 8) + .30;
    const px = x + Math.sin(theta) * panelRadius, pz = z + Math.cos(theta) * panelRadius;
    const span = 2 * radius * Math.sin(Math.PI / 8) + .08;
    for (const height of [6.1, 9.6, 13.1, 16.6, 20.1, 23.6]) {
      add(new BoxGeometry(span, .20, .22), px, height, pz, 'paleIce', theta);
      add(new BoxGeometry(.50, 1.1, .12), px, height + .61, pz, 'ice', theta);
    }
  }
  // Eight-sided crown remains visually distinct from the four square legacy turrets.
  add(new CylinderGeometry(3.54, 3.32, .25, 8), x, 24.58, z, 'snow', Math.PI / 8);
  add(new CylinderGeometry(.28, .72, 1.18, 8), x, 25.42, z, 'glint', Math.PI / 8);
  const corners = [[2.08, 2.08], [2.08, -2.08], [-2.08, -2.08], [-2.08, 2.08]] as const;
  const turns = 16;
  const steps = 5;
  let current = entryHeight;
  floor(x + corners[0][0], current, z + corners[0][1], 1.26, 1.26, .19, 'paleIce');
  for (let flight = 0; flight < turns; flight++) {
    const [ax, az] = corners[flight % corners.length];
    const [bx, bz] = corners[(flight + 1) % corners.length];
    const dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
    for (let step = 0; step < steps; step++) {
      const distance = 0.63 + (step + .5) * run;
      const stepX = x + ax + dx * distance, stepZ = z + az + dz * distance;
      current = Math.min(platform, current + rise);
      floor(stepX, current, stepZ, dx ? run : 1.26, dz ? run : 1.26, .20, 'paleIce');
      block(stepX - dx * .23 - (dz ? Math.sign(ax) * .52 : 0), current + .012,
        stepZ - dz * .23 - (dx ? Math.sign(az) * .52 : 0), dx ? .06 : .12, .014, dz ? .06 : .12, 'glint');
      if (dz) solid(stepX - Math.sign(ax) * .63, current, stepZ, .14, .80, run, 'ice');
      else solid(stepX, current, stepZ - Math.sign(az) * .63, run, .80, .14, 'ice');
    }
    floor(x + bx, current, z + bz, 1.26, 1.26, .20, 'ice');
  }
  // Leave the west and south flights open below the rooftop until their landing.
  floor(x + .62, platform, z - .62, 4.72, 4.72, .24, 'paleIce');
  for (const side of [-1, 1]) {
    solid(x + side * 2.90, platform, z, .17, .94, 5.80, 'ice');
    solid(x, platform, z + side * 2.90, 5.80, .94, .17, 'ice');
  }
  for (const [index, point] of Object.values(icePalaceInteriorAnchors.bells).entries()) {
    const [bellX, feet, bellZ] = point;
    const size = .52 - index * .09;
    block(bellX, feet + .30, bellZ, .24, .60, .24, 'deepIce');
    add(new CylinderGeometry(size * .61, size, .52, 8), bellX, feet + .86, bellZ, 'brass', Math.PI / 8);
    block(bellX, feet + 1.15, bellZ, .24, .13, .25, 'glint');
  }
  const [finishX, feet, finishZ] = icePalaceInteriorAnchors.towerFinish;
  block(finishX, feet + .012, finishZ, 1.60, .02, 1.60, 'deepIce');
  for (const dx of [-.54, 0, .54]) for (const dz of [-.54, 0, .54]) {
    block(finishX + dx, feet + .025, finishZ + dz, .49, .008, .49,
      dx === 0 || dz === 0 ? 'paleIce' : 'deepIce');
  }
}

const banquetTable = { x: 12, z: -2 };
const banquetFeet = .15;
const banquetEye = 1.62;
export const icePalaceBanquetDrinkStand = [8.15, .15, -3.54] as const;

export const icePalaceBanquetSeats = [-1, 1].flatMap(side => {
  const seats = Array.from({ length: 5 }, (_, index) => {
    const x = banquetTable.x + (index - 2) * 1.32;
    return {
      stand: [x, banquetFeet, banquetTable.z + side * 1.54] as const,
      seat: [x, banquetEye, banquetTable.z + side * 1.03] as const,
      yaw: side > 0 ? 0 : Math.PI,
    };
  });
  seats.push({
    stand: [banquetTable.x + side * 4.40, banquetFeet, banquetTable.z],
    seat: [banquetTable.x + side * 3.91, banquetEye, banquetTable.z],
    yaw: -side * Math.PI / 2,
  });
  return seats;
});

export function addIcePalaceHallExpansion({ block, solid, floor }: Parts) {
  floor(18.55, 3.09, -4.48, 1.58, 7.02, .23, 'paleIce');
  floor(15.41, 3.09, -7.45, 6.28, 1.30, .23, 'paleIce');
  floor(13.08, 3.09, -9.14, 1.26, 2.90, .23, 'paleIce');
  for (const x of [12.39, 13.77]) solid(x, 3.09, -9.47, .12, .82, 2.34, 'ice');
  for (const z of [-6.79, -8.10]) solid(15.72, 3.09, z, 3.76, .75, .12, 'ice');
  solid(19.38, 3.09, -4.38, .12, .84, 6.65, 'ice');
  solid(17.73, 3.09, -3.85, .12, .84, 5.10, 'ice');

  const { x: tableX, z: tableZ } = banquetTable;
  solid(tableX, .71, tableZ, 7.2, .20, 1.2, 'ice');
  block(tableX, .935, tableZ, 7.13, .05, 1.13, 'paleIce');
  for (const x of [tableX - 2.8, tableX + 2.8]) solid(x, .15, tableZ, .32, .59, .57, 'deepIce');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = tableX + (i - 2) * 1.32;
      const z = tableZ + side * 1.03;
      block(x, .56, z, .64, .16, .57, 'ice');
      block(x, .84, z + side * .25, .61, .51, .09, 'paleIce');
      block(x, .33, z, .18, .35, .21, 'deepIce');
    }
    const x = tableX + side * 3.91;
    block(x, .56, tableZ, .56, .16, .64, 'ice');
    block(x + side * .23, .84, tableZ, .09, .51, .61, 'paleIce');
    block(x, .33, tableZ, .21, .35, .18, 'deepIce');
  }
  const [drinkX, drinkFeet, drinkStandZ] = icePalaceBanquetDrinkStand;
  const drinkZ = drinkStandZ - .79;
  solid(drinkX, drinkFeet, drinkZ, .69, .67, .59, 'blueIce');
  block(drinkX, .88, drinkZ, .86, .12, .74, 'paleIce');
  for (const x of [drinkX - .21, drinkX + .21]) {
    block(x, .99, drinkZ, .28, .04, .23, 'deepIce');
    block(x, 1.10, drinkZ, .16, .20, .15, 'brass');
    block(x, 1.207, drinkZ, .135, .018, .13, 'lantern');
  }

  for (const x of [tableX - 2.3, tableX, tableX + 2.3]) {
    block(x, 1.02, tableZ, .19, .14, .19, 'brass');
    block(x, 1.34, tableZ, .08, .12, .08, 'lantern');
  }
}
