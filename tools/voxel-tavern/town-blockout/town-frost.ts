// 原冻纹基线继续由仪式曲线驱动。寒意设计 v1 把个人暴露与基线取较高值，
// 两条通道共用该等级。移动系数仅由 viewer 在着地步行分支消费。
import type { CeremonyState, FrostLevel } from './town-ceremony';

export type WarmthSource = 'interior' | 'onsen' | 'hot-drink' | 'fire-source';
export type FrostExposure = 'none' | 'dark-snow' | 'lamp' | 'water';
const naturalThawRate = 1 / 120;
const exposureRate = 1 / 270;
const maskClear = [100, 83, 73, 62] as const;
const blurByLevel = [0, 0, 1.15, 3.2] as const;
export const wetColdMultiplier = 2;

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

export function sampleFrostStyle(personal: number) {
  const low = Math.floor(clampLevel(personal)) as FrostLevel;
  const high = Math.ceil(clampLevel(personal)) as FrostLevel;
  const mix = clampLevel(personal) - low;
  const a = frostLevelStyles[low];
  const b = frostLevelStyles[high];
  return {
    opacity: a.opacity + (b.opacity - a.opacity) * mix,
    band: a.band + (b.band - a.band) * mix,
    tint: a.tint + (b.tint - a.tint) * mix,
    clearPercent: maskClear[low] + (maskClear[high] - maskClear[low]) * mix,
    blur: blurByLevel[low] + (blurByLevel[high] - blurByLevel[low]) * mix,
    breath: personal > 2.5,
    level: (Math.round(clampLevel(personal)) as FrostLevel),
  };
}

export interface FrostTracker {
  setBaseline(level: FrostLevel): void;
  baseline(): FrostLevel;
  setWarmth(source: WarmthSource, active: boolean): void;
  drinkHot(): void;
  setExposure(intensity: number, depth: number, surface: FrostExposure | boolean, ceremonyRelief: boolean, mobilityFactor?: number): void;
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
  let exposureGrowth = 0;
  let naturallyThaws = true;
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
    setExposure(intensity, depth, input, ceremonyRelief, mobilityFactor = 1) {
      const surface = input === true ? 'dark-snow' : input === false ? 'none' : input;
      const snowIntensity = Number.isFinite(intensity) ? Math.min(4, Math.max(1, intensity)) : 1;
      relief = ceremonyRelief;
      naturallyThaws = surface === 'lamp' || (surface !== 'water' && snowIntensity < 2);
      const snowPressure = surface === 'dark-snow' && snowIntensity >= 2 ? (snowIntensity - 1) * (depth >= .6 ? 1.5 : 1) : 0;
      const wetPressure = surface === 'water' ? Math.max(1, snowIntensity - 1) * wetColdMultiplier : 0;
      exposureGrowth = (snowPressure + wetPressure) * exposureRate * (relief ? .5 : 1) *
        (Number.isFinite(mobilityFactor) ? Math.max(0, mobilityFactor) : 1);
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
      const rate = warmRate > 0 ? -warmRate : naturallyThaws ? -naturalThawRate : exposureGrowth;
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
  scene?: HTMLElement;
  announce?: (text: string) => void;
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
  const melt = root.querySelector<HTMLElement>('.frost-melt');
  const tracker = createFrostTracker();
  let enabled = options.enabled !== false;
  let visibleLevel = 0;
  let meltFilm = 0;
  let fireRecovery = false;
  let fireActive = false;
  let lastPaint = '';
  let lastReduced = false;

  function paintOpacity(node: HTMLElement | null, value: number) {
    if (!node) return;
    const opacity = String(Math.round(value * 100) / 100);
    if (node.style.opacity !== opacity) node.style.opacity = opacity;
  }

  function render() {
    const reduced = options.reducedMotion?.matches === true;
    lastReduced = reduced;
    const style = sampleFrostStyle(visibleLevel);
    const blur = enabled ? Math.round(style.blur * 10) / 10 : 0;
    const clear = Math.round(style.clearPercent * 2) / 2;
    const film = enabled ? Math.round(meltFilm * 24) / 100 : 0;
    const opacity = Math.round(style.opacity * 100);
    const tintOpacity = Math.round(style.tint * 100);
    const paint = `${enabled}:${style.level}:${opacity}:${tintOpacity}:${blur}:${clear}:${film}:${reduced}`;
    if (paint === lastPaint) return;
    lastPaint = paint;
    root.hidden = !enabled || (opacity <= 0 && tintOpacity <= 0 && film <= 0);
    const filter = blur > 0 ? `blur(${blur}px)` : '';
    if (options.scene && options.scene.style.filter !== filter) options.scene.style.filter = filter;
    if (root.hidden) return;
    paintOpacity(edges, style.opacity);
    paintOpacity(tint, style.tint);
    paintOpacity(melt, film);
    root.style.setProperty('--frost-clear', `${clear}%`);
    root.dataset.level = String(style.level);
    if (breath) breath.hidden = !(style.breath && !reduced);
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
    setWarmth(source: WarmthSource, active: boolean) {
      if (source === 'fire-source') {
        if (!active) fireRecovery = false;
        else if (tracker.exposure() > .5) fireRecovery = true;
        fireActive = active;
      }
      tracker.setWarmth(source, active);
    },
    setExposure: tracker.setExposure,
    drinkHot: tracker.drinkHot,
    walkingScale: () => tracker.walkingScale(enabled),
    setEnabled(next: boolean) { enabled = next; render(); },
    enabled: () => enabled,
    update(dtSeconds: number) {
      const previousLevel = tracker.displayLevel();
      const target = tracker.update(dtSeconds);
      const wasVisible = visibleLevel;
      const previousFilm = meltFilm;
      const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
      // Keep the immediate hot-drink effect in the tracker while visibly melting the view.
      visibleLevel = target >= visibleLevel ? target : Math.max(target, visibleLevel - dt * 2.75);
      meltFilm = visibleLevel < wasVisible ? Math.min(1, meltFilm + dt * 3)
        : Math.max(0, meltFilm - dt * 1.2);
      if (enabled && previousLevel < 3 && tracker.displayLevel() === 3) {
        options.announce?.('冷得迈不开步了——找个火堆烤烤火。');
      }
      if (fireActive && fireRecovery && tracker.exposure() <= 1e-8) {
        fireRecovery = false;
        if (enabled) options.announce?.('身上暖和过来了。');
      }
      if (wasVisible !== visibleLevel || previousFilm !== meltFilm || lastReduced !== (options.reducedMotion?.matches === true)) render();
    },
    tracker,
  };
}
