import { workshopMonkeySteps } from './landmark-market';
import type { CharmSite } from './town-zodiac-atlas';

type Point = readonly [number, number, number];

export const greenhouseRabbitSite: CharmSite = {
  id: 'rabbit', stand: [-1.8, .206, 4.31], object: [-1.59, 1.09, 5.12], yaw: Math.PI, range: .26,
};
export function towerDragonSite(lookout: Point): CharmSite {
  return {
    id: 'dragon', stand: [-.84, lookout[1], 1.3125], object: [-1.33, lookout[1] + .06, 1.24], yaw: Math.PI / 2, range: .17,
  };
}
export const hotSpringPigSite: CharmSite = {
  id: 'pig', stand: [-5.40, .18, -10.97], object: [-4.98, .18, -11], yaw: -Math.PI / 2, range: .24,
};
const monkeyPlatform = workshopMonkeySteps[3];
export const lanternWorkshopMonkeySite: CharmSite = {
  id: 'monkey', stand: monkeyPlatform,
  object: [monkeyPlatform[0] - .42, monkeyPlatform[1], monkeyPlatform[2]],
  yaw: Math.PI / 2, range: .30,
};

export const towerDragonClues = [
  "寻龙？听钟。钟声起处，塔顶梁角——登塔的路一阶不能少，爬到观景台，往内侧梁角看。脚步放稳，别贪快。",
  "本站提醒：真龙不在地面停留。钟楼的台阶走完，龙影自现。下塔原路返回，注意脚下积雪。",
] as const;
export const workshopMonkeyClues = [
  "我工坊的梁上藏着个灵猴。踩着工作台上木箱，一级一级跳——别逞能一蹦三尺高，摔下来我可不赔汤药。",
  "花灯影子最密的那根横梁，猴就躲在影里。你顺着灯影找，上到梁边平台，探手就能摸着。手稳，心更要稳。",
] as const;
