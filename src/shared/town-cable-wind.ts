import type { TownOutdoorWeatherState } from './town-outdoor-weather.js';

/**
 * G-09 cable-clock adapter. One absolute, deterministic clock drives both
 * cabins and rider positions; no per-frame simulation, no per-client timers.
 * The weather schedule is 100 real minutes per cycle and shares the ZB-17
 * town dawn anchor. A host must explicitly opt in only when weather is active.
 */
export const townCableWindCycleMs = 100 * 60_000;
export const townCableWindDawnEpoch = Date.UTC(2026, 0, 1);

export const townCableWindRates = Object.freeze({
  'clear-snow': 1,
  wind: .7,
  whiteout: 0,
} as const);

export type TownCableWindState = Pick<TownOutdoorWeatherState, 'weather' | 'startedAt' | 'nextChangeAt'>;
export type TownCableWindReport = Readonly<{
  weather: TownCableWindState['weather'];
  rate: number;
  canBoard: boolean;
  label: string;
  nextChangeAt: number;
}>;

function finiteClock(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function report(weather: TownCableWindState): TownCableWindReport {
  const rate = townCableWindRates[weather.weather];
  return {
    weather: weather.weather, rate, canBoard: rate > 0,
    label: weather.weather === 'whiteout' ? '暴风雪封站 · 缆车暂歇，耐心候晴'
      : weather.weather === 'wind' ? '风大减速 · 扶稳缆车扶手'
        : '缆车运行正常',
    nextChangeAt: weather.nextChangeAt,
  };
}

/**
 * The caller supplies the same authoritative schedule used by town presence.
 * Prefix sums are precomputed once. Ordinary updates and newly joined players
 * get identical absolute cab positions even during whiteout freezes.
 */
export function createTownCableWindClock(
  weatherAt: (epochMs: number) => TownCableWindState,
  dawnEpoch = townCableWindDawnEpoch,
) {
  if (!finiteClock(dawnEpoch)) throw new RangeError('Invalid town cable dawn anchor');
  const end = dawnEpoch + townCableWindCycleMs;
  if (!Number.isSafeInteger(end)) throw new RangeError('Town cable weather clock overflow');
  const segments: { start: number; end: number; elapsed: number; rate: number }[] = [];
  let cursor = dawnEpoch;
  let total = 0;
  // Calendar validation prevents an accidental infinite loop or a divergent
  // phase table from silently moving the two cabins out of synchronization.
  for (let attempts = 0; cursor < end && attempts < 64; attempts++) {
    const weather = weatherAt(cursor);
    if (!finiteClock(weather.startedAt) || !finiteClock(weather.nextChangeAt) ||
        weather.startedAt > cursor || weather.nextChangeAt <= cursor ||
        !(weather.weather in townCableWindRates)) {
      throw new RangeError('Invalid authoritative cable weather schedule');
    }
    const edge = Math.min(end, weather.nextChangeAt);
    const rate = townCableWindRates[weather.weather];
    segments.push({ start: cursor - dawnEpoch, end: edge - dawnEpoch, elapsed: total, rate });
    total += (edge - cursor) * rate;
    cursor = edge;
  }
  if (cursor !== end || segments.length === 0 || weatherAt(end).weather !== weatherAt(dawnEpoch).weather) {
    throw new RangeError('Cable weather cycle must close after 100 minutes');
  }

  function scaledNow(epochMs: number) {
    if (!finiteClock(epochMs)) return dawnEpoch;
    if (epochMs < dawnEpoch) return epochMs;
    const elapsed = epochMs - dawnEpoch;
    const cycle = Math.floor(elapsed / townCableWindCycleMs);
    const position = elapsed - cycle * townCableWindCycleMs;
    const current = segments.find(segment => position < segment.end) ?? segments.at(-1)!;
    return dawnEpoch + cycle * total + current.elapsed + (position - current.start) * current.rate;
  }

  return {
    /** Suitable for createZa22CloudRoute's shared line.timeline clock. */
    scaledNow,
    /** Display/boarding are derived from the current real server epoch. */
    statusAt(nowMs: number): TownCableWindReport {
      if (!finiteClock(nowMs)) throw new RangeError('Invalid town cable weather time');
      return report(weatherAt(nowMs));
    },
    /**
     * Arrival times must be compared in virtual time. The passenger remains
     * aboard throughout an interrupted ride; nothing auto-ejects or teleports.
     */
    arrived(nowMs: number, virtualArrivalAt: number) {
      return finiteClock(nowMs) && Number.isFinite(virtualArrivalAt) && scaledNow(nowMs) >= virtualArrivalAt;
    },
    cycleDistanceMs: total,
  };
}
