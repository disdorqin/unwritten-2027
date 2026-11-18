import { icePalaceProgressKey } from './ice-palace-race';
import { readCollectedZodiac } from './town-zodiac';

type Paint = `#${string}`;
type VoxelPalette = readonly [
  skin: Paint, hairAndBoots: Paint, coat: Paint, cuffs: Paint,
  trousers: Paint, collarAndBootTrim: Paint, button: Paint, mouth: Paint,
];
type SkinDefinition = {
  id: number;
  name: string;
  palette: VoxelPalette;
  scarf: Paint;
  details?: readonly ('goldHorns' | 'goldBell' | 'iceCrown' | 'fireworksPattern' | 'goldScarfEdge' | 'testerTag')[];
  requirement?: string;
};

const snowfieldPalette = [
  '#e6b18c', '#423541', '#e9eef2', '#cfd7df', '#969fb2', '#b9bfca', '#e6eaf0', '#8f5745',
] as const satisfies VoxelPalette;
const goldGoatPalette = [
  '#e6b18c', '#423541', '#fff0d2', '#f4e4cf', '#887165', '#dbc6ad', '#fff5e0', '#8f5745',
] as const satisfies VoxelPalette;

// IDs are stable. The star scarf is common to visitors; neither NPC outfits nor
// the player’s separately equipped gear are represented by these IDs.
export const townSkinCatalog = [
  { id: 0, name: '默认·雪原白',
    palette: snowfieldPalette, scarf: '#d64d52' },
  { id: 1, name: '糖葫芦红',
    palette: ['#e6b18c', '#413043', '#ef4539', '#ffd1ab', '#753945', '#ff853f', '#ffe9bd', '#8f5745'], scarf: '#ffffff' },
  { id: 2, name: '橘子汽水',
    palette: ['#e6b18c', '#504039', '#f59323', '#ffe0a0', '#865644', '#ffcf4a', '#fff4b5', '#8f5745'], scarf: '#87d9fd' },
  { id: 3, name: '薄荷冰',
    palette: ['#e6b18c', '#3e4b50', '#87dfbd', '#eefaf5', '#456d68', '#c0f5df', '#effbf6', '#8f5745'], scarf: '#f597b7' },
  { id: 4, name: '葡萄汽水',
    palette: ['#e6b18c', '#49314d', '#d762cc', '#ffe0fa', '#79426d', '#f8a8e6', '#ffedfb', '#8f5745'], scarf: '#ffda68' },
  { id: 5, name: '晴空蓝',
    palette: ['#e6b18c', '#334662', '#84cfff', '#ddefff', '#476982', '#b4eaff', '#eff8ff', '#8f5745'], scarf: '#ff9c51' },
  { id: 6, name: '姜饼棕',
    palette: ['#e6b18c', '#4a3436', '#bc794f', '#f4dcab', '#705243', '#dfad6e', '#ffedd4', '#8f5745'], scarf: '#195846' },
  { id: 7, name: '蜜桃粉',
    palette: ['#e6b18c', '#503646', '#f790a4', '#ffe1df', '#a65268', '#fa7e75', '#fff0ea', '#8f5745'], scarf: '#ffffff' },
  { id: 8, name: '金羊款', palette: goldGoatPalette, scarf: '#8d604e',
    details: ['goldHorns', 'goldBell', 'goldScarfEdge'], requirement: '集齐生肖 12 件（含金羊压轴）' },
  { id: 9, name: '冰晶冠款',
    palette: ['#e6b18c', '#354f68', '#b5e8ff', '#f3faff', '#568ba7', '#cceeff', '#f2fbff', '#8f5745'], scarf: '#607cb9',
    details: ['iceCrown'], requirement: '达成过「冰雪之主」（宫殿王座登临 ≥1 次）' },
  { id: 10, name: '烟花款',
    palette: ['#e6b18c', '#2a314c', '#293a76', '#9ba3d8', '#3f4268', '#6873b0', '#ffe780', '#8f5745'], scarf: '#5a659b',
    details: ['fireworksPattern', 'goldScarfEdge'],
    requirement: '跨年夜在场：12-31 23:55–01-01 00:10 任意时刻在线（正式夜）；测试期等效条件 = 在场见证一场完整烟花秀（测试服烟花/服主点烟花均算）' },
  { id: 11, name: '测试纪念款',
    palette: ['#e6b18c', '#3d4533', '#b7de56', '#e6f4a8', '#6b823d', '#d0ed71', '#f5ffe1', '#8f5745'], scarf: '#455d49',
    details: ['testerTag'], requirement: '测试期内进过镇（首次进镇日期 ≤ 测试期结束日，结束日由客户端内置常量，正式夜前随版本更新）' },
] as const satisfies readonly SkinDefinition[];

export const mayorTownSkin = { ...townSkinCatalog[8], id: 255, name: '金羊镇长款', requirement: '仅 owner=true 会话可用' } as const;
type TownSkinId = (typeof townSkinCatalog)[number]['id'] | typeof mayorTownSkin.id;

export const townSkinStorageKeys = {
  selected: 'unwritten.presence.skin.v1',
  fireworks: 'unwritten.presence.skin-fireworks.v1',
  tester: 'unwritten.presence.skin-tester.v1',
} as const;
type ReadStorage = Pick<Storage, 'getItem'>;

function browserStorage(): ReadStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function read(storage: ReadStorage | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

/** A saved preference is a request. Only the verified presence session can grant id 255. */
export function readRequestedTownSkin(storage = browserStorage()): TownSkinId {
  const raw = read(storage, townSkinStorageKeys.selected);
  if (raw === String(mayorTownSkin.id)) return mayorTownSkin.id;
  return townSkinCatalog.find(({ id }) => raw === String(id))?.id ?? townSkinCatalog[0].id;
}

/** Read the original ledgers. Future writers own their marker shape and event rules. */
export function readTownSkinSources(storage = browserStorage()) {
  return {
    zodiacComplete: Object.keys(readCollectedZodiac(storage)).length === 12,
    palaceSave: read(storage, icePalaceProgressKey),
    fireworksMarker: read(storage, townSkinStorageKeys.fireworks),
    testerMarker: read(storage, townSkinStorageKeys.tester),
  };
}
