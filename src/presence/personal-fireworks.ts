import { isSharedHomePosition } from './shared-home-space.js';

export const personalFireworkKinds = ['sparkler', 'rocket', 'string'] as const;
export type PersonalFireworkKind = typeof personalFireworkKinds[number];
export type PersonalFireworkRequest = {
  item: PersonalFireworkKind; seed: number; east: number; north: number; height: number; yaw: number;
};
export type PersonalFireworkRelay = PersonalFireworkRequest & {
  type: 'event'; kind: 'personal-firework'; from: number; startAt: number;
};

export const personalFireworkCooldownMs = 2_000;
export function isPersonalFireworkKind(value: unknown): value is PersonalFireworkKind {
  return value === 'sparkler' || value === 'rocket' || value === 'string';
}

export function readPersonalFirework(value: unknown): PersonalFireworkRequest | undefined {
  if (!value || typeof value !== 'object') return;
  const { item, seed, east, north, height, yaw } = value as Partial<PersonalFireworkRequest>;
  if (!isPersonalFireworkKind(item) || typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff ||
      typeof east !== 'number' || !Number.isFinite(east) || east < 1 || east > 639 ||
      typeof north !== 'number' || !Number.isFinite(north) || north < 1 || north > 511 ||
      typeof height !== 'number' || !Number.isFinite(height) || height < 0 || height > 655.35 ||
      typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI * 2) return;
  return { item, seed, east, north, height, yaw };
}

export function readPersonalFireworkRelay(value: unknown): PersonalFireworkRelay | undefined {
  const request = readPersonalFirework(value);
  if (!request) return;
  const { type, kind, from, startAt } = value as Partial<PersonalFireworkRelay>;
  if (type !== 'event' || kind !== 'personal-firework' || typeof from !== 'number' || !Number.isInteger(from) ||
      from < 1 || from > 65535 || typeof startAt !== 'number' || !Number.isSafeInteger(startAt)) return;
  return { ...request, type, kind, from, startAt };
}

// Interior footprints enforce the same broad exclusions for remote event requests.
// The viewer independently checks exact roofs, cars, home portals and individual bath seating.
const interiorRegions = [
  [159, 230, 10.5, 8.5], [337, 277, 29, 14.5],
  [547.35, 167.1, 3.525, 2.075], [560.08, 166.85, 3.85, 2.3],
  [534.6, 167.2, 3.8, 2.2], [568.2, 166.6, 1.9, 1.5],
] as const;

export function personalFireworkRestricted(east: number, north: number, height: number): boolean {
  return isSharedHomePosition(east, north, height) ||
    interiorRegions.some(([x, n, halfWidth, halfDepth]) =>
      Math.abs(east - x) <= halfWidth && Math.abs(north - n) <= halfDepth);
}
