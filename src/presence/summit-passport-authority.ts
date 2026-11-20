import type { SummitPassportAction, SummitPassportProgress, SummitPassportReply, SummitPassportResult } from '../shared/summit-passport.js';

type Area = 'cloud-deck' | 'summit';

export type SummitPassportPosition = Readonly<{ area: Area; east: number; north: number; height: number }>;

export type SummitPassportHost = Readonly<{
  cloudDeckHeight: number;
  /** Resolve this live presence peer via the authoritative domain host. Interpolated or received presence is cosmetic. */
  resolvePosition(peerId: number): SummitPassportPosition | undefined;
}>;

type StampAction = Exclude<SummitPassportAction, 'status'>;
type Stage = 0 | 1 | 2 | 3;

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

export function summitPassportUnavailable(action: SummitPassportAction): SummitPassportReply {
  return { type: 'event', kind: 'summit-passport-result', action, result: 'unavailable', progress: progressAt(0) };
}

export function createSummitPassportAuthority(host: SummitPassportHost) {
  const sites = summitPassportSites(host.cloudDeckHeight);
  const stages = new Map<number, Stage>();

  return {
    request(peerId: number, action: SummitPassportAction): SummitPassportReply {
      let stage = stages.get(peerId) ?? 0;
      let result: SummitPassportResult = 'ok';
      if (action !== 'status') {
        const anchor = sites[action];
        const position = host.resolvePosition(peerId);
        const target = targetStage[action];
        const reached = position?.area === anchor.area && Math.abs(position.height - anchor.height) <= 0.43 &&
          Math.hypot(position.east - anchor.east, position.north - anchor.north) <= 1.1;
        if (!reached) result = 'position';
        else if (stage < target - 1) result = 'previous-stamp';
        else if (stage < target) {
          stage = target;
          stages.set(peerId, stage);
        }
      }
      return { type: 'event', kind: 'summit-passport-result', action, result, progress: progressAt(stage) };
    },
    forget(peerId: number) {
      stages.delete(peerId);
    },
  };
}
