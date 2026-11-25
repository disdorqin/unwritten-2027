/** U-17: authoritative, deterministic pump-house waterline. No local player input, clock or inventory ownership. */
export type PumpHouseStage = 'running' | 'jammed' | 'cover-open' | 'blockage-cleared';
export type PumpHouseAction = 'journal' | 'open-cover' | 'strike-blockage' | 'reset-lever';
export type PumpHousePoint = Readonly<{ domainId: string; east: number; north: number; height: number }>;
export type PumpHouseSnapshot = Readonly<{
  revision: number;
  lastAtMs: number;
  water: number; // 0 drained, 1 flooded
  pumpedMs: number;
  lastPumpAtMs?: number;
  operator?: string;
  stage: PumpHouseStage;
  repairHits: number;
  repairedJams: number;
  journalReaders: readonly string[];
}>;
export type PumpHouseStaminaDebit = Readonly<{ playerId: string; stamina: number }>;
export type PumpHouseOptions = Readonly<{
  domainId: string;
  /** The host is the sole source of authoritative time (including persisted save expiry). */
  now(): number;
  readAcceptedFoot(playerId: string): (PumpHousePoint & { playerId: string }) | undefined;
  /** True only when the movement authority supports a standing, reachable action foot. */
  canUse(playerId: string, action: 'pump' | PumpHouseAction | 'cross' | 'ore', foot: PumpHousePoint): boolean;
  /** The host checks U-13 stamina before any pump debit; no second stamina meter. */
  canSpendStamina(playerId: string, amount: number): boolean;
  /** Commit pump snapshot and optional U-13 stamina debit in ONE host transaction, or throw. */
  save(next: PumpHouseSnapshot, debit?: PumpHouseStaminaDebit): void;
  /** Physical crossing remains movement-host owned and is not implemented by this controller. */
  mayCross(playerId: string): boolean;
  /** Side ore must already be registered under U-8 in the current host domain. */
  isRegisteredLowWaterOre(playerId: string, oreId: string): boolean;
  initial?: PumpHouseSnapshot;
  config: Readonly<{
    drainPerSecond: number; refillPerSecond: number; passageWaterLimit: number;
    jamEveryPumpMs: number; pumpHeartbeatMaxMs: number; staminaPerSecond: number;
    blockageStrikes: number;
  }>;
}>;

export const pumpHouseLogbook = Object.freeze({
  title: '矿一至晶洞 · 第六班值守簿',
  pages: [
    '二更接班。下坡水尺又漫到第三格。木闸记得留缝，不让矿车吃水。',
    '排水要人守着。松手水会慢慢回来。若摇杆发硬，先拆盖，再敲出叶片里的石屑，最后拉复位杆。',
    '今夜矿灯换了新芯。对面听见三声敲击，回头却只有水。记在这里，不跟工友说。',
    '末页：昨夜有人替我把阀拧紧了。墨还没干，水尺上却没有半个指印。',
  ] as const,
  labels: {
    pump: '手摇排水机 · 持续摇动',
    scale: '水位尺 · 漫 / 浅 / 通',
    cover: '泵叶清堵口 · 拆盖',
    strike: '堵塞石屑 · 逐击清理',
    reset: '复位杆 · 向下压',
    ore: '退水后方可采矿',
    passage: '水晶洞通道 · 退水通行',
  },
});

