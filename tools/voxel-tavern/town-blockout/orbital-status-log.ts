import type { OrbitalRoomPoint } from './orbital-early-rooms.js';

export type OrbitalLogHands = Readonly<{ leftHand: OrbitalRoomPoint; rightHand: OrbitalRoomPoint }>;
export type OrbitalLogState = Readonly<{ slot: number | null; lastReached: boolean }>;
export type OrbitalLogAction = Readonly<{ type: 'confirm'; leftHeld: boolean; rightHeld: boolean }> | Readonly<{ type: 'next' }>;

// The isolated status review uses three blank slots. It assigns no text or canonical page numbers.
export const orbitalLogReviewSlots = 3;
export const initialOrbitalLogState: OrbitalLogState = { slot: null, lastReached: false };

export function readOrbitalLogReach(accepted: OrbitalRoomPoint, hands: OrbitalLogHands) {
  const canReach = (hand: OrbitalRoomPoint) => Math.abs(accepted.ground - hand.ground) <= .07 &&
    Math.hypot(accepted.x - hand.x, accepted.n - hand.n) <= .96;
  return { left: canReach(hands.leftHand), right: canReach(hands.rightHand) };
}

/** The caller supplies the accepted feet, not cursor placement or a requested target. */
export function resolveOrbitalLogAction(state: OrbitalLogState, action: OrbitalLogAction,
  accepted: OrbitalRoomPoint, hands: OrbitalLogHands): OrbitalLogState {
  const reach = readOrbitalLogReach(accepted, hands);
  if (!reach.left || !reach.right) return state;
  if (action.type === 'confirm') {
    return state.slot === null && action.leftHeld && action.rightHeld ? { ...state, slot: 0 } : state;
  }
  if (state.slot === null || state.lastReached) return state;
  const slot = state.slot + 1;
  return { slot, lastReached: slot === orbitalLogReviewSlots - 1 };
}
