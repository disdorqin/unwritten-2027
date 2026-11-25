import type { TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';
import { townG09SnowSnapshotAt } from './town-g09-snow-cover';
import { townSnowWeatherForOutdoorState } from './town-weather';
import type { createTownSnowField } from './town-snow-field';
import type { createSnowfall } from './snowfall';

type SnowField = Pick<ReturnType<typeof createTownSnowField>,
  'restoreWeatherSnapshot' | 'setWeather' | 'setIntensity'>;
type SnowParticles = Pick<ReturnType<typeof createSnowfall>,
  'setOutdoorWind' | 'setIntensity'>;

type Host = Readonly<{
  weather(): TownOutdoorWeatherState | undefined;
  dawnEpoch(): number | undefined;
  serverNow(): number;
  exposure(): number;
  fireDistance?(): number;
  nightFogFar?(): number;
  snowField: SnowField;
  particles: SnowParticles;
}>;

/**
 * Adapter owned by B: the A-owned viewer need only call sample() once in its
 * existing weather section. If the server has no G-09 snapshot/anchor, leave
 * the old ceremony and weather route untouched (not a local authority).
 */
export function createTownG09SceneAdapter(host: Host) {
  let generation = '';
  let lastSeenAt: number | undefined;

  return {
    sample() {
      const state = host.weather();
      const dawn = host.dawnEpoch();
      const clockReading = host.serverNow();
      // Presence clock interpolates with performance.now(), so it often has
      // fractional milliseconds even though server epochs are integers.
      const now = Math.floor(clockReading);
      if (!state || !Number.isSafeInteger(dawn) || dawn! < 0 ||
          !Number.isFinite(clockReading) || !Number.isSafeInteger(now) || now < 0) {
        // If Presence drops while the sky is windy, stop only the extra
        // authority-driven drift. Keep the legacy snowfall base behavior.
        if (generation) host.particles.setOutdoorWind(0, 0, 0);
        generation = '';
        lastSeenAt = undefined;
        return;
      }
      const key = [dawn, state.startedAt, state.nextChangeAt].join(':');
      const gap = lastSeenAt !== undefined && (now - lastSeenAt > 10_000 || now < lastSeenAt - 2_000);
      const visual = townSnowWeatherForOutdoorState(
        state, host.exposure(), host.nightFogFar?.() ?? Infinity, host.fireDistance?.() ?? Infinity,
      );
      host.particles.setIntensity(visual.intensity);
      host.particles.setOutdoorWind(state.windEast, state.windNorth, state.windStrength, host.exposure());
      host.snowField.setIntensity(visual.intensity);
      host.snowField.setWeather(visual);
      if (key !== generation || gap) {
        // Only one terrain refresh per authoritative phase/foreground resume.
        host.snowField.restoreWeatherSnapshot(townG09SnowSnapshotAt(now, dawn!));
        generation = key;
      }
      lastSeenAt = now;
      return visual;
    },
  };
}
