import {
  addUndergroundFireFuel, projectUndergroundFire, validFireProfile,
  type UndergroundFireCycle, type UndergroundFireProfile,
} from '../shared/underground-fire-cycle.js';
import type { UndergroundSurvivalPoint } from './underground-survival.js';

type Point = UndergroundSurvivalPoint;
export type ExpeditionCamp = Readonly<{
  id: string;
  at: Point;
  founderId: string;
  fire: UndergroundFireCycle;
}>;
export type ExpeditionCampSnapshot = Readonly<{
  revision: number;
  camps: readonly ExpeditionCamp[];
}>;
type ResourceReceipt = Readonly<{
  playerId: string; kind: 'build' | 'stoke'; wood: number; tinder: number;
}>;
type Options = Readonly<{
  now(): number;
  /** One server-authoritative and persistently allocated camp ID, not a client request ID. */
  allocateCampId(): string;
  readAcceptedFoot(playerId: string): (Point & { playerId: string }) | undefined;
  canReach(playerId: string, from: Point, to: Point): boolean;
  /** The live U-15 terrain and collision sweep certify the player's chosen site. */
  supportsFlatFirePoint(site: Point): boolean;
  isFreeGround(site: Point): boolean;
  /** True only when the G-11 material/wood inventory is enough for the requested transaction. */
  canSpend(playerId: string, change: ResourceReceipt): boolean;
  /** Persist camp snapshot and inventory debit atomically (throw = no state change). */
  save(snapshot: ExpeditionCampSnapshot, debit?: ResourceReceipt): void;
  initial?: ExpeditionCampSnapshot;
  fire: UndergroundFireProfile;
  buildFuel: number;
  stokeFuel: number;
  /** G-11 owns recipe counts; this module does not invent material prices. */
  buildWood: number;
  buildTinder: number;
  stokeWood: number;
  minimumSeparation: number;
  maximumCamps: number;
  maximumReach: number;
}>;

