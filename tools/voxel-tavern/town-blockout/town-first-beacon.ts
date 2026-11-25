import { thirteenthBellCatalogueEntry, type TownNightBeaconFrame } from '../../../src/shared/town-night-beacon.js';
import { browserTextStorage, type StorageAccess } from './town-text-store';

const receiptKey = 'unwritten:2027-town-first-thirteenth-bell';
const livingPauseMs = 450;
const mascotLookMs = 1_500;

function readReceipt(storage: StorageAccess | undefined) {
  try { return storage?.getItem(receiptKey) === 'heard'; }
  catch { return false; }
}

type FirstBeaconOptions = Readonly<{
  serverNow: () => number;
  /** The current live session's authoritative join time. Undefined while disconnected. */
  connectedAt: () => number | undefined;
  /** The current room and player state are eligible to hear this cue. */
  canHearHere?: () => boolean;
  /** Inject a monotonic clock for reactions, independent of server synchronization. */
  monotonicNow?: () => number;
  /** The scene confirms that this live cue passed its audibility checks and scheduled the sound. */
  playAudibleTowerCue: (cue: TownNightBeaconFrame) => boolean;
  storage?: StorageAccess;
}>;

/** One per local player. Supply ringTower to the existing live beacon receiver. */
export function createTownFirstBeacon(options: FirstBeaconOptions) {
  const storage = options.storage ?? browserTextStorage();
  let heard = readReceipt(storage);
  let reactionStartedAt: number | undefined;
  let lastAudibleCue = -1;
  const reactionClock = options.monotonicNow ?? options.serverNow;

  return {
    ringTower(cue: TownNightBeaconFrame) {
      const connectedAt = options.connectedAt();
      const now = options.serverNow();
      if (options.canHearHere?.() === false || connectedAt === undefined || !Number.isFinite(connectedAt) ||
          connectedAt < 0 || connectedAt > cue.at || !Number.isFinite(now) || now < cue.at ||
          now >= cue.expiresAt || cue.at <= lastAudibleCue) return;
      if (options.playAudibleTowerCue(cue) !== true) return;
      lastAudibleCue = cue.at;

      if (heard || readReceipt(storage)) return;
      heard = true;
      reactionStartedAt = reactionClock();
      try { storage?.setItem(receiptKey, 'heard'); }
      catch { /* Keep the first hearing through reconnects in this page. */ }
    },

    /** Read once per scene frame and apply the same pause flag to all living actors. */
    sampleScene() {
      const now = reactionClock();
      if (reactionStartedAt === undefined || !Number.isFinite(now)) return;
      const age = now - reactionStartedAt;
      if (age < 0 || age >= mascotLookMs) return;
      return { livingPaused: age < livingPauseMs, mascotLooksAtTower: true } as const;
    },

    /** Read while opening or rendering the existing catalogue. No UI event is generated. */
    catalogueEntry() {
      if (heard || readReceipt(storage)) return thirteenthBellCatalogueEntry;
    },
  };
}
