import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ceremonyCuesBetween, ceremonyEveYear, ceremonyMidnight, ceremonyStateAt,
  createCeremonyDirector, createLocalCeremonyClock, createServerCeremonyClock,
  dimLevelAt, frostBaselineAt, snowIntensityAt, type CeremonyCue,
} from '../tools/voxel-tavern/town-blockout/town-ceremony.ts';
import {
  createFrostTracker, frostLevelStyles, frostWarmOffset, frostWarmRate, hasFrostCeremonyRelief,
} from '../tools/voxel-tavern/town-blockout/town-frost.ts';

// 全部时刻用本地时间构造，与实现的设计口径一致（设备本地时间，设计 §3）。
function at(day: number, h = 0, m = 0, s = 0, ms = 0): number {
  return new Date(2026, 11, day, h, m, s, ms).getTime();
}
function atJan(h = 0, m = 0, s = 0, ms = 0): number {
  return new Date(2027, 0, 1, h, m, s, ms).getTime();
}
const midnight = atJan(0, 0, 0);

test('ceremony clocks: local provider and reserved server provider offset', () => {
  let local = 1_000_000;
  const localClock = createLocalCeremonyClock(() => local);
  assert.equal(localClock.now(), 1_000_000);

  const serverClock = createServerCeremonyClock(() => local);
  assert.equal(serverClock.offsetMs(), 0);
  assert.equal(serverClock.now(), local);
  serverClock.calibrate(local + 5_000); // 服务端比本地快 5 秒
  assert.equal(serverClock.offsetMs(), 5_000);
  assert.equal(serverClock.now(), local + 5_000);
  local += 1_000;
  assert.equal(serverClock.now(), local + 5_000);
  serverClock.calibrate(local - 2_000); // 重新校准覆盖旧偏移
  assert.equal(serverClock.now(), local - 2_000);
});

