import { townDayMs, townDaylightMs } from '../../../src/shared/town-night-window';

/**
 * ZB-41 · Crater-post guard handover lines — the text is supplied
 * verbatim by the coordinator （文本-交班台词与石沉水位引路词
 * -2026-11-22, batch 74); this leaf only owns WHEN each exchange
 * plays and in what order. Three handovers a day at the sentry棚：
 * dawn （孙小山 → 罗大年）, noon （罗大年 → 田守义）, and just
 * before dusk （田守义 → 孙小山）. A passer-by overhears; nothing
 * blocks the road and nothing pops a dialog box （听 = one of the
 * three touches). Names follow the fixed roster; the living know
 * their post and nothing more.
 */

export type HandoverShift = 'morning' | 'midday' | 'evening';
export type HandoverLine = Readonly<{ speaker: string; text: string; aside?: string }>;
export type HandoverExchange = Readonly<{ shift: HandoverShift; from: string; to: string; lines: readonly HandoverLine[] }>;

/** Each spoken line holds about four seconds before the next voice. */
export const handoverLineMs = 4_000;

export const craterHandoverExchanges: readonly HandoverExchange[] = [
  {
    shift: 'morning', from: '孙小山', to: '罗大年',
    lines: [
      { speaker: '孙小山', text: '大年叔，夜里安生。栅栏那头塌口我又去看了一眼，没新脚印。' },
      { speaker: '罗大年', text: '嗯。塌口别自己下去，记上一笔就行。' },
      { speaker: '孙小山', text: '记了。就是……昨儿后半夜，坑底好像有动静，像谁在底下挪东西。' },
      { speaker: '罗大年', text: '风。坑里的风，夜里都这样。回去睡吧，娃。', aside: '笑' },
    ],
  },
  {
    shift: 'midday', from: '罗大年', to: '田守义',
    lines: [
      { speaker: '罗大年', text: '守义，牌给你。上午来了两个后生想进去看稀奇，我请他们去镇上喝热汤了。' },
      { speaker: '田守义', text: '做得对。里头没什么稀奇，净是烂铁和黑石头，看了还压运气。' },
      { speaker: '罗大年', text: '补给站那边石九斤的人下午要过料，你放行，别拦错了。' },
      { speaker: '田守义', text: '放心。有登记的过，没登记的——天王老子也得在栅栏外头站着。' },
    ],
  },
  {
    shift: 'evening', from: '田守义', to: '孙小山',
    lines: [
      { speaker: '田守义', text: '小山，夜班还是老规矩——' },
      { speaker: '孙小山', text: '知道，夜里不入。我就坐哨棚里，灯笼挂高点，谁来也不开门。' },
      { speaker: '田守义', text: '对喽。夜里听见什么都别应，听见有人喊你名字，更别应。' },
      { speaker: '孙小山', text: '守义叔，你每回都说这句，我从小听到大了。', aside: '笑' },
      { speaker: '田守义', text: '我也是从小听我爹说的。' },
    ],
  },
];

/** Handover moments within one town day, as offsets from dawn. */
const handoverAtMs: Record<HandoverShift, number> = {
  morning: 0,
  midday: townDaylightMs / 2,
  evening: townDaylightMs - 30_000,
};

/**
 * The exchange playing at `now`, and how far into it we are — or
 * undefined outside the three short handover windows.
 */
export function craterHandoverAt(now: number, dawnEpoch: number): { exchange: HandoverExchange; elapsedMs: number } | undefined {
  if (!Number.isFinite(now) || now < dawnEpoch) return undefined;
  const intoDay = (now - dawnEpoch) % townDayMs;
  for (const exchange of craterHandoverExchanges) {
    const start = handoverAtMs[exchange.shift];
    const elapsedMs = intoDay - start;
    if (elapsedMs >= 0 && elapsedMs < exchange.lines.length * handoverLineMs) return { exchange, elapsedMs };
  }
  return undefined;
}

/** The line being spoken `elapsedMs` into an exchange. */
export function handoverLineAt(exchange: HandoverExchange, elapsedMs: number): HandoverLine | undefined {
  if (elapsedMs < 0) return undefined;
  return exchange.lines[Math.floor(elapsedMs / handoverLineMs)];
}
