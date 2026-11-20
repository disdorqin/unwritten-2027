type LiftDirection = 'down' | 'up';
type LiftStop = 'crater-floor' | 'mine';
type AcceptedFoot = Readonly<{
  playerId: string;
  domainId: string;
  east: number;
  north: number;
  height: number;
}>;

export type UndergroundMineLiftTrip = Readonly<{
  id: number;
  origin: LiftStop;
  destination: LiftStop;
  direction: LiftDirection;
  departedAt: number;
  travelMs: number;
  riders: readonly string[];
}>;

type LiftOptions = {
  travelMs: number;
  riderCapacity: number;
  now(): number;
  requestCageRide(playerId: string, direction: LiftDirection): { kind: string; direction?: LiftDirection };
  readAcceptedFoot(playerId: string): AcceptedFoot | undefined;
  isAtBoardingPlatform(stop: LiftStop, foot: AcceptedFoot): boolean;
  readDockedStop(): LiftStop | undefined;
};

/** Movement owns the cabin and rider footsteps. The lift only permits and tracks trips. */
export function createUndergroundMineLift(options: LiftOptions) {
  const { travelMs, riderCapacity } = options;
  if (!Number.isFinite(travelMs) || travelMs < 20_000 || travelMs > 30_000 ||
      !Number.isSafeInteger(riderCapacity) || riderCapacity < 1) {
    throw new RangeError('The lift needs a 20–30 second journey and an explicit positive rider capacity');
  }

  const boarded = new Set<string>();
  let stop: LiftStop | undefined;
  let trip: UndergroundMineLiftTrip | undefined;
  let sequence = 0;

  function observedStop(): LiftStop | undefined {
    const dock = options.readDockedStop();
    if (dock === undefined) return;
    // A fresh authority can recover either dock. After that, only a confirmed trip changes stops.
    stop ??= dock;
    return dock === stop ? stop : undefined;
  }

  function directionAtStop(stop: LiftStop): LiftDirection {
    return stop === 'crater-floor' ? 'down' : 'up';
  }

  function canRide(playerId: string, direction: LiftDirection, stop: LiftStop): boolean {
    if (!playerId) return false;
    const foot = options.readAcceptedFoot(playerId);
    if (!foot || foot.playerId !== playerId || !foot.domainId ||
        ![foot.east, foot.north, foot.height].every(Number.isFinite) ||
        !options.isAtBoardingPlatform(stop, foot)) return false;
    const decision = options.requestCageRide(playerId, direction);
    return decision.kind === 'ride-cage' && decision.direction === direction;
  }

  return {
    state: () => trip ? { trip: { ...trip, riders: [...trip.riders] } } : { stop: observedStop(), riders: [...boarded] },

    // The caller supplies the authenticated session's stable player id.
    board(playerId: string, direction: LiftDirection): boolean {
      if (trip) return false;
      const dock = observedStop();
      if (!dock || direction !== directionAtStop(dock) ||
          (boarded.size >= riderCapacity && !boarded.has(playerId)) || !canRide(playerId, direction, dock)) {
        return false;
      }
      boarded.add(playerId);
      return true;
    },

    leave(playerId: string): boolean {
      return trip === undefined && boarded.delete(playerId);
    },

    depart(playerId: string): UndergroundMineLiftTrip | undefined {
      if (trip || !boarded.has(playerId)) return;
      const dock = observedStop();
      if (!dock) return;
      const departedAt = options.now();
      if (!Number.isFinite(departedAt)) return;
      const direction = directionAtStop(dock);
      for (const rider of boarded) {
        if (!canRide(rider, direction, dock)) boarded.delete(rider);
      }
      if (!boarded.has(playerId)) return;
      trip = {
        id: ++sequence,
        origin: dock,
        destination: direction === 'down' ? 'mine' : 'crater-floor',
        direction,
        departedAt,
        travelMs,
        riders: [...boarded],
      };
      boarded.clear();
      return { ...trip, riders: [...trip.riders] };
    },

    // The host reports a physical dock. Elapsed time alone never moves or lands a player.
    confirmArrival(tripId: number): boolean {
      if (!trip || trip.id !== tripId || options.readDockedStop() !== trip.destination) return false;
      const now = options.now();
      if (!Number.isFinite(now) || now - trip.departedAt < trip.travelMs) return false;
      stop = trip.destination;
      trip = undefined;
      return true;
    },
  };
}
