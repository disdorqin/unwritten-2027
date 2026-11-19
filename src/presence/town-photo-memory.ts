import { townPhotoCaption } from '../shared/town-photo-caption.js';

const frameCount = 3;

type PlayerId = string;

type TownPhoto = Readonly<{
  id: string;
  source: 'selfie' | 'midnight';
  pointId: string;
  capturedAt: number;
  caption: string;
}>;

type PhotoMemoryOptions = {
  photoPoints: ReadonlyMap<string, string>;
  midnight: { pointId: string; captureAt: number };
  canVisit: (visitor: PlayerId, owner: PlayerId) => boolean;
};

function internalCaptureId(id: string) {
  return typeof id === 'string' && /^[\w-]{1,96}$/.test(id);
}

/** The capture host supplies successful town renders and a confirmed attendance snapshot.
 *  Player actions can only select an existing selfie reference for their own frames. */
export function createTownPhotoMemory({ photoPoints, midnight, canVisit }: PhotoMemoryOptions) {
  const places = new Map(photoPoints);
  const { pointId: midnightPoint, captureAt: midnightAt } = midnight;
  const selfies = new Map<string, { owner: PlayerId; photo: TownPhoto }>();
  const frames = new Map<PlayerId, (TownPhoto | null)[]>();
  let group: { photo: TownPhoto; present: ReadonlySet<PlayerId> } | undefined;

  function makePhoto(id: string, pointId: string, capturedAt: number, source: TownPhoto['source']) {
    const location = places.get(pointId);
    if (!internalCaptureId(id) || !location || selfies.has(id) || group?.photo.id === id) return;
    const caption = townPhotoCaption(location, capturedAt);
    if (!caption) return;
    return Object.freeze({ id, pointId, capturedAt, source, caption });
  }

  return {
    recordMidnight(id: string, capturedAt: number, present: readonly PlayerId[]) {
      if (group || capturedAt !== midnightAt) return false;
      const photo = makePhoto(id, midnightPoint, capturedAt, 'midnight');
      if (!photo) return false;
      group = { photo, present: new Set(present) };
      return true;
    },

    midnightFor(player: PlayerId) {
      return group?.present.has(player) ? group.photo : undefined;
    },

    recordSelfie(owner: PlayerId, id: string, pointId: string, capturedAt: number) {
      if (!owner) return;
      const photo = makePhoto(id, pointId, capturedAt, 'selfie');
      if (!photo) return;
      selfies.set(id, { owner, photo });
      return photo;
    },

    setHomeFrame(owner: PlayerId, slot: number, photoId: string | null) {
      if (!owner || !Number.isInteger(slot) || slot < 1 || slot > frameCount) return false;
      const selfie = photoId === null ? undefined : selfies.get(photoId);
      if (photoId !== null && selfie?.owner !== owner) return false;
      const row = frames.get(owner) ?? Array<TownPhoto | null>(frameCount).fill(null);
      row[slot - 1] = selfie?.photo ?? null;
      frames.set(owner, row);
      return true;
    },

    homeFramesFor(visitor: PlayerId, owner: PlayerId): readonly (TownPhoto | null)[] | undefined {
      if (!visitor || !owner || (visitor !== owner && !canVisit(visitor, owner))) return;
      return [...(frames.get(owner) ?? Array<TownPhoto | null>(frameCount).fill(null))];
    },
  };
}
