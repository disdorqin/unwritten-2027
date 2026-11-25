/**
 * The underground mine (first-fall layer, floor at world height -90) occupies
 * its own presence room. The established 12-byte protocol stores unsigned
 * centimetres, so world coordinates MUST be translated before serialization
 * (a plain -90 height write would saturate at the uint16 floor).
 *
 * Domain coordinates are never interchangeable with the town, west, mountain
 * or sky rooms; the scene host and presence room must switch together. The
 * The -140 room is independently registered in underground-second-mine-presence-domain.
 * Batch103 expands only the first mine horizontal room to fit the actual shell.
 */
export const minePresencePath = '/presence-mine';
/** Reuse the established WS and poll URI suffixes in the isolated mine room. */
export function minePresenceEndpoint(path: string): string {
  if (path !== '/presence' && !path.startsWith('/presence/')) throw new Error('Invalid presence route');
  return minePresencePath + path.slice('/presence'.length);
}
// Batch96 mounted survey: E[-121.575,22.995], N[74.472,269.352].
// Both client and server consume this shared datum in the same release.
export const minePresenceOrigin = Object.freeze({ east: -180, north: 70, height: -128 });
export const minePresenceBounds = Object.freeze({ width: 210, depth: 210, height: 64 });
export const mineWorldHeightLimit = minePresenceOrigin.height + minePresenceBounds.height;

type Position = { east: number; north: number; height: number };

export function isMinePresenceFoot(east: number, north: number, height: number) {
  const origin = minePresenceOrigin;
  const bounds = minePresenceBounds;
  return Number.isFinite(east) && east >= origin.east && east <= origin.east + bounds.width &&
    Number.isFinite(north) && north >= origin.north && north <= origin.north + bounds.depth &&
    Number.isFinite(height) && height >= origin.height && height <= mineWorldHeightLimit;
}

/** Convert accepted world-space feet into unsigned centimetre-wire metres. */
export function toMinePresencePose<T extends Position>(pose: T): T | undefined {
  if (!isMinePresenceFoot(pose.east, pose.north, pose.height)) return undefined;
  const origin = minePresenceOrigin;
  return { ...pose, east: pose.east - origin.east, north: pose.north - origin.north, height: pose.height - origin.height };
}

/** Convert a wire pose from the mine room back into world-space feet. */
export function fromMinePresencePose<T extends Position>(pose: T): T {
  const origin = minePresenceOrigin;
  return { ...pose, east: pose.east + origin.east, north: pose.north + origin.north, height: pose.height + origin.height };
}
