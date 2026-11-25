/**
 * Carved-stone rubbing — the rules face (branch window B, batch 95:
 * the scenery and host markers are C2's; the rubbing rules are
 * mine). The stone carries the half-moon falling-arc carving —
 * carved only, never explained （只刻不释）: this leaf registers the
 * act of rubbing it, nothing about what it means.
 *
 * The interaction follows my line's rubbing canon (survey rubbings,
 * tower rubbings): hold to press, progress survives a released hand
 * only briefly, completion is one-time and registers the atlas
 * entry. The marker is injected structurally — when C2's scenery
 * lands, the host passes its marker id and this leaf does not
 * change.
 */

export const carvedStoneRubMs = 2_400;
/** Letting go keeps progress for this long; after that it fades. */
export const carvedStoneHoldGraceMs = 800;

export type CarvedStoneMarker = Readonly<{ id: string }>;

export function createCarvedStoneRubbing(marker: CarvedStoneMarker) {
  let progressMs = 0;
  let idleMs = 0;
  let done = false;
  return {
    get markerId() { return marker.id; },
    get complete() { return done; },
    get progress() { return done ? 1 : progressMs / carvedStoneRubMs; },
    /**
     * Advance one frame. `pressing` is the held interact key near the
     * stone. Returns the atlas entry key exactly once, on completion.
     */
    frame(dtMs: number, pressing: boolean): { atlasEntry: string } | undefined {
      if (done) return undefined;
      if (pressing) {
        idleMs = 0;
        progressMs = Math.min(carvedStoneRubMs, progressMs + Math.max(0, dtMs));
        if (progressMs >= carvedStoneRubMs) {
          done = true;
          return { atlasEntry: 'carved-stone' };
        }
      } else if (progressMs > 0) {
        idleMs += Math.max(0, dtMs);
        if (idleMs > carvedStoneHoldGraceMs) progressMs = 0;
      }
      return undefined;
    },
  };
}