test('the shared rehearsal calendar plays the countdown and midnight in UTC+08:00', () => {
  const chinaMidnight = Date.parse('2027-01-01T00:00:00+08:00');
  let simulation = chinaMidnight - 10_001;
  const cues: CeremonyCue[] = [];
  const director = createCeremonyDirector({ now: () => simulation, utcOffsetMinutes: 480 }, {
    onCue: cue => cues.push(cue),
  });
  assert.equal(ceremonyMidnight(2026, 480), chinaMidnight);
  assert.equal(director.update().phase, 'approach');
  simulation++;
  assert.equal(director.update().phase, 'countdown');
  assert.equal(director.state().secondsToMidnight, 10);
  simulation += 10_000;
  assert.equal(director.update().phase, 'climax');
  assert.deepEqual(cues.flatMap(cue => cue.type === 'countdown-tick' ? [cue.secondsLeft] : []),
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.ok(cues.some(cue => cue.type === 'new-year' && cue.at === chinaMidnight));
});

test('ceremony eve year resolves the right cycle around midnight', () => {
  assert.equal(ceremonyMidnight(2026), midnight);
  assert.equal(ceremonyEveYear(at(31, 12)), 2026);
  assert.equal(ceremonyEveYear(atJan(1, 30)), 2026); // 1 月 1 日凌晨仍属 2026 跨年夜
  assert.equal(ceremonyEveYear(atJan(3)), 2027);     // 02:00 后归下一周期
  assert.equal(ceremonyEveYear(new Date(2026, 5, 15).getTime()), 2026); // 年中指向将到的一场
});

test('ceremony phases follow the design timeline', () => {
  const phase = (t: number) => ceremonyStateAt(t).phase;
  assert.equal(phase(new Date(2026, 5, 15).getTime()), 'ordinary');
  assert.equal(phase(at(31, 12)), 'standby');
  assert.equal(phase(at(31, 19, 59)), 'standby');
  assert.equal(phase(at(31, 20, 0)), 'mailbox');
  assert.equal(phase(at(31, 21, 29)), 'mailbox');
  assert.equal(phase(at(31, 21, 30)), 'evening');
  assert.equal(phase(at(31, 22, 59)), 'evening');
  assert.equal(phase(at(31, 23, 0)), 'converge');
  assert.equal(phase(at(31, 23, 49)), 'converge');
  assert.equal(phase(at(31, 23, 50)), 'approach');
  assert.equal(phase(at(31, 23, 59, 49)), 'approach');
  assert.equal(phase(at(31, 23, 59, 50)), 'countdown');
  assert.equal(phase(midnight), 'climax');
  assert.equal(phase(atJan(0, 0, 29)), 'climax');
  assert.equal(phase(atJan(0, 0, 30)), 'afterglow');
  assert.equal(phase(atJan(0, 59)), 'afterglow');
  assert.equal(phase(atJan(1, 0)), 'ordinary');
});

test('snow intensity curve: tiers, 10-minute ramps, post-midnight falloff', () => {
  assert.equal(snowIntensityAt(new Date(2026, 5, 15).getTime()), 1);
  assert.equal(snowIntensityAt(at(31, 19, 0)), 1);
  assert.equal(snowIntensityAt(at(31, 19, 55)), 1);
  assert.ok(Math.abs(snowIntensityAt(at(31, 20, 0)) - 1.5) < 1e-9); // 20:00 正在过渡中点
  assert.equal(snowIntensityAt(at(31, 20, 5)), 2);
  assert.equal(snowIntensityAt(at(31, 21, 0)), 2);
  assert.ok(Math.abs(snowIntensityAt(at(31, 21, 30)) - 2.5) < 1e-9);
  assert.equal(snowIntensityAt(at(31, 21, 35)), 3);
  assert.ok(Math.abs(snowIntensityAt(at(31, 23, 0)) - 3.5) < 1e-9);
  assert.equal(snowIntensityAt(at(31, 23, 5)), 4);
  assert.equal(snowIntensityAt(at(31, 23, 59)), 4);
  assert.equal(snowIntensityAt(midnight), 4);
  assert.ok(Math.abs(snowIntensityAt(atJan(0, 5)) - 3) < 1e-9);  // 10 分钟内 4→2 回落
  assert.equal(snowIntensityAt(atJan(0, 10)), 2);
  assert.equal(snowIntensityAt(atJan(0, 30)), 2);
  assert.equal(snowIntensityAt(atJan(1, 0)), 1);

  // 档间无跳变：19:50–23:10 每分钟采样，单步变化不超过 1 档/10 分钟的斜率。
  let previous = snowIntensityAt(at(31, 19, 50));
  for (let t = at(31, 19, 51); t <= at(31, 23, 10); t += 60_000) {
    const value = snowIntensityAt(t);
    assert.ok(Math.abs(value - previous) <= .1 + 1e-9, `snow jump at ${new Date(t)}`);
    previous = value;
  }
});

test('frost baseline follows the shared ceremony curve and decays fast after midnight', () => {
  assert.equal(frostBaselineAt(new Date(2026, 5, 15).getTime()), 0);
  assert.equal(frostBaselineAt(at(31, 19, 59)), 0);
  assert.equal(frostBaselineAt(at(31, 20, 0)), 1);
  assert.equal(frostBaselineAt(at(31, 21, 29)), 1);
  assert.equal(frostBaselineAt(at(31, 21, 30)), 2);
  assert.equal(frostBaselineAt(at(31, 22, 59)), 2);
  assert.equal(frostBaselineAt(at(31, 23, 0)), 3);
  assert.equal(frostBaselineAt(at(31, 23, 59, 59)), 3);
  assert.equal(frostBaselineAt(atJan(0, 0, 19)), 3);
  assert.equal(frostBaselineAt(atJan(0, 0, 20)), 2);
  assert.equal(frostBaselineAt(atJan(0, 0, 39)), 2);
  assert.equal(frostBaselineAt(atJan(0, 0, 40)), 1);
  assert.equal(frostBaselineAt(atJan(0, 0, 59)), 1);
  assert.equal(frostBaselineAt(atJan(0, 1, 0)), 0);
});

test('dim level: 60% from 23:50, 30% for the final ten seconds, restored at midnight', () => {
  assert.equal(dimLevelAt(at(31, 23, 49)), 1);
  assert.equal(dimLevelAt(at(31, 23, 50)), .6);
  assert.equal(dimLevelAt(at(31, 23, 59, 49)), .6);
  assert.equal(dimLevelAt(at(31, 23, 59, 50)), .3);
  assert.equal(dimLevelAt(at(31, 23, 59, 59)), .3);
  assert.equal(dimLevelAt(midnight), 1);
});

test('cue table for the whole evening matches the design cue sheet', () => {
  const cues = ceremonyCuesBetween(at(31, 19, 59), atJan(0, 1));
  const byType = (type: CeremonyCue['type']) => cues.filter(cue => cue.type === type);

  assert.deepEqual(byType('mailbox-open').map(c => c.at), [at(31, 20)]);
  assert.deepEqual(byType('hourly-chime').map(c => (c as { hour: number }).hour), [21, 22, 23]);
  assert.deepEqual(
    byType('lights-dim').map(c => [(c as { level: number }).level, c.at]),
    [[.6, at(31, 23, 50)], [.3, at(31, 23, 59, 50)], [1, midnight]],
  );

  const ticks = byType('countdown-tick') as Array<{ secondsLeft: number; at: number }>;
  assert.deepEqual(ticks.map(c => c.secondsLeft), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(ticks.map(c => c.at), Array.from({ length: 10 }, (_, i) => midnight - (10 - i) * 1000));

  assert.deepEqual(byType('new-year').map(c => c.at), [midnight]);

  const strikes = byType('grand-strike') as Array<{ index: number; at: number }>;
  assert.equal(strikes.length, 12);
  assert.deepEqual(strikes.map(c => c.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(strikes.map(c => c.at), Array.from({ length: 12 }, (_, i) => midnight + i * 2020));
  assert.ok(strikes[11].at <= midnight + 24_000); // 第 12 下约在 T+24 s 前（设计 §3.4）

  const bands = byType('bloom-band') as Array<{ band: number; at: number }>;
  assert.deepEqual(bands.map(c => [c.band, c.at]),
    [[0, midnight], [1, midnight + 600], [2, midnight + 1200], [3, midnight + 1800]]);

  assert.deepEqual(byType('fireworks-main').map(c => c.at), [midnight + 1000]);
  assert.deepEqual(byType('fireworks-far').map(c => c.at), [midnight + 8000]);
  assert.deepEqual(byType('fireworks-finale').map(c => c.at), [midnight + 14_000]);
  assert.deepEqual(byType('climax-end').map(c => c.at), [midnight + 30_000]);

  // 全表按时刻升序、无重复时刻+类型。
  const keys = cues.map(c => `${c.type}@${c.at}`);
  assert.equal(new Set(keys).size, keys.length);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].at >= cues[i - 1].at);

  // 空窗口与非跨年夜窗口无 cue。
  assert.deepEqual(ceremonyCuesBetween(midnight, midnight), []);
  assert.deepEqual(ceremonyCuesBetween(new Date(2026, 5, 15).getTime(), new Date(2026, 5, 16).getTime()), []);
});

test('director fires each cue once, in order, across the midnight boundary', () => {
  let now = at(31, 23, 59, 45);
  const fired: CeremonyCue[] = [];
  const director = createCeremonyDirector({ now: () => now }, { onCue: cue => fired.push(cue) });
  director.update(); // 首帧只对齐，不补放
  for (let s = 0; s <= 50; s++) {
    now += 1000;
    director.update();
  }
  const types = fired.map(c => c.type);
  assert.deepEqual(types.filter(t => t === 'countdown-tick').length, 10);
  assert.equal(types.filter(t => t === 'new-year').length, 1);
  assert.equal(types.filter(t => t === 'grand-strike').length, 12);
  assert.equal(types.filter(t => t === 'bloom-band').length, 4);
  assert.equal(types.filter(t => t === 'climax-end').length, 1);
  const newYearIndex = types.indexOf('new-year');
  assert.ok(types.lastIndexOf('countdown-tick') < newYearIndex);
  assert.ok(newYearIndex < types.indexOf('grand-strike') || types.indexOf('grand-strike') === newYearIndex + 2);
  for (let i = 1; i < fired.length; i++) assert.ok(fired[i].at >= fired[i - 1].at);
});

test('director state during countdown and late join without replay', () => {
  let now = at(31, 23, 59, 55);
  const director = createCeremonyDirector({ now: () => now });
  const state = director.update();
  assert.equal(state.phase, 'countdown');
  assert.ok(Math.abs((state.secondsToMidnight ?? 0) - 5) < 1e-9);
  assert.equal(state.frostBaseline, 3);
  assert.equal(state.dimLevel, .3);

  // 迟入 10 秒：已错过的 new-year / 前几下大敲不补放（设计 §5），但状态立即正确。
  let late = midnight + 10_000;
  const fired: CeremonyCue[] = [];
  const lateDirector = createCeremonyDirector({ now: () => late }, { onCue: cue => fired.push(cue) });
  const lateState = lateDirector.update();
  assert.equal(lateState.phase, 'climax');
  assert.equal(lateState.frostBaseline, 3);
  assert.ok(lateState.snowIntensity > 3.9); // 仍在 4 档高位，正沿零点后回落曲线缓降
  late += 25_000;
  lateDirector.update();
  assert.ok(!fired.some(c => c.type === 'new-year'));
  assert.ok(!fired.some(c => c.type === 'grand-strike' && (c as { index: number }).index <= 5));
  assert.ok(fired.some(c => c.type === 'climax-end'));
});

test('director reports frost baseline changes through the hook', () => {
  let now = at(31, 19, 0);
  const seen: number[] = [];
  const director = createCeremonyDirector({ now: () => now }, { onFrostBaseline: level => seen.push(level) });
  director.update();
  for (const t of [at(31, 20, 30), at(31, 22, 0), at(31, 23, 30), atJan(0, 2)]) {
    now = t;
    director.update();
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 0]);
});

test('director initializes weather and dimming hooks before emitting changes', () => {
  let now = at(31, 19, 0);
  const snow: number[] = [];
  const dim: number[] = [];
  const director = createCeremonyDirector({ now: () => now }, {
    onSnowIntensity: level => snow.push(level),
    onDim: level => dim.push(level),
  });
  director.update();
  director.update();
  assert.deepEqual(snow, [1]);
  assert.deepEqual(dim, [1]);
  now = at(31, 23, 51);
  director.update();
  assert.deepEqual(snow, [1, 4]);
  assert.deepEqual(dim, [1, .6]);
});

test('frost tracker: instant sync on first update, then 1 level per 20 s both ways', () => {
  const tracker = createFrostTracker();
  tracker.setBaseline(3);
  assert.equal(tracker.update(0.016), 3); // 迟入立即补齐，不从 0 爬
  assert.equal(tracker.displayLevel(), 3);

  tracker.setWarmth('interior', true);
  assert.equal(tracker.warming(), true);
  assert.ok(Math.abs(tracker.update(20) - 2) < 1e-9);
  assert.ok(Math.abs(tracker.update(20) - (3 - frostWarmOffset)) < 1e-9);
  assert.ok(Math.abs(tracker.update(120) - (3 - frostWarmOffset)) < 1e-9); // 压到基线 −2 为止

  tracker.setWarmth('interior', false);
  assert.equal(tracker.warming(), false);
  assert.ok(Math.abs(tracker.update(40) - 3) < 1e-9); // 离开回暖点后同样速率回基线

  tracker.setBaseline(0); // 零点后基线消退
  assert.ok(Math.abs(tracker.update(3 / frostWarmRate) - 0) < 1e-9);
  assert.equal(tracker.displayLevel(), 0);
});

test('frost tracker: any single warmth source is enough, floor is level 0', () => {
  const tracker = createFrostTracker();
  tracker.setBaseline(1);
  tracker.update(0.016);
  tracker.setWarmth('onsen', true);
  tracker.setWarmth('fire-source', true);
  tracker.setWarmth('onsen', false);
  assert.equal(tracker.warming(), true); // 还有火源
  assert.ok(Math.abs(tracker.update(20) - 0) < 1e-9); // 基线 1 − 2 压到 0 为止
  tracker.setWarmth('fire-source', false);
  assert.ok(Math.abs(tracker.update(20) - 1) < 1e-9);
});

test('frost exposure follows the snow curve, full depth pressure and calm-weather decay', () => {
  const tracker = createFrostTracker();
  tracker.update(600);
  assert.equal(tracker.exposure(), 0);
  tracker.setExposure(3, 0, true, false);
  assert.equal(tracker.update(135), 1);
  assert.equal(tracker.walkingScale(), 1);
  assert.equal(tracker.update(135), 2);

  tracker.setExposure(1.9, 0, true, false);
  assert.equal(tracker.update(120), 1);
  tracker.setExposure(4, 0, false, false);
  assert.equal(tracker.update(90), 1);
  tracker.setExposure(4, 0, true, false);
  assert.equal(tracker.update(90), 2);

  tracker.setExposure(3, .6, true, false);
  assert.equal(tracker.update(90), 3);
  assert.equal(tracker.walkingScale(), .8);
});

test('fastest warmth source lowers exposure while the old ceremony baseline keeps its rate', () => {
  const tracker = createFrostTracker();
  tracker.setBaseline(3);
  tracker.setExposure(4, 0, true, false);
  assert.equal(tracker.update(270), 3);
  tracker.setWarmth('interior', true);
  tracker.setWarmth('onsen', true);
  tracker.setWarmth('fire-source', true);
  assert.equal(tracker.update(15), 2.25);
  assert.equal(tracker.exposure(), 0);
  tracker.setWarmth('fire-source', false);
  tracker.setWarmth('onsen', false);
  tracker.setWarmth('interior', false);
  tracker.update(270);
  assert.equal(tracker.exposure(), 3);

  tracker.drinkHot();
  assert.equal(tracker.exposure(), 2);
  tracker.drinkHot();
  assert.equal(tracker.exposure(), 1);
  tracker.update(10);
  assert.equal(tracker.exposure(), 0);

  for (const [source, seconds] of [['fire-source', 15], ['onsen', 24], ['interior', 30]] as const) {
    const fresh = createFrostTracker();
    fresh.setExposure(4, 0, true, false);
    fresh.update(270);
    fresh.setWarmth(source, true);
    assert.equal(fresh.update(seconds), 0, source);
  }
});

test('ceremony relief halves pressure and caps L3 walking drag without changing the visible level', () => {
  const tracker = createFrostTracker();
  const relieved = hasFrostCeremonyRelief(ceremonyStateAt(at(31, 23, 30)));
  assert.equal(relieved, true);
  assert.equal(hasFrostCeremonyRelief(ceremonyStateAt(at(31, 21))), false);
  assert.equal(hasFrostCeremonyRelief(ceremonyStateAt(atJan(0, 29, 59))), true);
  assert.equal(hasFrostCeremonyRelief(ceremonyStateAt(atJan(0, 30))), false);

  tracker.setExposure(4, 0, true, relieved);
  assert.equal(tracker.update(180), 1);
  tracker.setBaseline(3);
  tracker.update(60);
  assert.equal(tracker.displayLevel(), 3);
  assert.equal(tracker.walkingScale(), .9);

  tracker.setExposure(4, 0, true, false);
  assert.equal(tracker.walkingScale(), .8);
  assert.equal(tracker.walkingScale(false), 1);
  assert.equal(tracker.displayLevel(), 3);
  assert.ok(Math.abs(.62 * tracker.walkingScale() - .496) < 1e-10);
});

test('frost level styles match the design bands', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map(level => frostLevelStyles[level as 0 | 1 | 2 | 3].opacity),
    [0, .25, .5, .75],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map(level => frostLevelStyles[level as 0 | 1 | 2 | 3].band),
    [0, .06, .12, .22],
  );
  assert.equal(frostLevelStyles[3].breath, true);
  assert.equal(frostLevelStyles[2].breath, false);
});
