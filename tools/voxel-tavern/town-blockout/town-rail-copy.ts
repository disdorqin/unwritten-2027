import type { createTownRailway } from './town-railway';
import { railSecondsText } from './town-rail-stops';
import { TOWN_STATION_NAME } from './station-sign-copy';

type Railway = ReturnType<typeof createTownRailway>;
type Stop = Railway['stops'][number];

function rule(railway: Railway) {
  return `本线一圈约 ${railSecondsText(railway.cycleSeconds)} · 每站每圈停靠一次 · 停靠 ${railway.dwellSeconds} 秒`;
}

export function railPlatformCopy(railway: Railway, stop: Stop) {
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
  ].join('\n');
}

export function railHallCopy(railway: Railway) {
  const state = railway.timetable('railway-station');
  const location = state.atStop ? `停靠${state.atStop.label}，即将开往${state.nextStop.label}。` :
    `正开往${state.nextStop.label}，距${state.nextStop.label}约 ${Math.ceil(state.nextMetres)} 米。`;
  return [
    `全线六站（顺环）：${railway.stops.map(stop => stop.label).join(' → ')} → 回${TOWN_STATION_NAME}`,
    `${rule(railway)} · 小镇开放期间循环运行，没有末班车`,
    `列车现在：${location}`,
    state.atPlatform ? '火车站前站：列车停靠中 · 请抓紧上下车' : `下一班到火车站前站：约 ${railSecondsText(state.seconds)}`,
    '乘车请至站外站台（火车站前站）· 出站即小镇，广场往南',
  ].join('\n');
}
