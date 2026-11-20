import { createIceTreasureRound } from './ice-treasure-round.js';

type Point = Readonly<{ east: number; north: number }>;
type Team = string | number;

export type IceTreasureRoomSite = Readonly<{
  pedestal: Point;
  pickupRadius: number;
  scoreRingRadius: number;
  scoreRings: ReadonlyMap<Team, Point>;
  mode: 'round' | 'free';
  // Production registers the agreed reset timing and carrier-exit disposition together with the rink.
  resetAfterScoreMs: number;
  returnOnCarrierExit: true;
}>;

type State = ReturnType<ReturnType<typeof createIceTreasureRound>['snapshot']>;
export type IceTreasureRoomUpdate = {
  type: 'ice-treasure-state';
  state: null | { treasure: State['treasure']; scores: [Team, number][]; winner?: Team };
};

type Host = {
  now(): number;
  isIceOpen(): boolean;
  // Must use the current server record, arena boundary, height and team roster.
  acceptedSkater(id: number): (Point & { team: Team }) | undefined;
  deliver(id: number, update: IceTreasureRoomUpdate): void;
};

export function createIceTreasureRoom(site: IceTreasureRoomSite, host: Host) {
  if (site.scoreRings.size !== 2 || !(site.pickupRadius > 0) || !(site.scoreRingRadius > 0) ||
      !Number.isFinite(site.resetAfterScoreMs) || site.resetAfterScoreMs < 0 ||
      (site.mode !== 'round' && site.mode !== 'free') || site.returnOnCarrierExit !== true) {
    throw new RangeError('Ice treasure needs the sanctioned rink, team circles and reset rules');
  }
  const round = createIceTreasureRound({ ...site, ...host }, site.mode);
  const members = new Set<number>();
  let resetAt: number | undefined;

  function sendState(only?: number) {
    const { treasure, scores, winner } = round.snapshot();
    const update: IceTreasureRoomUpdate = {
      type: 'ice-treasure-state', state: { treasure, scores: [...scores], ...(winner === undefined ? {} : { winner }) },
    };
    if (only === undefined) {
      for (const id of members) host.deliver(id, update);
    } else host.deliver(only, update);
  }

  function remove(id: number) {
    if (!members.delete(id)) return;
    host.deliver(id, { type: 'ice-treasure-state', state: null });
    if (round.returnUnavailableCarrier(id)) sendState();
  }

  function playingIceIsOpen() {
    if (host.isIceOpen() === true) return true;
    const revoked = [...members];
    members.clear();
    for (const id of revoked) {
      round.returnUnavailableCarrier(id);
      host.deliver(id, { type: 'ice-treasure-state', state: null });
    }
    return false;
  }

  return {
    // Observe only after normal pose admission. Leaving the configured rink revokes membership and its view.
    observeAcceptedMove(id: number) {
      if (!playingIceIsOpen()) return;
      const skater = host.acceptedSkater(id);
      if (!skater || !site.scoreRings.has(skater.team) ||
          !Number.isFinite(skater.east) || !Number.isFinite(skater.north)) {
        remove(id);
        return;
      }
      if (!members.has(id)) {
        members.add(id);
        sendState(id);
      }
      const score = round.acceptedMove(id);
      if (!score) return;
      if (score.winner === undefined) resetAt = host.now() + site.resetAfterScoreMs;
      sendState();
    },

    // The requesting identity comes from the joined peer, never from JSON.
    requestPickup(id: number) {
      if (!playingIceIsOpen() || !members.has(id) || !round.requestPickup(id)) return false;
      sendState();
      return true;
    },

    // Call only after presence has accepted and marked this throw as confirmed.
    confirmedSnowballHit(thrower: number, recipient: number) {
      if (!playingIceIsOpen() || !members.has(thrower) || !members.has(recipient)) return;
      if (round.confirmedSnowballHit(thrower, recipient)) sendState();
    },
    remove(id: number) { if (playingIceIsOpen()) remove(id); },
    tick() {
      if (!playingIceIsOpen() || resetAt === undefined || !(host.now() >= resetAt)) return;
      resetAt = undefined;
      if (round.resetTreasureAfterScore()) sendState();
    },
  };
}
