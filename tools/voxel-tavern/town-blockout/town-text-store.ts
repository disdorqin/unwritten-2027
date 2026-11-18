export type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
type Collection<Item> = { version: 1; items: Item[] };

export function isStoredRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function browserTextStorage(): StorageAccess | undefined {
  try { return globalThis.localStorage; }
  catch { return undefined; }
}

export function readCollection<Item>(storage: StorageAccess | undefined, key: string, guard: (item: unknown) => item is Item): Item[] {
  if (!storage) return [];
  let raw: string | null;
  try { raw = storage.getItem(key); }
  catch { return []; }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredRecord(parsed) && parsed.version === 1 && Array.isArray(parsed.items) && parsed.items.every(guard)) {
      return parsed.items;
    }
  } catch { /* Preserve the source below. */ }
  try {
    storage.setItem(key + '.bak', raw);
    storage.setItem(key, JSON.stringify({ version: 1, items: [] }));
  } catch { /* A read-only browser still opens the empty panel. */ }
  return [];
}

export function writeCollection<Item>(storage: StorageAccess | undefined, key: string, items: Item[]) {
  if (!storage) return false;
  try {
    const payload: Collection<Item> = { version: 1, items };
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch { return false; }
}
