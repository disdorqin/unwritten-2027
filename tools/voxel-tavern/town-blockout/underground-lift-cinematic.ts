export type UndergroundLiftCinematicPhase =
  'boarding' | 'ride' | 'sway' | 'flash' | 'screech' | 'blackout' | 'waking' | 'sitting' | 'complete';

export type UndergroundLiftCinematicFrame = Readonly<{
  tripId: number;
  phase: UndergroundLiftCinematicPhase;
  progress: number;
  sway: number;
  blackout: boolean;
  canSkip: boolean;
  skipped: boolean;
  waterFilm?: true;
}>;

type Descent = Readonly<{ id: number; first: boolean; departedAt: number; travelMs: number }>;
type ActiveDescent = {
  descent: Descent;
  sampledPhase?: UndergroundLiftCinematicPhase;
  blackoutPainted: boolean;
  handingOff: boolean;
  acceptedAt?: number;
  skipped: boolean;
};

const wakeMs = 1150;
const sitUpMs = 950;
const waterFilmLeadMs = 1500;

function progress(elapsed: number, start: number, end: number) {
  return Math.min(1, Math.max(0, (elapsed - start) / (end - start)));
}

function travelFrame({ first, departedAt, travelMs }: Descent, now: number) {
  const elapsed = now - departedAt;
  const boardingEnd = first ? Math.min(2400, travelMs * .19) : 550;
  const swayStart = first ? boardingEnd : travelMs - 1750;
  const swayEnd = first ? travelMs * .67 : travelMs - 850;
  const screechStart = travelMs * .76;
  const blackoutStart = first ? travelMs * .88 : swayEnd;

  if (elapsed < boardingEnd) return ['boarding', progress(elapsed, 0, boardingEnd), 0] as const;
  if (elapsed < swayStart) return ['ride', progress(elapsed, boardingEnd, swayStart), 0] as const;
  if (elapsed < swayEnd) {
    const amount = progress(elapsed, swayStart, swayEnd);
    return ['sway', amount, first ? amount * amount * .7 : amount * .2] as const;
  }
  if (first && elapsed < screechStart) return ['flash', progress(elapsed, swayEnd, screechStart), .8] as const;
  if (first && elapsed < blackoutStart) return ['screech', progress(elapsed, screechStart, blackoutStart), 1] as const;
  return ['blackout', progress(elapsed, blackoutStart, travelMs), 0] as const;
}

/** Local presentation for one authority epoch. The host owns the trip, scene transition and accepted landing. */
export function createUndergroundLiftCinematic() {
  let active: ActiveDescent | undefined;
  let lastTripId = 0;
  let now = -Infinity;

  function advance(time: number) {
    if (Number.isFinite(time)) now = Math.max(now, time);
  }

  function frame({ descent, acceptedAt, skipped }: ActiveDescent): UndergroundLiftCinematicFrame {
    let phase: UndergroundLiftCinematicPhase;
    let amount = 1;
    let sway = 0;
    if (acceptedAt === undefined) {
      [phase, amount, sway] = travelFrame(descent, now);
    } else if (!descent.first || skipped || now - acceptedAt >= wakeMs + sitUpMs) {
      phase = 'complete';
    } else if (now - acceptedAt < wakeMs) {
      phase = 'waking';
      amount = progress(now - acceptedAt, 0, wakeMs);
    } else {
      phase = 'sitting';
      amount = progress(now - acceptedAt, wakeMs, wakeMs + sitUpMs);
    }
    const blackout = phase === 'blackout';
    const remaining = descent.travelMs - (now - descent.departedAt);
    // Mark the midpoint of the final fall without affecting the accepted landing.
    const crossesWaterFilm = acceptedAt === undefined && !skipped && remaining > 0 &&
      remaining <= Math.min(waterFilmLeadMs, descent.travelMs / 2);
    return {
      tripId: descent.id, phase, progress: amount, sway, blackout, skipped,
      canSkip: descent.first && !skipped && (blackout || phase === 'waking' || phase === 'sitting'),
      ...(crossesWaterFilm ? { waterFilm: true } : {}),
    };
  }

  return {
    // Both times use the same synchronized clock. The caller verifies membership in the downward trip.
    start(descent: Descent, time: number): boolean {
      if (!Number.isSafeInteger(descent.id) || descent.id <= lastTripId || typeof descent.first !== 'boolean' ||
          !Number.isFinite(descent.departedAt) || !Number.isFinite(time) || !Number.isFinite(descent.travelMs) ||
          descent.travelMs <= 0 || (!descent.first && (descent.travelMs < 20_000 || descent.travelMs > 30_000))) return false;
      advance(time);
      if (active && frame(active).phase !== 'complete') return false;
      lastTripId = descent.id;
      active = { descent: { ...descent }, blackoutPainted: false, handingOff: false, skipped: false };
      return true;
    },

    sample(time: number): UndergroundLiftCinematicFrame | undefined {
      if (!active) return;
      advance(time);
      const current = frame(active);
      active.sampledPhase = current.phase;
      return current;
    },

    // The scene host calls this only after a full-black frame was actually presented.
    confirmBlackout(tripId: number): boolean {
      if (active?.descent.id !== tripId || active.sampledPhase !== 'blackout' || active.acceptedAt !== undefined) return false;
      active.blackoutPainted = true;
      return true;
    },

    beginHandoff(tripId: number): boolean {
      if (active?.descent.id !== tripId || !active.blackoutPainted || active.handingOff ||
          active.acceptedAt !== undefined || now - active.descent.departedAt < active.descent.travelMs) return false;
      active.handingOff = true;
      return true;
    },

    retryHandoff(tripId: number): boolean {
      if (active?.descent.id !== tripId || !active.handingOff || active.acceptedAt !== undefined) return false;
      active.handingOff = false;
      return true;
    },

    // This acknowledges the visual handoff. The host first verifies a safe landing for this rider and trip.
    acceptLanding(tripId: number, time: number): boolean {
      if (active?.descent.id !== tripId || !active.handingOff || active.acceptedAt !== undefined || !Number.isFinite(time)) return false;
      advance(time);
      active.acceptedAt = now;
      return true;
    },

    skip(tripId: number): boolean {
      if (active?.descent.id !== tripId || !frame(active).canSkip) return false;
      active.skipped = true;
      return true;
    },

    cancel(tripId: number): boolean {
      if (active?.descent.id !== tripId) return false;
      active = undefined;
      return true;
    },
  };
}
