export type TownOutdoorWeather = 'clear-snow' | 'wind' | 'whiteout';
/** One deterministic weather cycle: the 60/30/10 G-09 approved schedule. */
export const townOutdoorWeatherCycleMs = 100 * 60_000;

export type TownOutdoorWeatherState = Readonly<{
  weather: TownOutdoorWeather;
  startedAt: number;
  nextChangeAt: number;
  /** Unit direction in which the wind is blowing, in town map coordinates. */
  windEast: number;
  windNorth: number;
  windStrength: number;
}>;

export type TownOutdoorWeatherFrame = Readonly<{
  type: 'event';
  kind: 'town-outdoor-weather';
  state: TownOutdoorWeatherState;
}>;

export type TownOutdoorWeatherCue = Readonly<{
  type: 'event';
  kind: 'town-outdoor-weather-warning';
  weather: 'wind' | 'whiteout';
  at: number;
  expiresAt: number;
}>;

export const townOutdoorWeatherEffects = Object.freeze({
  'clear-snow': { headwindScale: 1, tailwindScale: 1, exposureScale: 1, gatheringScale: 1, visibilityMeters: null },
  wind: { headwindScale: 0.85, tailwindScale: 1.05, exposureScale: 1.5, gatheringScale: 1, visibilityMeters: null },
  whiteout: { headwindScale: 0.6, tailwindScale: 1.1, exposureScale: 2, gatheringScale: 1.5, visibilityMeters: 12 },
} as const);

export const townOutdoorWhiteoutFirePoolMeters = 8;
export const townOutdoorWeatherWarningLeadMs = Object.freeze({ wind: 30_000, whiteout: 60_000 } as const);

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function readTownOutdoorWeatherState(value: unknown): TownOutdoorWeatherState | undefined {
  if (!value || typeof value !== 'object') return;
  const { weather, startedAt, nextChangeAt, windEast, windNorth, windStrength } = value as Record<string, unknown>;
  if (weather !== 'clear-snow' && weather !== 'wind' && weather !== 'whiteout') return;
  if (!isTimestamp(startedAt) || !isTimestamp(nextChangeAt) || nextChangeAt <= startedAt) return;
  if (typeof windEast !== 'number' || !Number.isFinite(windEast) ||
      typeof windNorth !== 'number' || !Number.isFinite(windNorth) ||
      Math.abs(Math.hypot(windEast, windNorth) - 1) > 1e-6) return;
  if (typeof windStrength !== 'number' || !Number.isFinite(windStrength) || windStrength < 0 || windStrength > 1) return;
  return Object.freeze({ weather, startedAt, nextChangeAt, windEast, windNorth, windStrength });
}

export function readTownOutdoorWeatherFrame(value: unknown): TownOutdoorWeatherFrame | undefined {
  if (!value || typeof value !== 'object') return;
  const { type, kind, state: raw } = value as Record<string, unknown>;
  if (type !== 'event' || kind !== 'town-outdoor-weather') return;
  const state = readTownOutdoorWeatherState(raw);
  if (state) return Object.freeze({ type, kind, state });
}

export function readTownOutdoorWeatherCue(value: unknown): TownOutdoorWeatherCue | undefined {
  if (!value || typeof value !== 'object') return;
  const { type, kind, weather, at, expiresAt } = value as Record<string, unknown>;
  if (type !== 'event' || kind !== 'town-outdoor-weather-warning' || (weather !== 'wind' && weather !== 'whiteout')) return;
  if (!isTimestamp(at) || !isTimestamp(expiresAt) || expiresAt - at !== townOutdoorWeatherWarningLeadMs[weather]) return;
  return Object.freeze({ type, kind, weather, at, expiresAt });
}

type WarningEffect = (cue: TownOutdoorWeatherCue) => void;

/** Consume warnings from the beacon transport with the same authoritative clock as the scene. */
export function createTownOutdoorWeatherCueReceiver(effects: Readonly<{
  ringTower?: WarningEffect;
  stationBroadcast?: WarningEffect;
}>) {
  let lastPlayedAt = -Infinity;
  const consumers = [effects.ringTower, effects.stationBroadcast];
  return (value: unknown, serverNow: number) => {
    const cue = readTownOutdoorWeatherCue(value);
    if (!cue || !Number.isFinite(serverNow) || serverNow < cue.at || serverNow >= cue.expiresAt || cue.at <= lastPlayedAt) return;
    lastPlayedAt = cue.at;
    const failures: unknown[] = [];
    for (const consume of consumers) {
      try { consume?.(cue); }
      catch (error) { failures.push(error); }
    }
    return { cue, failures };
  };
}

export function townOutdoorWindWalkingScale(state: TownOutdoorWeatherState, east: number, north: number): number {
  const length = Math.hypot(east, north);
  if (!Number.isFinite(length) || length === 0) return 1;
  const alignment = Math.max(-1, Math.min(1, (east * state.windEast + north * state.windNorth) / length));
  const { headwindScale, tailwindScale } = townOutdoorWeatherEffects[state.weather];
  const target = alignment < 0 ? headwindScale : tailwindScale;
  return 1 + (target - 1) * Math.abs(alignment);
}

