export const marketStallKinds = [
  '糖葫芦', '干果炒货', '吃食', '热饮', '杂货', '布匹/围巾', '灯笼', '春联年画', '玩具/套圈',
] as const;

export type MarketStallKind = typeof marketStallKinds[number];
export type MarketStallRow = 'main' | 'east' | 'opposite' | 'north' | 'forecourt';
export type MarketStallLayout = {
  id: `market-stall-${number}`;
  x: number;
  z: number;
  width: number;
  canopy: string;
  kind: MarketStallKind;
  row: MarketStallRow;
  yaw: number;
  base: number;
  counterGround: number;
};

const south = 0;
const north = Math.PI;
const oxApproachGround = 10;
const east = Math.PI / 2;

type Stall = readonly [
  x: number, z: number, width: number, canopy: string, kind: MarketStallKind, row: MarketStallRow,
  yaw: number, base: number,
];

// The first four IDs, positions, colors and order are saved in the live tasting ledger.
// The large center booth steps behind the old row and leaves the zodiac ox's hay and approach clear.
const stalls: readonly Stall[] = [
  [-12.5, -4.8, 6.8, '#a1342d', '糖葫芦', 'main', south, 10],
  [-4.38, -4.4, 6.4, '#92562e', '干果炒货', 'main', south, 10],
  [4.25, -4.95, 6.7, '#8a312d', '吃食', 'main', south, 10],
  [12.4, -4.6, 6.55, '#2e6a67', '热饮', 'main', south, 10],
  [0, -11.9, 7.2, '#95702c', '杂货', 'main', south, 10.08],
  [23.5, -4.6, 4.9, '#8a312d', '吃食', 'east', south, 9.12],
  // Keep the two outer counters north of the existing housing collision at N108.5.
  [30.5, -7, 4.9, '#593f7c', '布匹/围巾', 'east', south, 9.51],
  [37.5, -7, 4.9, '#95702c', '杂货', 'east', south, 9.83],
  [-14.4, 6.5, 4.9, '#593f7c', '布匹/围巾', 'opposite', north, 10],
  [-7.2, 6.5, 4.9, '#2e6a67', '热饮', 'opposite', north, 10],
  [0, 6.5, 4.9, '#b54126', '灯笼', 'opposite', north, 10],
  [7.2, 6.5, 4.9, '#92562e', '干果炒货', 'opposite', north, 10],
  [14.4, 6.5, 4.9, '#a1342d', '糖葫芦', 'opposite', north, 10],
  [-16.2, -11, 5.15, '#b54126', '灯笼', 'north', east, 10.10],
  [-16.2, -17.8, 5.15, '#2e6a67', '热饮', 'north', east, 10.43],
  [-13, 15, 8.7, '#a32232', '春联年画', 'forecourt', north, 9.72],
  [13, 15, 8.7, '#416783', '玩具/套圈', 'forecourt', north, 8.96],
];

export const marketStallLayouts: readonly MarketStallLayout[] = stalls.map((
  [x, z, width, canopy, kind, row, yaw, base], index,
) => ({ id: `market-stall-${index}`, x, z, width, canopy, kind, row, yaw, base, counterGround: index === 4 ? oxApproachGround : base }));

export function marketStallLocalPoint(stall: Pick<MarketStallLayout, 'x' | 'z' | 'yaw'>, dx: number, dz: number): [number, number] {
  if (stall.yaw === north) return [stall.x - dx, stall.z - dz];
  if (stall.yaw === east) return [stall.x + dz, stall.z - dx];
  return [stall.x + dx, stall.z + dz];
}
