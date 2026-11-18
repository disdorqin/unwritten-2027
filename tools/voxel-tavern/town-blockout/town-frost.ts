// 原冻纹基线继续由仪式曲线驱动。寒意设计 v1 把个人暴露与基线取较高值，
// 两条通道共用该等级。移动系数仅由 viewer 在着地步行分支消费。
import type { CeremonyState, FrostLevel } from './town-ceremony';

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

const exposureWarmRates: Record<WarmthSource, number> = {
  'fire-source': 1 / 5, onsen: 1 / 8, interior: 1 / 10, 'hot-drink': 1 / 10,
};

export function hasFrostCeremonyRelief({ phase, now }: Pick<CeremonyState, 'phase' | 'now'>) {
  return phase === 'converge' || phase === 'approach' || phase === 'countdown' ||
    phase === 'climax' || (phase === 'afterglow' && new Date(now).getMinutes() < 30);
}

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
  drinkHot(): void;
  setExposure(intensity: number, depth: number, exposed: boolean, ceremonyRelief: boolean, mobilityFactor?: number): void;
  exposure(): number;
  walkingScale(enabled?: boolean): number;
  warming(): boolean;
  /** 推进 dt 秒，返回当前个人等级（浮点，便于渲染平滑插值）。 */
  update(dtSeconds: number): number;
  personal(): number;
  /** 当前应呈现的离散等级（取整后），供 data-level / 呼吸雾开关使用。 */
  displayLevel(): FrostLevel;
}

export function createFrostTracker(): FrostTracker {
  let baseline: FrostLevel = 0;
  let baselinePersonal = 0;
  let exposure = 0;
  let snowIntensity = 1;
  let exposureGrowth = 0;
  let warmRate = 0;
  let relief = false;
  let synced = false;
  const warmth = new Set<WarmthSource>();
  const personal = () => Math.max(baselinePersonal, exposure);
  const displayLevel = () => Math.round(personal()) as FrostLevel;

  function setWarmth(source: WarmthSource, active: boolean) {
    if (warmth.has(source) === active) return;
    if (active) warmth.add(source);
    else warmth.delete(source);
    warmRate = 0;
    for (const current of warmth) warmRate = Math.max(warmRate, exposureWarmRates[current]);
  }

  return {
    setBaseline(level: FrostLevel) { baseline = level; },
    baseline: () => baseline,
    setWarmth,
    drinkHot() {
      exposure = Math.max(0, exposure - 1);
      setWarmth('hot-drink', true);
    },
    setExposure(intensity, depth, exposed, ceremonyRelief, mobilityFactor = 1) {
      snowIntensity = Number.isFinite(intensity) ? Math.min(4, Math.max(1, intensity)) : 1;
      relief = ceremonyRelief;
      exposureGrowth = exposed && snowIntensity >= 2
        ? (snowIntensity - 1) / 270 * (depth >= .6 ? 1.5 : 1) * (relief ? .5 : 1) *
          (Number.isFinite(mobilityFactor) ? Math.max(0, mobilityFactor) : 1)
        : 0;
    },
    exposure: () => exposure,
    walkingScale(enabled = true) {
      if (!enabled) return 1;
      const level = displayLevel();
      return level === 3 && !relief ? .80 : level >= 2 ? .90 : 1;
    },
    warming: () => warmth.size > 0,
    update(dtSeconds: number) {
      const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
      const goal = warmth.size > 0 ? Math.max(0, baseline - frostWarmOffset) : baseline;
      if (!synced) {
        synced = true;
        baselinePersonal = goal;
      } else {
        const step = frostWarmRate * dt;
        if (baselinePersonal < goal) baselinePersonal = Math.min(goal, baselinePersonal + step);
        else if (baselinePersonal > goal) baselinePersonal = Math.max(goal, baselinePersonal - step);
      }
      const rate = warmRate > 0 ? -warmRate : snowIntensity < 2 ? -1 / 120 : exposureGrowth;
      exposure = clampLevel(exposure + rate * dt);
      return personal();
    },
    personal,
    displayLevel,
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
    const tintOpacity = String(Math.round(style.tint * 100) / 100);
    if (tint && tint.style.opacity !== tintOpacity) tint.style.opacity = tintOpacity;
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
    setWarmth: tracker.setWarmth,
    setExposure: tracker.setExposure,
    drinkHot: tracker.drinkHot,
    walkingScale: () => tracker.walkingScale(enabled),
    setEnabled(next: boolean) { enabled = next; render(); },
    enabled: () => enabled,
    update(dtSeconds: number) {
      tracker.update(dtSeconds);
      render();
    },
    tracker,
  };
}
