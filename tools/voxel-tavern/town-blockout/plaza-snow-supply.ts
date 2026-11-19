import type { Vector3 } from 'three';
import { snowballSegmentBox, type SnowballContact } from './town-snowball';

export const plazaSnowSupplySites = [
  { id: 'west', east: 216, north: 196 },
  { id: 'north', east: 233, north: 206 },
  { id: 'south', east: 233, north: 160 },
] as const;
export type PlazaSnowSupplySite = typeof plazaSnowSupplySites[number];

export const plazaSnowSupplySize = { halfWidth: .7, height: .48 } as const;
export const plazaSnowSupplyRefillMs = 60_000;
const supplyServings = 5;
const depletedHeightScale = .65;
const contactTolerance = 1e-6;
type HeightAt = (east: number, north: number) => number;
type SnowballStock = { gather(amount: number): boolean };

export function createPlazaSnowSupply(now = () => performance.now()) {
  const lastScoop = new Map<PlazaSnowSupplySite['id'], number>();
  const { halfWidth, height } = plazaSnowSupplySize;

  function aimed(from: Vector3, to: Vector3, heightAt: HeightAt, sceneContact?: Pick<SnowballContact, 'at'>) {
    const rayLengthSquared = from.distanceToSquared(to);
    if (!(rayLengthSquared > 0) || !Number.isFinite(rayLengthSquared)) return undefined;
    const sceneEntry = sceneContact
      ? Math.sqrt(from.distanceToSquared(sceneContact.at) / rayLengthSquared)
      : 1;
    let bestEntry = sceneEntry + contactTolerance;
    let nearest: PlazaSnowSupplySite | undefined;
    for (const site of plazaSnowSupplySites) {
      const west = site.east - halfWidth;
      const east = site.east + halfWidth;
      const minZ = -site.north - halfWidth;
      const maxZ = -site.north + halfWidth;
      if (west > Math.max(from.x, to.x) || east < Math.min(from.x, to.x) ||
          minZ > Math.max(from.z, to.z) || maxZ < Math.min(from.z, to.z)) continue;
      const base = heightAt(site.east, site.north);
      const entry = snowballSegmentBox(from, to, [west, base, minZ], [east, base + height, maxZ], 0);
      if (entry === undefined || entry >= bestEntry) continue;
      bestEntry = entry;
      nearest = site;
    }
    return nearest;
  }

  function gather(snowballs: SnowballStock, ambientServings: number, supply?: PlazaSnowSupplySite) {
    const applied = snowballs.gather(supply ? supplyServings : ambientServings);
    if (applied && supply) lastScoop.set(supply.id, now());
    return applied;
  }

  function heightScale({ id }: PlazaSnowSupplySite) {
    const dugAt = lastScoop.get(id);
    if (dugAt === undefined) return 1;
    const time = now();
    if (time >= dugAt + plazaSnowSupplyRefillMs) {
      lastScoop.delete(id);
      return 1;
    }
    const refill = Math.max(0, time - dugAt) / plazaSnowSupplyRefillMs;
    return depletedHeightScale + (1 - depletedHeightScale) * refill;
  }

  return { aimed, gather, heightScale };
}
