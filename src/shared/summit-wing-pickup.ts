import { claimSnowWing } from './snow-wing.js';

type SummitLocalPoint = Readonly<{ east: number; north: number; height: number }>;

export const summitWingRackStand = { east: 66.62, north: 1016.10, height: 800 } as const;

export function isWithinSummitWingRackReach(feet: SummitLocalPoint) {
  const stand = summitWingRackStand;
  return Math.abs(feet.height - stand.height) <= .43 &&
    Math.hypot(feet.east - stand.east, feet.north - stand.north) <= .72;
}

/** The host passes accepted P-1 local feet and the player's trusted progress. */
export function summitWingPickupAvailability(feet: SummitLocalPoint, claimed: boolean,
  profile: Readonly<{ snowWingEligible: boolean }>) {
  if (!isWithinSummitWingRackReach(feet)) return 'out-of-reach';
  if (claimed) return 'already-claimed';
  return claimSnowWing(false, 'summit-lodge', profile) ? 'available' : 'need-registration';
}
