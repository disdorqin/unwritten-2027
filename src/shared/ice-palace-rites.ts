export const icePalaceRiteSites = {
  lever: { stand: [-13, .12, -1.30], fixture: [-13, .12, -2.63] },
  harvest: { stand: [-5.95, .12, -5.43], fixture: [-5.95, .12, -6.62] },
  solstice: { stand: [1.40, .12, 6.97], fixture: [1.40, .12, 8.25] },
} as const;

export const icePalaceRiteReach = .85;
export const icePalaceRiteHeightTolerance = .55;
export type IcePalaceRite = keyof typeof icePalaceRiteSites;
export type IcePalaceSolsticeRite = 'closed' | 'ready' | 'completed';
export type IcePalaceRiteState = Readonly<{
  frozen: boolean;
  leverAvailable: boolean;
  harvestAvailable: boolean;
  solsticeRite: IcePalaceSolsticeRite;
}>;
export type IcePalaceLakeConditions = Readonly<{ frozen: boolean; showUnderIceGlow: boolean }>;
export type IcePalaceRiteSnapshot = Readonly<{
  lake: IcePalaceLakeConditions | undefined;
  rites: IcePalaceRiteState;
}>;

export function isIcePalaceRite(value: unknown): value is IcePalaceRite {
  return typeof value === 'string' && Object.hasOwn(icePalaceRiteSites, value);
}
