import type { StarStoneLocation } from './zodiac-star-stones.js';

export type SoulMayorSite = Readonly<{ actor: StarStoneLocation; talk: StarStoneLocation }>;
export type SoulMayorView = Readonly<{
  site: SoulMayorSite;
  invited: boolean;
  ringCount: number;
}>;

export const soulMayorTalkRange = .85;
export const soulMayorFloorTolerance = .55;

export const livingMayorQuestion = '问问镇长';
export const livingMayorDeflection = '镇长？不太清楚呀，那是老一辈了，那是我们的先祖了';
