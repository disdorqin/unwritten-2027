import { Group } from 'three';
import { isMirrorLakeIce, mirrorLake, mirrorLakeSignedDistance } from '../../../src/shared/mirror-lake';
import { createMirrorF2Slope, surveyedF2Corridor } from './mirror-lake-f2-slope';
import { buildMirrorLakeScene } from './mirror-lake-scene';
import { createMirrorLakeSculptureIsland } from './mirror-lake-sculpture-island';
import { mirrorFishingOccupancyRadius, mirrorFishingSites, shapeMirrorEastShore } from './mirror-lake-site';
import { createMirrorLakeLegacyShoreSampler, createMirrorLakeWestAccess } from './mirror-lake-west-access';
import { createMirrorLakeUnderIceGlow, type MirrorLakeConfirmedConditions } from './mirror-lake-under-ice';
import { createMirrorSouthShorePath } from './mirror-lake-west-shore';
import { canEnter, gridStep, isWater, layout, type createTerrainGrid } from './terrain';

type TerrainGrid = ReturnType<typeof createTerrainGrid>;
type LocalCell = { index: number; oldHeight: number; oldSurface: number; height: number; surface: number };
export const mirrorLakeTerrainBounds = { west: 10, east: 104, south: 116, north: 254 } as const;

const roads = [...layout.roads,
  ...layout.plots.map(plot => ({ points: [plot.connect, plot.door], width: 4 }))].flatMap(({ points, width }) =>
  points.slice(1).map(([east, north], index) => {
    const [a, b] = points[index];
    const dx = east - a, dn = north - b;
    return { a, b, dx, dn, length2: dx * dx + dn * dn, radius: width / 2 };
  }));
function roadEdgeAt(east: number, north: number) {
  let nearest = Infinity;
  let edge = Infinity;
  for (const { a, b, dx, dn, length2, radius } of roads) {
    if (length2 === 0) continue;
    const ex = east - a, en = north - b;
    const t = Math.max(0, Math.min(1, (ex * dx + en * dn) / length2));
    const distance = Math.hypot(ex - dx * t, en - dn * t);
    if (distance >= nearest) continue;
    nearest = distance;
    edge = distance - radius;
  }
  return edge;
}

type HeightLayer = (east: number, north: number) => number | undefined;
function collectLakeCells(grid: TerrainGrid, slopeAt: HeightLayer, shoreAt: HeightLayer) {
  const { elevation, surfaces, gridWidth } = grid;
  const cells: LocalCell[] = [];
  for (let n = mirrorLakeTerrainBounds.south; n <= mirrorLakeTerrainBounds.north; n += gridStep) {
    for (let e = mirrorLakeTerrainBounds.west; e <= mirrorLakeTerrainBounds.east; e += gridStep) {
      if (isWater(e, n)) continue;
      const index = n / gridStep * gridWidth + e / gridStep;
      const oldHeight = elevation[index], oldSurface = surfaces[index];
      const distance = mirrorLakeSignedDistance(e, n);
      const toShore = Math.max(0, Math.min(1, distance / 13));
      const blend = toShore * toShore * (3 - 2 * toShore);
      const roadEdge = roadEdgeAt(e, n);
      const ice = isMirrorLakeIce(e, n);
      const base = roadEdge < 0 ? oldHeight : mirrorLake.height + (oldHeight - mirrorLake.height) * blend;
      const shaped = shapeMirrorEastShore(e, n, base, roadEdge);
      // Keep the real F2 mesh above the sampled terrain rather than rendering
      // the old ground through it. Its measured profile supplies walk height.
      const slopeHeight = slopeAt(e, n);
      const shoreHeight = !ice ? shoreAt(e, n) : undefined;
      const height = ice ? mirrorLake.height : shoreHeight ??
        (slopeHeight === undefined ? shaped : Math.min(shaped, slopeHeight - .04));
      const surface = ice ? 4 : oldSurface;
      if (height !== oldHeight || surface !== oldSurface) cells.push({ index, oldHeight, oldSurface, height, surface });
    }
  }
  return cells;
}

