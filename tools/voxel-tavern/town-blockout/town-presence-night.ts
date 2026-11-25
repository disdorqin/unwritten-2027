import { readTownNightBeacon, type TownNightBeaconFrame } from '../../../src/shared/town-night-beacon.js';
import type { TownNightWindowState } from '../../../src/shared/town-night-window.js';

function isEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function readWindow(value: unknown): TownNightWindowState | undefined {
  if (!value || typeof value !== 'object') return;
  const { phase, shift, canEnterRestricted, layersOverlap, chapterGatesLocked, beaconAt, morningBellAt } =
    value as Record<string, unknown>;
  if (phase !== 'day' && phase !== 'awaiting-beacon' && phase !== 'night-window') return;
  const open = phase === 'night-window';
  const expectedShift = open ? 'night' : 'day';
  if (shift !== expectedShift || canEnterRestricted !== open || chapterGatesLocked !== true ||
      typeof layersOverlap !== 'boolean' || (layersOverlap && !open)) return;
  if (!((beaconAt === null && morningBellAt === null && phase === 'day') ||
      (isEpoch(beaconAt) && isEpoch(morningBellAt) && beaconAt < morningBellAt))) return;
  return Object.freeze({ phase, shift: expectedShift, canEnterRestricted: open, layersOverlap, chapterGatesLocked, beaconAt, morningBellAt });
}

/** Feed only frames from the current presence connection. Join snapshots never play a cue. */
export function createTownPresenceNight(serverNow: () => number) {
  let state: TownNightWindowState | undefined;
  let connectedAt: number | undefined;
  let pending: TownNightBeaconFrame | undefined;
  let lastDelivered = -1;
  let listener: ((cue: TownNightBeaconFrame) => void) | undefined;

  function tick() {
    if (!pending) return;
    const now = serverNow();
    if (!Number.isFinite(now) || now < pending.at) return;
    const cue = pending;
    pending = undefined;
    if (now >= cue.expiresAt) return;
    lastDelivered = cue.at;
    listener?.(cue);
  }

  return {
    join(epochMs: unknown, snapshot: unknown) {
      connectedAt = isEpoch(epochMs) && epochMs > 0 ? epochMs : undefined;
      pending = undefined;
      state = connectedAt === undefined ? undefined : readWindow(snapshot);
    },
    disconnect() {
      connectedAt = undefined;
      pending = undefined;
      state = undefined;
    },
    acceptWindow(snapshot: unknown) {
      if (connectedAt === undefined) return;
      const next = readWindow(snapshot);
      if (next) state = next;
    },
    acceptBeacon(frame: unknown) {
      if (connectedAt === undefined || !listener) return;
      const cue = readTownNightBeacon(frame);
      if (!cue || cue.at < connectedAt || cue.at <= lastDelivered || (pending && cue.at <= pending.at)) return;
      pending = cue;
      tick();
    },
    tick,
    state: () => state,
    connectedAt: () => connectedAt,
    onBeacon(handler: (cue: TownNightBeaconFrame) => void) {
      pending = undefined;
      listener = handler;
      return () => {
        if (listener !== handler) return;
        listener = undefined;
        pending = undefined;
      };
    },
  };
}
