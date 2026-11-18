import { UNLOCK_AT } from './town-mail-store';
import { browserTextStorage, isStoredRecord, readCollection, writeCollection, type StorageAccess } from './town-text-store';

export const townChronicleKey = 'unwritten.chronicle.v1';
export const townChronicleLocalScope = '本机所见';

export type TownChronicleEntry = {
  id: string;
  vol: 1 | 2 | 3 | 4 | 5;
  era: string;
  date: string | null;
  title: string;
  body: string;
  source: 'official' | 'auto' | 'player';
  actor: string | null;
  status: 'draft' | 'published';
  pinned: boolean;
};

type PlazaPhoto = { id: string; at: number; names: readonly string[]; occasion: string };
type TimeboxUnlock = { at: number; playerLetters: number; npcLetters: number };

function isChronicleEntry(value: unknown): value is TownChronicleEntry {
  return isStoredRecord(value) && typeof value.id === 'string' && /^chr-[\w-]+$/.test(value.id) &&
    typeof value.vol === 'number' && [1, 2, 3, 4, 5].includes(value.vol) &&
    typeof value.era === 'string' && (value.date === null || typeof value.date === 'string') &&
    typeof value.title === 'string' && typeof value.body === 'string' &&
    (value.source === 'official' || value.source === 'auto' || value.source === 'player') &&
    (value.actor === null || typeof value.actor === 'string') &&
    (value.status === 'draft' || value.status === 'published') && typeof value.pinned === 'boolean';
}

export function readPublishedTownChronicle(storage = browserTextStorage()): TownChronicleEntry[] {
  return readCollection(storage, townChronicleKey, isChronicleEntry).filter(item => item.status === 'published');
}

function append(entry: TownChronicleEntry, storage: StorageAccess | undefined) {
  const entries = readCollection(storage, townChronicleKey, isChronicleEntry);
  if (entries.some(item => item.id === entry.id)) return true;
  return writeCollection(storage, townChronicleKey, [...entries, entry]);
}

function timestamp(at: number) {
  const time = new Date(at);
  if (!Number.isInteger(at) || at < 0 || !Number.isFinite(time.getTime())) return null;
  const year = time.getFullYear();
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = year + '-' + pad(time.getMonth() + 1) + '-' + pad(time.getDate());
  if (at < new Date(UNLOCK_AT).getTime()) return { era: '建镇纪', date };
  const openingYear = year - 2026;
  const numeral = new Intl.NumberFormat('zh-CN-u-nu-hanidec', { useGrouping: false }).format(openingYear);
  const era = openingYear <= 1 ? '开镇纪元年' : '开镇纪' + numeral + '年';
  return { era, date };
}

const automatic = { source: 'auto', actor: null, status: 'published', pinned: false } as const;

export function recordTownChronicleTimeboxUnlock({ at, playerLetters, npcLetters }: TimeboxUnlock, storage = browserTextStorage()) {
  const time = timestamp(at);
  if (!time || at !== new Date(UNLOCK_AT).getTime() ||
      !nonnegativeCount(playerLetters) || !nonnegativeCount(npcLetters)) return false;
  const count = playerLetters + npcLetters;
  return append({
    ...automatic, ...time, vol: 2, id: 'chr-timebox-unlock-' + time.date, title: '时光信箱开箱',
    body: '时光信箱到了开启时间。本机所见，开箱时共封存 ' + count + ' 封信，其中镇民来信 ' +
      playerLetters + ' 封，镇内角色来信 ' + npcLetters + ' 封。',
  }, storage);
}

function nonnegativeCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function eventText(value: string, max: number) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    Array.from(value).length <= max && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

export function recordTownChroniclePlazaPhoto({ id, at, names, occasion }: PlazaPhoto, storage = browserTextStorage()) {
  const time = timestamp(at);
  if (!time || !/^plaza-photo-[\w-]{1,96}$/.test(id) || !Array.isArray(names) ||
      names.length < 1 || names.length > 64 || !names.every(name => eventText(name, 24)) ||
      !eventText(occasion, 24)) return false;
  return append({
    ...automatic, ...time, vol: 5, id: 'chr-' + id, title: '广场合影 · ' + occasion,
    body: '本机所见，' + names.length + ' 位镇民留影。名单为 ' + names.join('、') + '。',
  }, storage);
}
