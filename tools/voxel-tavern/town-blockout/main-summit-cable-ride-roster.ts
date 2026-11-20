import type { createMainSummitCable, SummitCablePoint } from './main-summit-cable';
import { createMainSummitCableTravel } from './main-summit-cable-travel';

type SummitCable = ReturnType<typeof createMainSummitCable>;
type SummitCableTravel = ReturnType<typeof createMainSummitCableTravel>;

export type SummitCableRider = {
  readonly id: string;
  readonly cabinIndex: 0 | 1;
  readonly seat: 0 | 1;
};

const previewSeats = [0, 1] as const;

export function createSummitCableRideRoster(cable: SummitCable) {
  const travel = createMainSummitCableTravel(cable);
  const riders = new Map<string, SummitCableRider>();

  return {
    board(id: string, nowMs: number, cabinIndex: SummitCableRider['cabinIndex'], feet: SummitCablePoint) {
      if (!id || riders.has(id) || !travel.attemptBoard(nowMs, cabinIndex, feet)) return false;

      const occupied = [...riders.values()].filter(rider => rider.cabinIndex === cabinIndex);
      const seat = previewSeats.find(candidate => occupied.every(rider => rider.seat !== candidate));
      if (seat === undefined) return false;

      riders.set(id, { id, cabinIndex, seat });
      return true;
    },

    exit(id: string, nowMs: number) {
      const rider = riders.get(id);
      if (!rider) return;

      const { station } = travel.ridePose(nowMs, rider);
      const feet = travel.exit(nowMs, rider);
      if (!station || !feet) return;

      riders.delete(id);
      return { feet, station };
    },

    disconnect(id: string) {
      return riders.delete(id);
    },

    snapshot(): readonly SummitCableRider[] {
      return Array.from(riders.values(), rider => ({ ...rider }));
    },
  };
}

export function summitCableRiderPose(travel: SummitCableTravel, nowMs: number, rider: SummitCableRider) {
  const pose = travel.ridePose(nowMs, rider);
  // The seats stay fixed to the physical cabin on both the outbound and return trips.
  const seatSide = rider.seat === 0 ? -1 : 1;
  const right = seatSide * .55;
  const forward = seatSide * .58;
  const sin = Math.sin(pose.heading);
  const cos = Math.cos(pose.heading);

  return {
    ...pose,
    feet: {
      east: pose.feet.east + right * cos + forward * sin,
      north: pose.feet.north - right * sin + forward * cos,
      height: pose.feet.height,
    },
  };
}
