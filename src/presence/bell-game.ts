// D3 抢铃铛共享规则：一只铃落在广场上，触碰夺铃，六分钟内累计持铃最久者胜。
// 本模块只做纯逻辑（时间一律由调用方以墙钟毫秒注入），服务端权威执行、客户端照单渲染、测试直接验规则。

export const bellMatchMs = 360_000;
export const bellTitleMs = [30_000, 60_000, 90_000] as const;
// 称号文案逐字锁定（任务书 D3）：`${名字} ${后缀}`。
export const bellTitleSuffixes = ['无人能挡', '已经无双', '已经无敌'] as const;
export const bellStealRadius = 1.3;
export const bellPickupDelayMs = 1_000;
export const bellStealGraceMs = 1_000;
export const bellDropRollMetres = 2;
// 临时场 = 现广场界（layout.json plaza bounds）。
export const bellVenue = { minEast: 191, maxEast: 251, minNorth: 169, maxNorth: 212 } as const;
export const bellSpawn = { east: 224, north: 188 } as const;

export type BellConfig = {
  matchMs: number;
  titleMs: readonly number[];
  stealRadius: number;
  pickupDelayMs: number;
  stealGraceMs: number;
  dropRollMetres: number;
};

export const defaultBellConfig: BellConfig = {
  matchMs: bellMatchMs,
  titleMs: bellTitleMs,
  stealRadius: bellStealRadius,
  pickupDelayMs: bellPickupDelayMs,
  stealGraceMs: bellStealGraceMs,
  dropRollMetres: bellDropRollMetres,
};

export function bellTitleText(name: string, tier: number): string {
  const suffix = bellTitleSuffixes[tier];
  return suffix ? `${name} ${suffix}` : '';
}

export type BellPoint = { east: number; north: number };

export type BellState = {
  phase: 'running' | 'ended';
  endsAt: number;
  holderId: number | null;
  loose: BellPoint | null;
  pickableAt: number;
  holderSince: number;
  totals: Map<number, number>;
  firstHoldAt: Map<number, number>;
};

export function createBellMatch(now: number, config: BellConfig = defaultBellConfig): BellState {
  return {
    phase: 'running',
    endsAt: now + config.matchMs,
    holderId: null,
    loose: { ...bellSpawn },
    pickableAt: now,
    holderSince: 0,
    totals: new Map(),
    firstHoldAt: new Map(),
  };
}

export function inBellVenue(point: BellPoint): boolean {
  return point.east >= bellVenue.minEast && point.east <= bellVenue.maxEast &&
    point.north >= bellVenue.minNorth && point.north <= bellVenue.maxNorth;
}

function horizontalDistance(a: BellPoint, b: BellPoint): number {
  return Math.hypot(a.east - b.east, a.north - b.north);
}

/** 把当前持铃时段折进 totals（易地/掉铃/结束时调用）。 */
export function closeBellSegment(state: BellState, now: number): void {
  if (state.holderId === null) return;
  const held = Math.max(0, now - state.holderSince);
  state.totals.set(state.holderId, (state.totals.get(state.holderId) ?? 0) + held);
  state.holderSince = now;
}

/** 含当前时段的累计持铃毫秒。 */
export function bellHoldMs(state: BellState, id: number, now: number): number {
  const folded = state.totals.get(id) ?? 0;
  return state.holderId === id && state.phase === 'running' ? folded + Math.max(0, now - state.holderSince) : folded;
}

export function bellStandings(state: BellState, now: number): { id: number; ms: number }[] {
  const ids = new Set([...state.totals.keys(), ...(state.holderId === null ? [] : [state.holderId])]);
  return [...ids]
    .map(id => ({ id, ms: bellHoldMs(state, id, now) }))
    .filter(entry => entry.ms > 0)
    .sort((a, b) => b.ms - a.ms ||
      (state.firstHoldAt.get(a.id) ?? Infinity) - (state.firstHoldAt.get(b.id) ?? Infinity) || a.id - b.id);
}

export function bellWinner(state: BellState, now: number): { id: number; ms: number } | null {
  return bellStandings(state, now)[0] ?? null;
}

