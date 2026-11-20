type Vec3 = [number, number, number];
type Bounds = [number, number, number, number, number, number];

export const tavernCraftMaterials = [
  'stardustPowder', 'paper', 'bamboo', 'liquor', 'warmMineral', 'wood', 'cloth', 'wire',
] as const;
export type TavernCraftMaterial = typeof tavernCraftMaterials[number];
export type TavernCraftCounts = Partial<Record<TavernCraftMaterial, number>>;
export type TavernCraftPart = { m: string; b: Bounds; slot?: TavernCraftMaterial };
export type TavernCraftBench = { stand: Vec3; setCounts: (counts: TavernCraftCounts) => void };

// Leave the lower bottle shelf and its posts behind the work surface.
export const tavernCraftBenchBox: Bounds = [-3.125, 3, -4.5625, -1.125, 4.1875, -4];
export const tavernCraftBenchStand: Vec3 = [-2.125, 3, -3.56];

const casks = [
  { west: -6, north: -4.75, porchWest: 2.5, porchNorth: 6.75 },
  { west: -6, north: -3.5, porchWest: 3.875, porchNorth: 6.75 },
];
export const tavernCraftCaskBoxes = casks.map(({ porchWest: x, porchNorth: z }): Bounds =>
  [x - .0625, 3, z - .0625, x + 1.0625, 4, z + 1.1875]);

export function relocateTavernCraftCask(m: string, b: Bounds): Bounds {
  const [left, bottom, north, right, top, south] = b;
  // The source splits the two western casks at voxel boundaries.
  const cask = casks.find(({ west: x, north: z }) => {
    if (m === 'plank') {
      return left >= x && right <= x + 1 && bottom >= 3 && top <= 4 && north >= z && south <= z + 1;
    }
    if (m === 'iron') {
      return left >= x - .0625 && right <= x + 1.0625 && bottom >= 3.1875 && top <= 3.875
        && north >= z - .0625 && south <= z + 1.0625;
    }
    return m === 'dark' && left >= x + .4375 && right <= x + .5625 && bottom === 3.375 && top === 3.5
      && north >= z + 1 && south <= z + 1.1875;
  });
  if (!cask) return b;
  const dx = cask.porchWest - cask.west;
  const dz = cask.porchNorth - cask.north;
  return [left + dx, bottom, north + dz, right + dx, top, south + dz];
}

export function tavernCraftBenchParts(): TavernCraftPart[] {
  const parts: TavernCraftPart[] = [];
  const [left, floor, back, , surface, front] = tavernCraftBenchBox;
  const add = (m: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    parts.push({ m, b: [x, y, z, x + w, y + h, z + d] });
  };
  for (let i = 0; i < 8; i++) {
    add(i % 3 ? 'plank' : 'timberTrim', left + i * .25, surface - .125, back, .25, .125, front - back);
  }
  add('dark', left + .0625, surface - .25, front - .0625, 1.875, .125, .0625);
  add('wood', left + .125, floor + .1875, front - .1875, 1.75, .125, .125);
  for (const x of [left + .0625, left + 1.5625]) {
    add('wood', x, floor, front - .3125, .375, 1.0625, .25);
    add('plank', x + .03125, floor + .5625, front - .0625, .3125, .25, .03125);
    add('bronze', x + .125, floor + .65625, front - .03125, .125, .0625, .03125);
  }
  // The vise and paired hand tools frame the eight empty material wells.
  add('iron', -3.0625, surface, -4.25, .25, .0625, .1875);
  for (const x of [-3.0625, -2.875]) add('iron', x, surface + .0625, -4.25, .0625, .125, .1875);
  add('bronze', -3, surface + .0625, -4.125, .0625, .0625, .125);
  add('wood', -1.4375, surface, -4.5, .0625, .0625, .3125);
  add('iron', -1.5, surface + .0625, -4.5, .1875, .0625, .09375);
  add('bronze', -1.3125, surface, -4.4375, .0625, .0625, .3125);
  add('dark', -2.6875, surface, -4.53125, 1.125, .03125, .5);

  const shapes: Record<TavernCraftMaterial, [string, number, number, number, number, number, number][]> = {
    stardustPowder: [
      ['ceramic', -.078, 0, -.055, .156, .038, .11],
      ['cream', -.055, .037, -.037, .11, .03, .074],
      ['glow', -.024, .065, -.02, .047, .023, .043],
    ],
    paper: [
      ['paper', -.07, 0, -.071, .14, .024, .142],
      ['cream', -.059, .024, -.064, .128, .015, .117],
    ],
    bamboo: [
      ['green', -.065, 0, -.075, .04, .044, .15],
      ['green', .009, 0, -.075, .04, .044, .15],
      ['gold', -.065, .043, -.005, .115, .009, .028],
    ],
    liquor: [
      ['wine', -.055, 0, -.05, .11, .081, .10],
      ['wine', -.026, .079, -.025, .052, .048, .05],
      ['gold', -.033, .124, -.031, .066, .025, .062],
    ],
    warmMineral: [
      ['cobble', -.076, 0, -.06, .134, .048, .12],
      ['amberGlass', -.048, .046, -.044, .094, .055, .08],
      ['glow', -.022, .098, -.023, .046, .03, .043],
    ],
    wood: [
      ['dark', -.075, 0, -.065, .15, .037, .13],
      ['plank', -.075, .036, -.046, .15, .035, .1],
    ],
    cloth: [
      ['cloth', -.071, 0, -.064, .142, .062, .128],
      ['linen', -.065, .06, -.055, .13, .023, .111],
      ['cloth', -.065, .08, -.052, .13, .017, .078],
    ],
    wire: [
      ['iron', -.07, 0, -.067, .14, .027, .134],
      ['bronze', -.048, .023, -.046, .096, .058, .092],
      ['iron', -.07, .079, -.067, .14, .027, .134],
    ],
  };
  for (const [i, slot] of tavernCraftMaterials.entries()) {
    const x = -2.55 + (i % 4) * .28125;
    const z = i < 4 ? -4.407 : -4.153;
    for (const corner of [-.104, .083]) {
      add('bronze', x + corner, surface + .03, z - .09, .021, .016, .18);
      add('bronze', x - .083, surface + .03, z + corner, .166, .016, .021);
    }
    for (const [m, dx, dy, dz, w, h, d] of shapes[slot]) {
      const start: Vec3 = [x + dx, surface + .032 + dy, z + dz];
      parts.push({ m, slot, b: [...start, start[0] + w, start[1] + h, start[2] + d] });
    }
  }
  return parts;
}
