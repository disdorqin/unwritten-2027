import type { SummitExpeditionSite } from './main-summit-expedition-sites';

export type ExpeditionContact = 'view' | 'listen' | 'touch';
export type ExpeditionActivityPoint = Readonly<{ east: number; north: number; height: number }>;
type Kind = 'shelter' | 'observatory' | 'icefall' | 'summit-flag' | 'machine-hall';
type State = Readonly<{ touches: number; views: number; listens: number; complete: boolean }>;
export type ExpeditionActivityReply =
  | Readonly<{ accepted: false; reason: 'not-authorized' | 'out-of-reach' | 'unknown-site' }>
  | Readonly<{
    accepted: true; siteId: string; action: ExpeditionContact; copy: string;
    progress: number; complete: boolean;
  }>;

export const summitExpeditionActivityScript: Record<Kind, Readonly<{
  view: string; listen: string; steps: readonly [string, ...string[]]; finished: string;
}>> = {
  shelter: {
    view: '石木窝棚四壁厚实，火塘旁还有未燃尽的松木。',
    listen: '柴火噼啪作响，外面的山风被石墙削成细声。',
    steps: ['你添了一截干柴，火塘亮了一点。', '火光爬上梁木，屋里暖和了。', '火塘烧稳了，留一簇火给晚归人。'],
    finished: '火塘已经添足，别浪费守山人的干柴。',
  },
  observatory: {
    view: '断裂黄铜环下散着三块刻着星位的石板。',
    listen: '风从断环孔洞穿过，发出极短的哨声。',
    steps: ['第一块星板推入台心。', '第二块星板对上了边缘的凹痕。', '第三块星板合拢，台心亮起半幅旧星图。'],
    finished: '半幅旧星图已经拼好，另一半仍在云海外。',
  },
  icefall: {
    view: '高悬四十米的冰瀑里有细小气泡，六枚旧绳桩沿冰面向上。',
    listen: '冰层低低作响，像远处尚未结完的河。',
    steps: [
      '你摇了第一枚绳桩，纹丝不动。', '第二枚绳桩下是旧时绳结。',
      '第三枚绳桩牢牢吃住了岩石。', '第四枚绳桩旁的冰层完整。',
      '第五枚绳桩还留着守山人的布条。', '六枚绳桩检查完毕，但攀冰仍须正式规则许可。',
    ],
    finished: '六枚绳桩已经检查过，未取得登冰授权。',
  },
  'summit-flag': {
    view: '五色经幡掠过石圈，镇上和云海的灯都落在山下。',
    listen: '经幡在风里拍打，石圈间有细碎的风铃声。',
    steps: ['你在黄铜三角标石旁留下今年登顶的一笔。'],
    finished: '这一年的绝顶回望已经留下痕迹。',
  },
  'machine-hall': {
    view: '二线检修房里有锈闸、两组轮盘和一枚沉重配重。',
    listen: '停机轮组发出很轻的金属弹响，没有开车的声音。',
    steps: ['你检查了锈闸的齿边。', '你查看了上轮组和备用缆盘。', '配重保持在检修位；机房仍待正式抢修授权。'],
    finished: '已做完机房勘察；抢修与发车只能由正式状态机决定。',
  },
};

const toKind = (id: string): Kind | undefined =>
  id.includes('shelter') ? 'shelter' :
  id.includes('watch-ruins') ? 'observatory' :
  id.includes('icefall') ? 'icefall' :
  id.includes('summit-flag') ? 'summit-flag' :
  id.includes('machine-room') ? 'machine-hall' : undefined;

/**
 * Local review of the six scene story hooks. It does NOT unlock P-2 cable
 * stations, publish multiplayer achievements, or authenticate a client. The
 * official world must call only after its own proximity/identity receipts.
 */
export function createSummitExpeditionActivities(sites: readonly SummitExpeditionSite[]) {
  const stations = new Map<string, { site: SummitExpeditionSite; kind: Kind;
    touches: number; views: number; listens: number }>();
  for (const site of sites) {
    const kind = toKind(site.id);
    if (kind) stations.set(site.id, { site, kind, touches: 0, views: 0, listens: 0 });
  }
  function snapshot(): Readonly<Record<string, State>> {
    return Object.fromEntries([...stations.entries()].map(([id, station]) => {
      const script = summitExpeditionActivityScript[station.kind];
      return [id, { touches: station.touches, views: station.views, listens: station.listens,
        complete: station.touches >= script.steps.length }];
    }));
  }
  function interact(args: Readonly<{
    siteId: string; action: ExpeditionContact; player: ExpeditionActivityPoint;
    authorized: boolean;
  }>): ExpeditionActivityReply {
    const station = stations.get(args.siteId);
    if (!station || !['view', 'listen', 'touch'].includes(args.action)) {
      return { accepted: false, reason: 'unknown-site' };
    }
    if (!args.authorized) return { accepted: false, reason: 'not-authorized' };
    const { site } = station;
    if (![args.player?.east, args.player?.north, args.player?.height].every(Number.isFinite) ||
        Math.hypot(args.player.east - site.east, args.player.north - site.north) >
          (station.kind === 'icefall' ? 10 : station.kind === 'observatory' ? 8 : 4.9) ||
        Math.abs(args.player.height - site.height) > 3.8) {
      return { accepted: false, reason: 'out-of-reach' };
    }
    const script = summitExpeditionActivityScript[station.kind];
    let copy: string;
    if (args.action === 'view') { station.views++; copy = script.view; }
    else if (args.action === 'listen') { station.listens++; copy = script.listen; }
    else {
      copy = script.steps[station.touches] ?? script.finished;
      station.touches = Math.min(script.steps.length, station.touches + 1);
    }
    return {
      accepted: true, siteId: site.id, action: args.action, copy,
      progress: station.touches, complete: station.touches >= script.steps.length,
    };
  }
  return { snapshot, interact };
}