export type BellTitleDue = { id: number; tier: number; key: string };

/** 当前连续持铃跨过下一档称号时返回该档；announced 记 `${id}:${tier}`，每档每人每局只报一次。 */
export function bellTitleDue(
  state: BellState, now: number, announced: ReadonlySet<string>, config: BellConfig = defaultBellConfig,
): BellTitleDue | null {
  if (state.phase !== 'running' || state.holderId === null) return null;
  const held = now - state.holderSince;
  for (let tier = 0; tier < config.titleMs.length; tier++) {
    if (held < config.titleMs[tier]) break;
    const key = `${state.holderId}:${tier}`;
    if (!announced.has(key)) return { id: state.holderId, tier, key };
  }
  return null;
}

export type BellTouchResult =
  | { ok: true; action: 'pickup' | 'steal'; previousHolderId: number | null }
  | { ok: false; reason: 'phase' | 'self' | 'early' | 'grace' | 'range' };

/** 触碰判定：散铃看拾取窗，持铃看夺铃宽限，两者都看水平距离。holder 为持铃人脚下点（散铃时传 null）。 */
export function tryBellTouch(
  state: BellState, claimantId: number, claimant: BellPoint, holder: BellPoint | null,
  now: number, config: BellConfig = defaultBellConfig,
): BellTouchResult {
  if (state.phase !== 'running') return { ok: false, reason: 'phase' };
  if (state.holderId === null) {
    if (!state.loose) return { ok: false, reason: 'phase' };
    if (now < state.pickableAt) return { ok: false, reason: 'early' };
    if (horizontalDistance(claimant, state.loose) > config.stealRadius) return { ok: false, reason: 'range' };
    return { ok: true, action: 'pickup', previousHolderId: null };
  }
  if (claimantId === state.holderId) return { ok: false, reason: 'self' };
  if (now - state.holderSince < config.stealGraceMs) return { ok: false, reason: 'grace' };
  if (!holder || horizontalDistance(claimant, holder) > config.stealRadius) return { ok: false, reason: 'range' };
  return { ok: true, action: 'steal', previousHolderId: state.holderId };
}

/** 触碰生效：结算上一任时段，铃易主。 */
export function applyBellTouch(state: BellState, claimantId: number, now: number): void {
  closeBellSegment(state, now);
  state.holderId = claimantId;
  state.holderSince = now;
  state.loose = null;
  if (!state.firstHoldAt.has(claimantId)) state.firstHoldAt.set(claimantId, now);
}

/** 掉铃：从 from 沿 (dirEast, dirNorth) 滚出固定距离（零向量则原地），落点夹回场地内 1 米边距。 */
export function dropBell(
  state: BellState, from: BellPoint, dirEast: number, dirNorth: number,
  now: number, config: BellConfig = defaultBellConfig, pickupDelayMs: number = config.pickupDelayMs,
): BellPoint {
  closeBellSegment(state, now);
  const length = Math.hypot(dirEast, dirNorth);
  const roll = length > 0 ? config.dropRollMetres : 0;
  const loose = {
    east: Math.min(bellVenue.maxEast - 1, Math.max(bellVenue.minEast + 1, from.east + (length ? dirEast / length * roll : 0))),
    north: Math.min(bellVenue.maxNorth - 1, Math.max(bellVenue.minNorth + 1, from.north + (length ? dirNorth / length * roll : 0))),
  };
  state.holderId = null;
  state.loose = loose;
  state.pickableAt = now + pickupDelayMs;
  return loose;
}

export function endBellMatch(state: BellState, now: number): void {
  closeBellSegment(state, now);
  state.phase = 'ended';
  state.holderId = null;
  state.loose = null;
}

// ---- 线上协议（JSON 事件，沿 P2b 事件层） ----

