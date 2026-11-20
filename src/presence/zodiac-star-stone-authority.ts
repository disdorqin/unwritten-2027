import {
  createZodiacStarStones, readStarStoneLocation, zodiacStarStoneIds,
  type ScatteredStarStoneId, type StarStoneLocation, type ZodiacStarStoneId, type ZodiacStarStoneStore,
} from '../shared/zodiac-star-stones.js';

export type ZodiacStarStonePoint = Readonly<{ area: string; east: number; north: number; height: number }>;
export type ZodiacStarStoneView = {
  id: ZodiacStarStoneId;
  revision: number;
  phase: 'origin' | 'held' | 'dropped' | 'ring';
  origin?: ZodiacStarStonePoint;
  dropPosition?: ZodiacStarStonePoint;
  pickupLockedUntilMs?: number;
};
export type ZodiacStarStoneProgress = {
  ringCount: number;
  goatRevealed: boolean;
  firstKeyLit: boolean;
  stones: ZodiacStarStoneView[];
};

export type ZodiacStarStoneHost = {
  /** Unix epoch milliseconds from the host, to recover deadlines across restarts. */
  nowMs(): number;
  origin(id: ScatteredStarStoneId): StarStoneLocation | undefined;
  playerPosition(player: number): StarStoneLocation | undefined;
  canPickup(player: number, from: StarStoneLocation, at: StarStoneLocation): boolean;
  canDeposit(player: number, from: StarStoneLocation): boolean;
  xiaoweiScene(): {
    atRingPassage: boolean;
    atNewYearsEveWitness: boolean;
    bellHandoffConfirmed: boolean;
  };
};

function publicPoint({ layer, ...point }: StarStoneLocation): ZodiacStarStonePoint {
  return { area: layer, ...point };
}

const positionCheckpointMs = 1_000;

/** One instance per town. Pass an authenticated host player handle unique to that live connection. */
export function createZodiacStarStoneAuthority(host: ZodiacStarStoneHost, store: ZodiacStarStoneStore) {
  const origins: Partial<Record<ScatteredStarStoneId, StarStoneLocation>> = {};
  for (const id of zodiacStarStoneIds) {
    if (id === 'goat') continue;
    const point = host.origin(id);
    if (point) origins[id] = point;
  }
  let lastCheckpointAt = host.nowMs();
  const stones = createZodiacStarStones({ origins, store, restartAt: lastCheckpointAt });
  const pendingPositions = new Map<number, StarStoneLocation>();

  return {
    pickup(player: number, id: ZodiacStarStoneId, revision: number) {
      if (id === 'goat' || !stones.origin(id)) return false;
      const now = host.nowMs();
      const stone = stones.snapshot(now).find(item => item.id === id && item.revision === revision);
      if (!stone || (stone.phase !== 'origin' && stone.phase !== 'dropped')) return false;
      const from = readStarStoneLocation(host.playerPosition(player));
      if (!from || from.layer !== stone.point.layer || host.canPickup(player, from, stone.point) !== true) return false;
      if (!stones.pickup(id, revision, player, now, from)) return false;
      pendingPositions.set(player, from);
      return true;
    },

    deposit(player: number, id: ZodiacStarStoneId, revision: number) {
      const from = readStarStoneLocation(host.playerPosition(player));
      if (!from || host.canDeposit(player, from) !== true || !stones.inlay(id, revision, player)) return;
      if (stones.hasHeld(player)) pendingPositions.set(player, from);
      else pendingPositions.delete(player);
      return { ringCount: stones.ringProgress().installed.length, completedNow: false };
    },

    /** Invoke after accepted movement. The live position is buffered until the town's next checkpoint. */
    trackCarrier(player: number) {
      if (!stones.hasHeld(player)) return;
      const from = readStarStoneLocation(host.playerPosition(player));
      if (from) pendingPositions.set(player, from);
    },

    /** Invoke on exit, disconnect or death. Use the host's accepted pre-respawn point if already moved. */
    releaseCarrier(player: number, lastPosition?: StarStoneLocation) {
      const from = readStarStoneLocation(lastPosition) ?? readStarStoneLocation(host.playerPosition(player)) ??
        pendingPositions.get(player);
      const dropped = stones.dropHeld(player, from, host.nowMs());
      pendingPositions.delete(player);
      return dropped;
    },

    /** Notify only from the hosted Xiaowei ring passage. True is the persisted reveal edge. */
    recordXiaoweiResonance() {
      return stones.recordXiaoweiResonance(host.xiaoweiScene().atRingPassage);
    },

    /** Notify only from the hosted bell handoff. Completion is the single story and first-key edge. */
    inlayGoatAtFinale() {
      const { atNewYearsEveWitness, bellHandoffConfirmed } = host.xiaoweiScene();
      if (!stones.inlayGoatAtFinale(atNewYearsEveWitness, bellHandoffConfirmed)) return;
      return { ringCount: stones.ringProgress().installed.length, completedNow: true };
    },

    tick() {
      const now = host.nowMs();
      if (pendingPositions.size > 0 && Number.isSafeInteger(now) && now - lastCheckpointAt >= positionCheckpointMs) {
        stones.checkpointHeldPositions(pendingPositions, now);
        lastCheckpointAt = now;
        pendingPositions.clear();
      } else {
        stones.tick(now);
      }
    },

    carriedBy(player: number) {
      return stones.snapshot(host.nowMs()).flatMap(stone => stone.phase === 'carried' && stone.player === player
        ? [{ id: stone.id, revision: stone.revision }] : []);
    },

    /** A host-supplied authorized area receives only its own seat and drop positions. */
    snapshot(viewerArea?: string): ZodiacStarStoneProgress {
      const current = stones.snapshot(host.nowMs());
      const view: ZodiacStarStoneView[] = [];
      for (const stone of current) {
        const { id, revision, phase } = stone;
        if (phase === 'unplaced' || phase === 'sealed') continue;
        const item: ZodiacStarStoneView = {
          id, revision, phase: phase === 'carried' ? 'held' : phase === 'in-ring' ? 'ring' : phase,
        };
        const origin = id === 'goat' ? undefined : stones.origin(id);
        if (origin && origin.layer === viewerArea) item.origin = publicPoint(origin);
        if (origin && phase === 'dropped' && stone.point.layer === viewerArea) {
          item.dropPosition = publicPoint(stone.point);
          item.pickupLockedUntilMs = stone.pickableAt;
        }
        if (item.origin || item.dropPosition || item.phase === 'ring') view.push(item);
      }
      const { installed, total } = stones.ringProgress();
      return { ringCount: installed.length, goatRevealed: stones.goatRevealed(), firstKeyLit: installed.length === total, stones: view };
    },
  };
}
