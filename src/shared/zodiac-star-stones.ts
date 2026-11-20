import { iceTreasurePickupDelayMs } from './ice-treasure.js';

export const zodiacStarStoneIds = [
  'mouse', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig',
] as const;
export const zodiacStarStoneReturnMs = 10 * 60_000;

export type ZodiacStarStoneId = typeof zodiacStarStoneIds[number];
export type ScatteredStarStoneId = Exclude<ZodiacStarStoneId, 'goat'>;
export type StarStoneLocation = Readonly<{ layer: string; east: number; north: number; height: number }>;

type StonePhase =
  | { phase: 'unplaced' }
  | { phase: 'sealed' }
  | { phase: 'origin'; point: StarStoneLocation }
  | { phase: 'carried'; player: number }
  | { phase: 'dropped'; point: StarStoneLocation; pickableAt: number; returnsAt: number }
  | { phase: 'in-ring' };
type StoneState = StonePhase & { id: ZodiacStarStoneId; revision: number };

type StarStoneSetup = {
  origins: Readonly<Partial<Record<ScatteredStarStoneId, StarStoneLocation>>>;
  installed?: readonly ZodiacStarStoneId[];
};

function validLocation(point: StarStoneLocation) {
  return Boolean(point.layer) && [point.east, point.north, point.height].every(Number.isFinite);
}

/** Run one instance on the town authority. The host confirms reach and persists installed stones. */
export function createZodiacStarStones({ origins, installed = [] }: StarStoneSetup) {
  const inRing = new Set(zodiacStarStoneIds.filter(id => installed.includes(id)));
  if (inRing.has('goat') && inRing.size !== zodiacStarStoneIds.length) {
    throw new Error('The installed goat stone requires the other eleven installed stones');
  }
  const home = new Map<ZodiacStarStoneId, StarStoneLocation>();
  const stones = new Map<ZodiacStarStoneId, StoneState>();
  for (const id of zodiacStarStoneIds) {
    const point = id === 'goat' ? undefined : origins[id];
    if (point) {
      if (!validLocation(point)) throw new TypeError('Invalid star stone origin: ' + id);
      home.set(id, { ...point });
    }
    const origin = home.get(id);
    const phase: StonePhase = inRing.has(id) ? { phase: 'in-ring' } : id === 'goat' ? { phase: 'sealed' }
      : origin ? { phase: 'origin', point: origin } : { phase: 'unplaced' };
    stones.set(id, { id, revision: 0, ...phase });
  }

  function set(previous: StoneState, phase: StonePhase) {
    stones.set(previous.id, { id: previous.id, revision: previous.revision + 1, ...phase });
  }

  function tick(now: number) {
    if (!Number.isFinite(now)) return;
    for (const stone of stones.values()) {
      if (stone.phase !== 'dropped' || now < stone.returnsAt) continue;
      const point = home.get(stone.id);
      if (point) set(stone, { phase: 'origin', point });
    }
  }

  return {
    tick,
    /** Pass the revision of the pickup surface whose proximity was checked by the host. */
    pickup(id: ZodiacStarStoneId, revision: number, player: number, now: number) {
      if (!Number.isFinite(now) || !Number.isSafeInteger(player) || player < 1) return false;
      tick(now);
      const stone = stones.get(id);
      if (!stone || stone.revision !== revision || (stone.phase !== 'origin' &&
          (stone.phase !== 'dropped' || now < stone.pickableAt))) return false;
      set(stone, { phase: 'carried', player });
      return true;
    },
    /** Death, exit and disconnect all use the host's last accepted position for that player. */
    dropHeld(player: number, point: StarStoneLocation, now: number) {
      const dropped: ZodiacStarStoneId[] = [];
      if (!Number.isFinite(now) || !validLocation(point)) return dropped;
      for (const stone of stones.values()) {
        if (stone.phase !== 'carried' || stone.player !== player) continue;
        set(stone, { phase: 'dropped', point: { ...point },
          pickableAt: now + iceTreasurePickupDelayMs, returnsAt: now + zodiacStarStoneReturnMs });
        dropped.push(stone.id);
      }
      return dropped;
    },
    /** The host confirms this carrier's current reach to the ring before inlaying. */
    inlay(id: ZodiacStarStoneId, revision: number, player: number) {
      const stone = stones.get(id);
      if (stone?.phase !== 'carried' || stone.revision !== revision || stone.player !== player) return false;
      set(stone, { phase: 'in-ring' });
      inRing.add(id);
      return true;
    },
    /** Call only for the approved finale with Xiao Wei present and the bell handoff confirmed. */
    inlayGoatAtFinale() {
      const stone = stones.get('goat');
      if (stone?.phase !== 'sealed' || inRing.size !== zodiacStarStoneIds.length - 1) return false;
      set(stone, { phase: 'in-ring' });
      inRing.add('goat');
      return true;
    },
    ringProgress() {
      return { installed: zodiacStarStoneIds.filter(id => inRing.has(id)), total: zodiacStarStoneIds.length };
    },
    /** Private authority snapshot. Public clients only receive the ring projection. */
    snapshot(now: number) {
      tick(now);
      return Array.from(stones.values(), (stone): StoneState => 'point' in stone
        ? { ...stone, point: { ...stone.point } } : { ...stone });
    },
  };
}