/** U-18 does not implement warmth, HP, safe spawns or U-13 fireAt; it supplies registered active fires. */
export function createUndergroundExpeditionCamps(options: Options) {
  const { fire } = options;
  if (!validFireProfile(fire) || ![options.buildFuel, options.stokeFuel,
      options.minimumSeparation, options.maximumReach].every(v => Number.isFinite(v) && v > 0) ||
      ![options.buildWood, options.buildTinder, options.stokeWood].every(v =>
        Number.isSafeInteger(v) && v >= 1) ||
      options.buildFuel > fire.maximumFuel || options.stokeFuel > fire.maximumFuel ||
      !Number.isSafeInteger(options.maximumCamps) || options.maximumCamps < 1 ||
      !Number.isFinite(options.now())) throw new RangeError('Invalid U-18 expedition fire profile');
  const original: ExpeditionCampSnapshot = options.initial
    ? structuredClone(options.initial) : { revision: 0, camps: [] };
  if (!Number.isSafeInteger(original.revision) || original.revision < 0 ||
      original.revision === Number.MAX_SAFE_INTEGER || original.camps.length > options.maximumCamps ||
      new Set(original.camps.map(c => c.id)).size !== original.camps.length ||
      original.camps.some(c => !c.id.trim() || !c.at.layer.trim() || !c.founderId.trim() ||
        ![c.at.east, c.at.north, c.at.height].every(Number.isFinite) ||
        !Number.isFinite(c.fire.atMs) || c.fire.atMs > options.now() ||
        !Number.isFinite(c.fire.fuel) || c.fire.fuel < 0 || c.fire.fuel > fire.maximumFuel)) {
    throw new RangeError('Invalid U-18 persisted camps');
  }
  let state: ExpeditionCampSnapshot = original;
  function time() {
    const at = options.now();
    if (!Number.isFinite(at) || at < 0) return;
    return at;
  }
  function foot(playerId: string, target: Point) {
    if (!playerId.trim() || !target.layer.trim() ||
        ![target.east, target.north, target.height].every(Number.isFinite)) return;
    const accepted = options.readAcceptedFoot(playerId);
    if (!accepted || accepted.playerId !== playerId || accepted.layer !== target.layer ||
        ![accepted.east, accepted.north, accepted.height].every(Number.isFinite)) return;
    const distance = Math.hypot(target.east - accepted.east, target.north - accepted.north,
      target.height - accepted.height);
    if (distance > options.maximumReach || !options.canReach(playerId, accepted, target)) return;
    return accepted;
  }
  function current(camp: ExpeditionCamp, at: number) {
    return projectUndergroundFire(camp.fire, at, fire);
  }
  function commit(camps: readonly ExpeditionCamp[], debit?: ResourceReceipt) {
    if (state.revision >= Number.MAX_SAFE_INTEGER - 1) return false;
    const next = structuredClone({ revision: state.revision + 1, camps });
    // This callback is the single host G-11 inventory and world-state transaction.
    options.save(next, debit);
    state = next;
    return true;
  }
  return {
    snapshot: () => structuredClone(state),
    visibleCamps() {
      const at = time();
      if (at === undefined) return [];
      return state.camps.map(camp => ({
        ...structuredClone(camp), fire: current(camp, at),
      }));
    },
    /** U-13 readLights(layer) consumes the returned exact campfire sources. Out fires vanish. */
    activeU13FireSources(layer: string) {
      const at = time();
      if (at === undefined || !layer.trim()) return [];
      return state.camps.flatMap(camp => {
        if (camp.at.layer !== layer || current(camp, at).phase === 'out') return [];
        return [{ id: camp.id, at: { ...camp.at }, kind: 'campfire' as const }];
      });
    },
    /** Choose a site from a true accepted foot; neither a client marker nor an invented map cell is authority. */
    build(playerId: string, expectedRevision: number, site: Point) {
      const at = time();
      if (at === undefined || expectedRevision !== state.revision ||
          !foot(playerId, site) || !options.supportsFlatFirePoint(site) ||
          !options.isFreeGround(site) || state.camps.length >= options.maximumCamps ||
          state.camps.some(camp => camp.at.layer === site.layer &&
            Math.hypot(camp.at.east - site.east, camp.at.north - site.north,
              camp.at.height - site.height) < options.minimumSeparation)) return 'unavailable' as const;
      const debit = { playerId, kind: 'build' as const,
        wood: options.buildWood, tinder: options.buildTinder };
      if (!options.canSpend(playerId, debit)) return 'materials' as const;
      const id = options.allocateCampId();
      if (!id.trim() || state.camps.some(camp => camp.id === id)) return 'unavailable' as const;
      const camp: ExpeditionCamp = { id, founderId: playerId, at: { ...site },
        fire: { fuel: options.buildFuel, atMs: at } };
      return commit([...state.camps, camp], debit) ? { kind: 'built', id } as const : 'unavailable' as const;
    },
    /** Every player can tend any reachable shared camp; no personal instance or duplicate HP meter. */
    stoke(playerId: string, expectedRevision: number, campId: string) {
      const at = time();
      const camp = state.camps.find(entry => entry.id === campId);
      if (!camp || at === undefined || expectedRevision !== state.revision ||
          !foot(playerId, camp.at)) return 'unavailable' as const;
      const updated = addUndergroundFireFuel(camp.fire, options.stokeFuel, at, fire);
      if (!updated) return 'full' as const;
      const debit = { playerId, kind: 'stoke' as const, wood: options.stokeWood, tinder: 0 };
      if (!options.canSpend(playerId, debit)) return 'materials' as const;
      const replaced = state.camps.map(entry => entry.id === camp.id
        ? { ...entry, fire: { fuel: updated.fuel, atMs: at } } : entry);
      return commit(replaced, debit)
        ? (updated.phase === 'weak' ? 'weak' as const : 'lit' as const) : 'unavailable' as const;
    },
    /** Persist natural burn-off for an authorized server tick. No client clock is accepted. */
    tick(expectedRevision: number) {
      const at = time();
      if (at === undefined || expectedRevision !== state.revision) return false;
      const projected = state.camps.map(camp => ({
        ...camp, fire: { fuel: current(camp, at).fuel, atMs: at },
      }));
      if (!projected.some((camp, i) => camp.fire.atMs !== state.camps[i].fire.atMs)) return false;
      return commit(projected);
    },
  };
}