export type BellHolderInfo = { id: number; name: string; east: number; north: number; height: number };
export type BellStateEvent = {
  type: 'event'; kind: 'bell-state';
  phase: 'running' | 'ended';
  endsAt: number;
  holderSince: number;
  holder: BellHolderInfo | null;
  loose: BellPoint | null;
  pickableAt: number;
  totals: [number, number][];
};
export type BellTitleEvent = { type: 'event'; kind: 'bell-title'; id: number; name: string; tier: number };
export type BellStanding = { id: number; name: string; ms: number };
export type BellEndEvent = { type: 'event'; kind: 'bell-end'; winner: BellStanding | null; standings: BellStanding[] };
export type BellEvent = BellStateEvent | BellTitleEvent | BellEndEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is BellPoint {
  return isRecord(value) && isFiniteNumber(value.east) && isFiniteNumber(value.north);
}

export function readBellEvent(message: unknown): BellEvent | undefined {
  if (!isRecord(message) || message.type !== 'event') return undefined;
  if (message.kind === 'bell-state') {
    if ((message.phase !== 'running' && message.phase !== 'ended') ||
        !isFiniteNumber(message.endsAt) || !isFiniteNumber(message.holderSince) || !isFiniteNumber(message.pickableAt) ||
        !Array.isArray(message.totals)) return undefined;
    let holder: BellHolderInfo | null = null;
    if (message.holder !== null) {
      if (!isRecord(message.holder) || !isId(message.holder.id) || typeof message.holder.name !== 'string' ||
          !isFiniteNumber(message.holder.east) || !isFiniteNumber(message.holder.north) ||
          !isFiniteNumber(message.holder.height)) return undefined;
      holder = {
        id: message.holder.id, name: message.holder.name.slice(0, 24),
        east: message.holder.east, north: message.holder.north, height: message.holder.height,
      };
    }
    if (message.loose !== null && !isPoint(message.loose)) return undefined;
    const totals: [number, number][] = [];
    for (const entry of message.totals) {
      if (!Array.isArray(entry) || !isId(entry[0]) || !isFiniteNumber(entry[1]) || entry[1] < 0) return undefined;
      totals.push([entry[0], entry[1]]);
    }
    return {
      type: 'event', kind: 'bell-state', phase: message.phase, endsAt: message.endsAt,
      holderSince: message.holderSince, holder,
      loose: message.loose === null ? null : { east: (message.loose as BellPoint).east, north: (message.loose as BellPoint).north },
      pickableAt: message.pickableAt, totals,
    };
  }
  if (message.kind === 'bell-title') {
    if (!isId(message.id) || typeof message.name !== 'string' ||
        !Number.isInteger(message.tier) || (message.tier as number) < 0 || (message.tier as number) >= bellTitleSuffixes.length) {
      return undefined;
    }
    return { type: 'event', kind: 'bell-title', id: message.id, name: message.name.slice(0, 24), tier: message.tier as number };
  }
  if (message.kind === 'bell-end') {
    if (!Array.isArray(message.standings)) return undefined;
    const standing = (value: unknown): BellStanding | undefined => {
      if (!isRecord(value) || !isId(value.id) || typeof value.name !== 'string' || !isFiniteNumber(value.ms) || value.ms < 0) {
        return undefined;
      }
      return { id: value.id, name: value.name.slice(0, 24), ms: value.ms };
    };
    const standings: BellStanding[] = [];
    for (const entry of message.standings) {
      const parsed = standing(entry);
      if (!parsed) return undefined;
      standings.push(parsed);
    }
    const winner = message.winner === null ? null : standing(message.winner);
    if (message.winner !== null && !winner) return undefined;
    return { type: 'event', kind: 'bell-end', winner: winner ?? null, standings };
  }
  return undefined;
}

// ---- 铃声空间参数（纯函数，客户端音频与测试共用） ----

/** 距离衰减 + 方位声像 + 距离低通：全场可闻（远处保底微响），近处清亮可辨位。azimuth 为相对视线方位角（弧度，右正）。 */
export function bellSpatialParams(distance: number, azimuth: number): { gain: number; pan: number; cutoff: number } {
  const metres = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const proximity = 1 / (1 + (metres / 55) ** 2);
  return {
    gain: Math.max(.05, proximity ** 1.2) * .9,
    pan: Math.max(-1, Math.min(1, Math.sin(azimuth))),
    cutoff: 1200 + 6800 * proximity ** 1.5,
  };
}
