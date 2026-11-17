import { bridgeAt, riverX, waterHeight, worldBounds, type createTerrainGrid } from './terrain';

export type TownWater = {
  mode: 'wade' | 'swim';
  ground: number;
  depth: number;
  speed: number;
};

type RiverSection = { n: number; left: number; right: number };

const maxRiverReach = 28;
const swimDepth = .6;
export const shoreJumpDepth = 1.08;
const wadeSpeed = .55;
const swimSpeed = .45;

export function createTownWater(grid: Pick<ReturnType<typeof createTerrainGrid>, 'groundHeightAt'>) {
  // Build the shoreline once from the same piecewise terrain used for movement.
  function shore(north: number, center: number, side: -1 | 1) {
    for (let distance = 1; distance <= maxRiverReach; distance++) {
      const x = center + side * distance;
      if (grid.groundHeightAt(x, north) < waterHeight) continue;
      let wet = distance - 1;
      let dry = distance;
      for (let refinement = 0; refinement < 8; refinement++) {
        const mid = (wet + dry) / 2;
        if (grid.groundHeightAt(center + side * mid, north) < waterHeight) wet = mid;
        else dry = mid;
      }
      return center + side * dry;
    }
    return center + side * maxRiverReach;
  }

  const sections: RiverSection[] = [];
  for (let n = 0; n <= worldBounds.depth; n++) {
    const center = riverX(n);
    sections.push({ n, left: shore(n, center, -1), right: shore(n, center, 1) });
  }

  function at(x: number, north: number): TownWater | undefined {
    if (north < 1 || north > worldBounds.depth - 1) return;
    const row = Math.floor(north);
    const entry = sections[row];
    const next = sections[row + 1];
    const f = north - row;
    const left = entry.left + (next.left - entry.left) * f;
    const right = entry.right + (next.right - entry.right) * f;
    if (x < left || x > right || bridgeAt(x, north)) return;
    const bed = grid.groundHeightAt(x, north);
    const depth = waterHeight - bed;
    if (depth <= 0) return;
    const swim = depth >= swimDepth;
    return {
      mode: swim ? 'swim' : 'wade',
      ground: Math.max(bed, waterHeight - shoreJumpDepth),
      depth,
      speed: swim ? swimSpeed : wadeSpeed,
    };
  }

  return { at, sections };
}
