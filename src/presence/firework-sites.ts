// The plaza interaction anchor and cooldown are shared by the viewer and presence.
export const publicFireworksStand = {
  east: 204,
  north: 174,
  fixtureNorth: 172.65,
  launch: [204, 13, -172.65],
} as const;

export const fireworksThemeLabels = {
  'gold-red': '金红',
  'ice-blue': '冰蓝',
  'pink-glow': '粉霞',
} as const;
export type FireworksTheme = keyof typeof fireworksThemeLabels;
export const fireworksSiteRangeMetres = 2;
export const fireworksShowMs = 20_000;
export const fireworksCooldownMs = 90_000;

export function isFireworksTheme(value: unknown): value is FireworksTheme {
  return typeof value === 'string' && Object.hasOwn(fireworksThemeLabels, value);
}

export function isFireworksSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}
