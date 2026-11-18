// 跨年夜仪式时钟与 cue 编排（设计：《跨年夜仪式与中心广场设计-v1》§3/§4.4/§5）。
// 本模块只负责「什么时候发生什么」：仪式阶段、雪势强度曲线、冻纹基线、零点 cue 表。
// 它不播放钟声、不放烟花、不改灯光——cue 通过 hooks 发出，实际编排由 festival /
// tower-chime / town-lights / snowfall 侧按契约消费（见 reports/ceremony-client.md）。
// 纯逻辑核心不碰 DOM，Node 测试可用假时钟驱动；DOM 叠层在文件末尾的
// createCeremonyOverlay（倒数大字 / 渐暗 / 横幅，全部零 WebGL 绘制）。

export type FrostLevel = 0 | 1 | 2 | 3;

export type CeremonyPhase =
  | 'ordinary'      // 非跨年夜时段：雪势 1 档、冻纹关
  | 'standby'       // 12-31 白天至 20:00 前：仪式待机
  | 'mailbox'       // 20:00–21:30：第一幕开箱 + 暖场，雪 2 档、冻 L1
  | 'evening'       // 21:30–23:00：雪 3 档、冻 L2
  | 'converge'      // 23:00–23:50：大雪 4 档、冻 L3，人流向广场收
  | 'approach'      // 23:50–23:59:50：灯光渐收至 6 成
  | 'countdown'     // 23:59:50–00:00：十秒倒数，灯光 3 成
  | 'climax'        // 00:00–00:00:30：大敲 12 下 + 绽放 + 烟花主秀
  | 'afterglow';    // 00:00:30–01:00：余韵，雪势回落、冻纹已消

export type CeremonyCue =
  | { type: 'mailbox-open'; at: number }
  | { type: 'hourly-chime'; at: number; hour: number; strikes: 3 }
  | { type: 'lights-dim'; at: number; level: number }
  | { type: 'countdown-tick'; at: number; secondsLeft: number }
  | { type: 'new-year'; at: number }
  | { type: 'grand-strike'; at: number; index: number; total: 12 }
  | { type: 'bloom-band'; at: number; band: number; bands: 4 }
  | { type: 'fireworks-main'; at: number }
  | { type: 'fireworks-far'; at: number }
  | { type: 'fireworks-finale'; at: number }
  | { type: 'climax-end'; at: number };

export interface CeremonyState {
  now: number;
  phase: CeremonyPhase;
  /** 连续雪势强度（1–4 档之间线性插值），与冻纹共用同一条仪式曲线（设计 §4.4）。 */
  snowIntensity: number;
  frostBaseline: FrostLevel;
  /** 目标场景亮度系数 0–1（1 = 常态）。本模块只发信号/叠层近似，真实灯光由 GPT 侧消费。 */
  dimLevel: number;
  /** 距零点秒数；只在跨年夜 23:00 后给出，其余为 null。 */
  secondsToMidnight: number | null;
}

// ---------------------------------------------------------------- 时钟提供者

/** 编排层只依赖这个接口（设计 §5）：单人版给本地提供者，多人版给服务端提供者。 */
export interface CeremonyClock {
  now(): number;
}

/** 单人版：设备本地时间，与时光信箱 UNLOCK_AT 的本地口径同源（设计 §3）。 */
export function createLocalCeremonyClock(now: () => number = () => Date.now()): CeremonyClock {
  return { now };
}

export interface ServerCeremonyClock extends CeremonyClock {
  /** presence 连接/周期校准时以服务端 epoch 调用；本期只存偏移，传输由 GPT 侧接。 */
  calibrate(serverEpochMs: number): void;
  offsetMs(): number;
}

/** 多人版预留：now() = 本地时钟 + 最近一次校准偏移。未校准时偏移为 0，等价本地时钟。 */
export function createServerCeremonyClock(localNow: () => number = () => Date.now()): ServerCeremonyClock {
  let offset = 0;
  return {
    now: () => localNow() + offset,
    calibrate(serverEpochMs: number) { offset = serverEpochMs - localNow(); },
    offsetMs: () => offset,
  };
}

// ---------------------------------------------------------------- 时间轴（设备本地时间）

const minute = 60_000;
const hour = 60 * minute;

/** 某年跨年夜的零点（次年 1 月 1 日 00:00 本地时间）。eveYear = 12-31 所在年份。 */
export function ceremonyMidnight(eveYear: number): number {
  return new Date(eveYear + 1, 0, 1, 0, 0, 0, 0).getTime();
}

function eveDayStart(eveYear: number): number {
  return new Date(eveYear, 11, 31, 0, 0, 0, 0).getTime();
}

