import type { TownOutdoorWeather, TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';

/**
 * Summit gust / waiting-for-wind rules v2 (ZB-20 weather-authority
 * aligned; atlas package B1, branch window B).
 *
 * The summit jump-off (ZD-05) has no instruments and no UI: the wind
 * is read off the world — prayer flags, flag clouds and the summit
 * windsock (atlas m64 / m32, night m75) are all driven by
 * summitGustFactorAt, so what the player sees IS the number.
 *
 * v2 consumes the ZB-20 authority state (src/shared/town-outdoor-
 * weather): weather kind, unit wind direction and normalized strength
 * all come from the one server-published state — never re-derived per
 * client. The gust phase runs on an absolute clock (same discipline
 * as town-cable-wind: no per-client timers), so every client sees the
 * same gust at the same moment.
 *
 * The boost changes only which rings are REACHABLE from the jump, never
 * pass detection (ZD-08 host owns that) and never the score. The m/s
 * contract D asked for: when the G-09 authority publishes a measured
 * windSpeedMs, pass it in — amplitude rescales by speed over the
 * nominal summit wind below. Until then the normalized strength is
 * the input and nothing is pseudo-converted.
 */
export const summitGustPeriodMs = Object.freeze({
  'clear-snow': 70_000,
  wind: 55_000,
  whiteout: 40_000,
} as const satisfies Record<TownOutdoorWeather, number>);

/** Nominal summit wind the boost cap is calibrated against. */
export const summitNominalWindMs = 6;

const summitKindAmplitude = Object.freeze({
  'clear-snow': 0.55,
  wind: 0.8,
  whiteout: 1,
} as const satisfies Record<TownOutdoorWeather, number>);

/** Vertical-speed boost ceiling at jump-off, m/s. */
export const summitMaxJumpBoost = 1.8;

/** Gust amplitude 0..~1.5 from authority state (+ optional measured m/s). */
export function summitGustAmplitude(state: TownOutdoorWeatherState, windSpeedMs?: number): number {
  const base = summitKindAmplitude[state.weather] * (0.5 + state.windStrength);
  if (windSpeedMs === undefined || !Number.isFinite(windSpeedMs) || windSpeedMs < 0) return base;
  return base * Math.min(1.5, Math.max(0.5, windSpeedMs / summitNominalWindMs));
}

/**
 * The visible gust factor 0..1 at an absolute time. One sine lobe per
 * period: calm, build, peak, ease. This exact value drives the
 * windsock/flag dressing and the jump assist — same source, no drift.
 */
export function summitGustFactorAt(state: TownOutdoorWeatherState, atMs: number, windSpeedMs?: number): number {
  const period = summitGustPeriodMs[state.weather];
  const phase = (((atMs % period) + period) % period) / period;
  return Math.sin(phase * Math.PI) * Math.min(1, summitGustAmplitude(state, windSpeedMs));
}

export type SummitJumpAssist = Readonly<{
  /** Vertical speed bonus at jump-off, m/s (never negative). */
  verticalBoost: number;
  /** 1 = wind square at the jumper's back, 0 = square in the face. */
  tailwind: number;
  /** The gust factor used — hosts log it as a result annotation only. */
  gustFactor: number;
}>;

/**
 * Jump assist for a jumper facing (headingEast, headingNorth) (need
 * not be normalized). A headwind keeps a floor of the gust — the
 * updraft is real even when the drift is against you.
 */
export function summitJumpAssist(
  state: TownOutdoorWeatherState,
  atMs: number,
  headingEast: number,
  headingNorth: number,
  windSpeedMs?: number,
): SummitJumpAssist {
  const gustFactor = summitGustFactorAt(state, atMs, windSpeedMs);
  const length = Math.hypot(headingEast, headingNorth);
  const alignment = length < 1e-9 ? 0
    : (headingEast / length) * state.windEast + (headingNorth / length) * state.windNorth;
  const tailwind = (alignment + 1) / 2;
  return {
    verticalBoost: summitMaxJumpBoost * gustFactor * (0.3 + 0.7 * tailwind),
    tailwind,
    gustFactor,
  };
}
