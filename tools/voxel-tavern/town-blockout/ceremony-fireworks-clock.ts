import type { FireworksTable } from './festival';

type ScheduledPlayback = { ageSeconds: number; clockMs: () => number; startAt: number };

/** Keep the authored score on one shared clock, dropping rockets launched before the client could see them. */
export function createCeremonyFireworksDispatch(flightSeconds: number) {
  let latestStart = -Infinity;

  return function dispatch(
    table: FireworksTable, startAt: number, observedFrom: number, clockMs: () => number,
    startShow: (table: FireworksTable, playback: ScheduledPlayback) => boolean,
  ): boolean {
    const now = clockMs();
    if (![now, startAt, observedFrom].every(Number.isFinite) || observedFrom > now || startAt <= latestStart) return false;

    const ageSeconds = (now - startAt) / 1000;
    const remaining = table.bursts.filter(({ time }) =>
      startAt + Math.max(0, time - flightSeconds) * 1000 >= observedFrom);
    if ((table.duration !== undefined && ageSeconds >= table.duration) || remaining.length === 0) {
      latestStart = startAt;
      return false;
    }

    let visibleNow = now;
    const playbackClock = () => {
      const sampled = clockMs();
      if (Number.isFinite(sampled)) visibleNow = Math.max(visibleNow, sampled);
      return visibleNow;
    };
    if (!startShow({ ...table, bursts: remaining }, { ageSeconds, clockMs: playbackClock, startAt })) return false;
    latestStart = startAt;
    return true;
  };
}