/** 找到 now 所属（或即将到来）的跨年夜周期年份；窗口外返回最近的下一场。 */
export function ceremonyEveYear(now: number): number {
  const year = new Date(now).getFullYear();
  // 1 月 1 日凌晨 02:00 前仍属上一年的跨年夜周期。
  if (now < ceremonyMidnight(year - 1) + 2 * hour) return year - 1;
  if (now < ceremonyMidnight(year) + 2 * hour) return year;
  return year + 1;
}

function phaseAt(now: number, eveYear: number): CeremonyPhase {
  const start = eveDayStart(eveYear);
  const midnight = ceremonyMidnight(eveYear);
  if (now < start || now >= midnight + hour) return 'ordinary';
  if (now < start + 20 * hour) return 'standby';
  if (now < start + 21.5 * hour) return 'mailbox';
  if (now < start + 23 * hour) return 'evening';
  if (now < midnight - 10 * minute) return 'converge';
  if (now < midnight - 10_000) return 'approach';
  if (now < midnight) return 'countdown';
  if (now < midnight + 30_000) return 'climax';
  return 'afterglow';
}

// 雪势 knots：[距零点毫秒偏移, 档位]。档间 10 分钟线性过渡（设计 §3.2），
// 零点后 10 分钟内由 4 档回落 2 档，01:00 前回到基线 1 档（设计 §3.1）。
const snowKnots: ReadonlyArray<readonly [number, number]> = [
  [-4 * hour - 5 * minute, 1],
  [-3 * hour - 55 * minute, 2],
  [-2 * hour - 35 * minute, 2],
  [-2 * hour - 25 * minute, 3],
  [-hour - 5 * minute, 3],
  [-55 * minute, 4],
  [0, 4],
  [10 * minute, 2],
  [50 * minute, 2],
  [hour, 1],
];

export function snowIntensityAt(now: number): number {
  const eveYear = ceremonyEveYear(now);
  const midnight = ceremonyMidnight(eveYear);
  const offset = now - midnight;
  if (offset < snowKnots[0][0] || offset > hour) return 1;
  for (let i = 1; i < snowKnots.length; i++) {
    const [t1, v1] = snowKnots[i];
    if (offset > t1) continue;
    const [t0, v0] = snowKnots[i - 1];
    return v0 + (v1 - v0) * (offset - t0) / (t1 - t0);
  }
  return 1;
}

export function frostBaselineAt(now: number): FrostLevel {
  const eveYear = ceremonyEveYear(now);
  const start = eveDayStart(eveYear);
  const midnight = ceremonyMidnight(eveYear);
  if (now < start + 20 * hour) return 0;
  if (now < start + 21.5 * hour) return 1;
  if (now < start + 23 * hour) return 2;
  if (now < midnight + 20_000) return 3;
  if (now < midnight + 40_000) return 2;
  if (now < midnight + 60_000) return 1;
  return 0;
}

export function dimLevelAt(now: number): number {
  const eveYear = ceremonyEveYear(now);
  const midnight = ceremonyMidnight(eveYear);
  if (now >= midnight - 10_000 && now < midnight) return .3;
  if (now >= midnight - 10 * minute && now < midnight - 10_000) return .6;
  return 1;
}

export function ceremonyStateAt(now: number): CeremonyState {
  const eveYear = ceremonyEveYear(now);
  const midnight = ceremonyMidnight(eveYear);
  const phase = phaseAt(now, eveYear);
  return {
    now,
    phase,
    snowIntensity: snowIntensityAt(now),
    frostBaseline: frostBaselineAt(now),
    dimLevel: dimLevelAt(now),
    secondsToMidnight: phase === 'converge' || phase === 'approach' || phase === 'countdown'
      ? (midnight - now) / 1000
      : null,
  };
}

// ---------------------------------------------------------------- cue 表（设计 §3.4）

/** 某一周期内全部 cue 的发生时刻（未排序过滤前）。 */
function cycleCues(eveYear: number): CeremonyCue[] {
  const start = eveDayStart(eveYear);
  const midnight = ceremonyMidnight(eveYear);
  const cues: CeremonyCue[] = [
    { type: 'mailbox-open', at: start + 20 * hour },
    { type: 'lights-dim', at: midnight - 10 * minute, level: .6 },
    { type: 'lights-dim', at: midnight - 10_000, level: .3 },
    { type: 'lights-dim', at: midnight, level: 1 },
    { type: 'new-year', at: midnight },
    { type: 'fireworks-main', at: midnight + 1_000 },
    { type: 'fireworks-far', at: midnight + 8_000 },
    { type: 'fireworks-finale', at: midnight + 14_000 },
    { type: 'climax-end', at: midnight + 30_000 },
  ];
  for (const h of [21, 22, 23]) {
    cues.push({ type: 'hourly-chime', at: start + h * hour, hour: h, strikes: 3 });
  }
  for (let s = 10; s >= 1; s--) {
    cues.push({ type: 'countdown-tick', at: midnight - s * 1000, secondsLeft: s });
  }
  for (let i = 1; i <= 12; i++) {
    cues.push({ type: 'grand-strike', at: midnight + (i - 1) * 2020, index: i, total: 12 });
  }
  for (let band = 0; band < 4; band++) {
    cues.push({ type: 'bloom-band', at: midnight + band * 600, band, bands: 4 });
  }
  return cues;
}

