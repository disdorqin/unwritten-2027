import { townDayMs, townDaylightMs } from './town-night-window.js';

/**
 * Continuous, deterministic sky state for the ordinary town day.
 *
 * The server calendar origin (`dawnEpoch`) and the presence clock are the only
 * inputs. Every client that samples the same `(now, dawnEpoch)` gets the same
 * values, so day/night cannot drift between players. This module is shared by
 * the server and the browser and must stay free of DOM/Three.js imports.
 */
export const townNightWeatherDayMs = townDayMs;
export const townNightWeatherDefaultDawnEpoch = Date.UTC(2026, 0, 1);
export const townNightWeatherNightStart = townDaylightMs / townDayMs;

export type TownNightWeatherPhase = 'sunrise' | 'day' | 'dusk' | 'nightfall' | 'deep-night';

export type TownNightWeatherSample = Readonly<{
  now: number;
  dawnEpoch: number;
  dayIndex: number;
  /** Normalized position in the ten minute day, always in [0, 1). */
  phase: number;
  phaseName: TownNightWeatherPhase;
  /** Matches the authoritative night window: false during the six daylight minutes. */
  daylight: boolean;
  sunElevationDeg: number;
  /** Visual direction of the key light, already clamped above the horizon. */
  sunDirection: readonly [number, number, number];
  skyColor: number;
  fogColor: number;
  cloudColor: number;
  ambientColor: number;
  sunColor: number;
  ambientIntensity: number;
  sunIntensity: number;
  /** Slow global exposure adaptation, multiplied into both light intensities. */
  exposure: number;
  /** 0 in full day, 1 deep at night. Never a hard on/off switch. */
  lampLevel: number;
  /** 0 by day, 1 at deep night. Reserved for the sky/aurora layer. */
  starLevel: number;
  fogNearScale: number;
  fogFarScale: number;
}>;

type SkyKey = Readonly<{
  at: number;
  sky: number;
  fog: number;
  cloud: number;
  ambient: number;
  sun: number;
  ambientIntensity: number;
  sunIntensity: number;
  exposure: number;
  lampLevel: number;
  starLevel: number;
  fogNearScale: number;
  fogFarScale: number;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
}>;

/**
 * Cyclic keyframes. The first key is also the wrap target of the last one, so
 * sampling 0.999... approaches the 0.0 values and the loop never snaps.
 * Day/night endpoints intentionally match the historical binary palette at
 * `#acc2dd` (day) and `#182642` (night) so A can adopt the rig without a
 * simultaneous art retune.
 */
