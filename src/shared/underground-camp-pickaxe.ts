export const undergroundCampPickaxe = {
  siteId: 'mine-camp-old-pickaxe',
  tool: 'pickaxe',
  horizontalReach: 1.15,
  verticalReach: .35,
} as const;

export type UndergroundCampPickaxeResult = 'granted' | 'already-granted' | 'rejected';
