import { icePalaceSite } from './ice-palace-site';
import { TOWN_STATION_NAME } from './station-sign-copy';

export const railPlatforms = [
  { id: 'coaster-station', label: TOWN_STATION_NAME, x: 473.5, n: 224, ground: 19.18, yaw: -Math.PI / 2,
    east: 478, north: 224, railY: 19.68, axis: 'north', halfLength: 24, speed: 11,
    direction: '雪原过山车乘车口在旁 · 红牌是过山车，深牌是火车，别上错车',
    arrival: '换乘过山车的乘客看清牌子——红牌过山车，深牌火车。' },
  { id: 'railway-station', label: '火车站前站', x: 480.5, n: 320, ground: 34.05, yaw: Math.PI / 2,
    east: 477, north: 320, railY: 33.19, axis: 'north', halfLength: 10, speed: 10,
    stairs: { end: [500, 320], axis: 'east' },
    trail: [[500, 320], [500, 317.3], [526, 317.3], [526, 315]],
    direction: '往东一分钟到火车站站厅 · 售票、盖章、大时刻表都在厅里',
    arrival: '去站厅买票、看大时刻表的乘客请下车，往东一分钟。' },
  { id: 'forest-station', label: '森林木屋站', x: 112, n: 416.5, ground: 33.7, yaw: -Math.PI / 2,
    east: 112, north: 420, railY: 32.84, axis: 'east', halfLength: 10, speed: 8.7,
    stairs: { start: [103.8, 415.2], end: [103.8, 407.4], axis: 'south' },
    trail: [[103.8, 407.4], [103.4, 407.3], [101.7, 409.3]],
    direction: '出站即森林木屋区 · 林间雪深，沿灯走',
    arrival: '林子里雪深，下车慢行，沿灯走。' },
  { id: 'lake-station', label: '湖南岸站', x: 350, n: 30.5, ground: 10.46, yaw: 0,
    east: 350, north: 27, railY: 9.6, axis: 'east', halfLength: 10, speed: 11,
    stairs: { end: [350, 44.5], axis: 'north' },
    trail: [[350, 44.5], [350, 48]],
    direction: '冰湖南口在北边 · 滑冰、冰钓从南口下冰，冰面滑，先扶稳',
    arrival: '冰面在南口，鞋底打滑的，先扶稳再下。' },
  { id: 'ice-castle', label: '城堡南站', x: 496, n: 23.5, ground: 10.31, yaw: 0,
    east: 496, north: 20, railY: 9.45, axis: 'east', halfLength: 10, speed: 9,
    stairs: { end: [496, 34], axis: 'north' },
    trail: icePalaceSite.stationTrail,
    direction: '沿接驳小道往北到冰雪城堡 · 走灯亮着的那条',
    arrival: '去城堡的乘客沿小道往北，灯亮着的那条。' },
  { id: 'hot-spring', label: '温泉站', x: 505.5, n: 144, ground: 22.56, yaw: Math.PI / 2,
    east: 502, north: 144, railY: 21.7, axis: 'north', halfLength: 10, speed: 11,
    stairs: { end: [528, 144], axis: 'east' },
    trail: [[528, 144], [528, 145.65], [525.75, 146.4], [524.6, 149.2], [524.6, 157.9], [524, 158]],
    direction: '出站往东到温泉浴场 · 冻透了，先去泡一泡回暖',
    arrival: '泡汤的乘客请下车——车上不回暖，汤里回暖。' },
] as const;

export type RailPlatform = (typeof railPlatforms)[number];
export type TownRailStopId = RailPlatform['id'];
export type TownRailStop = RailPlatform & { distance: number };
export const RAILWAY_STATION_NAMES = railPlatforms.map(stop => stop.label);

export function railSecondsText(seconds: number) {
  const rounded = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(rounded / 60)} 分 ${String(rounded % 60).padStart(2, '0')} 秒`;
}
