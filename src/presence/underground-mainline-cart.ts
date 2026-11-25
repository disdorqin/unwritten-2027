import type { createUndergroundMainlineTrack, UndergroundMainlineFault, UndergroundMainlinePoint } from '../shared/underground-mainline-track.js';
type Route = ReturnType<typeof createUndergroundMainlineTrack>;
type FaultVerb = 'carry-sleeper' | 'pry-gauge' | 'knock-rust' | 'apply-oil';
type Mode = 'repairing' | 'stopped' | 'rolling' | 'derailed' | 'recalling';
export type U19MineCartSnapshot = Readonly<{
  revision: number; mode: Mode; lastAtMs: number;
  chainage: number; speed: number; riderId?: string; brakeHeld: boolean;
  turnout: 'unset' | 'gate' | 'branch';
  faults: Readonly<Record<UndergroundMainlineFault, number>>;
  cargo: Readonly<{ oreId: string; pieces: number }>;
  recallOperator?: string; lastRecallAtMs?: number;
}>;
export type U19MineCartCargoChange = Readonly<{
  playerId: string; direction: 'load' | 'unload'; oreId: string; pieces: number;
}>;
type Option = Readonly<{
  route: Route;
  now(): number;
  readAcceptedFoot(id: string): (UndergroundMainlinePoint & { domainId: string; playerId: string }) | undefined;
  /** The movement host, not the vehicle view, confirms visible and swept reach. */
  canUse(id: string, foot: UndergroundMainlinePoint, target: UndergroundMainlinePoint,
    kind: 'repair' | 'board' | 'leave' | 'switch' | 'rerail' | 'cargo' | 'winch'): boolean;
  /** U-8/G-11 only. Both inventory and this immutable snapshot must commit together. */
  canTransferOre(id: string, oreId: string, pieces: number, direction: 'load' | 'unload'): boolean;
  /** Per-player carry amount from G-11, not a second invented backpack capacity. */
  playerCarryCapacity(id: string): number;
  /** U-13 receives a speed/noise edge only after successfully committed movement. */
  onAcceptedRun?(at: UndergroundMainlinePoint, speed: number): void;
  save(state: U19MineCartSnapshot, ore?: U19MineCartCargoChange): void;
  initial?: U19MineCartSnapshot;
  config: Readonly<{
    acceleration: number; brakeDeceleration: number; maxSpeed: number;
    safeTurnoutSpeed: number; safeCurveSpeed: number;
    recallMetresPerSecond: number; maximumTickMs: number;
    actionReachMetres: number;
  }>;
}>;
const faultRepair: Readonly<Record<UndergroundMainlineFault, readonly FaultVerb[]>> = {
  sleepers: ['carry-sleeper', 'carry-sleeper', 'carry-sleeper'],
  gauge: ['pry-gauge', 'pry-gauge', 'pry-gauge'],
  'turnout-rust': ['knock-rust', 'knock-rust', 'knock-rust', 'apply-oil'],
};
const faultList = ['sleepers', 'gauge', 'turnout-rust'] as const;
const finite = (n: number) => Number.isFinite(n);
const footDist = (a: UndergroundMainlinePoint, b: UndergroundMainlinePoint) =>
  Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height);
const cleanId = (v: string) => typeof v === 'string' && v.trim().length > 0 && v.trim() === v;

/**
 * U-19 server-side mainline authority. It keeps the U-7 push-cart module intact; this is
 * a separate approved 120m service, gated by the exact host survey and G-11 escrow.
 */
