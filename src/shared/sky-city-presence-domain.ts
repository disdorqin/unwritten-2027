/**
 * The Y750 sky city occupies its own presence room. The established 12-byte
 * protocol stores unsigned centimetres, so world height MUST be translated
 * before serialization (a plain Y750 write would saturate at 655.35).
 *
 * Domain coordinates are never interchangeable with the town or mountain
 * room; the scene host and presence room must switch together.
 */
export const skyCityPresencePath = '/presence-sky';
/** Reuse the established WS and poll URI suffixes in the isolated sky room. */
export function skyCityPresenceEndpoint(path: string): string {
  if (path !== '/presence' && !path.startsWith('/presence/')) throw new Error('Invalid presence route');
  return skyCityPresencePath + path.slice('/presence'.length);
}
export const skyCityPresenceOrigin = Object.freeze({ east: -320, north: -270, height: 750 });
export const skyCityPresenceBounds = Object.freeze({ width: 640, depth: 540, height: 150 });
export const skyCityWorldHeightLimit = skyCityPresenceOrigin.height + skyCityPresenceBounds.height;

type Position = { east: number; north: number; height: number };

export function isSkyCityPresenceFoot(east: number, north: number, height: number) {
  const origin = skyCityPresenceOrigin;
  const bounds = skyCityPresenceBounds;
  return Number.isFinite(east) && east >= origin.east && east <= origin.east + bounds.width &&
    Number.isFinite(north) && north >= origin.north && north <= origin.north + bounds.depth &&
    Number.isFinite(height) && height >= origin.height && height <= skyCityWorldHeightLimit;
}

/** Convert accepted world-space feet into unsigned centimetre-wire metres. */
export function toSkyCityPresencePose<T extends Position>(pose: T): T | undefined {
  if (!isSkyCityPresenceFoot(pose.east, pose.north, pose.height)) return undefined;
  return { ...pose,
    east: pose.east - skyCityPresenceOrigin.east,
    north: pose.north - skyCityPresenceOrigin.north,
    height: pose.height - skyCityPresenceOrigin.height,
  };
}

/** Reconstruct world-space feet from a sky-room record (not another room). */
export function fromSkyCityPresencePose<T extends Position>(pose: T): T | undefined {
  if (!Number.isFinite(pose.east) || pose.east < 0 || pose.east > skyCityPresenceBounds.width ||
      !Number.isFinite(pose.north) || pose.north < 0 || pose.north > skyCityPresenceBounds.depth ||
      !Number.isFinite(pose.height) || pose.height < 0 || pose.height > skyCityPresenceBounds.height) return undefined;
  return { ...pose,
    east: pose.east + skyCityPresenceOrigin.east,
    north: pose.north + skyCityPresenceOrigin.north,
    height: pose.height + skyCityPresenceOrigin.height,
  };
}