const skyKeys = [
  { at: 0, sky: 0x3d4f78, fog: 0x435279, cloud: 0x8a7d8a, ambient: 0xaabfe8, sun: 0xffb98a,
    ambientIntensity: 1.0, sunIntensity: 1.2, exposure: .97, lampLevel: .62, starLevel: .45,
    fogNearScale: .84, fogFarScale: .74, sunElevationDeg: -2, sunAzimuthDeg: 2 },
  { at: .03, sky: 0x7d8fb4, fog: 0x8b99b6, cloud: 0xc7a69c, ambient: 0xc6d3ee, sun: 0xffbd82,
    ambientIntensity: 1.15, sunIntensity: 1.45, exposure: .98, lampLevel: .3, starLevel: .12,
    fogNearScale: .9, fogFarScale: .86, sunElevationDeg: 6, sunAzimuthDeg: 12 },
  { at: .075, sky: 0x9db0cf, fog: 0x9fb3d0, cloud: 0xd8bfae, ambient: 0xd8e2f5, sun: 0xffd3a2,
    ambientIntensity: 1.24, sunIntensity: 1.58, exposure: .99, lampLevel: .06, starLevel: 0,
    fogNearScale: .92, fogFarScale: .92, sunElevationDeg: 17, sunAzimuthDeg: 40 },
  { at: .14, sky: 0xa9bed9, fog: 0xaabfda, cloud: 0xcfd9e7, ambient: 0xe1ebfb, sun: 0xffe2c0,
    ambientIntensity: 1.3, sunIntensity: 1.64, exposure: 1, lampLevel: 0, starLevel: 0,
    fogNearScale: .97, fogFarScale: .97, sunElevationDeg: 24, sunAzimuthDeg: 70 },
  { at: .3, sky: 0xb9cde4, fog: 0xb3c7e0, cloud: 0xdfe8f2, ambient: 0xe8f1ff, sun: 0xfff0d8,
    ambientIntensity: 1.38, sunIntensity: 1.72, exposure: 1, lampLevel: 0, starLevel: 0,
    fogNearScale: 1, fogFarScale: 1, sunElevationDeg: 39, sunAzimuthDeg: 135 },
  { at: .47, sky: 0xadc2dd, fog: 0xadc2dd, cloud: 0xd6dfeb, ambient: 0xe4edff, sun: 0xffe6c5,
    ambientIntensity: 1.35, sunIntensity: 1.7, exposure: 1, lampLevel: 0, starLevel: 0,
    fogNearScale: 1, fogFarScale: 1, sunElevationDeg: 20, sunAzimuthDeg: 220 },
  { at: .53, sky: 0xc0b4b4, fog: 0xb9ada9, cloud: 0xe0bfa6, ambient: 0xe9dfe9, sun: 0xffc186,
    ambientIntensity: 1.22, sunIntensity: 1.54, exposure: 1.01, lampLevel: .15, starLevel: 0,
    fogNearScale: .96, fogFarScale: .95, sunElevationDeg: 8, sunAzimuthDeg: 245 },
  { at: .578, sky: 0x8c7e98, fog: 0x8c7f97, cloud: 0xc0948f, ambient: 0xc9c4e4, sun: 0xff9a63,
    ambientIntensity: 1.06, sunIntensity: 1.34, exposure: 1.02, lampLevel: .48, starLevel: .08,
    fogNearScale: .92, fogFarScale: .9, sunElevationDeg: 1, sunAzimuthDeg: 258 },
  { at: .6, sky: 0x515b80, fog: 0x545e81, cloud: 0x6a7088, ambient: 0xa6b5df, sun: 0xd99a82,
    ambientIntensity: .99, sunIntensity: 1.2, exposure: 1.01, lampLevel: .74, starLevel: .28,
    fogNearScale: .9, fogFarScale: .84, sunElevationDeg: -3, sunAzimuthDeg: 264 },
  { at: .66, sky: 0x2e3c5f, fog: 0x303e61, cloud: 0x3e4b6a, ambient: 0x8ba6e5, sun: 0xa8c0f6,
    ambientIntensity: .92, sunIntensity: 1.1, exposure: .99, lampLevel: .95, starLevel: .6,
    fogNearScale: .85, fogFarScale: .74, sunElevationDeg: -14, sunAzimuthDeg: 280 },
  { at: .78, sky: 0x1b2947, fog: 0x1d2b4a, cloud: 0x26334e, ambient: 0x84a9e7, sun: 0xa6c0fd,
    ambientIntensity: .84, sunIntensity: .98, exposure: .97, lampLevel: 1, starLevel: 1,
    fogNearScale: .8, fogFarScale: .66, sunElevationDeg: -27, sunAzimuthDeg: 310 },
  { at: .9, sky: 0x131e36, fog: 0x16213a, cloud: 0x1c2942, ambient: 0x789adf, sun: 0x98b2ec,
    ambientIntensity: .66, sunIntensity: .76, exposure: .94, lampLevel: 1, starLevel: 1,
    fogNearScale: .76, fogFarScale: .62, sunElevationDeg: -34, sunAzimuthDeg: 335 },
  { at: .96, sky: 0x202f50, fog: 0x263552, cloud: 0x37476a, ambient: 0x94ade6, sun: 0xaec1f0,
    ambientIntensity: .78, sunIntensity: .88, exposure: .945, lampLevel: .92, starLevel: .9,
    fogNearScale: .78, fogFarScale: .66, sunElevationDeg: -20, sunAzimuthDeg: 352 },
] as const satisfies readonly SkyKey[];