export function createMirrorLakeHost(grid: TerrainGrid) {
  const group = new Group();
  group.name = 'Mirror Lake local scene';
  const effects = new Group();
  const glow = createMirrorLakeUnderIceGlow(effects);
  const slope = createMirrorF2Slope(grid.heightAt, surveyedF2Corridor);
  const west = createMirrorLakeWestAccess();
  const southShore = createMirrorSouthShorePath(grid.heightAt);
  const legacyShoreAt = createMirrorLakeLegacyShoreSampler(southShore.mesh.geometry);
  const cells = collectLakeCells(grid, slope.heightAt, legacyShoreAt);
  let shore: ReturnType<typeof buildMirrorLakeScene> | undefined;
  let island: ReturnType<typeof createMirrorLakeSculptureIsland>;
  let mounted = false;
  let disposed = false;

  function updateTerrain(active: boolean) {
    for (const { index, height, surface, oldHeight, oldSurface } of cells) {
      grid.elevation[index] = active ? height : oldHeight;
      grid.surfaces[index] = active ? surface : oldSurface;
    }
  }

  function setMounted(next: boolean) {
    if (disposed || next === mounted) return false;
    updateTerrain(next);
    if (!next) {
      group.clear();
      glow.sync(undefined);
      mounted = false;
      return true;
    }
    try {
      shore ??= buildMirrorLakeScene(grid.heightAt);
      island ??= createMirrorLakeSculptureIsland((east, north) =>
        canEnter(east, north) && isMirrorLakeIce(east, north) ? grid.heightAt(east, north) : undefined);
      if (!island) throw new Error('Mirror Lake ice does not support the surveyed sculpture island.');
      group.add(shore.group, slope.mesh, west.group, southShore.mesh, island.group, effects);
      mounted = true;
      return true;
    } catch (error) {
      updateTerrain(false);
      throw error;
    }
  }

  function iceAt(east: number, north: number) {
    return mounted && canEnter(east, north) && isMirrorLakeIce(east, north);
  }

  function exposedSurfaceAt(east: number, north: number) {
    if (!mounted) return;
    if (iceAt(east, north)) return mirrorLake.height;
    return slope.heightAt(east, north);
  }

  return {
    group, setMounted, iceAt, exposedSurfaceAt,
    // The palace host owns the current ice window. There is no local clock,
    // dawn default, or guessed thaw deadline in the lake.
    setConfirmedConditions(conditions: MirrorLakeConfirmedConditions | undefined) {
      if (disposed) return false;
      const changed = setMounted(conditions?.frozen === true);
      glow.sync(conditions);
      return changed;
    },
    skatingAt(east: number, north: number, height: number) {
      return iceAt(east, north) && east >= mirrorLake.center[0] - 12 &&
        Math.abs(height - mirrorLake.height) < .15 && !island?.onWalkingSurface(east, north, height) &&
        mirrorFishingSites.every(site => Math.hypot(east - site.x, north - site.n) > mirrorFishingOccupancyRadius);
    },
    get collisionGroups() { return mounted && shore ? [shore.group, ...(island ? [island.group] : [])] : []; },
    get tigerStoneFootpoint() { return mounted ? island?.tigerStoneFootpoint : undefined; },
    supportAt(east: number, north: number, limit: number) {
      if (!mounted) return -Infinity;
      const legacy = legacyShoreAt(east, north) ?? -Infinity;
      return Math.max(west.supportAt(east, north, limit), legacy <= limit ? legacy : -Infinity);
    },
    ceilingAt(east: number, north: number, min: number) {
      return mounted ? west.ceilingAt(east, north, min) : Infinity;
    },
    blocks(east: number, north: number, feet: number, body: number, epsilon: number) {
      return mounted && west.blocks(east, north, feet, body, epsilon);
    },
    dispose() {
      if (disposed) return;
      setMounted(false);
      disposed = true;
      group.removeFromParent();
      shore?.dispose();
      island?.dispose();
      southShore.dispose();
      slope.dispose();
      west.dispose();
      glow.dispose();
    },
  };
}
