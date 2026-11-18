const charms = [
  ["mouse","鼠","夜半信堆沙沙响，小影蹲在邮袋旁。","邮局 · 邮袋后"],
  ["ox","牛","力大如牛不耕田，躲在草垛后偷闲。","集市 · 草垛后"],
  ["tiger","虎","山君不下山，卧在老松巅。","森林 · 树杈平台"],
  ["rabbit","兔","玉兔躲进玻璃宫，花香深处睡正浓。","温室 · 花坛"],
  ["dragon","龙","真龙藏在钟声里，登高百尺才见影。","钟楼 · 观景台"],
  ["snake","蛇","小龙卧在桥洞下，听水声声过寒冬。","中央桥 · 桥洞"],
  ["horse","马","骏马不吃草，日行千里绕镇跑。","环镇列车 · 车厢"],
  ["goat","金羊","十一件齐聚唤金羊，北坡雪上留金痕；金痕尽处非终点，宝间深处见真身。","冰雪宫殿 · 宝物间"],
  ["monkey","猴","灵猴爬上灯架梁，躲在花灯影里藏。","春灯工坊 · 房梁"],
  ["rooster","鸡","金鸡躲在酒旗边，檐下报晓不争先。","酒馆 · 二楼檐下"],
  ["dog","狗","忠犬守门不吠人，蹲在信箱脚边等主人。","居民街道 · 信箱边"],
  ["pig","猪","福猪泡汤怕人笑，躲进池边石灯后。","温泉 · 石灯后"],
] as const;
type CharmId = typeof charms[number][0];
type TestPickupId = Exclude<CharmId, 'goat'>;
type Collected = Partial<Record<CharmId, string>>;
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export const zodiacStorageKey = 'unwritten.zodiac.v1';
export const sealedGoldenGoatClue = '金羊未醒——先集齐其余十一件。';
export const postMousePosition = [3.10, .3, -6.64] as const;

export function readCollectedZodiac(storage?: Pick<Storage, 'getItem'>): Collected {
  const collected: Collected = {};
  try {
    const saved: { collected?: Collected } = JSON.parse(storage?.getItem(zodiacStorageKey) ?? '{}');
    for (const [id] of charms) {
      const date = saved?.collected?.[id];
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) collected[id] = date;
    }
  } catch { /* A damaged or unavailable save starts empty. */ }
  return collected;
}

export function createZodiacProgress(available: readonly TestPickupId[], storage?: StoragePort) {
  const mounted = new Set<CharmId>(available);
  const collected = readCollectedZodiac(storage);

  const count = () => charms.filter(([id]) => collected[id]).length;
  const canCollect = (id: CharmId) => mounted.has(id) && !collected[id];

  return {
    canCollect,
    collect(id: CharmId, date = new Date()) {
      if (!canCollect(id) || !Number.isFinite(date.getTime())) return false;
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      collected[id] = `${date.getFullYear()}-${month}-${day}`;
      try { storage?.setItem(zodiacStorageKey, JSON.stringify({ collected })); }
      catch { /* Allow progress for the current visit when storage is unavailable. */ }
      return true;
    },
    count,
    rows() {
      return charms.map(([id, label, clue, location]) => {
        const date = collected[id];
        // The final charm has no world pickup until the north-slope and palace gates are wired.
        const sealed = id === 'goat' && !date;
        return { id, label, date, sealed, clue: date ? clue : sealed ? sealedGoldenGoatClue : mounted.has(id) ? clue : '尚未现身',
          location: date ? location : undefined };
      });
    },
  };
}
export type ZodiacProgress = ReturnType<typeof createZodiacProgress>;
