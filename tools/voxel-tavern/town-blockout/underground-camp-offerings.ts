type CampNiche = Readonly<{ id: string; hasSpentLamp: boolean }>;

type OfferingResult =
  | { kind: 'offered' }
  | { kind: 'unavailable-niche' }
  | { kind: 'no-lamp' }
  | { kind: 'busy' };

export const undergroundCampOfferingLighting = {
  niche: { radius: 8, tone: 'warm' },
  camp: { radius: 4, tone: 'cool' },
  visibleLightLimit: 5,
} as const;

/** Holds offerings for one activity scope selected and kept by the host. */
export function createUndergroundCampOfferings(niches: readonly CampNiche[]) {
  const configured = new Set<string>();
  const emptyNiches = new Set<string>();
  for (const { id, hasSpentLamp } of niches) {
    if (!id || configured.has(id)) throw new RangeError('Camp niches need unique IDs');
    configured.add(id);
    if (!hasSpentLamp) emptyNiches.add(id);
  }

  const lit = new Set<string>();
  let debiting = false;

  return {
    snapshot() {
      return { litNicheIds: [...lit], extraCampLightCount: lit.size >= 3 ? 2 as const : 0 as const };
    },
    // The host verifies and removes exactly one eligible existing lamp in this
    // synchronous call. Returning false or throwing must leave inventory unchanged.
    offerLamp(nicheId: string, takeLamp: () => boolean): OfferingResult {
      if (!emptyNiches.has(nicheId) || lit.has(nicheId)) return { kind: 'unavailable-niche' };
      if (debiting) return { kind: 'busy' };
      debiting = true;
      try {
        if (takeLamp() !== true) return { kind: 'no-lamp' };
        lit.add(nicheId);
        return { kind: 'offered' };
      } finally {
        debiting = false;
      }
    },
    // The host alone decides when this scope ends or is explicitly cleared.
    clear(): boolean {
      if (debiting) return false;
      lit.clear();
      return true;
    },
  };
}
