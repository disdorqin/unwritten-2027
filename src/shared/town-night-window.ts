export const townDayMs = 10 * 60_000;
export const townDaylightMs = 6 * 60_000;
export const townLayerOverlapMs = 60_000;
const driftDays = 12;

export type TownNightSchedule = Readonly<{
  duskAt: number;
  beaconAt: number;
  morningBellAt: number;
  cueExpiresAt: number;
}>;

type OrdinaryTownNightOptions = Readonly<{
  dawnEpoch: number;
  beaconOffsetsAfterDusk: readonly number[];
  cueFreshnessMs: number;
}>;

function isEpoch(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Supply the approved drift table. The host can substitute its real-time New Year's Eve schedule. */
export function createOrdinaryTownNightSchedule({ dawnEpoch, beaconOffsetsAfterDusk, cueFreshnessMs }: OrdinaryTownNightOptions) {
  const offsets = [...beaconOffsetsAfterDusk];
  const nightMs = townDayMs - townDaylightMs;
  if (!isEpoch(dawnEpoch) || !isEpoch(cueFreshnessMs) || cueFreshnessMs === 0 || offsets.length !== driftDays ||
      offsets.some(offset => !isEpoch(offset) || offset === 0 || offset + Math.max(townLayerOverlapMs, cueFreshnessMs) > nightMs)) {
    throw new RangeError('Invalid town night schedule');
  }
  return (now: number): TownNightSchedule | undefined => {
    if (!isEpoch(now) || now < dawnEpoch) return;
    const day = Math.floor((now - dawnEpoch) / townDayMs);
    const duskAt = dawnEpoch + day * townDayMs + townDaylightMs;
    const beaconAt = duskAt + offsets[day % driftDays];
    const morningBellAt = duskAt + nightMs;
    if (!isEpoch(morningBellAt)) return;
    return { duskAt, beaconAt, morningBellAt, cueExpiresAt: beaconAt + cueFreshnessMs };
  };
}

export type TownNightWindowState = Readonly<{
  phase: 'day' | 'awaiting-beacon' | 'night-window';
  shift: 'day' | 'night';
  canEnterRestricted: boolean;
  layersOverlap: boolean;
  chapterGatesLocked: true;
  beaconAt: number | null;
  morningBellAt: number | null;
}>;

type TownNightWindowHost = Readonly<{
  /** The authoritative host clock, shared by all players in this town. */
  now: () => number;
  scheduleAt: (now: number) => TownNightSchedule | undefined;
  /** Synchronously commit the latest receipt before publishing the one-shot cue. */
  saveBeacon?: (at: number) => void;
}>;

function validSchedule(schedule: TownNightSchedule | undefined): schedule is TownNightSchedule {
  return Boolean(schedule && isEpoch(schedule.duskAt) && isEpoch(schedule.beaconAt) &&
    isEpoch(schedule.cueExpiresAt) && isEpoch(schedule.morningBellAt) &&
    schedule.duskAt < schedule.beaconAt && schedule.beaconAt < schedule.cueExpiresAt &&
    schedule.cueExpiresAt <= schedule.morningBellAt);
}

function windowState(now: number, schedule: TownNightSchedule | undefined, receivedAt: number | null): TownNightWindowState {
  const inNight = schedule !== undefined && now >= schedule.duskAt && now < schedule.morningBellAt;
  const open = inNight && now >= schedule.beaconAt && receivedAt === schedule.beaconAt;
  return {
    phase: open ? 'night-window' : inNight ? 'awaiting-beacon' : 'day',
    shift: open ? 'night' : 'day',
    canEnterRestricted: open,
    layersOverlap: open && now - schedule.beaconAt < townLayerOverlapMs,
    chapterGatesLocked: true,
    beaconAt: schedule?.beaconAt ?? null,
    morningBellAt: schedule?.morningBellAt ?? null,
  };
}

/** Call once per town. Only the hosted beacon dispatcher may call recordBeacon. */
export function createTownNightWindow(host: TownNightWindowHost, restoredBeaconAt: number | null = null) {
  if (restoredBeaconAt !== null && !isEpoch(restoredBeaconAt)) throw new RangeError('Invalid town beacon receipt');
  let receivedAt = restoredBeaconAt;
  let lastClock = 0;
  let recording = false;

  function sample() {
    const read = host.now();
    if (!isEpoch(read)) return { now: lastClock, schedule: undefined };
    lastClock = Math.max(lastClock, read);
    const schedule = host.scheduleAt(lastClock);
    return { now: lastClock, schedule: validSchedule(schedule) ? schedule : undefined };
  }

  return {
    recordBeacon(at: number) {
      if (recording || (receivedAt !== null && at <= receivedAt)) return;
      const { now, schedule } = sample();
      if (!schedule || at !== schedule.beaconAt || now < at || now >= schedule.cueExpiresAt) return;
      recording = true;
      try {
        host.saveBeacon?.(at);
        receivedAt = at;
      } finally {
        recording = false;
      }
      return { kind: 'town-night-beacon' as const, at, expiresAt: schedule.cueExpiresAt, state: windowState(now, schedule, receivedAt) };
    },
    /** Reconnect reads the current state without emitting a cue. */
    snapshot() {
      const { now, schedule } = sample();
      return windowState(now, schedule, receivedAt);
    },
  };
}

export function allowsTownNightTransit(state: TownNightWindowState, direction: 'enter' | 'stay' | 'exit') {
  return direction !== 'enter' || state.canEnterRestricted;
}
