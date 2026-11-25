import { summitCableSpec, type createMainSummitCable, type SummitCablePoint } from './main-summit-cable';

type SummitCable = ReturnType<typeof createMainSummitCable>;

export type SummitCableRide = { readonly cabinIndex: 0 | 1 };

function nearBoardingPoint(feet: SummitCablePoint, point: SummitCablePoint) {
  // Keep the limits inclusive after subtracting coordinates from the surveyed frame.
  const roundoff = 1e-9;
  return Math.hypot(feet.east - point.east, feet.north - point.north) <= .9 + roundoff &&
    Math.abs(feet.height - point.height) <= .43 + roundoff;
}

/** An optional server-backed boarding policy; omitted for the legacy isolated P-2 geometry review. */
export type SummitCableBoardingPolicy = (input: Readonly<{
  nowMs: number; cabinIndex: SummitCableRide['cabinIndex'];
  station: 'cloud-deck' | 'summit'; direction: 'up' | 'down';
}>) => boolean;

export function createMainSummitCableTravel(cable: SummitCable, boardingAllowed?: SummitCableBoardingPolicy) {
  return {
    attemptBoard(nowMs: number, cabinIndex: SummitCableRide['cabinIndex'], feet: SummitCablePoint): SummitCableRide | undefined {
      const { station, direction } = cable.cabinsAt(nowMs)[cabinIndex];
      if (!station || (boardingAllowed && !boardingAllowed({ nowMs, cabinIndex, station, direction }))) return;
      const { approach, board } = cable.ropes[cabinIndex].dock(station);
      if (nearBoardingPoint(feet, approach) || nearBoardingPoint(feet, board)) return { cabinIndex };
    },

    ridePose(nowMs: number, ride: SummitCableRide) {
      const cabin = cable.cabinsAt(nowMs)[ride.cabinIndex];
      const { east, north, height, heading } = cabin.ropePoint;
      return {
        ...cabin,
        feet: { east, north, height: height - summitCableSpec.cabinFloorBelowRope },
        heading,
        whiteout: cabin.phase === 'whiteout',
      };
    },

    exit(nowMs: number, ride: SummitCableRide): SummitCablePoint | undefined {
      const { station } = cable.cabinsAt(nowMs)[ride.cabinIndex];
      if (station) return cable.ropes[ride.cabinIndex].dock(station).approach;
    },
  };
}
