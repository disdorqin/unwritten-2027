import { undergroundCampPickaxe, type UndergroundCampPickaxeResult } from '../shared/underground-camp-pickaxe.js';

type PickaxeSite = Readonly<{ domainId: string; east: number; north: number; height: number }>;
type AcceptedFoot = PickaxeSite & Readonly<{ playerId: string }>;

type Options = Readonly<{
  /** World coordinates of the tool, with the adjacent walkable floor as height. */
  site: PickaxeSite;
  readAcceptedFoot(playerId: string): AcceptedFoot | undefined;
  hasAcceptedMineArrival(playerId: string): boolean;
  hasAcceptedPickaxeSight(playerId: string, siteId: typeof undergroundCampPickaxe.siteId): boolean;
  /** Atomically record the per-profile receipt and grant the original tool through the inventory host. */
  grantToolOnce(playerId: string, pickup: typeof undergroundCampPickaxe): Promise<UndergroundCampPickaxeResult>;
}>;

export function createUndergroundCampPickaxeAuthority({
  site, readAcceptedFoot, hasAcceptedMineArrival, hasAcceptedPickaxeSight, grantToolOnce,
}: Options) {
  const { domainId, east, north, height } = site;
  if (!domainId.trim() || ![east, north, height].every(Number.isFinite)) {
    throw new RangeError('The camp pickaxe needs a registered domain and a finite walkable anchor');
  }
  const inFlight = new Set<string>();

  return async function claim(playerId: string, siteId: unknown): Promise<UndergroundCampPickaxeResult> {
    if (siteId !== undergroundCampPickaxe.siteId || !playerId.trim() || inFlight.has(playerId)) return 'rejected';
    const foot = readAcceptedFoot(playerId);
    if (!foot || foot.playerId !== playerId || foot.domainId !== domainId ||
        ![foot.east, foot.north, foot.height].every(Number.isFinite) ||
        Math.hypot(foot.east - east, foot.north - north) > undergroundCampPickaxe.horizontalReach ||
        Math.abs(foot.height - height) > undergroundCampPickaxe.verticalReach ||
        !hasAcceptedMineArrival(playerId) || !hasAcceptedPickaxeSight(playerId, siteId)) return 'rejected';
    inFlight.add(playerId);
    try {
      return await grantToolOnce(playerId, undergroundCampPickaxe);
    } finally {
      inFlight.delete(playerId);
    }
  };
}
