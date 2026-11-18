// 仪式冻纹叠层（设计：《跨年夜仪式与中心广场设计-v1》§4）。
// 寒冷等级只写这个 DOM 叠层：不掉血、不减速、不锁交互、不写任何玩法状态（§4.3 红线）。
// 基线等级由仪式时钟曲线给出（town-ceremony 的 frostBaselineAt，与雪势共用一条曲线）；
// 个人回暖只降低自己的表现等级：身处回暖点时以约 1 级/20 秒向「基线 −2」消退，
// 离开后以同样速率回到基线。纯逻辑的 FrostTracker 与 DOM 渲染分离，前者可单测。

import type { FrostLevel } from './town-ceremony';

export type WarmthSource = 'interior' | 'onsen' | 'hot-drink' | 'fire-source';

/** 每级的表现参数（设计 §4.1）：band = 霜带约占屏宽比例，tint = 冷色片不透明度。 */
export const frostLevelStyles: Record<FrostLevel, { opacity: number; band: number; tint: number; breath: boolean }> = {
  0: { opacity: 0, band: 0, tint: 0, breath: false },
  1: { opacity: .25, band: .06, tint: 0, breath: false },
  2: { opacity: .5, band: .12, tint: .08, breath: false },
  3: { opacity: .75, band: .22, tint: .14, breath: true },
};

/** 回暖速率：1 级 / 20 秒（设计 §4.2）。 */
export const frostWarmRate = 1 / 20;
/** 回暖最多把个人等级压到基线以下 2 级（设计 §4.2 的「−1~2 级」取上限）。 */
export const frostWarmOffset = 2;

function clampLevel(value: number): number {
  return Math.min(3, Math.max(0, value));
}

function lerpStyle(personal: number) {
  const low = Math.floor(clampLevel(personal)) as FrostLevel;
  const high = Math.ceil(clampLevel(personal)) as FrostLevel;
  const mix = clampLevel(personal) - low;
  const a = frostLevelStyles[low];
  const b = frostLevelStyles[high];
  return {
    opacity: a.opacity + (b.opacity - a.opacity) * mix,
    band: a.band + (b.band - a.band) * mix,
    tint: a.tint + (b.tint - a.tint) * mix,
    breath: personal > 2.5,
    level: (Math.round(clampLevel(personal)) as FrostLevel),
  };
}

export interface FrostTracker {
  setBaseline(level: FrostLevel): void;
  baseline(): FrostLevel;
  setWarmth(source: WarmthSource, active: boolean): void;
  warming(): boolean;
  /** 推进 dt 秒，返回当前个人等级（浮点，便于渲染平滑插值）。 */
  update(dtSeconds: number): number;
  personal(): number;
  /** 当前应呈现的离散等级（取整后），供 data-level / 呼吸雾开关使用。 */
  displayLevel(): FrostLevel;
}

export function createFrostTracker(): FrostTracker {
  let baseline: FrostLevel = 0;
  let personal = 0;
  let synced = false;
  const warmth = new Set<WarmthSource>();

  function target(): number {
    return warmth.size > 0 ? Math.max(0, baseline - frostWarmOffset) : baseline;
  }

  return {
    setBaseline(level: FrostLevel) { baseline = level; },
    baseline: () => baseline,
    setWarmth(source: WarmthSource, active: boolean) {
      if (active) warmth.add(source);
      else warmth.delete(source);
    },
    warming: () => warmth.size > 0,
    update(dtSeconds: number) {
      // 首次更新直接对齐目标：迟入/重连的玩家冻纹状态立即补齐（设计 §5），不从 0 慢慢爬。
      if (!synced) {
        synced = true;
        personal = target();
        return personal;
      }
      const goal = target();
      const step = frostWarmRate * Math.max(0, dtSeconds);
      if (personal < goal) personal = Math.min(goal, personal + step);
      else if (personal > goal) personal = Math.max(goal, personal - step);
      return personal;
    },
    personal: () => personal,
    displayLevel: () => Math.round(clampLevel(personal)) as FrostLevel,
  };
}

// ---------------------------------------------------------------- DOM 渲染（浏览器侧）

export interface CeremonyFrostOptions {
  /** 设置里的冻纹开关；false 时叠层整体隐藏（设计 §4.1 可关）。 */
  enabled?: boolean;
  reducedMotion?: { matches: boolean };
}

/**
 * #ceremony-frost 叠层控制器。子元素约定（town-blockout.html）：
 * .frost-edges（frost 纹理 + 径向 mask，只露边缘）、.frost-tint（冷色片）、
 * .frost-breath（L3 呼吸雾，纯 CSS 动画）。与雪球命中的 #snowball-frost 相互独立。
 * 渲染只在等级浮点值变化时写样式，静止时零成本；零 WebGL 绘制。
 */
export function createCeremonyFrost(root: HTMLElement, options: CeremonyFrostOptions = {}) {
  const edges = root.querySelector<HTMLElement>('.frost-edges');
  const tint = root.querySelector<HTMLElement>('.frost-tint');
  const breath = root.querySelector<HTMLElement>('.frost-breath');
  const tracker = createFrostTracker();
  let enabled = options.enabled !== false;
  let lastOpacity = '';
  let lastLevel: FrostLevel | undefined;
  let lastPersonal = Number.NaN;
  let lastEnabled: boolean | undefined;
  let lastReduced: boolean | undefined;

  function render() {
    const personal = tracker.personal();
    const reduced = options.reducedMotion?.matches === true;
    if (personal === lastPersonal && enabled === lastEnabled && reduced === lastReduced) return;
    lastPersonal = personal;
    lastEnabled = enabled;
    lastReduced = reduced;
    const style = lerpStyle(personal);
    root.hidden = !enabled || (style.opacity <= 0 && style.tint <= 0);
    if (root.hidden) return;
    const opacity = String(Math.round(style.opacity * 100) / 100);
    if (edges && opacity !== lastOpacity) {
      lastOpacity = opacity;
      edges.style.opacity = opacity;
    }
    if (tint) tint.style.opacity = String(Math.round(style.tint * 100) / 100);
    if (style.level !== lastLevel) {
      lastLevel = style.level;
      root.dataset.level = String(style.level);
    }
    if (breath) {
      breath.hidden = !(style.breath && !reduced);
    }
  }

  render();

  function mountSettings(parent: HTMLElement) {
    const key = 'unwritten.town-ceremony.frost.v1';
    try {
      if (localStorage.getItem(key) === 'off') enabled = false;
    } catch { /* The session control still works without storage. */ }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '仪式冻纹';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.addEventListener('click', () => {
      enabled = !enabled;
      toggle.setAttribute('aria-pressed', String(enabled));
      render();
      try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Keep the session setting. */ }
    });
    render();
    parent.append(toggle);
  }

  return {
    mountSettings,
    setBaseline: (level: FrostLevel) => tracker.setBaseline(level),
    setWarmth: (source: WarmthSource, active: boolean) => tracker.setWarmth(source, active),
    setEnabled(next: boolean) { enabled = next; render(); },
    enabled: () => enabled,
    update(dtSeconds: number) {
      tracker.update(dtSeconds);
      render();
    },
    tracker,
  };
}
