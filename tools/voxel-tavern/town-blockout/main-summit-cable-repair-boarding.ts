import type { SummitCableRepairState } from '../../../src/shared/main-summit-cable-repair';
import type { SummitCableBoardingPolicy } from './main-summit-cable-travel';

/**
 * The live host supplies an immutable server-authored fault-state snapshot and
 * the same official ZB-17 day/night decision used to dispatch the tram.
 * Never infer a repair from the model geometry or a client flag.
 */
export function createSummitRepairBoardingPolicy(
  state: () => SummitCableRepairState | undefined,
  daylightService: (nowMs: number) => boolean,
): SummitCableBoardingPolicy {
  return ({ nowMs, cabinIndex, station, direction }) => {
    const status = state();
    if (!status) return false;
    if (status.stage === 'single-trip') {
      // Before all three repairs, only the cab released by a climber at
      // the summit may descend one station. No lower-station ascent.
      return station === 'summit' && direction === 'down' &&
        status.singleTripCabin === cabinIndex;
    }
    return status.stage === 'open' && daylightService(nowMs);
  };
}
