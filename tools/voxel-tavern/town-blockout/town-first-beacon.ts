import { thirteenthBellCatalogueEntry, type TownNightBeaconFrame } from '../../../src/shared/town-night-beacon.js';
import { browserTextStorage, type StorageAccess } from './town-text-store.js';

const receiptKey = 'unwritten:2027-town-first-thirteenth-bell';
const livingPauseMs = 450;
const mascotLookMs = 1_500;

function readReceipt(storage: StorageAccess | undefined): boolean {
  try { return storage?.getItem(receiptKey) === 'heard'; }
  catch { return false; }
}

export type FirstBeaconScene = Readonly<{
  livingPaused: boolean;
  mascotLooksAtTower: boolean;
}>;

export type TownFirstBeaconOptions = Readonly<{
  serverNow: () => number;
  connectedAt: () => number | undefined;
  /** Current active domain: no first-hear receipt from other rooms, homes, or transit. */
  canHearHere: () => boolean;
  /** Return true only if the town bell sound was actually scheduled. */
  playAudibleTowerCue: (cue: TownNightBeaconFrame) => boolean;
  /** Local monotonic time for reactions; independent of server clock corrections. */
  monotonicNow?: () => number;
  storage?: StorageAccess;
}>;

/**
 * Local, unobtrusive first-hear staging. The server owns the signal; this
 * adapter only observes a live audible event, never restores a missed sound.
 */
export function createTownFirstBeacon(options: TownFirstBeaconOptions) {
  const storage = options.storage ?? browserTextStorage();
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  let heard = readReceipt(storage);
  let lastAudibleAt = -1;
  let firstReactionAt: number | undefined;

  return {
    ringTower(cue: TownNightBeaconFrame) {
      const connectedAt = options.connectedAt();
      const now = options.serverNow();
      if (!options.canHearHere() || connectedAt === undefined ||
          !Number.isFinite(connectedAt) || connectedAt < 0 || connectedAt > cue.at ||
          !Number.isFinite(now) || now < cue.at || now >= cue.expiresAt ||
          cue.at <= lastAudibleAt) return false;
      if (options.playAudibleTowerCue(cue) !== true) return false;
      lastAudibleAt = cue.at;

      if (!heard && !readReceipt(storage)) {
        heard = true;
        firstReactionAt = monotonicNow();
        try { storage?.setItem(receiptKey, 'heard'); }
        catch { /* In-memory receipt remains for this page. */ }
      }
      return true;
    },

    sampleScene(): FirstBeaconScene | undefined {
      if (firstReactionAt === undefined) return;
      const elapsed = monotonicNow() - firstReactionAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= mascotLookMs) return;
      return {
        livingPaused: elapsed < livingPauseMs,
        mascotLooksAtTower: true,
      };
    },

    catalogueEntry() {
      return (heard || readReceipt(storage)) ? thirteenthBellCatalogueEntry : undefined;
    },
  };
}
