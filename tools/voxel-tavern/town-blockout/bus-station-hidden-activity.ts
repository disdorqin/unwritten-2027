import { Vector3, type Group } from 'three';
import { busStationHiddenStops } from './landmark-station';
import type { TownActivityContext, TownActivitySpot } from './town-activity';
import type { PassportStamp } from './town-passport';

export const busStationTicket = '永不启程的车票';
export const busStationCatalogueStamp = {
  id: 'bus-station-waiting-for-the-bus',
  label: '等一班不来的车',
  hint: '在汽车站售票窗收集旧车票。',
} as const satisfies PassportStamp;

type StationFoot = Pick<TownActivitySpot, 'x' | 'n' | 'ground'>;

// Structural subset of the ZB-17 stationBroadcast effect. Freshness and delivery
// are decided by ZB-17's receiver on the established presence connection.
type StationBeaconCue = Readonly<{ type: 'event'; kind: 'town-night-beacon'; at: number; expiresAt: number }>;
type BusStationHost = {
  canStand(x: number, n: number, ground: number): boolean;
  canBuyTicket(): boolean;
  canHearStationBroadcast?(): boolean;
  listener?(): StationFoot | undefined;
  onTicketCollected?(): void;
  playStationBroadcast?(cue: StationBeaconCue, origin: Vector3): void;
};

const ticketReach = 1.25;
const platformHearingRange = 4;
const floorTolerance = .55;

function worldFoot(station: Group, local: readonly [number, number, number]): StationFoot {
  const world = station.localToWorld(new Vector3(...local));
  return { x: world.x, n: -world.z, ground: world.y };
}

export function createBusStationHiddenActivity(
  station: Group, context: Pick<TownActivityContext, 'open'>,
  passport: { hasExtension(id: string): boolean; collectExtension(id: string): boolean },
  host: BusStationHost,
) {
  const ticket = worldFoot(station, busStationHiddenStops.ticket);
  const platform = worldFoot(station, busStationHiddenStops.platform);
  const speaker = station.localToWorld(new Vector3(...busStationHiddenStops.speaker));
  const spots: TownActivitySpot[] = [];
  const { id, label } = busStationCatalogueStamp;
  const hasTicket = () => passport.hasExtension(id);
  const canBuy = () => host.canBuyTicket() && !hasTicket();
  if (host.canStand(ticket.x, ticket.n, ticket.ground)) {
    spots.push({
      ...ticket, range: ticketReach, label: `领取${busStationTicket}`,
      available: canBuy,
      run() {
        if (!canBuy() || !passport.collectExtension(id)) return;
        context.open(busStationTicket, `已收进扩展收集页 · ${label}`);
        host.onTicketCollected?.();
      },
    }, {
      ...ticket, range: ticketReach, label: `查看图鉴 · ${label}`,
      available: hasTicket,
      run() {
        if (hasTicket()) context.open(label, busStationTicket);
      },
    });
  }

  let lastStationBeaconAt = -1;
  return {
    spots,
    platform,
    stationBroadcast(cue: StationBeaconCue) {
      if (cue.at <= lastStationBeaconAt) return false;
      lastStationBeaconAt = cue.at;
      if (!host.playStationBroadcast || !host.canHearStationBroadcast?.()) return false;
      const player = host.listener?.();
      const withinPlatform = player && Math.abs(player.ground - platform.ground) <= floorTolerance &&
        Math.hypot(player.x - platform.x, player.n - platform.n) <= platformHearingRange;
      if (!withinPlatform) return false;
      host.playStationBroadcast(cue, speaker);
      return true;
    },
  };
}