const degrees = Math.PI / 180;
const colorKeys = [
  ['sky', 'skyColor'], ['fog', 'fogColor'], ['cloud', 'cloudColor'],
  ['ambient', 'ambientColor'], ['sun', 'sunColor'],
] as const;
const numberKeys = [
  'ambientIntensity', 'sunIntensity', 'exposure', 'lampLevel', 'starLevel',
  'fogNearScale', 'fogFarScale', 'sunElevationDeg',
] as const;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function readChannel(color: number, shift: number): number {
  return (color >> shift) & 0xff;
}

export function mixTownSkyColor(from: number, to: number, t: number): number {
  const ratio = clamp(t, 0, 1);
  const red = Math.round(readChannel(from, 16) + (readChannel(to, 16) - readChannel(from, 16)) * ratio);
  const green = Math.round(readChannel(from, 8) + (readChannel(to, 8) - readChannel(from, 8)) * ratio);
  const blue = Math.round(readChannel(from, 0) + (readChannel(to, 0) - readChannel(from, 0)) * ratio);
  return (red << 16) | (green << 8) | blue;
}

function phaseOf(now: number, dawnEpoch: number): { phase: number; dayIndex: number } {
  const elapsed = now - dawnEpoch;
  const phase = ((elapsed % townDayMs) + townDayMs) % townDayMs / townDayMs;
  return { phase, dayIndex: Math.floor(elapsed / townDayMs) };
}

export function townNightWeatherPhaseName(phase: number): TownNightWeatherPhase {
  if (phase < .06) return 'sunrise';
  if (phase < .48) return 'day';
  if (phase < .6) return 'dusk';
  if (phase < .7) return 'nightfall';
  return 'deep-night';
}

/**
 * Sample one instant of the authoritative sky. Invalid clocks fall back to the
 * default dawn anchor instead of producing NaN lighting mid-frame.
 */
export function townNightWeatherAt(
  now: number,
  dawnEpoch: number = townNightWeatherDefaultDawnEpoch,
): TownNightWeatherSample {
  const epoch = Number.isSafeInteger(dawnEpoch) && dawnEpoch >= 0 ? dawnEpoch : townNightWeatherDefaultDawnEpoch;
  const at = Number.isFinite(now) ? now : epoch;
  const { phase, dayIndex } = phaseOf(at, epoch);
  const index = skyKeys.findIndex(key => phase < key.at);
  const right = skyKeys[index === -1 ? 0 : index];
  const leftIndex = (index === -1 ? 0 : index) - 1;
  const left = skyKeys[leftIndex < 0 ? skyKeys.length - 1 : leftIndex];
  const span = (right.at || 1) - left.at;
  const t = smoothstep(span <= 0 ? 0 : clamp((phase - left.at) / span, 0, 1));
  const rightAzimuth = right.at === 0 ? right.sunAzimuthDeg + 360 : right.sunAzimuthDeg;
  const azimuth = left.sunAzimuthDeg + (rightAzimuth - left.sunAzimuthDeg) * t;

  const sample = {
    now: at,
    dawnEpoch: epoch,
    dayIndex,
    phase,
    phaseName: townNightWeatherPhaseName(phase),
    daylight: phase < townNightWeatherNightStart,
    sunElevationDeg: left.sunElevationDeg + (right.sunElevationDeg - left.sunElevationDeg) * t,
    sunDirection: [0, 0, 0] as [number, number, number],
    skyColor: 0,
    fogColor: 0,
    cloudColor: 0,
    ambientColor: 0,
    sunColor: 0,
    ambientIntensity: 0,
    sunIntensity: 0,
    exposure: 0,
    lampLevel: 0,
    starLevel: 0,
    fogNearScale: 0,
    fogFarScale: 0,
  };
  for (const [key, sampleKey] of colorKeys) sample[sampleKey] = mixTownSkyColor(left[key], right[key], t);
  for (const key of numberKeys) sample[key] = left[key] + (right[key] - left[key]) * t;

  const elevation = clamp(sample.sunElevationDeg, 6, 90) * degrees;
  const bearing = (((azimuth % 360) + 360) % 360) * degrees;
  const horizontal = Math.cos(elevation);
  sample.sunDirection[0] = Math.sin(bearing) * horizontal;
  sample.sunDirection[1] = Math.sin(elevation);
  sample.sunDirection[2] = -Math.cos(bearing) * horizontal;
  return sample;
}
