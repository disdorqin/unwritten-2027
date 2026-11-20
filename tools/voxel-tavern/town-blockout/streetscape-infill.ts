export type StreetInfillKind = 'lantern' | 'fence' | 'firewood' | 'sign' | 'lanternFir' | 'snowman';

export type StreetInfillPoint = readonly [
  kind: StreetInfillKind, east: number, north: number, heading?: number,
];

export type StreetInfillCluster = {
  id: string;
  points: readonly StreetInfillPoint[];
};

export const streetInfill: readonly StreetInfillCluster[] = [
  {
    id: 'southwest-plaza',
    points: [
      ['lantern', 159.5, 163, Math.PI],
      ['firewood', 159.5, 161, Math.PI / 2],
      ['sign', 157.5, 159, .35],
      ['lantern', 159.5, 158.8, Math.PI],
      ['fence', 159.5, 156.5, Math.PI / 2],
    ],
  },
  {
    id: 'northeast-approach',
    points: [
      ['lanternFir', 323, 212.5],
      ['lantern', 326, 227, Math.PI],
      ['sign', 338.5, 239.5, .6],
      ['snowman', 350, 240.5, Math.PI],
    ],
  },
  {
    id: 'station-approach',
    points: [
      ['lantern', 485, 287.5, Math.PI / 2],
      ['firewood', 496, 293, .3],
      ['fence', 501, 294, .4],
      ['sign', 504.5, 298, .8],
      ['firewood', 515, 308, .45],
      ['lantern', 518.5, 310, Math.PI / 2],
    ],
  },
];
