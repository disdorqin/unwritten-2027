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
    activity: '候车、环镇观景',
    route: '在站台时刻牌查看下一班。去站厅可搭一站，在火车站前站下车。',
  },
  'railway-station': {
    activity: '车票盖章、查班次',
    route: '从站台往东下楼，沿灯走到站厅。售票窗在西侧，时刻表在东侧。',
  },
  'forest-station': {
    activity: '林间木屋、雪路散步',
    route: '从木阶下站，沿有灯的林间小道进入木屋区。',
  },
  'lake-station': {
    activity: '滑冰、冰钓',
    route: '从北侧台阶离开站台，向冰湖南口走，从南岸下到冰面。',
  },
  'ice-castle': {
    activity: '王座就座、取景',
    route: '沿北向接驳道前行，顺着灯路走到城堡西门。',
  },
  'hot-spring': {
    activity: `室外四池泡汤\n${hotSpringPools.map(({ name }) => name).join('、')}`,
    route: '向东下台阶，沿铺石转向北，到浴场西门。',
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
