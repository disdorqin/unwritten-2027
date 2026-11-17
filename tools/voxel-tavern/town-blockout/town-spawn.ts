type SpawnPoint = { x: number; n: number };
type LegalSpawn = SpawnPoint & { ground: number };

const searchStep = .5;
const searchRadius = 32;

type Offset = { east: number; north: number; distanceSquared: number };
let recoveryOffsets: Offset[] | undefined;

function nearestOffsets() {
  if (recoveryOffsets) return recoveryOffsets;
  const offsets: Offset[] = [];
  const steps = searchRadius / searchStep;
  for (let north = -steps; north <= steps; north++) {
    for (let east = -steps; east <= steps; east++) {
      const distanceSquared = east * east + north * north;
      if (distanceSquared === 0 || distanceSquared > steps * steps) continue;
      offsets.push({ east: east * searchStep, north: north * searchStep, distanceSquared });
    }
  }
  recoveryOffsets = offsets.sort((a, b) => a.distanceSquared - b.distanceSquared);
  return recoveryOffsets;
}

// The caller supplies terrain, support height and the live world collision checks.
// Search from closest to farthest on a half-meter grid only when the original point fails.
export function findNearestLegalSpawn(
  origin: SpawnPoint,
  findGround: (x: number, n: number) => number | undefined,
): LegalSpawn | undefined {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.n)) return undefined;
  const ground = findGround(origin.x, origin.n);
  if (ground !== undefined && Number.isFinite(ground)) return { ...origin, ground };

  for (const { east, north } of nearestOffsets()) {
    const x = origin.x + east;
    const n = origin.n + north;
    const candidate = findGround(x, n);
    if (candidate !== undefined && Number.isFinite(candidate)) return { x, n, ground: candidate };
  }
  return undefined;
}
