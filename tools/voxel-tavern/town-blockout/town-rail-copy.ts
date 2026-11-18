import { townCeremonyMidnight } from '../../../src/presence/ceremony-arrival';
import { hotSpringPools } from './hot-spring-soak';
import type { createTownRailway } from './town-railway';
import { railPlatforms, railSecondsText, type TownRailStopId } from './town-rail-stops';
import { TOWN_STATION_NAME } from './station-sign-copy';

type Railway = ReturnType<typeof createTownRailway>;
type Stop = Railway['stops'][number];

// 站牌时刻表文案-v1 §1.4，节日提示只使用仪式日历，不参与列车相位计算。
export const railOvernightCopy = '跨年夜通宵运行 · 23:30 起班次配合广场仪式，请留意站台广播';
const overnightBoardOpensAt = townCeremonyMidnight - 24 * 60 * 60_000;
const overnightBroadcastStartsAt = townCeremonyMidnight - 30 * 60_000;

export function railOvernightBoardCopy(now: number): string {
  return now >= overnightBoardOpensAt && now < townCeremonyMidnight ? railOvernightCopy : '';
}

export function createRailOvernightBroadcast() {
  let delivered = false;
  return (now: number, atRailway: () => boolean): string => {
    if (delivered || now < overnightBroadcastStartsAt || now >= townCeremonyMidnight || !atRailway()) return '';
    delivered = true;
    return railOvernightCopy;
  };
}

const railDestinationGuide = {
  'coaster-station': {
    activity: '雪橇、环镇观景',
    route: '站台东侧有雪橇架。想环镇观景，可以在时刻牌查看发车时间。去站厅请搭一站，在火车站前站下车。',
  },
  'railway-station': {
    activity: '车票盖章、查班次',
    route: '从站台往东下楼，沿灯路进站厅南门。到西侧售票窗盖车票戳，西墙看总台，东侧查实时班次。',
  },
  'forest-station': {
    activity: '林间木屋、雪路散步',
    route: '从木阶下站，沿有灯的林间小道进入木屋区。',
  },
  'lake-station': {
    activity: '滑冰、冰钓',
    route: '从北侧台阶离站，沿雪路去冰湖南岸。到东侧换鞋点可自由滑行或沿金灯门计时，到西侧钓位可抛竿。',
  },
  'ice-castle': {
    activity: '王座就座、取景',
    route: '向北下台阶，再沿灯路往西绕到城堡西门。进大厅可在王座就座或保存取景。',
  },
  'hot-spring': {
    activity: `室外四池泡汤\n${hotSpringPools.map(({ name }) => name).join('、')}`,
    route: '向东下台阶，沿铺石转向北，从浴场西门进四池区。到池边选一池入水回暖。',
  },
} satisfies Record<TownRailStopId, { activity: string; route: string }>;

const guideStops = railPlatforms.map(({ id, label }) => ({ label, ...railDestinationGuide[id] }));

export const railHallGuide = {
  title: '全图玩法总台',
  board: guideStops.map(({ label, activity }) => `${label} · ${activity}`).join('\n'),
  description: guideStops.map(({ label, activity, route }) => `${label} · ${activity}\n${route}`).join('\n\n'),
};

function rule(railway: Railway) {
  return `本线一圈约 ${railSecondsText(railway.cycleSeconds)} · 每站每圈停靠一次 · 停靠 ${railway.dwellSeconds} 秒`;
}

export function railPlatformCopy(railway: Railway, stop: Stop, now: number) {
  const index = railway.stops.findIndex(candidate => candidate.id === stop.id);
  const later = [...railway.stops.slice(index + 1), ...railway.stops.slice(0, index)];
  const state = railway.timetable(stop.id);
  return [
    `顺环方向 · 依次经 ${later.map(candidate => candidate.label).join('、')} 回到${stop.label}`,
    `本站　下一站：${later[0].label}`,
    rule(railway),
    state.atPlatform ? '列车停靠中 · 请抓紧上下车' : `下一班约 ${railSecondsText(state.seconds)} 后到站`,
    stop.direction,
    '雪天路滑 · 请在黄线外候车',
    railOvernightBoardCopy(now),
  ].filter(Boolean).join('\n');
}

export function railHallCopy(railway: Railway, now: number) {
  const state = railway.timetable('railway-station');
  const location = state.atStop ? `停靠${state.atStop.label}，即将开往${state.nextStop.label}。` :
    `正开往${state.nextStop.label}，距${state.nextStop.label}约 ${Math.ceil(state.nextMetres)} 米。`;
  return [
    `全线六站（顺环）：${railway.stops.map(stop => stop.label).join(' → ')} → 回${TOWN_STATION_NAME}`,
    `${rule(railway)} · 小镇开放期间循环运行，没有末班车`,
    `列车现在：${location}`,
    state.atPlatform ? '火车站前站：列车停靠中 · 请抓紧上下车' : `下一班到火车站前站：约 ${railSecondsText(state.seconds)}`,
    '乘车请至站外站台（火车站前站）· 出站即小镇，广场往南',
    railOvernightBoardCopy(now),
  ].filter(Boolean).join('\n');
}
