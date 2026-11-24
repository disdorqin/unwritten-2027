/**
 * Crater play points — the rules face of the six point cards
 * （设计-坑区玩法点位详卡-2026-11-22, batch 83; branch window B).
 * Scenes, hosts and the descent chain belong to C/A; the daytime
 * workshop leaf (town-crater-surface-play) is separate and does not
 * overlap: this leaf judges the winch, the towers, the debris ring,
 * the registration desk, the mound and the night ember round.
 * Everything here is solo-completable; a second pair of hands only
 * ever speeds the winch, never gates it.
 */

// ------------------------------------------------------------------
// Point 1 · The winch face （绞盘作业面） — push the bar around.
// Progress only ever rises; letting go holds it. A first opening
// takes a turn and a half; a well that knows you takes half a turn.
// Two pushers move at 1.8x, per the standing co-op ruling.
// ------------------------------------------------------------------

export const winchFirstTurns = 1.5;
export const winchRepeatTurns = 0.5;
export const winchDuoFactor = 1.8;

export function createWinch(openedBefore: boolean) {
  const needed = openedBefore ? winchRepeatTurns : winchFirstTurns;
  let turns = 0;
  return {
    /** Advance by walked turns (signed by direction); returns total progress 0..1. */
    push(deltaTurns: number, pushers: 1 | 2): number {
      if (deltaTurns > 0) turns = Math.min(needed, turns + deltaTurns * (pushers === 2 ? winchDuoFactor : 1));
      return turns / needed;
    },
    get progress() { return turns / needed; },
    get open() { return turns >= needed; },
  };
}

// ------------------------------------------------------------------
// Point 2 · Defence towers （防御塔登临） — climb, look, rub.
// One snowball presses the paper; the three towers carry three
// different marks; all three unlock the atlas page.
// ------------------------------------------------------------------

export const towerIds = ['tower-1', 'tower-2', 'tower-3'] as const;
export type TowerId = (typeof towerIds)[number];
export const towerRubbingSnowCost = 1;

export function createTowerRound() {
  const rubbed = new Set<TowerId>();
  let lookoutSeen = false;
  return {
    /** Standing on any tower top registers the lookout entry once. */
    reachTop(_tower: TowerId): { lookoutFirstTime: boolean } {
      const first = !lookoutSeen;
      lookoutSeen = true;
      return { lookoutFirstTime: first };
    },
    /** Rub one tower's mark; the scene layer charges the snow cost on success. */
    rub(tower: TowerId): { ok: boolean; snowCost: number; atlasPageComplete: boolean } {
      if (rubbed.has(tower)) return { ok: false, snowCost: 0, atlasPageComplete: false };
      rubbed.add(tower);
      return { ok: true, snowCost: towerRubbingSnowCost, atlasPageComplete: rubbed.size === towerIds.length };
    },
    get rubbedCount() { return rubbed.size; },
  };
}

// ------------------------------------------------------------------
// Point 3 · The debris ring （残骸环拾荒） — dwell to identify.
// Two seconds of close looking identifies a piece; the five ship
// pieces complete the atlas group. Ordinary pieces take two pick
// hits (they are surface pieces, not mine faces) and may shed a
// stardust fragment.
// ------------------------------------------------------------------

export const debrisIdentifyMs = 2_000;
export const debrisHitsToBreak = 2;
export const debrisShipPieceCount = 5;

export function createDebrisRing(shipPieceIds: readonly string[], random: () => number) {
  const ship = new Set(shipPieceIds);
  const identified = new Set<string>();
  const hits = new Map<string, number>();
  return {
    /** Feed dwell time on one piece; returns true the moment it is identified. */
    dwell(pieceId: string, ms: number): boolean {
      if (identified.has(pieceId)) return false;
      const total = (hits.get(`dwell:${pieceId}`) ?? 0) + Math.max(0, ms);
      hits.set(`dwell:${pieceId}`, total);
      if (total < debrisIdentifyMs) return false;
      identified.add(pieceId);
      return true;
    },
    isShipPiece(pieceId: string) { return ship.has(pieceId); },
    get shipIdentified() { return [...identified].filter((id) => ship.has(id)).length; },
    get atlasGroupComplete() { return this.shipIdentified >= Math.min(debrisShipPieceCount, ship.size); },
    /** Knock an ordinary piece; ship pieces are look-only and never break. */
    knock(pieceId: string): { broke: boolean; stardustFragment: boolean } {
      if (ship.has(pieceId)) return { broke: false, stardustFragment: false };
      const n = (hits.get(pieceId) ?? 0) + 1;
      hits.set(pieceId, n);
      if (n < debrisHitsToBreak) return { broke: false, stardustFragment: false };
      return { broke: true, stardustFragment: random() < 0.15 };
    },
  };
}

