import { readPublishedTownChronicle, townChronicleLocalScope, type TownChronicleEntry } from './town-chronicle';
import type { StorageAccess } from './town-text-store';

export const chronicleVolumes = ['建镇记', '编年', '人物志', '风物志', '镇民录'] as const;
export type ChronicleVolume = TownChronicleEntry['vol'];
export type ChroniclePage = TownChronicleEntry & { time?: string; reserved?: boolean; local?: boolean };
const official = { source: 'official', status: 'published', actor: null, pinned: false } as const;

// Official entries and excerpts transcribed from 未写镇历史编纂设计-v1 §4.
const foundingRecords = [
  { date: '2026-11-16', title: '立镇之议' },
  { date: '2026-11-17', time: '夜', title: '镇基落成 · 门牌点亮', pinned: true, body: "是夜，镇基在雪原上落成。镇长先给镇子挂上门牌——从此顺着「未写镇」三个字，天下人都能找得到这条路；又点亮镇门上的灯，门里门外，照得见彼此。地基打好的这一夜，镇子还没有人声，只有灯先亮着，等人来。" },
  { date: '2026-11-18', time: '午', title: '试灯 · 首客临门', pinned: true, body: "午间，镇子头一回试灯。门开了一条缝，第一位客人踏雪进来，站在广场上把整座镇子看了一遍：钟楼的牌匾上写着，离正式开镇还有四十三天。灯试过了，是亮的；路走过了，是通的。" },
  { date: '2026-11-18', time: '午后', title: '镇门互通', pinned: true, body: "午后，镇门大开。这一回进来的人，彼此看得见了——能并肩走，能招手，能站在广场上认出对面是谁。未写镇从这一刻起，不再是一个人的镇子。" },
  { date: '2026-11-18', time: '午后', title: '各正其名' },
  { date: '2026-11-18', time: '午后', title: '雪仗开场 · 烟花备好' },
];
const reservations = [
  { date: '2026-12-31', time: '20:00', title: '开镇', body: "（题名与日期先行入册，正文留白。）腊月里的这一晚八点，镇门正式打开，邮局的时光信箱同刻开箱——写给 2027 年的信，交到 2027 年的人手里。这一页写了什么，等那一夜的人回来告诉我们。" },
  { date: '2027-02-05', title: '迎未' },
];

// A name and a role are accessible until the authored short biography arrives.
const people = [
  ['罗大江', '酒馆老板'], ['苏小满', '邮局邮差'], ['顾长明', '灯塔看守'], ['乔麦', '灯坊匠人'],
  ['柳三弦', '舞台班主'], ['钟铁生', '火车站站长'], ['钱满仓', '集市东家'], ['陶二娘', '糖葫芦摊主'],
  ['贾明灯', '灯笼摊主'], ['文墨生', '春联年画摊主'], ['胡六环', '套圈摊主'],
  ['纪守信', '信箱管理员兼编纂官'], ['翁寒江', '冰钓老手'], ['樊樵', '守林人'],
] as const;

// NPC事实库-张乐天-v1, 镇史卷三安全集 F1/F4/F6/F7/F9/F15.
const mayorBiography = '张乐天，新加坡华人，AI 工程师，研究电价预测，正为保研发论文，这座跨年小镇就是他张罗的。';

const copy: readonly ChroniclePage[] = [
  { ...official, id: 'chr-town-founding', vol: 1, era: '建镇纪', date: null, title: '建镇记', body: '' },
  ...foundingRecords.map((record, i): ChroniclePage => ({
    ...official, id: 'chr-founding-' + (i + 1), vol: 2, era: '建镇纪', body: '', ...record,
  })),
  ...reservations.map((record, i): ChroniclePage => ({
    ...official, id: 'chr-reserved-' + (i + 1), vol: 2, era: '开镇纪元年', body: '', ...record, reserved: true,
  })),
  ...people.map(([name, role], i): ChroniclePage => ({
    ...official, id: 'chr-person-' + (i + 1), vol: 3, era: '', date: null, title: name, body: role,
  })),
  { ...official, id: 'chr-mayor', vol: 3, era: '', date: null, title: '镇长张乐天', body: mayorBiography },
];

export const chronicleSourceLabels = { official: '官记', auto: '自动登记', player: '镇民投稿' } as const;

export function chronicleEntryDate(entry: ChroniclePage) {
  return [entry.era, entry.date, entry.time].filter(Boolean).join(' · ');
}

export function readTownChronicleViews(storage?: StorageAccess) {
  const records = new Map(copy.map(entry => [entry.id, entry]));
  for (const entry of readPublishedTownChronicle(storage)) {
    if (!records.has(entry.id)) records.set(entry.id, { ...entry, local: entry.source !== 'official' });
  }
  const entries = [...records.values()];
  const history = entries.filter(entry => entry.vol === 2 && !entry.reserved)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const latest = history.slice(-3).reverse();
  const featured = history.filter(entry => entry.pinned);
  return {
    entries, history, latest, featured,
    plaque: [...featured, ...latest.filter(entry => !featured.includes(entry))],
    localScope: townChronicleLocalScope,
  };
}

export type TownChronicleViews = ReturnType<typeof readTownChronicleViews>;

export function searchChronicle(views: TownChronicleViews, keyword: string, date: string) {
  const query = keyword.trim().toLocaleLowerCase();
  return views.entries.filter(entry =>
    (!date || (entry.vol === 2 && entry.date === date)) &&
    (!query || (entry.title + '\n' + entry.body + '\n' + chronicleEntryDate(entry)).toLocaleLowerCase().includes(query)),
  );
}
