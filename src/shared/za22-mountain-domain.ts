// The front ridge uses the existing unsigned centimetre wire format in its own room.
export const mountainPresencePath = '/presence-mountain';
export const townNightWindowPath = '/presence/night-window';
export const mountainPresenceNorthOrigin = 540;
export const mountainPresenceBounds = Object.freeze({ width: 640, depth: 260, height: 655.35 });

export function isMountainPresenceFoot(east: number, north: number, height: number) {
  return Number.isFinite(east) && east >= 0 && east <= mountainPresenceBounds.width &&
    Number.isFinite(north) && north >= mountainPresenceNorthOrigin &&
    north <= mountainPresenceNorthOrigin + mountainPresenceBounds.depth &&
    Number.isFinite(height) && height >= 0 && height <= mountainPresenceBounds.height;
}