// ------------------------------------------------------------------
// Point 4 · The registration desk （集结地登记桌） — sign before
// the lamp. This face keeps NO book of its own: since batch 96 the
// single lamp authority is the presence lamp ledger, and this desk
// is a judgment face over one player's record in it (the ledger is
// injected structurally; the production host is lamp-desk-host).
// No registration, no lamp; returning settles by cancelling the
// record; death marks the lamp lost on the same record and the
// camp re-issues — the ledger's words, not a second book's.
// ------------------------------------------------------------------

export type DeskLampBook = Readonly<{
  register(playerId: string): boolean;
  issue(playerId: string): boolean;
  returnLamp(playerId: string): boolean;
  onDeath(playerId: string): boolean;
  reissueAtCamp(playerId: string): boolean;
  record(playerId: string): Readonly<{ stage: 'registered' | 'holding' | 'placed' | 'lost' }> | undefined;
}>;

export type DeskState = 'unregistered' | 'registered' | 'lamp-out' | 'lost';

export function createRegistrationDesk(book: DeskLampBook, playerId: string) {
  const stage = () => book.record(playerId)?.stage;
  return {
    get state(): DeskState {
      const s = stage();
      if (s === undefined) return 'unregistered';
      if (s === 'holding' || s === 'placed') return 'lamp-out';
      return s;
    },
    register(): boolean { return book.register(playerId); },
    /** The lamp house asks the desk before it hands anything over. */
    canDrawLamp(): boolean { return stage() === 'registered'; },
    drawLamp(): boolean { return book.issue(playerId); },
    returnToken(): { settled: boolean } { return { settled: book.returnLamp(playerId) }; },
    /** Death marks the lamp lost on the same record — never dropped, never a second book. */
    onDeath(): void { book.onDeath(playerId); },
    /** The camp re-issues a replacement against the lost report. */
    reissue(): boolean { return book.reissueAtCamp(playerId); },
  };
}

// ------------------------------------------------------------------
// Point 5 · The central mound （中央隆起登顶） — the old work flag.
// Straightening it is a one-time act that persists across sessions;
// the summit registers the atlas overlook entry.
// ------------------------------------------------------------------

export function createMound(restoredFlag: boolean) {
  let flagStraight = restoredFlag;
  let summitSeen = false;
  return {
    reachSummit(): { atlasFirstTime: boolean } {
      const first = !summitSeen;
      summitSeen = true;
      return { atlasFirstTime: first };
    },
    straightenFlag(): { changed: boolean; persist: boolean } {
      if (flagStraight) return { changed: false, persist: false };
      flagStraight = true;
      return { changed: true, persist: true };
    },
    get flagStraight() { return flagStraight; },
  };
}

// ------------------------------------------------------------------
// Point 6 · The ember night round （冶炼余烬夜巡） — three ember
// points along the warm-light chain, stoked in any order inside
// the night window; when all three are stoked the empty night
// train arrives to a warmer platform lamp. State resets per night.
// ------------------------------------------------------------------

export const emberPointIds = ['smelter-hearth', 'calibration-bench', 'station-lamp'] as const;
export type EmberPointId = (typeof emberPointIds)[number];

export function createEmberRound() {
  let nightKey: string | null = null;
  const stoked = new Set<EmberPointId>();
  return {
    /** Call with the current night's key (e.g. its beacon timestamp); a new key resets the round. */
    stoke(point: EmberPointId, currentNightKey: string): { ok: boolean; allStoked: boolean } {
      if (currentNightKey !== nightKey) { nightKey = currentNightKey; stoked.clear(); }
      if (stoked.has(point)) return { ok: false, allStoked: stoked.size === emberPointIds.length };
      stoked.add(point);
      return { ok: true, allStoked: stoked.size === emberPointIds.length };
    },
    get stokedCount() { return stoked.size; },
  };
}
