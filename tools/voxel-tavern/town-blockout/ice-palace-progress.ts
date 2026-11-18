export const icePalaceProgressKey = 'unwritten.ice-palace.v1';
export type IcePalaceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function icePalaceRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function readIcePalaceProgress(storage: IcePalaceStorage | undefined) {
  try {
    return icePalaceRecord(JSON.parse(storage?.getItem(icePalaceProgressKey) ?? '{}'));
  } catch {
    return {};
  }
}

export function writeIcePalaceProgress(storage: IcePalaceStorage | undefined, patch: Record<string, unknown>) {
  try {
    storage?.setItem(icePalaceProgressKey, JSON.stringify({ ...readIcePalaceProgress(storage), ...patch }));
  } catch { /* The current visit remains playable when browser storage is disabled. */ }
}
