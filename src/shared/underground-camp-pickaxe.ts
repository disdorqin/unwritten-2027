export const undergroundCampPickaxe = {
  siteId: 'mine-camp-old-pickaxe',
  tool: 'pickaxe',
  horizontalReach: 1.15,
  verticalReach: .35,
} as const;

export const undergroundCampDiningTables = {
  x: [-1.32, .89], depth: 3.13, top: .77,
} as const;

type LocalPoint = readonly [x: number, y: number, z: number];
type MineCamp = Readonly<{
  route: readonly Readonly<{ from: LocalPoint; zone: string }>[];
  anchors: Readonly<{ campRecovery: Readonly<{ position: LocalPoint }> }>;
}>;

/** Resolve the old tool on the second table against the original camp axis. */
export function resolveUndergroundCampPickaxeSite(mine: MineCamp, camp: Readonly<{
  side: 'left' | 'right';
  length: number;
}>) {
  const spine = mine.route.at(-2);
  const floor = mine.anchors.campRecovery.position[1];
  if (spine?.zone !== 'camp' || ![spine.from[2], floor, camp.length].every(Number.isFinite) ||
      camp.length < 10 || (camp.side !== 'left' && camp.side !== 'right')) return;

  const { x, depth, top } = undergroundCampDiningTables;
  const across = camp.side === 'right' ? x[1] : -x[1];
  const artStart = spine.from[2] + (camp.length - 10) / 2;
  const forward = artStart + depth;
  return {
    id: undergroundCampPickaxe.siteId,
    aim: [across, floor + top + .033, forward + 1.06] as LocalPoint,
    approach: [across, floor, forward + 1.91] as LocalPoint,
  };
}

export type UndergroundCampPickaxeResult = 'granted' | 'already-granted' | 'rejected';
