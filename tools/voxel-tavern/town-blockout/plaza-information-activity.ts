import type { TownActivity } from './town-activity';
import { ceremonyEveYear, ceremonyMidnight, ceremonyStateAt, type CeremonyClock } from './town-ceremony';
import { railSecondsText } from './town-rail-stops';

type LivePanel = (title: string, read: () => string) => void;

export type PlazaInformationSources = {
  clock: CeremonyClock;
  train(): { seconds: number; atPlatform: boolean };
  /** The same joined membership, including the local player, used by the presence HUD. */
  roster(): readonly string[] | undefined;
  stage(now: number): string | undefined;
  formalSnowFight(): boolean;
  latestWish(): string | undefined;
};

export const plazaInformationSites = {
  countdown: { x: 211.4, n: 193.6, stand: 192.4 },
  board: { x: 234, n: 208, stands: [205.55, 210.45] },
} as const;

const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;
const wishPreviewLength = 34;

function countdownText(seconds: number) {
  if (seconds <= 0) return '新年快乐！';
  if (seconds <= 10 * minute) return `距跨年 ${Math.ceil(seconds)} 秒`;
  if (seconds <= hour) return `距跨年 ${railSecondsText(seconds)}`;
  if (seconds <= day) {
    const minutes = Math.ceil(seconds / minute);
    return `距跨年 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
  }
  return `距跨年 ${Math.ceil(seconds / day)} 天`;
}

export function readPlazaCountdown(clock: CeremonyClock) {
  const now = clock.now();
  const offset = clock.utcOffsetMinutes;
  return countdownText((ceremonyMidnight(ceremonyEveYear(now, offset), offset) - now) / 1000);
}

export function readPlazaInformation(sources: PlazaInformationSources) {
  const { clock } = sources;
  const now = clock.now();
  const ceremony = ceremonyStateAt(now, clock.utcOffsetMinutes);
  const names = sources.roster();
  const town = names === undefined ? '在线名册尚未连接' : [
    `同镇 ${names.length} 人`,
    ...(names.length > 0 && names.length <= 8 ? [names.join('、')] : []),
  ].join('\n');

  const train = sources.train();
  const departure = train.atPlatform ? '环镇列车停靠中' : `下一班环镇列车约 ${railSecondsText(train.seconds)} 后到站`;

  let tonight: string;
  if (ceremony.phase === 'approach' || ceremony.phase === 'countdown') {
    tonight = countdownText(ceremony.secondsToMidnight!);
  } else if (ceremony.phase === 'climax' || ceremony.phase === 'afterglow') {
    tonight = '新年快乐！';
  } else {
    const events = [sources.stage(now), sources.formalSnowFight() ? '广场正式雪仗进行中' : undefined];
    tonight = events.filter(Boolean).join(' · ') || '今晚暂无场次公告';
  }

  const wish = Array.from(sources.latestWish()?.trim().replace(/\s+/gu, ' ') ?? '');
  const wishLine = wish.length > wishPreviewLength
    ? `${wish.slice(0, wishPreviewLength).join('')}…`
    : wish.join('');

  return [
    `镇况\n${town}`,
    `列车\n${departure}\n未写镇站 · 出广场向东，经中央桥 →`,
    `今晚\n${tonight}`,
    `许愿\n${wishLine || '许愿树还没有祝福'}\n沿广场北缘向西 → 许愿树`,
  ].join('\n\n');
}

/** Register after the phase-two plaza props and collision are ready. */
export function createPlazaInformationActivity(
  showLive: LivePanel,
  sources: PlazaInformationSources,
  groundAt: (x: number, n: number) => number,
  canStand: (x: number, n: number, ground: number) => boolean,
): TownActivity {
  const { countdown, board } = plazaInformationSites;
  const points = [
    { x: countdown.x, n: countdown.stand, range: .68,
      title: '跨年倒计时', read: () => readPlazaCountdown(sources.clock) },
    ...board.stands.map(n => ({
      x: board.x, n, range: .60, title: '广场公告板', read: () => readPlazaInformation(sources),
    })),
  ];
  const spots = points.map(({ x, n, range, title, read }) => ({
    x, n, ground: groundAt(x, n), range, label: `查看${title}`,
    run: () => showLive(title, read),
  }));
  return { spots: spots.filter(({ x, n, ground }) => canStand(x, n, ground)) };
}
