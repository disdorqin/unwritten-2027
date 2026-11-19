export const plazaPhotoStand = {
  centreEast: 224, south: 162, halfWidth: 8, rows: 4, run: .875, rise: .35, base: 12,
} as const;
export const plazaPhotoGatherMs = 30_000;
export const plazaPhotoCountdownMs = 10_000;
export const plazaPhotoLockMs = 1_000;
export const plazaPhotoCapacity = 48;

export type PlazaPhotoPerson = { id: number; name: string; east: number; north: number; height: number };
export type PlazaPhotoInvite = { type: 'event'; kind: 'plaza-photo-invite'; id: number; captureAt: number };
export type PlazaPhotoLineup = { type: 'event'; kind: 'plaza-photo-lineup'; id: number; captureAt: number; people: PlazaPhotoPerson[] };
export type PlazaPhotoNotice = PlazaPhotoInvite | PlazaPhotoLineup;

export function inPlazaPhotoStand(east: number, north: number, height: number) {
  const stand = plazaPhotoStand;
  const distance = north - stand.south;
  if (!(Math.abs(east - stand.centreEast) <= stand.halfWidth && distance >= 0 && distance <= stand.rows * stand.run)) return false;
  const row = Math.min(stand.rows, 1 + Math.floor(distance / stand.run));
  return Math.abs(height - (stand.base + row * stand.rise)) <= .40;
}

export function inPlazaPhotoRequestZone(east: number, north: number, height: number) {
  const stand = plazaPhotoStand;
  return inPlazaPhotoStand(east, north, height) ||
    (Math.abs(east - stand.centreEast) <= stand.halfWidth && north >= stand.south - 2 &&
      north < stand.south && Math.abs(height - stand.base) <= .30);
}

export function plazaPhotoLineup(people: readonly PlazaPhotoPerson[]) {
  return people.filter(({ east, north, height }) => inPlazaPhotoStand(east, north, height))
    .sort((a, b) => a.id - b.id).slice(0, plazaPhotoCapacity);
}

function isPerson(value: unknown): value is PlazaPhotoPerson {
  if (!value || typeof value !== 'object') return false;
  const person = value as Partial<PlazaPhotoPerson>;
  const { id, name, east, north, height } = person;
  return Number.isInteger(id) && id! >= 1 && id! <= 65535 && typeof name === 'string' &&
    name.length > 0 && Array.from(name).length <= 24 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(name) &&
    typeof east === 'number' && typeof north === 'number' && typeof height === 'number' && inPlazaPhotoStand(east, north, height);
}

export function readPlazaPhotoNotice(value: unknown): PlazaPhotoNotice | undefined {
  if (!value || typeof value !== 'object') return;
  const notice = value as Partial<PlazaPhotoLineup | PlazaPhotoInvite>;
  if (notice.type !== 'event' || !Number.isSafeInteger(notice.id) || notice.id! < 1 ||
      !Number.isSafeInteger(notice.captureAt) || notice.captureAt! < 1) return;
  if (notice.kind === 'plaza-photo-invite') return notice as PlazaPhotoInvite;
  if (notice.kind === 'plaza-photo-lineup' && Array.isArray(notice.people) &&
      notice.people.length <= plazaPhotoCapacity && notice.people.every(isPerson) &&
      new Set(notice.people.map(person => person.id)).size === notice.people.length) return notice as PlazaPhotoLineup;
}
