import { bridgeAt, gridStep, isWater, type createTerrainGrid } from './terrain';
import { bridgeMouthKeepClear } from './road-clearance';
import { extensionRoadClearance, extensionStreetClearance } from './town-extension';

type Ground = Pick<ReturnType<typeof createTerrainGrid>, 'heightAt' | 'gridWidth' | 'gridDepth' | 'surfaces'>;
type GroundMask = (x: number, north: number, ground: number) => boolean;

const accumulationSeconds = 55;
const meltSeconds = 150;
const snowDepths = [
  { level: 0, label: '薄雪', servings: 3 },
  { level: 1, label: '积雪', servings: 4 },
  { level: 2, label: '深雪', servings: 5 },
] as const;
const deepSprintScale = (7.5 * 1.1) / 11.3;

export function approachTownSnowScale(current: number, target: number, seconds: number) {
  if (current === target || !(seconds > 0) || !Number.isFinite(seconds)) return current;
  const next = target + (current - target) * Math.exp(-10 * seconds);
  // Snap the final small tail so a boundary finishes transitioning in about 0.3 s.
  return Math.abs(next - target) < .02 ? target : next;
}

export function createTownSnowCover(grid: Ground) {
  let cover = 0;
  let intensity = 1;
  let snowNight = false;

  function sampleGround(x: number, north: number) {
    const col = Math.round(x / gridStep);
    const row = Math.round(north / gridStep);
    if (col < 0 || row < 0 || col >= grid.gridWidth || row >= grid.gridDepth) return undefined;
    return grid.surfaces[row * grid.gridWidth + col];
  }

  function hasSnowAtFeet(x: number, north: number, ground: number) {
    return !bridgeAt(x, north) && !isWater(x, north) && Math.abs(ground - grid.heightAt(x, north)) <= .18;
  }

  function exposedSnowAt(x: number, north: number, ground: number, isCleared?: GroundMask) {
    const surface = sampleGround(x, north);
    return (surface === 0 || surface === 3) && hasSnowAtFeet(x, north, ground) &&
      !bridgeMouthKeepClear(x, north, 0) && !extensionRoadClearance(x, north, 0) &&
      !extensionStreetClearance(x, north, 0) && !isCleared?.(x, north, ground);
  }

  function depthAt(x: number, north: number, ground: number, isCleared?: GroundMask) {
    if (!snowNight || intensity <= 1 || cover < .25) return 0;
    const surface = sampleGround(x, north);
    const depth = surface === 0 ? cover : surface === 3 ? cover * .5 : 0;
    if (depth < .25 || !hasSnowAtFeet(x, north, ground) || bridgeMouthKeepClear(x, north, 0) ||
      extensionRoadClearance(x, north, 0) || extensionStreetClearance(x, north, 0) ||
      isCleared?.(x, north, ground)) return 0;
    return depth;
  }

  return {
    depthAt,
    exposedSnowAt,
    setIntensity(nextIntensity: number) {
      if (Number.isFinite(nextIntensity)) intensity = Math.max(1, Math.min(4, nextIntensity));
    },
    movementScale(x: number, north: number, ground: number, isCleared?: GroundMask, sprint = false) {
      const depth = depthAt(x, north, ground, isCleared);
      if (depth < .25) return 1;
      if (depth >= .6) return sprint ? deepSprintScale : .62;
      return sprint ? .8 : .85;
    },
    update(seconds: number, isSnowNight: boolean) {
      snowNight = isSnowNight;
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      if (snowNight && intensity >= 1.5) {
        const storm = (intensity - 1) / 3;
        cover = Math.min(1, cover + seconds * storm / accumulationSeconds);
      } else {
        cover = Math.max(0, cover - seconds / meltSeconds);
      }
    },
    amount() { return cover; },
    depth() {
      return snowDepths[cover >= 2 / 3 ? 2 : cover >= 1 / 3 ? 1 : 0];
    },
    // Exclude upper floors and ledges. The viewer additionally checks overhead shelter.
    canGather(x: number, north: number, ground: number) {
      return sampleGround(x, north) === 0 && hasSnowAtFeet(x, north, ground);
    },
  };
}
