import { Vector3 } from 'three';
import type { Camera } from 'three';
import { layout } from './terrain';
import { marketStallLayouts, type ExistingMarketStallKind } from './market-stall-layout';
import type { TownActivity, TownActivityContext } from './town-activity';

/**
 * 河畔年集最小切片：吆喝气泡 + 试吃（《集市重点建设方案-v1》§4.1 气泡 / §4.3 词库 / §7.1 试吃）。
 *
 * 台词纪律：吆喝与试吃反馈逐字取自方案 §4.3 词库（按摊种），试吃超限回应逐字取自
 * 《集市试吃打烊句-v1》（按摊种），本文件不自创任何句子（§4.3 原文外裹的「」为排版引号，
 * 入库时去掉）。摊种、棚顶色与位置由几何和试吃共用的 marketStallLayouts 提供。
 *
 * 性能：气泡与试吃图标均为 DOM 覆盖层（参照 #snowball-frost 先例），新增 WebGL draw calls = 0；
 * 气泡池固定 2 个节点复用，每帧只更新已激活气泡的投影；玩家不在集市 12 m 内时零工作量。
 * 音效：本镇没有可供活动复用的共享音频框架（festival.ts 的 AudioContext 为其私有实现），
 * 按最小切片口径跳过，留待声音包阶段统一处理。
 */

export const MARKET_HAWK_RADIUS = 12;
export const MARKET_BUBBLE_LIMIT = 2;
export const MARKET_BUBBLE_SHOW_SECONDS = 3.5;
export const TASTING_DAILY_LIMIT = 3;
export const TASTING_ICON_SECONDS = 1.2;
export const tastingStorageKey = 'unwritten:market-tasting';

export type MarketStall = {
  id: string;
  kind: string;
  canopy: string;
  /** 摊位中心（镇面坐标：东 / 北）。 */
  east: number;
  north: number;
  /** 吆喝气泡锚点的世界高度（棚顶之上）。 */
  anchorY: number;
  /** 柜台前试吃站位（镇面坐标 + 地面高度 + 触发半径）。 */
  spot: { x: number; n: number; ground: number; range: number };
  hawking: readonly string[];
  closing: string;
  icon: string;
};

const stallCopy = {
  糖葫芦: {
    icon: '🍡',
    hawking: ['冰糖葫芦——酸酸甜甜，山楂裹糖稀！', '糖葫芦嘞，小孩吃了乐，大人吃了甜！'],
    closing: '今儿这锅糖稀熬完啦，想吃明儿请早，最亮的那串给你留着！',
  },
  干果炒货: {
    icon: '🥜',
    hawking: ['现炒的瓜子花生，嗑着看烟花，美！', '糖炒栗子，热乎着呢，剥一个尝尝不要钱！'],
    closing: '尝鲜的小碟空啦——明儿新炒一锅，头把瓜子给你抓！',
  },
  吃食: {
    icon: '🌭',
    hawking: ['热乎的烤肠哎——刚出炉，趁热吃！', '炸串炸串，十串管饱，路过别错过！'],
    closing: '锅都见底啦——明儿赶早，头一串留给你！',
  },
  热饮: {
    icon: '🍵',
    hawking: ['热姜茶，喝一碗，雪夜里不冷手！', '羊汤滚烫，加个饼，暖到心里头！'],
    closing: '汤锅都刷干净咯——明儿头一碗，先紧着你盛！',
  },
} as const satisfies Record<ExistingMarketStallKind, { icon: string; hawking: readonly string[]; closing: string }>;

export const marketStalls: readonly MarketStall[] = (() => {
  const plot = layout.plots.find(({ id }) => id === 'market-stalls')!;
  const [originEast, originNorth, base] = plot.origin;
  return marketStallLayouts.map(([localX, localZ, , canopy, kind], index) => {
    const east = originEast + localX;
    const north = originNorth - localZ;
    return {
      id: `market-stall-${index}`,
      kind,
      canopy,
      east,
      north,
      anchorY: base + 6.1,
      // 柜台碰撞面前缘在本地 z +1.96；站位取本地 z +2.6，距柜台 0.64 m，身体不与柜台相交。
      spot: { x: east, n: originNorth - (localZ + 2.6), ground: base, range: 2.4 },
      ...stallCopy[kind],
    };
  });
})();

// ---------------------------------------------------------------------------
// 吆喝轮播（纯逻辑，无 DOM）：半径内摊位轮流亮气泡，同屏 ≤ MARKET_BUBBLE_LIMIT，
// 每条显示 MARKET_BUBBLE_SHOW_SECONDS 后熄灭，间隔 4–7 s 随机再亮下一条（按摊轮换词条）。
// ---------------------------------------------------------------------------

