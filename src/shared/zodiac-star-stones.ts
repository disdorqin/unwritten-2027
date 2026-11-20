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
  | { phase: 'carried'; player: number; lastPosition?: StarStoneLocation }
  | { phase: 'dropped'; point: StarStoneLocation; pickableAt: number; returnsAt: number }
  | { phase: 'in-ring' };
export type StoneState = StonePhase & { id: ZodiacStarStoneId; revision: number };

export type ZodiacStarStoneSave = {
  version: 1;
  now: number;
  goatRevealed: boolean;
  stones: readonly StoneState[];
};

/** One synchronous writer per town. Save atomically replaces the previous snapshot. */
export type ZodiacStarStoneStore = {
  load(): unknown;
  save(snapshot: ZodiacStarStoneSave): undefined;
};

type StarStoneSetup = {
  origins: Readonly<Partial<Record<ScatteredStarStoneId, StarStoneLocation>>>;
  installed?: readonly ZodiacStarStoneId[];
  store?: ZodiacStarStoneStore;
  restartAt?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPlayer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

export function readStarStoneLocation(value: unknown): StarStoneLocation | undefined {
  if (!isRecord(value)) return;
  const { layer, east, north, height } = value;
  if (typeof layer !== 'string' || !layer || typeof east !== 'number' || !Number.isFinite(east) ||
      typeof north !== 'number' || !Number.isFinite(north) || typeof height !== 'number' ||
      !Number.isFinite(height)) return;
  return { layer, east, north, height };
}

function readSave(value: unknown) {
  if (!isRecord(value) || value.version !== 1 || !isTime(value.now) || typeof value.goatRevealed !== 'boolean' ||
      !Array.isArray(value.stones) || value.stones.length !== zodiacStarStoneIds.length) {
    throw new Error('Invalid zodiac star-stone save');
  }
  const stones = new Map<ZodiacStarStoneId, StoneState>();
  for (const raw of value.stones as unknown[]) {
    if (!isRecord(raw)) throw new Error('Invalid zodiac star-stone entry');
    const id = zodiacStarStoneIds.find(key => key === raw.id);
    if (!id || stones.has(id) || !isTime(raw.revision)) throw new Error('Invalid zodiac star-stone entry');
    const { revision, phase } = raw;
    if (id === 'goat' && phase !== 'sealed' && phase !== 'in-ring') throw new Error('Invalid goat stone entry');
    if (id !== 'goat' && phase === 'sealed') throw new Error('Invalid zodiac star-stone entry');
    if (phase === 'sealed' || phase === 'unplaced' || phase === 'in-ring') {
      stones.set(id, { id, revision, phase });
      continue;
    }
    if (phase === 'origin') {
      const point = readStarStoneLocation(raw.point);
      if (point) { stones.set(id, { id, revision, phase, point }); continue; }
    }
    if (phase === 'carried' && isPlayer(raw.player)) {
      const lastPosition = readStarStoneLocation(raw.lastPosition);
      if (lastPosition) { stones.set(id, { id, revision, phase, player: raw.player, lastPosition }); continue; }
    }
    if (phase === 'dropped' && isTime(raw.pickableAt) && isTime(raw.returnsAt) &&
        raw.returnsAt - raw.pickableAt === zodiacStarStoneReturnMs - iceTreasurePickupDelayMs &&
        raw.pickableAt >= iceTreasurePickupDelayMs && raw.pickableAt - iceTreasurePickupDelayMs <= value.now) {
      const point = readStarStoneLocation(raw.point);
      if (point) {
        stones.set(id, { id, revision, phase, point, pickableAt: raw.pickableAt, returnsAt: raw.returnsAt });
        continue;
      }
    }
    throw new Error('Invalid zodiac star-stone entry');
  }
  const firstElevenInstalled = zodiacStarStoneIds.every(id => id === 'goat' || stones.get(id)?.phase === 'in-ring');
  if ((value.goatRevealed && !firstElevenInstalled) || (!value.goatRevealed && stones.get('goat')?.phase === 'in-ring')) {
    throw new Error('Invalid zodiac star-stone reveal');
  }
  return { now: value.now, goatRevealed: value.goatRevealed, stones };
}

/** Run one instance on the town authority. The host confirms reach and persists installed stones. */
export function createZodiacStarStones({ origins, installed = [], store, restartAt = 0 }: StarStoneSetup) {
  const inRing = new Set(zodiacStarStoneIds.filter(id => installed.includes(id)));
  if (inRing.has('goat') && inRing.size !== zodiacStarStoneIds.length) {
    throw new Error('The installed goat stone requires the other eleven installed stones');
  }
  const home = new Map<ZodiacStarStoneId, StarStoneLocation>();
  let stones = new Map<ZodiacStarStoneId, StoneState>();
  let goatRevealed = inRing.has('goat');
  let currentTime = 0;
  for (const id of zodiacStarStoneIds) {
    const configured = id === 'goat' ? undefined : origins[id];
    const origin = readStarStoneLocation(configured);
    if (configured !== undefined && !origin) throw new TypeError('Invalid star stone origin: ' + id);
    if (origin) home.set(id, origin);
    const phase: StonePhase = inRing.has(id) ? { phase: 'in-ring' } : id === 'goat' ? { phase: 'sealed' }
      : origin ? { phase: 'origin', point: origin } : { phase: 'unplaced' };
    stones.set(id, { id, revision: 0, ...phase });
  }

  const installedIds = () => zodiacStarStoneIds.filter(id => stones.get(id)?.phase === 'in-ring');

  function copy(stone: StoneState): StoneState {
    if ('point' in stone) return { ...stone, point: { ...stone.point } };
    if (stone.phase === 'carried' && stone.lastPosition) return { ...stone, lastPosition: { ...stone.lastPosition } };
    return { ...stone };
  }

  let changing = false;
  function change<T>(apply: () => T): T {
    if (changing) throw new Error('Reentrant zodiac star-stone write');
    changing = true;
    const previous = stones;
    const wasRevealed = goatRevealed;
    const previousTime = currentTime;
    stones = new Map(previous);
    try {
      const result = apply();
      if (store && (goatRevealed !== wasRevealed || zodiacStarStoneIds.some(id => previous.get(id) !== stones.get(id)))) {
        store.save({ version: 1, now: currentTime, goatRevealed, stones: Array.from(stones.values(), copy) });
      }
      return result;
    } catch (error) {
      stones = previous;
      goatRevealed = wasRevealed;
      currentTime = previousTime;
      throw error;
    } finally {
      changing = false;
    }
  }

  function set(previous: StoneState, phase: StonePhase) {
    stones.set(previous.id, { id: previous.id, revision: previous.revision + 1, ...phase });
  }

  function tick(now: number) {
    currentTime = Math.max(currentTime, now);
    for (const stone of stones.values()) {
      if (stone.phase !== 'dropped' || currentTime < stone.returnsAt) continue;
      const point = home.get(stone.id);
      set(stone, point ? { phase: 'origin', point } : { phase: 'unplaced' });
    }
  }

  function drop(stone: StoneState, point: StarStoneLocation) {
    set(stone, { phase: 'dropped', point,
      pickableAt: currentTime + iceTreasurePickupDelayMs, returnsAt: currentTime + zodiacStarStoneReturnMs });
  }

  const saved = store?.load();
  if (saved !== undefined) {
    if (!isTime(restartAt)) throw new Error('Invalid zodiac star-stone clock');
    const restored = readSave(saved);
    currentTime = restored.now;
    goatRevealed = restored.goatRevealed;
    stones = restored.stones;
    change(() => {
      tick(restartAt);
      for (const stone of stones.values()) {
        if (stone.phase === 'carried' && stone.lastPosition) drop(stone, stone.lastPosition);
        if (stone.phase === 'origin' || stone.phase === 'unplaced') {
          const point = home.get(stone.id);
          if (point && (stone.phase !== 'origin' || !sameLocation(point, stone.point))) set(stone, { phase: 'origin', point });
          if (!point && stone.phase === 'origin') set(stone, { phase: 'unplaced' });
        }
      }
    });
  }

  return {
    tick(now: number) { if (isTime(now)) change(() => tick(now)); },
    /** Pass the revision of the pickup surface whose proximity was checked by the host. */
    pickup(id: ZodiacStarStoneId, revision: number, player: number, now: number, acceptedPosition?: StarStoneLocation) {
      const lastPosition = readStarStoneLocation(acceptedPosition);
      if (!isTime(now) || !isPlayer(player) || (store && !lastPosition)) return false;
      return change(() => {
        tick(now);
        const stone = stones.get(id);
        if (!home.has(id) || !stone || stone.revision !== revision || (stone.phase !== 'origin' &&
            (stone.phase !== 'dropped' || currentTime < stone.pickableAt))) return false;
        set(stone, lastPosition ? { phase: 'carried', player, lastPosition } : { phase: 'carried', player });
        return true;
      });
    },
    checkpointHeldPositions(positions: ReadonlyMap<number, StarStoneLocation>, now: number) {
      if (!isTime(now)) return;
      change(() => {
        tick(now);
        for (const stone of stones.values()) {
          if (stone.phase !== 'carried') continue;
          const lastPosition = readStarStoneLocation(positions.get(stone.player));
          if (lastPosition && (!stone.lastPosition || !sameLocation(stone.lastPosition, lastPosition))) {
            // Movement does not invalidate the carried item's inlay receipt.
            stones.set(stone.id, { ...stone, lastPosition });
          }
        }
      });
    },
    hasHeld(player: number) {
      for (const stone of stones.values()) if (stone.phase === 'carried' && stone.player === player) return true;
      return false;
    },
    /** Death, exit and disconnect all use the host's last accepted position for that player. */
    dropHeld(player: number, point: StarStoneLocation | undefined, now: number) {
      if (!isTime(now) || !isPlayer(player)) return [];
      const acceptedPosition = readStarStoneLocation(point);
      return change(() => {
        tick(now);
        const dropped: ZodiacStarStoneId[] = [];
        for (const stone of stones.values()) {
          if (stone.phase !== 'carried' || stone.player !== player) continue;
          const lastPosition = acceptedPosition ?? stone.lastPosition;
          if (!lastPosition) continue;
          drop(stone, lastPosition);
          dropped.push(stone.id);
        }
        return dropped;
      });
    },
    /** The host confirms this carrier's current reach to the ring before inlaying. */
    inlay(id: ZodiacStarStoneId, revision: number, player: number) {
      return change(() => {
        const stone = stones.get(id);
        if (stone?.phase !== 'carried' || stone.revision !== revision || stone.player !== player) return false;
        set(stone, { phase: 'in-ring' });
        return true;
      });
    },
    recordXiaoweiResonance(atRingPassage: boolean) {
      return change(() => {
        if (atRingPassage !== true || goatRevealed || installedIds().length !== zodiacStarStoneIds.length - 1) return false;
        goatRevealed = true;
        return true;
      });
    },
    /** The hosted finale confirms both Xiao Wei's witness position and the bell handoff. */
    inlayGoatAtFinale(atWitness?: boolean, bellHandoffConfirmed?: boolean) {
      return change(() => {
        const stone = stones.get('goat');
        if (!goatRevealed || atWitness !== true || bellHandoffConfirmed !== true || stone?.phase !== 'sealed') return false;
        set(stone, { phase: 'in-ring' });
        return true;
      });
    },
    goatRevealed() { return goatRevealed; },
    origin(id: ScatteredStarStoneId) {
      const point = home.get(id);
      return point && { ...point };
    },
    ringProgress() {
      return { installed: installedIds(), total: zodiacStarStoneIds.length };
    },
    /** Private authority snapshot. Public clients only receive the ring projection. */
    snapshot(now: number) {
      if (isTime(now)) change(() => tick(now));
      return zodiacStarStoneIds.map(id => copy(stones.get(id)!));
    },
  };
}

function sameLocation(a: StarStoneLocation, b: StarStoneLocation) {
  return a.layer === b.layer && a.east === b.east && a.north === b.north && a.height === b.height;
}
