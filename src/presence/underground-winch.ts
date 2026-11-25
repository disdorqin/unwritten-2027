export const undergroundWinchTurnsToOpen = 3;
export const undergroundWinchTurnMs = 2_500;

export type UndergroundWinchUsePoint = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  horizontalReach: number;
  verticalReach: number;
}>;

export type UndergroundWinchAcceptedFoot = Readonly<{
  playerId: string;
  domainId: string;
  east: number;
  north: number;
  height: number;
}>;

// Bind to UndergroundEntryOptions.canUseWinch. The caller takes playerId from
// the authenticated session and reads the latest live foot accepted by movement.
export function createUndergroundWinchAccess(
  usePoint: UndergroundWinchUsePoint,
  readAcceptedFoot: (playerId: string) => UndergroundWinchAcceptedFoot | undefined,
) {
  const { domainId, east, north, height, horizontalReach, verticalReach } = usePoint;
  if (!domainId || ![east, north, height, horizontalReach, verticalReach].every(Number.isFinite) ||
      horizontalReach < 0 || verticalReach < 0) {
    throw new RangeError('The winch needs a domain and a finite use point with non-negative reach');
  }

  return function canUseWinch(playerId: string): boolean {
    if (!playerId) return false;
    const foot = readAcceptedFoot(playerId);
    return foot !== undefined && foot.playerId === playerId && foot.domainId === domainId &&
      Math.hypot(foot.east - east, foot.north - north) <= horizontalReach &&
      Math.abs(foot.height - height) <= verticalReach;
  };
}

type WindingOptions = Readonly<{
  canUseWinch(playerId: string): boolean;
  now(): number;
  maxSampleGapMs: number;
  turnMs?: number;
  /**
   * External-completion attestor (ruling 2026-11-21, winch 乙案): a host
   * feel model (the town-winch leaf) may drive cranking pace and duo
   * collaboration. The winding still owns the credential: completion only
   * counts while this session's own held-input stream is current, the
   * operator stands at the handle, and the attestor reports complete.
   */
  external?: {
    isComplete(playerId: string): boolean;
    progress(playerId: string): number;
  };
}>;

/** Advance from accepted held-input samples. Only the entry authority opens and saves the well. */
export function createUndergroundWinchWinding({
  canUseWinch, now, maxSampleGapMs, turnMs = undergroundWinchTurnMs, external,
}: WindingOptions) {
  const totalMs = turnMs * undergroundWinchTurnsToOpen;
  if (!Number.isFinite(totalMs) || !Number.isFinite(maxSampleGapMs) || maxSampleGapMs <= 0 || maxSampleGapMs >= turnMs) {
    throw new RangeError('Winch winding needs a finite turn time and a shorter host sample interval');
  }

  let winding: { playerId: string; startedAt: number; lastAt: number } | undefined;
  let externalSession: { playerId: string; lastAt: number } | undefined;
  function cancel(playerId: string) {
    if (winding?.playerId === playerId) winding = undefined;
    if (externalSession?.playerId === playerId) externalSession = undefined;
  }

  function isCurrent(time: number, lastAt: number) {
    return Number.isFinite(time) && time >= lastAt && time - lastAt <= maxSampleGapMs;
  }

  return {
    cancel,
    sample(playerId: string) {
      const time = now();
      if (winding && !isCurrent(time, winding.lastAt)) winding = undefined;
      if (externalSession && !isCurrent(time, externalSession.lastAt)) externalSession = undefined;
      if (!playerId || !Number.isFinite(time) || !canUseWinch(playerId)) {
        cancel(playerId);
        return { kind: 'unreachable' } as const;
      }
      if (winding && winding.playerId !== playerId) return { kind: 'busy' } as const;
      if (externalSession && externalSession.playerId !== playerId) return { kind: 'busy' } as const;
      winding ??= { playerId, startedAt: time, lastAt: time };
      winding.lastAt = time;
      const elapsed = time - winding.startedAt;
      return elapsed >= totalMs
        ? { kind: 'ready', turns: undergroundWinchTurnsToOpen } as const
        : { kind: 'winding', turns: elapsed / turnMs } as const;
    },
    canOpenWell(playerId: string) {
      if (winding?.playerId === playerId && isCurrent(now(), winding.lastAt) &&
        winding.lastAt - winding.startedAt >= totalMs && canUseWinch(playerId)) return true;
      return external !== undefined && externalSession?.playerId === playerId &&
        isCurrent(now(), externalSession.lastAt) && external.isComplete(playerId) &&
        canUseWinch(playerId);
    },
    /**
     * Held-input stream for an external feel model. Same discipline as
     * sample(): one operator, handle reach enforced per call, stale
     * streams expire. Progress turns mirror the attestor's 0..1 progress.
     */
    sampleExternal(playerId: string) {
      if (!external) return { kind: 'unreachable' } as const;
      const time = now();
      if (externalSession && !isCurrent(time, externalSession.lastAt)) externalSession = undefined;
      if (winding && !isCurrent(time, winding.lastAt)) winding = undefined;
      if (!playerId || !Number.isFinite(time) || !canUseWinch(playerId)) {
        cancel(playerId);
        return { kind: 'unreachable' } as const;
      }
      if ((winding && winding.playerId !== playerId) ||
          (externalSession && externalSession.playerId !== playerId)) {
        return { kind: 'busy' } as const;
      }
      externalSession ??= { playerId, lastAt: time };
      externalSession.lastAt = time;
      if (external.isComplete(playerId)) {
        return { kind: 'ready', turns: undergroundWinchTurnsToOpen } as const;
      }
      const progress = external.progress(playerId);
      const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
      return { kind: 'winding', turns: clamped * undergroundWinchTurnsToOpen } as const;
    },
  };
}
