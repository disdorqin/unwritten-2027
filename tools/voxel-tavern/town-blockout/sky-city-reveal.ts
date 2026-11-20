import { mainSummitCloudSpec } from './main-summit-cloud-layer';

export type SkyCityRevealSample = Readonly<{
  source: 'ground' | 'mountain';
  height: number;
  whiteout: boolean;
  inView: boolean;
}>;

/** The host binds the store to the current player's discovery state. */
export type SkyCityDiscoveryStore = Readonly<{
  hasSeen(): boolean;
  markSeen(): void;
}>;

/** Read accepted world feet and the player's actual view after the cloud and camera update. */
export function createSkyCityReveal(alreadySeen = false, discovery?: SkyCityDiscoveryStore) {
  const { bottom, top } = mainSummitCloudSpec;
  let seen = alreadySeen;
  try { seen ||= discovery?.hasSeen() === true; }
  catch { /* Keep the current player's in-memory state if storage is unavailable. */ }
  let inBelt = false;
  let emerged = false;
  return {
    seen: () => seen,
    sample({ source, height, whiteout, inView }: SkyCityRevealSample) {
      if (seen) return false;
      if (source !== 'mountain' || !Number.isFinite(height)) {
        inBelt = emerged = false;
        return false;
      }
      if (height < top) {
        inBelt = height >= bottom;
        emerged = false;
        return false;
      }
      emerged ||= inBelt;
      inBelt = false;
      if (!emerged || whiteout || !inView) return false;
      seen = true;
      try { discovery?.markSeen(); }
      catch { /* The reveal still plays once in this session. */ }
      return true;
    },
  };
}
