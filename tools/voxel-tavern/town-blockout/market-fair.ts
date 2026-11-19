import { Vector3 } from 'three';
import type { Camera } from 'three';
import { layout } from './terrain';
import { marketStallLayouts, marketStallLocalPoint, type MarketStallKind } from './market-stall-layout';
import type { PassportStamp } from './town-passport';
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
  kind: MarketStallKind;
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
  灯笼: {
    icon: '🏮',
    hawking: ['灯笼灯笼，红的亮的，挂门口喜庆一整年！', '手工扎的灯笼，经风经雪，瞧一瞧看一看！'],
    closing: '试点的灯笼都让人挑走啦，明儿新扎的到了，再来掌眼！',
  },
  杂货: {
    icon: '🧺',
    hawking: ['针头线脑小百货，家里缺啥我这有！', '清仓啦清仓啦，年底大甩卖，手快有手慢无！'],
    closing: '样品都试完啦——明儿补了货，您头一个上手！',
  },
  '布匹/围巾': {
    icon: '🧣',
    hawking: ['新到的围巾手套，软和！给媳妇孩子捎一条！', '花布头子便宜卖，做件新衣裳过年啦！'],
    closing: '样巾都摸热乎咯，明儿新货到，您先挑花色！',
  },
  '玩具/套圈': {
    icon: '⭕',
    hawking: ['套圈套圈，一块钱的乐呵，套中啥拿啥！', '拨浪鼓、泥哨子，孩子见了走不动道！'],
    closing: '试玩的圈儿都套走咯，明儿补齐了，您头一个上手！',
  },
  春联年画: {
    icon: '🧧',
    hawking: ['春联年画，福字到家——现写现卖，墨还没干！', '写对联嘞，您出句，我落笔！'],
    closing: '试写的红纸用完啦——明儿墨研足了，头一副给您写！',
  },
} as const satisfies Record<MarketStallKind, { icon: string; hawking: readonly string[]; closing: string }>;

export const marketTastingStamp = {
  id: 'market-nine-tastings', label: '年货集', hint: '9 种全尝',
} as const satisfies PassportStamp;

const marketKinds = new Set<string>(Object.keys(stallCopy));

export const marketStalls: readonly MarketStall[] = (() => {
  const plot = layout.plots.find(({ id }) => id === 'market-stalls')!;
  const [originEast, originNorth] = plot.origin;
  return marketStallLayouts.map(stall => {
    const { id, kind, canopy, x, z, base, counterGround } = stall;
    const [counterX, counterZ] = marketStallLocalPoint(stall, 0, 2.6);
    return {
      id,
      kind,
      canopy,
      east: originEast + x,
      north: originNorth - z,
      anchorY: base + 6.1,
      spot: { x: originEast + counterX, n: originNorth - counterZ, ground: counterGround, range: 2.4 },
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
export type TastingLedger = { date: string; counts: number[]; tastedKinds: MarketStallKind[] };

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
    if (parsed && Array.isArray(parsed.counts)) {
      const stored = parsed.counts;
      const previousCounts = Array.from({ length: stallCount }, (_, index) => {
        const value = stored[index];
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      });
      const tastedKinds = new Set<MarketStallKind>();
      if (Array.isArray(parsed.tastedKinds)) {
        for (const kind of parsed.tastedKinds) if (marketKinds.has(kind)) tastedKinds.add(kind);
      }
      marketStalls.forEach(({ kind }, index) => {
        if (previousCounts[index] > 0) tastedKinds.add(kind);
      });
      return {
        date: today,
        counts: parsed.date === today ? previousCounts : Array<number>(stallCount).fill(0),
        tastedKinds: [...tastedKinds],
      };
    }
  } catch { /* 读不到旧账时从干净的账本继续。 */ }
  return { date: today, counts: Array<number>(stallCount).fill(0), tastedKinds: [] };
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
  if (!Number.isInteger(stallIndex) || stallIndex < 0 || stallIndex >= stallCount) return { served: false, count: 0 };
  const ledger = loadTastingLedger(storage, stallCount, now);
  if (ledger.counts[stallIndex] >= TASTING_DAILY_LIMIT) {
    return { served: false, count: ledger.counts[stallIndex] };
  }
  ledger.counts[stallIndex] += 1;
  const kind = marketStalls[stallIndex]?.kind;
  if (kind && !ledger.tastedKinds.includes(kind)) ledger.tastedKinds.push(kind);
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
  onHotDrink?(): void;
  marketPassport?: { collect(): boolean; collected(): boolean };
};

export function createMarketFairActivity(
  context: TownActivityContext, view: MarketFairView,
): TownActivity {
  void context; // 本切片的反馈走气泡 + 图标，不占用活动面板与状态行。
  const board = new HawkingBoard(marketStalls);
  let sessionLedger: string | null = null;
  let browserWriteFailed = false;
  const storage: TastingStorage = {
    read: () => {
      if (browserWriteFailed) return sessionLedger;
      try { return localStorage.getItem(tastingStorageKey); } catch { return sessionLedger; }
    },
    write: value => {
      sessionLedger = value;
      try {
        localStorage.setItem(tastingStorageKey, value);
        browserWriteFailed = false;
      } catch { browserWriteFailed = true; }
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
  let collectionComplete = !!view.marketPassport &&
    loadTastingLedger(storage, marketStalls.length, new Date()).tastedKinds.length === marketKinds.size;
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
    if (view.marketPassport && !collectionComplete) {
      collectionComplete = loadTastingLedger(storage, marketStalls.length, new Date()).tastedKinds.length === marketKinds.size;
    }
    if (stall.kind === '热饮') view.onHotDrink?.();
    board.shout(index, board.nextLine(index), clock);
    flashIcon(stall.icon);
  }

  const spots: TownActivity['spots'] = marketStalls.map((stall, index) => ({
    ...stall.spot,
    label: `试吃${stall.kind}`,
    run: () => taste(index),
  }));
  const host = marketStalls.find(stall => stall.id === 'market-stall-4');
  if (host && view.marketPassport) {
    const passport = view.marketPassport;
    const ready = () => collectionComplete && !passport.collected();
    spots.push({
      ...host.spot,
      x: host.spot.x - 1.15,
      range: .65,
      label: marketTastingStamp.label,
      available: ready,
      run() { if (ready()) passport.collect(); },
    });
  }

  return {
    spots,
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
