import type { createUndergroundMineEncounter } from './underground-mine-encounter.js';
import { createUndergroundWinchAccess } from './underground-winch.js';

export type UndergroundMineGateStage = 'closed' | 'ajar' | 'open';

type WinchRegistration = Parameters<typeof createUndergroundWinchAccess>;
type Options = Readonly<{
  winch: WinchRegistration[0];
  readAcceptedFoot: WinchRegistration[1];
  encounter: Pick<ReturnType<typeof createUndergroundMineEncounter>, 'isSectionCleared'>;
  now(): number;
  revealMs: number;
}>;

/** One gate per mine run. The host uses its stage to drive the leaf and validate traversal. */
export function createUndergroundMineGate({ winch, readAcceptedFoot, encounter, now, revealMs }: Options) {
  if (!Number.isFinite(revealMs) || revealMs <= 0) throw new RangeError('The mine gate needs a positive reveal time');
  const canUseWinch = createUndergroundWinchAccess(winch, readAcceptedFoot);
  let phase: 'closed' | { opensAt: number } | 'open' = 'closed';

  function state(): UndergroundMineGateStage {
    if (typeof phase === 'string') return phase;
    const time = now();
    if (!Number.isFinite(time) || time < phase.opensAt) return 'ajar';
    phase = 'open';
    return phase;
  }

  return {
    state,
    openFromMine(playerId: string) {
      if (!canUseWinch(playerId)) return 'unreachable' as const;
      if (phase !== 'closed') return state();
      if (!encounter.isSectionCleared('mine')) return 'uncleared' as const;
      const openedAt = now();
      const deadline = openedAt + revealMs;
      if (!Number.isFinite(deadline) || deadline <= openedAt) return 'clock-unavailable' as const;
      phase = { opensAt: deadline };
      return 'ajar' as const;
    },
  };
}
