export const publicExhibitWeekMs = 7 * 24 * 60 * 60 * 1000;

export const publicExhibitSlots = [
  { id: 'plaza-rack-1', site: 'plaza' },
  { id: 'plaza-rack-2', site: 'plaza' },
  { id: 'plaza-rack-3', site: 'plaza' },
  { id: 'plaza-rack-4', site: 'plaza' },
  { id: 'market-honor-stall', site: 'market' },
  { id: 'clocktower-window-1', site: 'clocktower' },
  { id: 'clocktower-window-2', site: 'clocktower' },
  { id: 'starport-lookout', site: 'starport' },
] as const;

const kinds = ['golden-goat-figurine', 'mineral-specimen', 'roasted-fish-specimen', 'photo-frame'] as const;
type ExhibitKind = (typeof kinds)[number];
type ExhibitSlot = (typeof publicExhibitSlots)[number]['id'];
type OwnedExhibit = Readonly<{ ownerId: string; kind: ExhibitKind; motif: 'none' }>;
type Exhibit = OwnedExhibit & { itemId: string };
type Placement = Exhibit & { slotId: ExhibitSlot; termStartsAt: number; termEndsAt: number };
type HomeReturn = { itemId: string; ownerId: string };
type Result =
  | { status: 'open' }
  | { status: 'cutoff-tie'; itemIds: string[]; places: number }
  | { status: 'settled'; placements: Placement[]; returnedHome: HomeReturn[] };

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// The inventory adapter supplies system records. Ballots and nominations only send item IDs.
function readSystemItem(item: unknown): OwnedExhibit | undefined {
  if (!item || typeof item !== 'object') return;
  if (Reflect.ownKeys(item).length !== 3 ||
      !Object.hasOwn(item, 'ownerId') || !Object.hasOwn(item, 'kind') || !Object.hasOwn(item, 'motif')) return;
  const { ownerId, kind, motif } = item as Partial<OwnedExhibit>;
  if (!isId(ownerId) || motif !== 'none' || !kind || !kinds.includes(kind)) return;
  return { ownerId, kind, motif };
}

export function createPublicExhibits(options: {
  firstWeekStartsAt: number;
  now(): number;
  readInventoryItem(itemId: string): unknown;
}) {
  const { firstWeekStartsAt, now, readInventoryItem } = options;
  if (!Number.isSafeInteger(firstWeekStartsAt) || firstWeekStartsAt < 0 ||
      !Number.isSafeInteger(firstWeekStartsAt + 2 * publicExhibitWeekMs)) {
    throw new RangeError('Invalid exhibit week start');
  }
  let startsAt = firstWeekStartsAt;
  let placements: Placement[] = [];
  const nominations = new Map<string, Exhibit>();
  const voters = new Set<string>();
  const totals = new Map<string, number>();

  function open(at: number) {
    return Number.isSafeInteger(at) && at >= startsAt && at < startsAt + publicExhibitWeekMs;
  }

  function lookup(itemId: string) {
    return readSystemItem(readInventoryItem(itemId));
  }

  function matches(exhibit: Exhibit) {
    const owned = lookup(exhibit.itemId);
    return owned?.ownerId === exhibit.ownerId && owned.kind === exhibit.kind;
  }

  function publicPlacements(at: number) {
    return placements.filter(placement =>
      at >= placement.termStartsAt && at < placement.termEndsAt && matches(placement))
      .map(placement => ({ ...placement }));
  }

  return {
    nominate(ownerId: string, itemId: string) {
      if (!open(now()) || !isId(itemId) || nominations.has(itemId)) return false;
      const owned = lookup(itemId);
      if (!owned || owned.ownerId !== ownerId) return false;
      nominations.set(itemId, { itemId, ...owned });
      return true;
    },

    vote(voterId: string, itemId: string) {
      if (!open(now()) || !isId(voterId) || voters.has(voterId)) return false;
      const exhibit = nominations.get(itemId);
      if (!exhibit || !matches(exhibit)) return false;
      voters.add(voterId);
      totals.set(itemId, (totals.get(itemId) ?? 0) + 1);
      return true;
    },

    placements: () => publicPlacements(now()),

    location(itemId: string) {
      const exhibit = publicPlacements(now()).find(entry => entry.itemId === itemId);
      if (exhibit) return { type: 'public' as const, ...exhibit };
      const owned = lookup(itemId);
      return owned ? { type: 'home' as const, ownerId: owned.ownerId } : undefined;
    },

    settle(approvedCutoffSelection?: readonly string[]): Result {
      const at = now();
      const closesAt = startsAt + publicExhibitWeekMs;
      if (!Number.isSafeInteger(at) || at < closesAt) return { status: 'open' };

      const score = (exhibit: Exhibit) => totals.get(exhibit.itemId) ?? 0;
      // An unprocessed election cannot extend its exhibit term into a later week.
      const eligible = at < closesAt + publicExhibitWeekMs
        ? [...nominations.values()].filter(exhibit => score(exhibit) > 0 && matches(exhibit))
          .sort((a, b) => score(b) - score(a))
        : [];
      const capacity = publicExhibitSlots.length;
      const cutoff = eligible[capacity - 1];
      let winners = eligible.slice(0, capacity);
      if (cutoff && eligible.length > capacity && score(eligible[capacity]) === score(cutoff)) {
        const guaranteed = eligible.filter(exhibit => score(exhibit) > score(cutoff));
        const ties = eligible.filter(exhibit => score(exhibit) === score(cutoff));
        const needed = capacity - guaranteed.length;
        const selected = new Set(approvedCutoffSelection);
        const approved = ties.filter(exhibit => selected.has(exhibit.itemId));
        if (selected.size !== needed || approved.length !== needed || approvedCutoffSelection?.length !== needed) {
          return { status: 'cutoff-tie', itemIds: ties.map(exhibit => exhibit.itemId), places: needed };
        }
        winners = [...guaranteed, ...approved];
      }

      const winningIds = new Set(winners.map(exhibit => exhibit.itemId));
      const returnedHome: HomeReturn[] = [];
      const previousIds = new Set([...placements.map(exhibit => exhibit.itemId), ...nominations.keys()]);
      for (const itemId of previousIds) {
        if (winningIds.has(itemId)) continue;
        const owned = lookup(itemId);
        if (owned) returnedHome.push({ itemId, ownerId: owned.ownerId });
      }
      placements = winners.map((exhibit, index) => ({
        ...exhibit,
        slotId: publicExhibitSlots[index].id,
        termStartsAt: closesAt,
        termEndsAt: closesAt + publicExhibitWeekMs,
      }));
      startsAt = firstWeekStartsAt + Math.floor((at - firstWeekStartsAt) / publicExhibitWeekMs) * publicExhibitWeekMs;
      nominations.clear();
      voters.clear();
      totals.clear();
      return { status: 'settled', placements: placements.map(placement => ({ ...placement })), returnedHome };
    },
  };
}
