import { townOutdoorWeatherAt } from '../../../src/presence/town-outdoor-weather';
import { townOutdoorWeatherCycleMs } from '../../../src/shared/town-outdoor-weather';
import { advanceWeatherCover, townSnowWeatherForOutdoorState } from './town-weather';

/**
 * Post-storm snow cover sampled at one authoritative instant. There is no
 * browser-local "minutes since join" clock: two clients joining hours apart
 * reconstruct the exact same physical depth from one shared dawn anchor.
 *
 * The previous cycle ends with ten minutes of wind, ample time to reach
 * wind's target cover (.64). Reconstruct only the current 100-minute cycle
 * from that stable boundary; each phase is integrated once, not per frame.
 */
export type TownG09SnowSnapshot = Readonly<{ cover: number; spillDepth: number }>;

export function townG09SnowSnapshotAt(epochMs: number, dawnEpoch: number): TownG09SnowSnapshot {
  if (!Number.isSafeInteger(dawnEpoch) || dawnEpoch < 0 ||
      !Number.isSafeInteger(epochMs) || epochMs < 0) {
    throw new RangeError('Invalid authoritative G-09 snow clock');
  }
  if (epochMs < dawnEpoch) return { cover: .18, spillDepth: 0 };
  const cycle = Math.floor((epochMs - dawnEpoch) / townOutdoorWeatherCycleMs);
  const start = dawnEpoch + cycle * townOutdoorWeatherCycleMs;
  let cursor = start;
  let cover = .64;
  // The cycle ends in a ten-minute windy interval: expansion has melted out.
  let spillDepth = 0;
  for (let phase = 0; cursor < epochMs && phase < 20; phase++) {
    const state = townOutdoorWeatherAt(cursor, dawnEpoch);
    const until = Math.min(epochMs, state.nextChangeAt);
    if (until <= cursor) throw new RangeError('Invalid G-09 snow phase boundary');
    const seconds = (until - cursor) / 1000;
    const profile = townSnowWeatherForOutdoorState(state);
    cover = advanceWeatherCover(cover, seconds, profile);
    const expansion = Math.max(0, Math.min(1, (profile.targetCover - .8) / .2));
    const targetSpill = .45 * cover * expansion;
    spillDepth = targetSpill > spillDepth
      ? Math.min(targetSpill, spillDepth + seconds * .45 * profile.pilingRate / 55)
      : Math.max(targetSpill, spillDepth - seconds * .45 / 150);
    cursor = until;
  }
  if (cursor !== epochMs) throw new RangeError('Incomplete G-09 snow replay');
  return { cover: Math.max(0, Math.min(1, cover)), spillDepth: Math.max(0, Math.min(.45, spillDepth)) };
}

export function townG09SnowCoverAt(epochMs: number, dawnEpoch: number) {
  return townG09SnowSnapshotAt(epochMs, dawnEpoch).cover;
}
