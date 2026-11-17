import { bridgeAt, gridStep, isWater, type createTerrainGrid } from './terrain';

type Ground = Pick<ReturnType<typeof createTerrainGrid>, 'heightAt' | 'gridWidth' | 'gridDepth' | 'surfaces'>;
const accumulationSeconds = 55;
const meltSeconds = 150;
const snowDepths = [
  { level: 0, label: '薄雪', servings: 3 },
  { level: 1, label: '积雪', servings: 4 },
  { level: 2, label: '深雪', servings: 5 },
] as const;

export function createTownSnowCover(grid: Ground) {
  let cover = 0;
  return {
    update(seconds: number, accumulating: boolean) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      cover = accumulating ? Math.min(1, cover + seconds / accumulationSeconds)
        : Math.max(0, cover - seconds / meltSeconds);
    },
    amount() { return cover; },
    depth() {
      return snowDepths[cover >= 2 / 3 ? 2 : cover >= 1 / 3 ? 1 : 0];
    },
    canGather(x: number, north: number, ground: number) {
      const col = Math.round(x / gridStep);
      const row = Math.round(north / gridStep);
      if (col < 0 || row < 0 || col >= grid.gridWidth || row >= grid.gridDepth ||
        grid.surfaces[row * grid.gridWidth + col] !== 0 || bridgeAt(x, north) || isWater(x, north)) return false;
      // Exclude upper floors and ledges. The viewer additionally checks overhead shelter.
      return Math.abs(ground - grid.heightAt(x, north)) <= .18;
    },
  };
}