export type HawkingFrame = { stall: number; text: string };
type StallCycle = { line: number; visibleUntil: number; nextAt: number; text: string };

export class HawkingBoard {
  private cycles: StallCycle[];
  private priority: { stall: number; text: string; until: number } | undefined;

  constructor(
    private stalls: readonly MarketStall[],
    private random: () => number = Math.random,
    private showSeconds: number = MARKET_BUBBLE_SHOW_SECONDS,
  ) {
    this.cycles = stalls.map(() => ({ line: 0, visibleUntil: -Infinity, nextAt: Infinity, text: '' }));
  }

  /** 取该摊的下一条吆喝词（推进轮换，试吃反馈用）。 */
  nextLine(stall: number): string {
    const cycle = this.cycles[stall];
    const bank = this.stalls[stall].hawking;
    const text = bank[cycle.line % bank.length];
    cycle.line += 1;
    return text;
  }

  /** 强制某摊立即亮出指定台词（试吃反馈 / 打烊回应），占用一个气泡位。 */
  shout(stall: number, text: string, now: number, seconds = this.showSeconds) {
    this.priority = { stall, text, until: now + seconds };
  }

  /** 计算本帧应渲染的气泡（近者优先，总数 ≤ 上限）。 */
  frame(now: number, playerEast: number, playerNorth: number): HawkingFrame[] {
    const near = this.stalls
      .map((stall, index) => ({
        index,
        distance: Math.hypot(playerEast - stall.east, playerNorth - stall.north),
      }))
      .filter(entry => entry.distance <= MARKET_HAWK_RADIUS)
      .sort((a, b) => a.distance - b.distance);
    const nearSet = new Set(near.map(entry => entry.index));
    this.cycles.forEach((cycle, index) => {
      if (!nearSet.has(index)) {
        // 离开半径即复位：回来时 0.6–1.4 s 内重新开吆喝，不残留旧气泡。
        cycle.visibleUntil = -Infinity;
        cycle.nextAt = Infinity;
      } else if (cycle.nextAt === Infinity) {
        cycle.nextAt = now + .6 + this.random() * .8;
      }
    });
    const frames: HawkingFrame[] = [];
    if (this.priority) {
      if (now > this.priority.until) this.priority = undefined;
      else if (nearSet.has(this.priority.stall)) {
        frames.push({ stall: this.priority.stall, text: this.priority.text });
      }
    }
    for (const { index } of near) {
      if (frames.length >= MARKET_BUBBLE_LIMIT) break;
      if (frames.some(frame => frame.stall === index)) continue;
      const cycle = this.cycles[index];
      if (now <= cycle.visibleUntil) {
        frames.push({ stall: index, text: cycle.text });
        continue;
      }
      if (now >= cycle.nextAt) {
        cycle.text = this.nextLine(index);
        cycle.visibleUntil = now + this.showSeconds;
        cycle.nextAt = cycle.visibleUntil + 4 + this.random() * 3;
        frames.push({ stall: index, text: cycle.text });
      }
    }
    return frames;
  }
}

// ---------------------------------------------------------------------------
// 试吃计数（纯逻辑）：每摊每日 TASTING_DAILY_LIMIT 次，localStorage 按本地日期存账，
// 键名沿用镇上 'unwritten:' 前缀风格（参照 market-activity 的 'unwritten:workshop-lantern'）。
// ---------------------------------------------------------------------------

export type TastingStorage = {
  read(): string | null;
  write(value: string): void;
};
export type TastingLedger = { date: string; counts: number[] };

export function localDateKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function loadTastingLedger(storage: TastingStorage, stallCount: number, now: Date): TastingLedger {
  const today = localDateKey(now);
  try {
    const raw = storage.read();
    const parsed = raw ? JSON.parse(raw) as Partial<TastingLedger> : null;
    if (parsed && parsed.date === today && Array.isArray(parsed.counts)) {
      const stored = parsed.counts;
      return {
        date: today,
        counts: Array.from({ length: stallCount }, (_, index) => {
          const value = stored[index];
          return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
        }),
      };
    }
  } catch { /* 存储损坏或不可用时按新账本处理。 */ }
  return { date: today, counts: Array.from({ length: stallCount }, () => 0) };
}

export function saveTastingLedger(storage: TastingStorage, ledger: TastingLedger) {
  try {
    storage.write(JSON.stringify(ledger));
  } catch { /* 浏览器存储不可用时仅保留本次会话内的账本。 */ }
}