export function createUndergroundMainlineCart(options: Option) {
  const { route, config } = options;
  if (!route || !cleanId(route.domainId) || !Object.values(config).every(n => finite(n) && n > 0) ||
      config.maxSpeed <= config.safeTurnoutSpeed || config.maxSpeed <= config.safeCurveSpeed ||
      config.maximumTickMs > 2_000 ||
      config.actionReachMetres > 2.5 || !finite(options.now())) {
    throw new RangeError('U-19 requires certified route and host movement constants');
  }
  const fresh: U19MineCartSnapshot = {
    revision: 0, mode: 'repairing', lastAtMs: options.now(), chainage: 0, speed: 0,
    brakeHeld: false, turnout: 'unset', cargo: { oreId: '', pieces: 0 },
    faults: { sleepers: 0, gauge: 0, 'turnout-rust': 0 },
  };
  let state = structuredClone(options.initial ?? fresh);
  function valid(next: U19MineCartSnapshot) {
    return Number.isSafeInteger(next.revision) && next.revision >= 0 &&
      finite(next.lastAtMs) && next.lastAtMs >= 0 && finite(next.chainage) &&
      next.chainage >= 0 && next.chainage <= route.length && finite(next.speed) &&
      next.speed >= 0 && next.speed <= config.maxSpeed &&
      ['repairing', 'stopped', 'rolling', 'derailed', 'recalling'].includes(next.mode) &&
      ['unset', 'gate', 'branch'].includes(next.turnout) &&
      typeof next.brakeHeld === 'boolean' && (!next.riderId || cleanId(next.riderId)) &&
      (!next.recallOperator || cleanId(next.recallOperator)) &&
      (next.lastRecallAtMs === undefined || finite(next.lastRecallAtMs) && next.lastRecallAtMs <= next.lastAtMs) &&
      (next.mode !== 'recalling' || (!next.riderId && !!next.recallOperator &&
        next.lastRecallAtMs !== undefined)) &&
      (next.mode !== 'rolling' || !!next.riderId) &&
      (next.cargo.pieces === 0 && next.cargo.oreId === '' ||
        Number.isSafeInteger(next.cargo.pieces) && next.cargo.pieces > 0 && cleanId(next.cargo.oreId)) &&
      faultList.every(key => Number.isSafeInteger(next.faults[key]) &&
        next.faults[key] >= 0 && next.faults[key] <= faultRepair[key].length);
  }
  if (!valid(state) || state.lastAtMs > options.now() || state.revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Invalid persisted U-19 mainline');
  }
  function repaired(faults = state.faults) {
    return faultList.every(key => faults[key] === faultRepair[key].length);
  }
  function time() {
    const now = options.now();
    if (!finite(now) || now < state.lastAtMs || now < 0) return;
    return now;
  }
  function acceptedFoot(playerId: string, at: UndergroundMainlinePoint,
    kind: Parameters<Option['canUse']>[3]) {
    if (!cleanId(playerId)) return false;
    const foot = options.readAcceptedFoot(playerId);
    if (!foot || foot.domainId !== route.domainId || foot.playerId !== playerId ||
        ![foot.east, foot.north, foot.height].every(finite)) return false;
    return footDist(foot, at) <= config.actionReachMetres &&
      options.canUse(playerId, foot, at, kind) === true;
  }
  function commit(next: U19MineCartSnapshot, cargoChange?: U19MineCartCargoChange) {
    if (state.revision >= Number.MAX_SAFE_INTEGER - 1) return false;
    const snapshot: U19MineCartSnapshot = structuredClone({ ...next, revision: state.revision + 1 });
    if (!valid(snapshot)) return false;
    options.save(snapshot, cargoChange);
    state = snapshot;
    return true;
  }
  const cartAt = () => route.sample(state.chainage).position;
  function atStop() {
    const nearCamp = state.chainage <= 2;
    const nearGate = state.chainage >= route.length - 2;
    return nearCamp || nearGate;
  }
  return {
    snapshot: () => structuredClone(state),
    /** Manual local repairs require the corresponding real U-15 foot and correct maintenance verb. */
    repair(playerId: string, revision: number, fault: UndergroundMainlineFault, verb: FaultVerb) {
      const at = time();
      if (at === undefined || revision !== state.revision || !faultList.includes(fault) ||
          !acceptedFoot(playerId, route.work[fault].position, 'repair') ||
          state.mode !== 'repairing') return 'rejected' as const;
      const progress = state.faults[fault];
      if (faultRepair[fault][progress] !== verb) return 'wrong-tool' as const;
      const faults = { ...state.faults, [fault]: progress + 1 };
      return commit({ ...state, lastAtMs: at,
        mode: repaired(faults) ? 'stopped' : 'repairing', faults })
        ? (repaired(faults) ? 'service-restored' as const : 'repaired' as const) : 'rejected' as const;
    },
    /** A derail can never eject riders; even an emergency stop keeps the occupant in the cart. */
    board(playerId: string, revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.riderId ||
          !repaired() || state.mode !== 'stopped' ||
          !acceptedFoot(playerId, cartAt(), 'board')) return false;
      return commit({ ...state, lastAtMs: at, riderId: playerId });
    },
    leave(playerId: string, revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.riderId !== playerId ||
          state.speed !== 0 || !['stopped', 'derailed'].includes(state.mode) ||
          !acceptedFoot(playerId, cartAt(), 'leave')) return false;
      return commit({ ...state, lastAtMs: at, riderId: undefined, brakeHeld: false });
    },
    brake(playerId: string, revision: number, active: boolean) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.riderId !== playerId ||
          state.mode !== 'rolling' || state.brakeHeld === active) return false;
      return commit({ ...state, lastAtMs: at, brakeHeld: active });
    },
    go(playerId: string, revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.riderId !== playerId ||
          state.mode !== 'stopped' || !repaired() ||
          state.chainage >= route.length ||
          (Math.abs(state.chainage - route.turnoutMetres) < 1 && state.turnout !== 'gate')) return false;
      return commit({ ...state, lastAtMs: at, mode: 'rolling', brakeHeld: false });
    },
    /** A stopped cart is not enough: the rider must step out and physically switch the lever. */
    switchTurnout(playerId: string, revision: number, toward: 'gate' | 'branch') {
      const at = time();
      if (at === undefined || revision !== state.revision || state.mode !== 'stopped' ||
          state.riderId || Math.abs(state.chainage - route.turnoutMetres) > 1 ||
          !acceptedFoot(playerId, route.work.turnout.position, 'switch')) return false;
      return commit({ ...state, lastAtMs: at, turnout: toward });
    },
    /** Human-operated rerailing after derail, without forcing the rider out in the crash tick. */
    rerail(playerId: string, revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.mode !== 'derailed' ||
          state.riderId || !acceptedFoot(playerId, cartAt(), 'rerail')) return false;
      return commit({ ...state, lastAtMs: at, mode: 'stopped', speed: 0 });
    },
    /** Host-timed gravity service. Long stalls stop instead of fast-forward teleporting the cart. */
    tick(revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || at === state.lastAtMs ||
          state.mode !== 'rolling') return false;
      const dt = (at - state.lastAtMs) / 1000;
      if (dt > config.maximumTickMs / 1000) {
        return commit({ ...state, lastAtMs: at, speed: 0, mode: 'stopped', brakeHeld: false });
      }
      const signedAccel = state.brakeHeld ? -config.brakeDeceleration : config.acceleration;
      const speed = Math.max(0, Math.min(config.maxSpeed, state.speed + signedAccel * dt));
      const proposed = Math.min(route.length, state.chainage + (state.speed + speed) / 2 * dt);
      const crossingTurnout = state.chainage < route.turnoutMetres &&
        proposed >= route.turnoutMetres;
      // A scenic branch without an official movement domain must stop here. An approved
      // straight-through switch still derails a fast cart: switch setting is NOT immunity.
      const blockedTurnout = crossingTurnout && state.turnout !== 'gate';
      const stopAt = blockedTurnout ? route.turnoutMetres : proposed;
      const fastBend = route.bends.find(bend => bend.chainage > state.chainage &&
        bend.chainage <= stopAt && speed > config.safeCurveSpeed);
      const fastTurnout = crossingTurnout && speed > config.safeTurnoutSpeed;
      const derailAt = Math.min(fastBend?.chainage ?? Infinity,
        fastTurnout ? route.turnoutMetres : Infinity);
      if (Number.isFinite(derailAt)) {
        const next = { ...state, lastAtMs: at, chainage: derailAt, speed: 0,
          brakeHeld: false, mode: 'derailed' as const };
        if (!commit(next)) return false;
        options.onAcceptedRun?.(route.sample(derailAt).position, speed);
        return true;
      }
      const finalChainage = blockedTurnout ? route.turnoutMetres : proposed;
      const stopping = speed <= .01 || proposed >= route.length || blockedTurnout;
      const next = { ...state, lastAtMs: at, chainage: finalChainage, speed: stopping ? 0 : speed,
        brakeHeld: stopping ? false : state.brakeHeld, mode: stopping ? 'stopped' as const : 'rolling' as const };
      if (!commit(next)) return false;
      options.onAcceptedRun?.(route.sample(finalChainage).position, speed);
      return true;
    },
    /** Loading and unloading are G-11 atomic inventory moves, not a visual ore counter. */
    cargo(playerId: string, revision: number, direction: 'load' | 'unload', oreId: string, pieces: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.mode !== 'stopped' ||
          state.riderId || !atStop() || !cleanId(oreId) ||
          !Number.isSafeInteger(pieces) || pieces <= 0 ||
          !acceptedFoot(playerId, cartAt(), 'cargo')) return false;
      const capacity = options.playerCarryCapacity(playerId) * 3;
      if (!Number.isSafeInteger(capacity) || capacity <= 0 || !Number.isSafeInteger(pieces) ||
          !options.canTransferOre(playerId, oreId, pieces, direction)) return false;
      let nextCargo = state.cargo;
      if (direction === 'load') {
        if (pieces + state.cargo.pieces > capacity ||
            state.cargo.pieces && state.cargo.oreId !== oreId) return false;
        nextCargo = { oreId, pieces: state.cargo.pieces + pieces };
      } else {
        if (state.cargo.oreId !== oreId || state.cargo.pieces < pieces) return false;
        nextCargo = state.cargo.pieces === pieces ? { oreId: '', pieces: 0 } :
          { oreId, pieces: state.cargo.pieces - pieces };
      }
      return commit({ ...state, lastAtMs: at, cargo: nextCargo },
        { playerId, direction, oreId, pieces });
    },
    /** Hold E at the real camp winch. An abandoned or disconnected hold can be reclaimed. */
    recall(playerId: string, revision: number) {
      const at = time();
      const stalled = state.mode === 'recalling' && state.lastRecallAtMs !== undefined &&
        at !== undefined && at - state.lastRecallAtMs > 2 * config.maximumTickMs;
      if (at === undefined || revision !== state.revision ||
          (state.mode !== 'stopped' && !stalled) ||
          state.riderId || state.cargo.pieces !== 0 || state.chainage <= 2 ||
          !acceptedFoot(playerId, route.work.camp.position, 'winch')) return false;
      return commit({ ...state, lastAtMs: at, mode: 'recalling', recallOperator: playerId,
        lastRecallAtMs: at });
    },
    /** On E release or client disconnect, preserve the cart's actual partial position. */
    releaseRecall(playerId: string, revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.mode !== 'recalling' ||
          state.recallOperator !== playerId) return false;
      return commit({ ...state, lastAtMs: at, mode: 'stopped', recallOperator: undefined,
        lastRecallAtMs: undefined, speed: 0 });
    },
    recallHold(playerId: string, revision: number) {
      const at = time();
      if (at === undefined || revision !== state.revision || state.mode !== 'recalling' ||
          state.recallOperator !== playerId ||
          !acceptedFoot(playerId, route.work.camp.position, 'winch') ||
          state.lastRecallAtMs === undefined) return false;
      const elapsedMs = at - state.lastRecallAtMs;
      if (elapsedMs <= 0) return false; // duplicated E heartbeat cannot churn revisions.
      const dt = Math.min(config.maximumTickMs, elapsedMs) / 1000;
      const pos = Math.max(0, state.chainage - dt * config.recallMetresPerSecond);
      const done = pos <= 0;
      return commit({ ...state, lastAtMs: at, lastRecallAtMs: done ? undefined : at,
        chainage: pos, mode: done ? 'stopped' : 'recalling', recallOperator: done ? undefined : playerId });
    },
  };
}
