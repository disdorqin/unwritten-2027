import { readStarStoneLocation, type StarStoneLocation } from './zodiac-star-stones.js';

const entityByStone = {
  rabbit: 'r2-halfway-lookout',
  dragon: 'starport-flight-site',
  pig: 'main-summit-hut-and-registration',
} as const;

export type AlpineStarStoneId = keyof typeof entityByStone;
export type AlpineStarStoneEntity = typeof entityByStone[AlpineStarStoneId];
type ENY = Readonly<Omit<StarStoneLocation, 'layer'>>;

/** Supplied by the server's mounted scene, with its live transform and collision queries. */
export type AlpineStarStoneMount = Readonly<{
  mode: 'production' | 'preview' | 'skyline';
  origin: ENY;
  approach: ENY;
  toWorld(point: ENY): StarStoneLocation | undefined;
  supports(point: StarStoneLocation): boolean;
  canPickUpFrom(approach: StarStoneLocation, origin: StarStoneLocation): boolean;
}>;

/** Bind only explicitly mounted entities. The release skyline and detached review scenes have no origins. */
export function resolveAlpineStarStoneSite(
  id: AlpineStarStoneId,
  entity: (name: AlpineStarStoneEntity) => AlpineStarStoneMount | undefined,
) {
  const mount = entity(entityByStone[id]);
  if (mount?.mode !== 'production') return;

  const origin = readStarStoneLocation(mount.toWorld(mount.origin));
  const approach = readStarStoneLocation(mount.toWorld(mount.approach));
  if (!origin || !approach || origin.layer !== approach.layer ||
      !mount.supports(origin) || !mount.supports(approach) || !mount.canPickUpFrom(approach, origin)) return;

  return { origin, approach };
}