/** 试吃一次：未达上限则记账并返回 served；已达上限返回 served=false（由调用方亮打烊句）。 */
export function tasteOnce(
  storage: TastingStorage, stallCount: number, stallIndex: number, now: Date,
): { served: boolean; count: number } {
  const ledger = loadTastingLedger(storage, stallCount, now);
  if (ledger.counts[stallIndex] >= TASTING_DAILY_LIMIT) {
    return { served: false, count: ledger.counts[stallIndex] };
  }
  ledger.counts[stallIndex] += 1;
  saveTastingLedger(storage, ledger);
  return { served: true, count: ledger.counts[stallIndex] };
}

// ---------------------------------------------------------------------------
// 活动工厂：DOM 气泡池 + 试吃触发点。viewer.ts 只做加法接线（见施工报告）。
// ---------------------------------------------------------------------------

export type MarketFairView = {
  camera: Camera;
  /** 玩家当前镇面位置与是否处于步行模式（轨道俯瞰时不亮气泡）。 */
  player(): { x: number; n: number; walking: boolean };
};

export function createMarketFairActivity(
  context: TownActivityContext, view: MarketFairView,
): TownActivity {
  void context; // 本切片的反馈走气泡 + 图标，不占用活动面板与状态行。
  const board = new HawkingBoard(marketStalls);
  const storage: TastingStorage = {
    read: () => {
      try { return localStorage.getItem(tastingStorageKey); } catch { return null; }
    },
    write: value => {
      try { localStorage.setItem(tastingStorageKey, value); } catch { /* 会话内账本继续可用。 */ }
    },
  };

  const layer = document.createElement('div');
  layer.className = 'market-bubbles';
  layer.setAttribute('aria-hidden', 'true');
  const pool = Array.from({ length: MARKET_BUBBLE_LIMIT }, () => {
    const bubble = document.createElement('div');
    bubble.className = 'market-bubble';
    bubble.hidden = true;
    const text = document.createElement('span');
    bubble.append(text);
    layer.append(bubble);
    return { bubble, text };
  });
  const icon = document.createElement('div');
  icon.className = 'market-taste-icon';
  icon.hidden = true;
  document.body.append(layer, icon);

  let clock = 0;
  let iconTimer = 0;
  const projected = new Vector3();

  function flashIcon(glyph: string) {
    icon.textContent = glyph;
    icon.hidden = false;
    icon.classList.remove('market-taste-icon-show');
    void icon.offsetWidth; // 重启动画：先摘类强制回流，再挂回去。
    icon.classList.add('market-taste-icon-show');
    window.clearTimeout(iconTimer);
    iconTimer = window.setTimeout(() => { icon.hidden = true; }, TASTING_ICON_SECONDS * 1000);
  }

  function taste(index: number) {
    const stall = marketStalls[index];
    const outcome = tasteOnce(storage, marketStalls.length, index, new Date());
    if (!outcome.served) {
      board.shout(index, stall.closing, clock, MARKET_BUBBLE_SHOW_SECONDS + .5);
      return;
    }
    board.shout(index, board.nextLine(index), clock);
    flashIcon(stall.icon);
  }

  return {
    spots: marketStalls.map((stall, index) => ({
      x: stall.spot.x,
      n: stall.spot.n,
      ground: stall.spot.ground,
      range: stall.spot.range,
      label: `试吃${stall.kind}`,
      run: () => taste(index),
    })),
    update(dt) {
      clock += dt;
      const player = view.player();
      if (!player.walking) {
        for (const slot of pool) slot.bubble.hidden = true;
        return;
      }
      const frames = board.frame(clock, player.x, player.n);
      if (!frames.length) {
        for (const slot of pool) slot.bubble.hidden = true;
        return;
      }
      view.camera.updateMatrixWorld();
      pool.forEach((slot, index) => {
        const frame = frames[index];
        if (!frame) {
          slot.bubble.hidden = true;
          return;
        }
        const stall = marketStalls[frame.stall];
        projected.set(stall.east, stall.anchorY, -stall.north).project(view.camera);
        if (projected.z > 1 || projected.z < -1) {
          slot.bubble.hidden = true;
          return;
        }
        slot.bubble.hidden = false;
        if (slot.text.textContent !== frame.text) slot.text.textContent = frame.text;
        const px = (projected.x * .5 + .5) * innerWidth;
        const py = (-projected.y * .5 + .5) * innerHeight;
        slot.bubble.style.transform =
          `translate(-50%, -100%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      });
    },
  };
}
