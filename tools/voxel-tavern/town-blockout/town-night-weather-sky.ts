import { Color, Fog, FogExp2, type AmbientLight, type DirectionalLight, type Scene } from 'three';
import {
  townNightWeatherAt, townNightWeatherDefaultDawnEpoch,
  type TownNightWeatherSample,
} from '../../../src/shared/town-night-weather-cycle';

/**
 * Applies the authoritative, continuous sky sample to the production scene.
 *
 * This is the whole client integration surface: construct once after the
 * renderer lights exist, then call `update(presence.serverNow(),
 * presence.getTownWeatherDawnEpoch())` every frame. It owns only values that
 * were previously hard-switched in `setNight`: background, fog colour, ambient
 * light and key light. Materials, lamps, clouds and gameplay gates stay with
 * their existing owners and switch on the returned `nightSide` boundary.
 */
export type TownNightWeatherSkyTarget = Readonly<{
  scene: Scene;
  ambient: AmbientLight;
  sun: DirectionalLight;
  /** Production uses the weather Fog; FogExp2 is accepted for previews. */
  fog?: Fog | FogExp2 | null;
}>;

export type TownNightWeatherSkyFrame = Readonly<{
  sample: TownNightWeatherSample;
  /** Same boundary as the authoritative night window (phase >= 0.6). */
  nightSide: boolean;
  lampLevel: number;
  /** Multiply the outdoor weather fog distances by these for the time of day. */
  fogNearScale: number;
  fogFarScale: number;
}>;

export type TownNightWeatherSkyRig = Readonly<{
  update(now: number, dawnEpoch?: number, options?: Readonly<{ dim?: number }>): TownNightWeatherSkyFrame;
  current(): TownNightWeatherSkyFrame | undefined;
}>;

export function createTownNightWeatherSky(target: TownNightWeatherSkyTarget): TownNightWeatherSkyRig {
  const { scene, ambient, sun } = target;
  const background = scene.background instanceof Color ? scene.background : new Color();
  if (!(scene.background instanceof Color)) scene.background = background;
  const fog = target.fog === undefined ? (scene.fog as Fog | FogExp2 | null) : target.fog;
  let current: TownNightWeatherSkyFrame | undefined;

  return {
    update(now, dawnEpoch = townNightWeatherDefaultDawnEpoch, options = {}) {
      const sample = townNightWeatherAt(now, dawnEpoch);
      const dim = Number.isFinite(options.dim) && options.dim! > 0 ? options.dim! : 1;
      const exposure = sample.exposure * dim;

      background.setHex(sample.skyColor);
      if (fog) fog.color.setHex(sample.fogColor);

      ambient.color.setHex(sample.ambientColor);
      ambient.intensity = sample.ambientIntensity * exposure;
      sun.color.setHex(sample.sunColor);
      sun.intensity = sample.sunIntensity * exposure;
      sun.position.set(sample.sunDirection[0], sample.sunDirection[1], sample.sunDirection[2])
        .multiplyScalar(300);

      current = {
        sample,
        nightSide: !sample.daylight,
        lampLevel: sample.lampLevel,
        fogNearScale: sample.fogNearScale,
        fogFarScale: sample.fogFarScale,
      };
      return current;
    },
    current() {
      return current;
    },
  };
}
