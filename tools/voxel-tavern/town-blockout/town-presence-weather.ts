import {
  readTownOutdoorWeatherCue, readTownOutdoorWeatherFrame, readTownOutdoorWeatherState,
  type TownOutdoorWeatherCue, type TownOutdoorWeatherState,
} from '../../../src/shared/town-outdoor-weather';

/**
 * G-09 client store. The Presence link is the only authority: not a local
 * independent weather timer. A reconnect takes a fresh snapshot, never
 * replays weather warnings as if they had just arrived.
 */
export function createTownPresenceWeather(serverNow: () => number) {
  let state: TownOutdoorWeatherState | undefined;
  let dawnEpoch: number | undefined;
  let joined = false;
  let lastWarningAt = -Infinity;
  let warn: ((cue: TownOutdoorWeatherCue) => void) | undefined;

  return {
    join(raw: unknown, anchor?: unknown) {
      joined = true;
      state = readTownOutdoorWeatherState(raw);
      dawnEpoch = typeof anchor === 'number' && Number.isSafeInteger(anchor) && anchor >= 0 ? anchor : undefined;
    },
    disconnect() { joined = false; state = undefined; dawnEpoch = undefined; },
    state: () => state,
    dawnEpoch: () => state && dawnEpoch,
    onWarning(handler: (cue: TownOutdoorWeatherCue) => void) { warn = handler; },
    accept(raw: unknown) {
      if (!joined) return;
      const frame = readTownOutdoorWeatherFrame(raw);
      if (frame) {
        // A duplicated or delayed frame cannot roll back a new live phase.
        if (!state || frame.state.startedAt > state.startedAt) {
          state = frame.state;
          return { kind: 'weather' as const, state };
        }
        return;
      }
      const cue = readTownOutdoorWeatherCue(raw);
      // A live warning must point at the boundary of the current phase;
      // a forged/stale shifted timestamp must never retrigger a cue.
      if (!cue || !state || cue.expiresAt !== state.nextChangeAt) return;
      const now = serverNow();
      if (!Number.isFinite(now) || now < cue.at || now >= cue.expiresAt || cue.at <= lastWarningAt) return;
      lastWarningAt = cue.at;
      warn?.(cue);
      return { kind: 'warning' as const, cue };
    },
  };
}
