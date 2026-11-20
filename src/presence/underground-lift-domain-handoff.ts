import type { createUndergroundMineLift, UndergroundMineLiftTrip } from './underground-mine-lift.js';

type LiftPort = Pick<ReturnType<typeof createUndergroundMineLift>, 'state' | 'confirmArrival'>;
type Stop = UndergroundMineLiftTrip['destination'];
type Foot = Readonly<{ playerId: string; domainId: string; east: number; north: number; height: number }>;
type AcceptedLanding = Readonly<{ tripId: number; foot: Foot }>;
type CueState = Readonly<{ tripId: number; stop: Stop; docked: boolean; landing?: Foot }>;
type Options = Readonly<{
  lift: LiftPort;
  domains: Readonly<Record<Stop, string>>;
  readAcceptedLanding(playerId: string): AcceptedLanding | undefined;
  isAtAcceptedLanding(stop: Stop, foot: Foot): boolean;
}>;

/** Pass cues between the lift and the shared domain host. The host accepts movement and owns realm loading. */
export function createUndergroundLiftDomainHandoff({ lift, domains, readAcceptedLanding, isAtAcceptedLanding }: Options) {
  const domainAt = { ...domains };
  if (!domainAt.mine.trim() || !domainAt['crater-floor'].trim() || domainAt.mine === domainAt['crater-floor']) {
    throw new RangeError('A lift handoff requires distinct registered domains');
  }
  const cues = new Map<string, CueState>();

  return {
    // The cabin's jolt is rendered by the caller, using the server-accepted list of riders.
    jolt(playerId: string, tripId: number) {
      const { trip } = lift.state();
      const current = cues.get(playerId);
      if (!trip || trip.id !== tripId || !trip.riders.includes(playerId) || (current && current.tripId >= tripId)) return;
      cues.set(playerId, { tripId, stop: trip.destination, docked: false });
      return { phase: 'blackout', playerId, tripId } as const;
    },

    confirmDock(tripId: number): boolean {
      const { trip } = lift.state();
      if (!trip || trip.id !== tripId || !lift.confirmArrival(tripId)) return false;
      for (const rider of trip.riders) {
        const cue = cues.get(rider);
        if (cue?.tripId === tripId) cues.set(rider, { ...cue, docked: true });
      }
      return true;
    },

    wake(playerId: string, tripId: number) {
      const current = cues.get(playerId);
      if (!current?.docked || current.tripId !== tripId) return;
      if (current.landing) return { phase: 'wake', tripId, foot: { ...current.landing } } as const;
      const landing = readAcceptedLanding(playerId);
      if (!landing || landing.tripId !== tripId) return;
      const { foot } = landing;
      if (foot.playerId !== playerId || foot.domainId !== domainAt[current.stop] ||
          ![foot.east, foot.north, foot.height].every(Number.isFinite) || !isAtAcceptedLanding(current.stop, foot)) return;
      cues.set(playerId, { ...current, landing: { ...foot } });
      return { phase: 'wake', tripId, foot: { ...foot } } as const;
    },

    // Keep the accepted location available while the visual handoff is being retried.
    finishWake(playerId: string, tripId: number): boolean {
      const current = cues.get(playerId);
      return current?.tripId === tripId && current.landing !== undefined && cues.delete(playerId);
    },

    forget(playerId: string) {
      cues.delete(playerId);
    },
  };
}