const validNumber = (x: number) => Number.isFinite(x) && x >= 0;
const normalWater = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
const validAt = (v: number) => Number.isFinite(v) && v >= 0;
const isSafeRev = (v: number) => Number.isSafeInteger(v) && v >= 0;
const stageValues: readonly PumpHouseStage[] = ['running', 'jammed', 'cover-open', 'blockage-cleared'];
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Rules use a single revisioned snapshot for flood geometry, mining access and pump repairs. */
export function createUndergroundPumpHouse(options: PumpHouseOptions) {
  const { config } = options;
  const {
    drainPerSecond, refillPerSecond, passageWaterLimit,
    jamEveryPumpMs, pumpHeartbeatMaxMs, staminaPerSecond, blockageStrikes,
  } = config;
  if (!options.domainId || options.domainId.trim() !== options.domainId ||
      ![drainPerSecond, refillPerSecond, passageWaterLimit, jamEveryPumpMs,
        pumpHeartbeatMaxMs, staminaPerSecond].every(validNumber) ||
      drainPerSecond <= 0 || refillPerSecond <= 0 || passageWaterLimit <= 0 ||
      passageWaterLimit >= 1 || jamEveryPumpMs <= 0 || pumpHeartbeatMaxMs <= 0 ||
      pumpHeartbeatMaxMs > 5_000 || !Number.isSafeInteger(blockageStrikes) || blockageStrikes < 2 ||
      !validAt(options.now())) throw new RangeError('U-17 requires certified domain and pump profile');

  const initTime = options.now();
  const fresh: PumpHouseSnapshot = {
    revision: 0, lastAtMs: initTime, water: 1, pumpedMs: 0,
    stage: 'running', repairHits: 0, repairedJams: 0, journalReaders: [],
  };
  let state: PumpHouseSnapshot = options.initial ? structuredClone(options.initial) : fresh;
  function validate(s: PumpHouseSnapshot): boolean {
    return isSafeRev(s.revision) && validAt(s.lastAtMs) && normalWater(s.water) &&
      validNumber(s.pumpedMs) && stageValues.includes(s.stage) &&
      Number.isSafeInteger(s.repairedJams) && s.repairedJams >= 0 &&
      Number.isSafeInteger(s.repairHits) && s.repairHits >= 0 && s.repairHits <= blockageStrikes &&
      Array.isArray(s.journalReaders) && new Set(s.journalReaders).size === s.journalReaders.length &&
      s.journalReaders.every(id => typeof id === 'string' && !!id.trim()) &&
      (!s.operator || !!s.operator.trim()) &&
      (s.lastPumpAtMs === undefined || validAt(s.lastPumpAtMs) && s.lastPumpAtMs <= s.lastAtMs);
  }
  if (!validate(state) || state.lastAtMs > initTime || state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Invalid persisted U-17 pump state');
  }

  function allowed(playerId: string, action: Parameters<PumpHouseOptions['canUse']>[1]): boolean {
    if (!playerId.trim()) return false;
    const foot = options.readAcceptedFoot(playerId);
    return !!foot && foot.playerId === playerId && foot.domainId === options.domainId &&
      [foot.east, foot.north, foot.height].every(Number.isFinite) &&
      options.canUse(playerId, action, foot) === true;
  }
  function now() {
    const at = options.now();
    if (!validAt(at) || at < state.lastAtMs) return;
    return at;
  }
  function advanced(at: number): PumpHouseSnapshot {
    // A long real absence refills naturally; no client catchup pumping can happen.
    const elapsed = (at - state.lastAtMs) / 1000;
    return { ...state, water: clamp(state.water + elapsed * refillPerSecond),
      lastAtMs: at, operator: state.operator &&
        state.lastPumpAtMs !== undefined && at - state.lastPumpAtMs <= pumpHeartbeatMaxMs
          ? state.operator : undefined };
  }
  function commit(next: PumpHouseSnapshot, debit?: PumpHouseStaminaDebit) {
    if (!isSafeRev(state.revision + 1) || !validate(next)) return false;
    const incoming = structuredClone({ ...next, revision: state.revision + 1 });
    // A rejected/failed host save leaves both local state and stamina untouched.
    options.save(incoming, debit);
    state = incoming;
    return true;
  }
  return {
    snapshot: () => structuredClone(state),
    /** Read-only presentation should use this derived level, without mutating persistence. */
    projected(nowMs = options.now()) {
      if (!validAt(nowMs) || nowMs < state.lastAtMs) return;
      const water = clamp(state.water + (nowMs - state.lastAtMs) / 1000 * refillPerSecond);
      return { ...structuredClone(state), water, passageOpen: water <= passageWaterLimit };
    },
    /** Server-only tick applies continued seepage, including while everybody is offline. */
    tick(expectedRevision: number) {
      const at = now();
      if (at === undefined || expectedRevision !== state.revision || at === state.lastAtMs) return false;
      return commit(advanced(at));
    },
    /** Press-and-hold heartbeat; server compares accepted foot, revision, stamina and real delta. */
    pump(playerId: string, expectedRevision: number) {
      const at = now();
      if (at === undefined || expectedRevision !== state.revision || !allowed(playerId, 'pump')) return 'rejected' as const;
      const next = advanced(at);
      if (next.stage !== 'running') return 'jammed' as const;
      const previous = state.operator === playerId ? state.lastPumpAtMs : undefined;
      const deltaMs = previous !== undefined && at >= previous &&
        at - previous <= pumpHeartbeatMaxMs ? at - previous : 0;
      const workMs = Math.min(deltaMs, Math.max(0, jamEveryPumpMs - state.pumpedMs));
      const stamina = workMs / 1000 * staminaPerSecond;
      if (workMs > 0 && !options.canSpendStamina(playerId, stamina)) return 'exhausted' as const;
      const pumpedMs = state.pumpedMs + workMs;
      const jammed = pumpedMs >= jamEveryPumpMs;
      const nextState: PumpHouseSnapshot = {
        ...next, water: clamp(next.water - workMs / 1000 * drainPerSecond),
        pumpedMs, lastPumpAtMs: at, operator: jammed ? undefined : playerId,
        stage: jammed ? 'jammed' : 'running',
      };
      return commit(nextState, workMs > 0 ? { playerId, stamina } : undefined)
        ? (jammed ? 'jammed' as const : 'pumping' as const) : 'rejected' as const;
    },
    release(playerId: string, expectedRevision: number) {
      const at = now();
      if (at === undefined || expectedRevision !== state.revision || state.operator !== playerId) return false;
      return commit({ ...advanced(at), operator: undefined, lastPumpAtMs: undefined });
    },
    /** Uses the same accepted E-foot and the accepted mining hit action for debris. */
    interact(playerId: string, expectedRevision: number, action: PumpHouseAction) {
      const at = now();
      if (at === undefined || expectedRevision !== state.revision || !allowed(playerId, action)) return 'rejected' as const;
      const next = advanced(at);
      if (action === 'journal') {
        const seen = next.journalReaders.includes(playerId);
        if (seen) return 'read' as const;
        const readers = [...next.journalReaders, playerId];
        return commit({ ...next, journalReaders: readers }) ? 'read' as const : 'rejected' as const;
      }
      if (action === 'open-cover' && next.stage === 'jammed') {
        return commit({ ...next, stage: 'cover-open', repairHits: 0 }) ? 'opened' as const : 'rejected' as const;
      }
      if (action === 'strike-blockage' && next.stage === 'cover-open') {
        const hits = next.repairHits + 1;
        return commit({ ...next, repairHits: hits,
          stage: hits === blockageStrikes ? 'blockage-cleared' : 'cover-open' })
          ? (hits === blockageStrikes ? 'cleared' as const : 'struck' as const) : 'rejected' as const;
      }
      if (action === 'reset-lever' && next.stage === 'blockage-cleared') {
        return commit({ ...next, stage: 'running', repairHits: 0, pumpedMs: 0,
          repairedJams: next.repairedJams + 1, operator: undefined, lastPumpAtMs: undefined })
          ? 'reset' as const : 'rejected' as const;
      }
      return 'rejected' as const;
    },
    /** Only movement authority commits actual domain handoff, after its own sweep/landing test. */
    canCross(playerId: string) {
      const current = this.projected();
      return !!current?.passageOpen && allowed(playerId, 'cross') && options.mayCross(playerId);
    },
    /** U-8 handles mining; this is a waterline authorization guard, not a new reward path. */
    canMineLowWaterOre(playerId: string, oreId: string) {
      const current = this.projected();
      return !!current?.passageOpen && !!oreId.trim() && allowed(playerId, 'ore') &&
        options.isRegisteredLowWaterOre(playerId, oreId);
    },
    journal: pumpHouseLogbook,
  };
}
