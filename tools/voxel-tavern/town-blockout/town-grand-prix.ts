// 3.0 D2 环镇大奖赛（任务书 §1 D2）：雪橇下坡 → 湖面滑冰 → 徒步冲刺的混合环线。
// 纯逻辑 + 本地最佳（localStorage）+ 本场成绩榜数据；镇内榜条目由 viewer 经
// presence 的 grand-prix 事件喂入 recordResult（服务器只中继，校验在两端）。
// 检查点必须按序、且当前赛段与检查点要求一致才推进（错段/乱序不计）。
import { lakeSkateGates } from './lake-skate-course';

export const grandPrixProgressKey = 'unwritten.grand-prix.v1';
export const grandPrixMinTotalMs = 45_000;
export const grandPrixMaxTotalMs = 1_800_000;

export type GrandPrixLeg = 'sled' | 'skate' | 'foot';
export type GrandPrixMode = { sledding: boolean; skating: boolean };

export const grandPrixCheckpoints: readonly {
  id: string; label: string; x: number; n: number; radius: number; leg: GrandPrixLeg;
}[] = [
  { id: 'start', label: '北坡顶出发', x: 378, n: 303, radius: 3, leg: 'sled' },
  { id: 'memorial', label: '纪念馆东', x: 332, n: 245, radius: 3.5, leg: 'sled' },
  { id: 'bridge', label: '中央桥面', x: 304, n: 192, radius: 3.5, leg: 'sled' },
  { id: 'sled-finish', label: '雪橇终点', x: 231, n: 192, radius: 3, leg: 'sled' },
  { id: 'skate-1', label: '冰湖一门', x: lakeSkateGates[0].x, n: lakeSkateGates[0].n, radius: 2.5, leg: 'skate' },
  { id: 'skate-2', label: '冰湖二门', x: lakeSkateGates[2].x, n: lakeSkateGates[2].n, radius: 2.5, leg: 'skate' },
  { id: 'skate-3', label: '冰湖三门', x: lakeSkateGates[4].x, n: lakeSkateGates[4].n, radius: 2.5, leg: 'skate' },
  { id: 'finish', label: '广场徽记终点', x: 224, n: 188, radius: 2.5, leg: 'foot' },
];

export type GrandPrixResult = { id: string; name: string; totalMs: number; at: number };

type RaceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): RaceStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function bestTime(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= grandPrixMinTotalMs && value <= grandPrixMaxTotalMs ? value : undefined;
}

function seconds(ms: number) {
  return (ms / 1000).toFixed(1) + ' 秒';
}

export function isGrandPrixResult(value: unknown): value is GrandPrixResult {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0 &&
    typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 24 &&
    bestTime(row.totalMs) !== undefined &&
    typeof row.at === 'number' && Number.isFinite(row.at);
}

export function createGrandPrix(storage = browserStorage(), now = () => performance.now()) {
  let best = bestTime((() => {
    try { return JSON.parse(storage?.getItem(grandPrixProgressKey) ?? '{}').bestMs; } catch { return undefined; }
  })());
  let startedAt: number | undefined;
  let nextIndex = 0;
  let splits: number[] = [];
  let pendingResult: number | undefined;
  const board = new Map<string, GrandPrixResult>();

  function legMatches(leg: GrandPrixLeg, mode: GrandPrixMode) {
    if (leg === 'sled') return mode.sledding;
    if (leg === 'skate') return mode.skating;
    return !mode.sledding && !mode.skating;
  }

  function near(index: number, x: number, n: number) {
    const point = grandPrixCheckpoints[index];
    return (x - point.x) ** 2 + (n - point.n) ** 2 <= point.radius ** 2;
  }

  function finishRun(totalMs: number) {
    pendingResult = totalMs;
    if (best === undefined || totalMs < best) {
      best = totalMs;
      try { storage?.setItem(grandPrixProgressKey, JSON.stringify({ bestMs: totalMs })); } catch { /* session keeps it */ }
    }
    startedAt = undefined;
    nextIndex = 0;
    splits = [];
  }

  return {
    update(x: number, n: number, mode: GrandPrixMode) {
      const start = grandPrixCheckpoints[0];
      if (mode.sledding && near(0, x, n) && startedAt === undefined) {
        startedAt = now();
        nextIndex = 1;
        splits = [0];
      }
      if (startedAt !== undefined) {
        const target = grandPrixCheckpoints[nextIndex];
        if (target && legMatches(target.leg, mode) && near(nextIndex, x, n)) {
          const elapsed = Math.max(1, Math.round(now() - startedAt));
          splits.push(elapsed);
          if (nextIndex === grandPrixCheckpoints.length - 1) {
            finishRun(elapsed);
            return `大奖赛完赛 ${seconds(elapsed)}` + (best === elapsed ? ' · 新纪录' : '');
          }
          nextIndex++;
        }
        const targetNow = grandPrixCheckpoints[nextIndex];
        return `大奖赛 ${seconds(now() - startedAt)} · 下一站 ${targetNow.label}` +
          (best !== undefined ? ` · 个人最佳 ${seconds(best)}` : '');
      }
      void start;
      return best !== undefined ? `大奖赛 · 个人最佳 ${seconds(best)}（乘橇过北坡顶出发）` : '';
    },
    /** 完赛成绩只交付一次（viewer 据此发 presence 成绩事件）。 */
    takeResult() {
      const result = pendingResult;
      pendingResult = undefined;
      return result;
    },
    running: () => startedAt !== undefined,
    splits: () => [...splits],
    best: () => best,
    recordResult(value: unknown) {
      if (!isGrandPrixResult(value)) return false;
      const existing = board.get(value.id);
      if (!existing || value.totalMs < existing.totalMs) board.set(value.id, { ...value });
      return true;
    },
    board(): GrandPrixResult[] {
      return [...board.values()].sort((a, b) => a.totalMs - b.totalMs).slice(0, 8);
    },
  };
}

export type TownGrandPrix = ReturnType<typeof createGrandPrix>;
