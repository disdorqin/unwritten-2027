import type { SummitPassportAction, SummitPassportProgress, SummitPassportReply, SummitPassportResult } from '../shared/summit-passport.js';

type Area = 'cloud-deck' | 'summit';

export type SummitPassportPosition = Readonly<{ area: Area; east: number; north: number; height: number }>;

export type SummitPassportStage = 1 | 2 | 3;
export type SummitPassportStore = Readonly<{
  load(profileKey: string): Promise<SummitPassportStage | undefined>;
  /** Resolve only after the new stage is durable. Reject without acknowledging a failed write. */
  save(profileKey: string, stage: SummitPassportStage): Promise<void>;
}>;

export type SummitPassportHost = Readonly<{
  cloudDeckHeight: number;
  /** Resolve this live presence peer via the authoritative domain host. Interpolated or received presence is cosmetic. */
  resolvePosition(peerId: number): SummitPassportPosition | undefined;
  persistence?: Readonly<{
    /** An opaque identity from the authenticated host. Neither a wire field nor a display name. */
    resolveProfileKey(peerId: number): string | undefined;
    store: SummitPassportStore;
  }>;
}>;

type StampAction = Exclude<SummitPassportAction, 'status'>;
type Stage = 0 | SummitPassportStage;

// Picked from the audited P-4 stamp and registrar points (f646a02).
// The lower point is in the north ridge coordinate frame; the upper points are summit-local.
export function summitPassportSites(cloudDeckHeight: number): Readonly<Record<StampAction, SummitPassportPosition>> {
  if (!Number.isFinite(cloudDeckHeight) || cloudDeckHeight < 347 || cloudDeckHeight > 350) {
    throw new RangeError('The summit passport requires the surveyed cloud-deck height.');
  }
  return {
    'cloud-stamp': { area: 'cloud-deck', east: 306, north: 659, height: cloudDeckHeight },
    'summit-stamp': { area: 'summit', east: 50, north: 998, height: 800 },
    'register-summit': { area: 'summit', east: 62.5, north: 1014, height: 800 },
  };
}

const targetStage: Record<StampAction, Exclude<Stage, 0>> = { 'cloud-stamp': 1, 'summit-stamp': 2, 'register-summit': 3 };

function progressAt(stage: Stage): SummitPassportProgress {
  return { cloudStamped: stage >= 1, summitStamped: stage >= 2, summitRegistered: stage === 3, snowWingEligible: stage === 3 };
}

function passportReply(action: SummitPassportAction, result: SummitPassportResult, stage: Stage): SummitPassportReply {
  return { type: 'event', kind: 'summit-passport-result', action, result, progress: progressAt(stage) };
}

export function summitPassportUnavailable(action: SummitPassportAction): SummitPassportReply {
  return passportReply(action, 'unavailable', 0);
}

export function createSummitPassportAuthority(host: SummitPassportHost) {
  const sites = summitPassportSites(host.cloudDeckHeight);
  const stages = new Map<number, Stage>();
  const pendingProfiles = new Map<string, Promise<void>>();
  const persistence = host.persistence;

  function evaluate(stage: Stage, action: SummitPassportAction, reached: boolean) {
    if (action === 'status') return { next: stage, result: 'ok' } as const;
    const target = targetStage[action];
    if (!reached) return { next: stage, result: 'position' } as const;
    if (stage < target - 1) return { next: stage, result: 'previous-stamp' } as const;
    return { next: stage < target ? target : stage, result: 'ok' } as const;
  }

  function atSite(peerId: number, action: SummitPassportAction) {
    if (action === 'status') return true;
    const anchor = sites[action];
    const position = host.resolvePosition(peerId);
    return position?.area === anchor.area && Math.abs(position.height - anchor.height) <= 0.43 &&
      Math.hypot(position.east - anchor.east, position.north - anchor.north) <= 1.1;
  }

  async function persistedResult(profileKey: string, action: SummitPassportAction, reached: boolean) {
    let stage: Stage = 0;
    try {
      stage = await persistence!.store.load(profileKey) ?? 0;
      const { next, result } = evaluate(stage, action, reached);
      if (next !== stage && next !== 0) await persistence!.store.save(profileKey, next);
      return passportReply(action, result, next);
    } catch {
      return passportReply(action, 'storage', stage);
    }
  }

  return {
    async request(peerId: number, action: SummitPassportAction): Promise<SummitPassportReply> {
      let reached: boolean;
      let profileKey: string | undefined;
      try {
        reached = atSite(peerId, action);
        profileKey = persistence?.resolveProfileKey(peerId);
      } catch {
        return summitPassportUnavailable(action);
      }
      if (!persistence) {
        const stage = stages.get(peerId) ?? 0;
        const { next, result } = evaluate(stage, action, reached);
        if (next !== stage) stages.set(peerId, next);
        return passportReply(action, result, next);
      }
      if (typeof profileKey !== 'string' || !profileKey.length || profileKey.length > 256) {
        return summitPassportUnavailable(action);
      }
      // Two transports may overlap while the same trusted profile is reconnecting.
      const key = profileKey;
      const result = (pendingProfiles.get(key) ?? Promise.resolve()).then(() => persistedResult(key, action, reached));
      const pending = result.then(() => {});
      pendingProfiles.set(key, pending);
      try {
        return await result;
      } finally {
        if (pendingProfiles.get(key) === pending) pendingProfiles.delete(key);
      }
    },
    forget(peerId: number) {
      stages.delete(peerId);
    },
    async flush() {
      await Promise.all(pendingProfiles.values());
    },
  };
}
