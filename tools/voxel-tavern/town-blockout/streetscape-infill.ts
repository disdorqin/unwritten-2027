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
  // ZA-32 second wave (zone-1 self-build): old-town street clusters.
  // Every point was picked from a clearance scan of the assembled town
  // (fence = largest reserve radius) and is asserted by the house-portals
  // test: all configured clusters must survive door/road clearance.
  {
    id: 'cabins-approach',
    points: [
      ['lantern', 94, 246, Math.PI / 2],
      ['firewood', 118, 254, .4],
      ['fence', 120, 258, Math.PI / 2],
      ['sign', 114, 260, .5],
    ],
  },
  {
    id: 'workshop-corner',
    points: [
      ['lantern', 106, 100, 0],
      ['fence', 106, 108, 0],
      ['firewood', 108, 124, .3],
      ['sign', 110, 130, .4],
    ],
  },
  {
    id: 'stage-south',
    points: [
      ['lantern', 226, 150, Math.PI],
      ['firewood', 230, 150, .2],
      ['sign', 234, 150, .35],
    ],
  },
  {
    id: 'post-office-street',
    points: [
      ['lantern', 254, 198, Math.PI / 2],
      ['fence', 268, 198, Math.PI / 2],
      ['firewood', 276, 186, .3],
      ['sign', 280, 198, .6],
    ],
  },
  {
    id: 'glasshouse-road',
    points: [
      ['lantern', 382, 86, 0],
      ['snowman', 382, 96, Math.PI],
      ['firewood', 382, 100, .5],
    ],
  },
];
