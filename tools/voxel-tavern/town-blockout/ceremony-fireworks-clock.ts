type ScheduledPlayback = { ageSeconds: number; clockMs: () => number; startAt: number };

/** Keep the authored score on one shared clock, dropping rockets launched before the client could see them. */
export function createCeremonyFireworksDispatch(flightSeconds: number) {
  const latestStart = new WeakMap<object, number>();

  return function dispatch<Table extends { duration?: number; bursts: readonly { time: number }[] }>(
    table: Table, startAt: number, observedFrom: number, clockMs: () => number,
    startShow: (table: Table, playback: ScheduledPlayback) => boolean,
  ): boolean {
    const now = clockMs();
    if (![now, startAt, observedFrom].every(Number.isFinite) || observedFrom > now || startAt <= (latestStart.get(table) ?? -Infinity)) return false;

    const ageSeconds = (now - startAt) / 1000;
    const remaining = table.bursts.filter(({ time }) =>
      startAt + Math.max(0, time - flightSeconds) * 1000 >= observedFrom);
    if ((table.duration !== undefined && ageSeconds >= table.duration) || remaining.length === 0) {
      latestStart.set(table, startAt);
      return false;
    }

    let visibleNow = now;
    const playbackClock = () => {
      const sampled = clockMs();
      if (Number.isFinite(sampled)) visibleNow = Math.max(visibleNow, sampled);
      return visibleNow;
    };
    if (!startShow({ ...table, bursts: remaining }, { ageSeconds, clockMs: playbackClock, startAt })) return false;
    latestStart.set(table, startAt);
    return true;
  };
}
