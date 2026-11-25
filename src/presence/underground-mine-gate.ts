import type { createUndergroundMineEncounter } from './underground-mine-encounter.js';
import { createUndergroundWinchAccess, type UndergroundWinchAcceptedFoot } from './underground-winch.js';

export type UndergroundMineGateStage = 'closed' | 'ajar' | 'open';

type WinchRegistration = Parameters<typeof createUndergroundWinchAccess>;
type GateSide = 'mine' | 'crystal';
type Landing = Readonly<Omit<UndergroundWinchAcceptedFoot, 'playerId'> & { yaw: number }>;
type Passage = Readonly<{
  mine: Landing;
  crystal: Landing;
  isAtThreshold(side: GateSide, foot: UndergroundWinchAcceptedFoot): boolean;
  supportsLanding(side: GateSide, landing: Landing): boolean;
}>;
type Options = Readonly<{
  winch: WinchRegistration[0];
  crystalSwitch?: WinchRegistration[0];
  readAcceptedFoot: WinchRegistration[1];
  passage?: Passage;
  encounter: Pick<ReturnType<typeof createUndergroundMineEncounter>, 'isSectionCleared'>;
  now(): number;
  revealMs: number;
}>;

function isFiniteLanding(foot: Landing) {
  return typeof foot.domainId === 'string' && foot.domainId.length > 0 && foot.domainId.trim() === foot.domainId &&
    [foot.east, foot.north, foot.height, foot.yaw].every(Number.isFinite);
}

/** One gate per mine run. Opening and both directions of traversal use the same leaf state. */
export function createUndergroundMineGate({
  winch, crystalSwitch, readAcceptedFoot, passage, encounter, now, revealMs,
}: Options) {
  if (!Number.isFinite(revealMs) || revealMs <= 0) throw new RangeError('The mine gate needs a positive reveal time');
  if (crystalSwitch?.domainId === winch.domainId) {
    throw new RangeError('The crystal return switch needs a domain distinct from the mine winch');
  }
  const landings = passage && { mine: { ...passage.mine }, crystal: { ...passage.crystal } };
  if (landings && (!isFiniteLanding(landings.mine) || !isFiniteLanding(landings.crystal) ||
      landings.mine.domainId !== winch.domainId || landings.mine.domainId === landings.crystal.domainId ||
      (crystalSwitch && landings.crystal.domainId !== crystalSwitch.domainId))) {
    throw new RangeError('The gate passage requires finite landings in its registered mine and crystal domains');
  }
  const canUseWinch = createUndergroundWinchAccess(winch, readAcceptedFoot);
  const canUseCrystalSwitch = crystalSwitch && createUndergroundWinchAccess(crystalSwitch, readAcceptedFoot);
  let phase: 'closed' | { opensAt: number } | 'open' = 'closed';

  function state(): UndergroundMineGateStage {
    if (typeof phase === 'string') return phase;
    const time = now();
    if (!Number.isFinite(time) || time < phase.opensAt) return 'ajar';
    phase = 'open';
    return phase;
  }

  function startOpening() {
    const openedAt = now();
    const deadline = openedAt + revealMs;
    if (!Number.isFinite(deadline) || deadline <= openedAt) return 'clock-unavailable' as const;
    phase = { opensAt: deadline };
    return 'ajar' as const;
  }

  return {
    state,
    // The host must commit the realm and position together after resolving its accepted foot.
    resolveTraversal(playerId: string) {
      if (!passage || !landings || !playerId || state() !== 'open') return;
      const foot = readAcceptedFoot(playerId);
      if (!foot || foot.playerId !== playerId || ![foot.east, foot.north, foot.height].every(Number.isFinite)) return;
      const from = foot.domainId === landings.mine.domainId ? 'mine' :
        foot.domainId === landings.crystal.domainId ? 'crystal' : undefined;
      if (!from || passage.isAtThreshold(from, foot) !== true) return;
      const to = from === 'mine' ? 'crystal' : 'mine';
      const landing = { ...landings[to] };
      if (passage.supportsLanding(to, landing) !== true) return;
      return { playerId, fromDomainId: foot.domainId, landing };
    },
    openFromMine(playerId: string) {
      if (!canUseWinch(playerId)) return 'unreachable' as const;
      if (phase !== 'closed') return state();
      if (!encounter.isSectionCleared('mine')) return 'uncleared' as const;
      return startOpening();
    },
    openFromCrystal(playerId: string) {
      if (!canUseCrystalSwitch?.(playerId)) return 'unreachable' as const;
      return phase === 'closed' ? startOpening() : state();
    },
  };
}
