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
  /** Allocate and durably commit a positive, never-reused trip ID in the single world authority. */
  allocateTripId(): number;
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
  let lastIssuedTripId = 0;

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

  function startTrip(origin: LiftStop, departedAt: number, riders: readonly string[]) {
    // A restart must never recycle trip 1: the old rider's accepted landing could then wake in a new trip.
    // The host must commit the allocation before this authority announces departure.
    const id = options.allocateTripId();
    if (!Number.isSafeInteger(id) || id <= lastIssuedTripId) {
      throw new RangeError('Lift trip IDs must be durable, positive and monotonically increasing');
    }
    const direction = directionAtStop(origin);
    lastIssuedTripId = id;
    trip = {
      id, origin, direction,
      destination: direction === 'down' ? 'mine' : 'crater-floor',
      departedAt, travelMs, riders,
    };
    return { ...trip, riders: [...riders] };
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
      const departing = startTrip(dock, departedAt, [...boarded]);
      boarded.clear();
      return departing;
    },

    // An accepted waiting player may bring the idle, empty cage to the other platform.
    callEmptyCage(playerId: string, destination: LiftStop): UndergroundMineLiftTrip | undefined {
      if (trip || boarded.size !== 0) return;
      const dock = observedStop();
      if (!dock || dock === destination || !canRide(playerId, directionAtStop(destination), destination)) return;
      const departedAt = options.now();
      if (!Number.isFinite(departedAt)) return;
      return startTrip(dock, departedAt, []);
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