/** (from, to] 窗口内应触发的 cue，按时刻升序。纯函数，测试直接断言。 */
export function ceremonyCuesBetween(from: number, to: number): CeremonyCue[] {
  if (to <= from) return [];
  const years = new Set([ceremonyEveYear(from), ceremonyEveYear(to)]);
  const found: CeremonyCue[] = [];
  for (const year of years) {
    for (const cue of cycleCues(year)) {
      if (cue.at > from && cue.at <= to) found.push(cue);
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- 编排器

export interface CeremonyHooks {
  onCue?(cue: CeremonyCue): void;
  /** 雪势连续值变化时（GPT 侧 snowfall 强度 uniform 消费；本期仅暴露）。 */
  onSnowIntensity?(value: number): void;
  onFrostBaseline?(level: FrostLevel): void;
  onDim?(level: number): void;
}

export interface CeremonyDirector {
  /** 每帧调用：推进 cue 并返回当前状态。迟入/重连不补放已错过的 cue（设计 §5）。 */
  update(): CeremonyState;
  state(): CeremonyState;
}

export function createCeremonyDirector(clock: CeremonyClock, hooks: CeremonyHooks = {}): CeremonyDirector {
  let lastNow: number | undefined;
  let scheduledYear: number | undefined;
  let schedule: CeremonyCue[] = [];
  let lastSnow: number | undefined;
  let lastFrost: FrostLevel | undefined;
  let lastDim: number | undefined;
  let current = ceremonyStateAt(clock.now());

  function update(): CeremonyState {
    const now = clock.now();
    const year = ceremonyEveYear(now);
    if (scheduledYear !== year) {
      scheduledYear = year;
      schedule = cycleCues(year).sort((a, b) => a.at - b.at);
    }
    if (lastNow !== undefined && now > lastNow) {
      for (const cue of schedule) {
        if (cue.at > now) break;
        if (cue.at > lastNow) hooks.onCue?.(cue);
      }
    }
    lastNow = now;
    current = ceremonyStateAt(now);
    if (lastSnow === undefined || Math.abs(current.snowIntensity - lastSnow) > .001) {
      lastSnow = current.snowIntensity;
      hooks.onSnowIntensity?.(current.snowIntensity);
    }
    if (current.frostBaseline !== lastFrost) {
      lastFrost = current.frostBaseline;
      hooks.onFrostBaseline?.(current.frostBaseline);
    }
    if (lastDim === undefined || Math.abs(current.dimLevel - lastDim) > .001) {
      lastDim = current.dimLevel;
      hooks.onDim?.(current.dimLevel);
    }
    return current;
  }

  return { update, state: () => current };
}

// ---------------------------------------------------------------- DOM 叠层（浏览器侧）

export interface CeremonyOverlayElements {
  dim: HTMLElement;
  countdown: HTMLElement;
  banner: HTMLElement;
}

export interface CeremonyOverlayOptions {
  /** true（默认）：渐暗由本叠层以黑幕近似；GPT 侧接真实灯光渐暗后置 false，只保留 cue 信号。 */
  dimOverlay?: boolean;
  reducedMotion?: { matches: boolean };
}

/** 倒数大字 / 渐暗黑幕 /「新年快乐」横幅。全部 DOM，零 WebGL 绘制、零逐帧成本（仅状态变化时写样式）。 */
export function createCeremonyOverlay(elements: CeremonyOverlayElements, options: CeremonyOverlayOptions = {}) {
  const dimOverlay = options.dimOverlay !== false;
  let shownSeconds: number | null = null;
  let bannerTimer: number | undefined;

  function apply(state: CeremonyState) {
    const seconds = state.secondsToMidnight;
    const display = seconds !== null && seconds <= 60 && seconds > 0 ? Math.ceil(seconds) : null;
    if (display !== shownSeconds) {
      shownSeconds = display;
      elements.countdown.textContent = display === null ? '' : String(display);
      elements.countdown.classList.toggle('final', display !== null && display <= 10);
    }
    if (dimOverlay) {
      const opacity = String(Math.round((1 - state.dimLevel) * .72 * 100) / 100);
      if (elements.dim.style.opacity !== opacity) elements.dim.style.opacity = opacity;
    }
  }

  function cue(cue: CeremonyCue) {
    if (cue.type !== 'new-year') return;
    elements.banner.hidden = false;
    elements.banner.classList.add('show');
    if (bannerTimer !== undefined) window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      elements.banner.classList.remove('show');
      elements.banner.hidden = true;
    }, options.reducedMotion?.matches ? 12_000 : 9_000);
  }

  return { apply, cue };
}
