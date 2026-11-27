/**
 * Atlas species pages — framework only (ZB-42, branch window B).
 *
 * The species roster and every word of page copy belong to the design
 * line: entries arrive as data with copy KEYS, and page text resolves
 * through an injected copy table. This module never invents a species
 * or a sentence; an unresolved key renders as an empty slot.
 *
 * Canon: the atlas is a record, not an assessment — no progress bars,
 * no completion rewards, no arrows. Discovery is two-stage in the
 * spirit of the three-touch standard: hearing a species marks the
 * page as heard (silhouette), seeing it completes the entry.
 */

export type AtlasRegion = 'town' | 'crater' | 'mountain' | 'underground' | 'sky';
export type DiscoveryStage = 'unknown' | 'heard' | 'seen';

export type AtlasSpeciesEntry = Readonly<{
  id: string;
  region: AtlasRegion;
  /** Copy keys for the page's three lines; text comes from the design line's copy table. */
  copy: Readonly<{ name: string; form: string; habit: string; folk: string }>;
  /** World radius (m) inside which a sighting/hearing can register. */
  range: number;
}>;

export type AtlasPage = Readonly<{
  id: string;
  region: AtlasRegion;
  stage: DiscoveryStage;
  name: string;
  lines: readonly string[];
}>;

export function createAtlasSpeciesRegistry(copyTable: Readonly<Record<string, string>> = {}) {
  const entries = new Map<string, AtlasSpeciesEntry>();
  const stages = new Map<string, DiscoveryStage>();

  function register(entry: AtlasSpeciesEntry): boolean {
    if (entries.has(entry.id)) return false;
    entries.set(entry.id, entry);
    stages.set(entry.id, 'unknown');
    return true;
  }

  /** A hearing can only raise unknown -> heard; a sighting raises any stage to seen. */
  function record(id: string, kind: 'heard' | 'seen'): DiscoveryStage | undefined {
    const stage = stages.get(id);
    if (stage === undefined) return undefined;
    const next = kind === 'seen' ? 'seen' : stage === 'unknown' ? 'heard' : stage;
    stages.set(id, next);
    return next;
  }

  function page(id: string): AtlasPage | undefined {
    const entry = entries.get(id);
    if (!entry) return undefined;
    const stage = stages.get(id)!;
    const resolve = (key: string) => copyTable[key] ?? '';
    return {
      id, region: entry.region, stage,
      // An unseen species shows no name — the page is a silhouette until first sight.
      name: stage === 'seen' ? resolve(entry.copy.name) : '',
      lines: stage === 'unknown' ? [] : [resolve(entry.copy.form), resolve(entry.copy.habit), resolve(entry.copy.folk)],
    };
  }

  function pages(region?: AtlasRegion): AtlasPage[] {
    return [...entries.values()]
      .filter(entry => region === undefined || entry.region === region)
      .map(entry => page(entry.id)!);
  }

  /** A plain tally for the atlas cover — a count of records kept, never a score. */
  function tally(): { heard: number; seen: number; total: number } {
    let heard = 0, seen = 0;
    for (const stage of stages.values()) {
      if (stage === 'heard') heard++;
      if (stage === 'seen') seen++;
    }
    return { heard, seen, total: entries.size };
  }

  return { register, record, page, pages, tally };
}
