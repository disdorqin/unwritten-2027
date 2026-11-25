import {
  isMineCartSnapshot, nextMineCartStep, type MineCartPoint, type MineCartPush, type MineCartSnapshot,
  type UndergroundMineCartTrack,
} from '../shared/underground-mine-cart-track.js';

type AcceptedFoot = MineCartPoint & Readonly<{ domainId: string; playerId: string }>;
type Options = Readonly<{
  track: UndergroundMineCartTrack;
  domainId: string;
  pushReach: number;
  initial?: MineCartSnapshot;
  readAcceptedFoot(playerId: string): AcceptedFoot | undefined;
  canRoll(from: MineCartPoint, to: MineCartPoint, playerId: string): boolean;
}>;

/** The mine scene owns this state. Presence supplies accepted feet and evaluates the real swept cart volume. */
export function createUndergroundMineCart({ track, domainId, pushReach, initial, readAcceptedFoot, canRoll }: Options) {
  let state: MineCartSnapshot = initial ? { ...initial } : { step: 0, revision: 0 };
  if (!domainId.trim() || !Number.isFinite(pushReach) || pushReach <= 0 || !isMineCartSnapshot(state)) {
    throw new RangeError('The mine cart needs a registered domain, a positive reach, and a valid state');
  }

  return {
    snapshot: () => ({ ...state }),
    push(playerId: string, { direction, revision }: MineCartPush): MineCartSnapshot | undefined {
      if (!playerId || revision !== state.revision || revision === Number.MAX_SAFE_INTEGER) return;
      const next = nextMineCartStep(state.step, direction);
      if (next === undefined) return;
      const foot = readAcceptedFoot(playerId);
      if (!foot || foot.playerId !== playerId || foot.domainId !== domainId) return;
      const at = track.approach(state.step, direction);
      const gap = Math.hypot(foot.east - at.east, foot.north - at.north, foot.height - at.height);
      if (!Number.isFinite(gap) || gap > pushReach) return;
      if (!canRoll(track.point(state.step), track.point(next), playerId) || state.revision !== revision) return;
      state = { step: next, revision: revision + 1 };
      return { ...state };
    },
  };
}
