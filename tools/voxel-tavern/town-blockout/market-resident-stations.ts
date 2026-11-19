import type { Group } from 'three';
import { marketStalls } from './market-fair';
import { marketStallLayouts, marketStallLocalPoint, type MarketStallKind } from './market-stall-layout';
import type { TownActivitySpot } from './town-activity';
import type { TownResidentStation } from './town-npc-residents';
import type { marketResidentNames } from './town-npc-stations';

type MarketResidentName = typeof marketResidentNames[number];
type MarketStallId = typeof marketStallLayouts[number]['id'];
type MarketGeometry = Pick<Group, 'userData'>;
type StationOptions = {
  market: () => MarketGeometry | undefined;
  fairSpots: readonly TownActivitySpot[];
  standableGround: (east: number, north: number, feet: number) => number | undefined;
  vendorActivity?: (name: MarketResidentName) => TownActivitySpot | undefined;
};

const booths = {
  贾明灯: { id: 'market-stall-13', kind: '灯笼' },
  文墨生: { id: 'market-stall-15', kind: '春联年画' },
  胡六环: { id: 'market-stall-16', kind: '玩具/套圈' },
} as const satisfies Record<MarketResidentName, { id: MarketStallId; kind: MarketStallKind }>;

export function createMarketResidentStationLookup(options: StationOptions) {
  const stations = new WeakMap<MarketGeometry, Map<MarketStallId, TownResidentStation>>();
  const indices = new Map(marketStallLayouts.map((booth, index) => [booth.id, index]));

  return function marketStall(name: MarketResidentName) {
    const { id, kind } = booths[name];
    const market = options.market();
    const index = indices.get(id);
    if (!market || index === undefined) return undefined;
    const emitted = market.userData.marketStallIds;
    if (!Array.isArray(emitted) || !emitted.includes(id)) return undefined;
    const model = marketStallLayouts[index];
    const booth = marketStalls[index];
    const fair = options.fairSpots[index];
    if (model.kind !== kind || booth?.id !== id || booth.kind !== kind || !fair ||
        fair.x !== booth.spot.x || fair.n !== booth.spot.n || fair.ground !== booth.spot.ground) return undefined;

    let occupied = stations.get(market);
    if (!occupied) {
      occupied = new Map();
      stations.set(market, occupied);
    }
    let station = occupied.get(id);
    if (!station) {
      function standAt(dx: number, dz: number, hint: number) {
        const [x, z] = marketStallLocalPoint(model, dx, dz);
        const east = booth.east + (x - model.x);
        const north = booth.north - (z - model.z);
        const feet = options.standableGround(east, north, hint);
        if (feet !== undefined) return [east, north, feet] as const;
      }

      const actor = standAt(0, -.25, model.base);
      // The adjacent customer position keeps the talk prompt separate from the central fair action.
      const talk = standAt(1.05, 2.6, model.counterGround) ?? standAt(-1.05, 2.6, model.counterGround);
      if (!actor || !talk) return undefined;
      station = { actor, talk };
      occupied.set(id, station);
    }
    return { station, activity: options.vendorActivity?.(name) ?? fair };
  };
}
