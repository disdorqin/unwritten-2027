import { snowballWindAcceleration } from '../../../src/shared/snowball-wind';
import type { SnowballWindWeather } from '../../../src/shared/snowball-wind';

export type { SnowballWindWeather } from '../../../src/shared/snowball-wind';

/** Compatibility alias for the existing G-09 town viewer and tests.
 * Host supplies weather and exposure; server and viewer use one formula.
 */
export const townSnowballWindAcceleration: (
  state: SnowballWindWeather, exposure: number,
) => ReturnType<typeof snowballWindAcceleration> = snowballWindAcceleration;
