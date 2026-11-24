/**
 * Encounter rotation (design: 地下重入变化， secondary variable). The
 * encounter groups of the layer tables are dealt into three tiers by
 * night; each night a layer fields exactly one tier plus its fixed
 * garrison groups. The population never changes — only which groups
 * are on the road tonight. The tier a night fields rotates with the
 * beacon night ordinal, offset per layer so the layers do not move in
 * lockstep.
 */

export type EncounterLayer = -140 | -165 | -190;
export type EncounterTier = 0 | 1 | 2 | 'fixed';

export type EncounterGroup = Readonly<{
  id: string;
  layer: EncounterLayer;
  tier: EncounterTier;
}>;

/** Per-layer phase offset for the rotation (design freedom, pinned
 * here): the layers are one night out of step with each other. */
const layerOffset: Readonly<Record<EncounterLayer, number>> = {
  '-140': 0, '-165': 1, '-190': 2,
};

export function encounterTierForNight(layer: EncounterLayer, nightOrdinal: number): 0 | 1 | 2 {
  const raw = nightOrdinal + layerOffset[layer];
  return (((raw % 3) + 3) % 3) as 0 | 1 | 2;
}

export function activeEncounterGroups(
  registry: readonly EncounterGroup[],
  layer: EncounterLayer,
  nightOrdinal: number,
): EncounterGroup[] {
  const tier = encounterTierForNight(layer, nightOrdinal);
  return registry.filter((group) =>
    group.layer === layer && (group.tier === 'fixed' || group.tier === tier));
}
