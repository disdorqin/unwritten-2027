// B-01's western surface extension uses signed world coordinates, then translates to the existing wire frame.
export const westPresencePath = '/presence-west';
export const westPresenceEastOrigin = -240;
export const westPresenceHeightOrigin = -64;
export const westPresenceBounds = Object.freeze({ width: 240, depth: 540, height: 655.35 });

export function isWestPresenceFoot(east: number, north: number, height: number) {
  return Number.isFinite(east) && east >= westPresenceEastOrigin && east <= 0 &&
    Number.isFinite(north) && north >= 0 && north <= westPresenceBounds.depth &&
    Number.isFinite(height) && height >= westPresenceHeightOrigin &&
    height <= westPresenceHeightOrigin + westPresenceBounds.height;
}
