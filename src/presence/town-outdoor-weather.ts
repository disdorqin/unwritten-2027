import {
  townOutdoorWeatherWarningLeadMs,
  type TownOutdoorWeather,
  type TownOutdoorWeatherCue,
  type TownOutdoorWeatherFrame,
  type TownOutdoorWeatherState,
} from '../shared/town-outdoor-weather.js';

const slotMs = 5 * 60_000;
const slotsPerCycle = 20;

// Fixed schedule in five-minute slots. Its 12 clear, 6 wind and 2 whiteout
// slots implement the 60/30/10 distribution across each complete cycle.
const phases = [
  { slot: 0, weather: 'clear-snow' },
  { slot: 6, weather: 'wind', warning: 'wind' },
  { slot: 8, weather: 'whiteout', warning: 'whiteout' },
  { slot: 10, weather: 'wind' },
  { slot: 12, weather: 'clear-snow' },
  { slot: 18, weather: 'wind', warning: 'wind' },
] as const satisfies ReadonlyArray<{
  slot: number;
  weather: TownOutdoorWeather;
  warning?: TownOutdoorWeatherCue['weather'];
}>;

const windStrength: Readonly<Record<TownOutdoorWeather, number>> = Object.freeze({
  'clear-snow': 0,
  wind: 0.5,
  whiteout: 1,
});

function isTimestamp(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function lookup(now: number, dawnEpoch: number) {
  const slot = Math.floor((now - dawnEpoch) / slotMs);
  const cycle = Math.floor(slot / slotsPerCycle);
  const cycleStartSlot = cycle * slotsPerCycle;
  const slotInCycle = slot - cycleStartSlot;
  const nextIndex = phases.findIndex(phase => phase.slot > slotInCycle);
  const index = nextIndex < 0 ? phases.length - 1 : nextIndex - 1;
  const phase = phases[index]!;
  const next = phases[index + 1];
  const phaseSlot = cycleStartSlot + phase.slot;
  const start = Math.max(0, dawnEpoch + phaseSlot * slotMs);
  const end = dawnEpoch + (cycleStartSlot + (next?.slot ?? slotsPerCycle)) * slotMs;
  if (!isTimestamp(end)) throw new RangeError('Invalid town outdoor weather timestamp');

  let hash = Math.imul(phaseSlot ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  const direction = ((hash ^ (hash >>> 16)) >>> 0) * (2 * Math.PI / 0x1_0000_0000);

  const state: TownOutdoorWeatherState = Object.freeze({
    weather: phase.weather,
    startedAt: start,
    nextChangeAt: end,
    windEast: Math.sin(direction),
    windNorth: Math.cos(direction),
    windStrength: windStrength[phase.weather],
  });
  const warningWeather = next && 'warning' in next ? next.warning : undefined;
  const warningAt = warningWeather === undefined ? -1 : end - townOutdoorWeatherWarningLeadMs[warningWeather];
  return {
    state,
    warning: warningWeather && warningAt >= 0 ? Object.freeze({
      type: 'event',
      kind: 'town-outdoor-weather-warning',
      weather: warningWeather,
      at: warningAt,
      expiresAt: end,
    } as const) : undefined,
  };
}

/** The same server time and schedule anchor reconstruct the same state, including after restart. */
export function townOutdoorWeatherAt(now: number, dawnEpoch = 0): TownOutdoorWeatherState {
  if (!isTimestamp(now) || !isTimestamp(dawnEpoch)) throw new RangeError('Invalid town outdoor weather clock');
  return lookup(now, dawnEpoch).state;
}

type TownOutdoorWeatherHost = Readonly<{
  now: () => number;
  /** Use the same calendar anchor as the ordinary town day if the host has one. */
  dawnEpoch?: number;
  broadcast: (frame: TownOutdoorWeatherFrame | TownOutdoorWeatherCue) => void;
  /** Optional persistent receipt, committed before a warning is published. */
  saveWarning?: (at: number) => void;
}>;

/** One per town, driven by the existing beacon host clock and broadcast channel. */
export function createTownOutdoorWeatherHost(host: TownOutdoorWeatherHost, restoredWarningAt: number | null = null) {
  const dawnEpoch = host.dawnEpoch ?? 0;
  let now = host.now();
  if (!isTimestamp(now) || !isTimestamp(dawnEpoch) || (restoredWarningAt !== null && !isTimestamp(restoredWarningAt))) {
    throw new RangeError('Invalid town outdoor weather clock or warning receipt');
  }

  let active = lookup(now, dawnEpoch);
  let publishedAt = active.state.startedAt;
  let warningAt = restoredWarningAt ?? -Infinity;
  let dispatching = false;
  function current() {
    const sampled = host.now();
    if (isTimestamp(sampled)) now = Math.max(now, sampled);
    if (now >= active.state.nextChangeAt) active = lookup(now, dawnEpoch);
    return active.state;
  }

  return {
    // A reconnect can read the new phase even before the scheduled tick.
    snapshot: current,
    tick() {
      const state = current();
      if (dispatching) return state;
      const { warning } = active;
      dispatching = true;
      try {
        if (state.startedAt !== publishedAt) {
          publishedAt = state.startedAt;
          host.broadcast({ type: 'event', kind: 'town-outdoor-weather', state });
        }

        if (warning && now >= warning.at && now < warning.expiresAt && warning.at > warningAt) {
          host.saveWarning?.(warning.at);
          warningAt = warning.at;
          host.broadcast(warning);
        }
      } finally {
        dispatching = false;
      }
      return state;
    },
  };
}
