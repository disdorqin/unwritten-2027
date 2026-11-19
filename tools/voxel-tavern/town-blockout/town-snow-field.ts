// 3.0 H2 积雪统一场（任务书 §2 H2）：一张全图积雪量场统一驱动深雪深度/范围、
// 挖坑回填与雪橇长雪痕。天气三档（town-weather 的 targetCover/pilingRate）驱动
// 全局覆盖量 L；每格雪量 = 基线因子 × L，大雪时另有「扩围」——雪线向原本无雪的
// 边缘格漫延（只升不降已验口径：基线格的目标严格等于 基线因子 × L）。
//
// 基线等值铁律：基线因子沿用现役 town-snow-cover 的表面映射（自然雪面 0 → 1、
// 压实面 3 → .5、其余 → 0），movementScale 阈值与数值（.85/.62、疾跑 deepSprintScale）
// 与现役逐字一致；基线积雪量下任意点的减速与现役完全等值。
// 扩围只作用于基线为 0 的格、且深度封顶 .45（只会到 .85 档，永不到 .62 深雪档），
// 不许漫进桥面/水面/道路净空（depthAt 的净空门与现役一致）。
import { bridgeAt, gridStep, isWater, type createTerrainGrid } from './terrain';
import { bridgeMouthKeepClear } from './road-clearance';
import { extensionRoadClearance, extensionStreetClearance } from './town-extension';
import { advanceWeatherCover, type TownSnowWeather } from './town-weather';

type Ground = Pick<ReturnType<typeof createTerrainGrid>, 'heightAt' | 'gridWidth' | 'gridDepth' | 'surfaces'>;
type GroundMask = (x: number, north: number, ground: number) => boolean;
export type SnowFieldWeather = Pick<TownSnowWeather, 'targetCover' | 'pilingRate'>;

const snowDepths = [
  { level: 0, label: '薄雪', servings: 3 },
  { level: 1, label: '积雪', servings: 4 },
  { level: 2, label: '深雪', servings: 5 },
] as const;
const deepSprintScale = (7.5 * 1.1) / 11.3;
/** 扩围深度封顶：只到 .85 档（≥.25 且 <.6），永不进 .62 深雪档。 */
const spillDepthCap = .45;
/** 扩围只在大雪（targetCover ≥ .8）时出现，1 时满额。 */
const spillFullTarget = 1;
const spillStartTarget = .8;
/** 挖坑回填：基线 240 s 回满，下雪时按 pilingRate 加速。 */
const digRefillSeconds = 240;
/** 雪痕留存：5 分钟时间上限；下雪按 pilingRate 积盖，盖满即消失。 */
export const snowFieldTrackLifeSeconds = 300;
export const snowFieldTrackCapacity = 1600;
const trackCoverPerPilingSecond = .01;
/** 场更新节流：速率是分钟量级，0.25 s 一步与逐帧等价（线性速率）。 */
const fieldStepSeconds = .25;

export type SnowFieldTrack = {
  x1: number; n1: number; x2: number; n2: number;
  strength: number; alpha: number; drifting?: boolean;
};

type TrackRecord = {
  x1: number; n1: number; x2: number; n2: number;
  strength: number; born: number; cover: number; drifting?: boolean;
};

export function createTownSnowField(grid: Ground) {
  const { gridWidth, gridDepth, surfaces } = grid;
  const cellCount = gridWidth * gridDepth;
  const base = new Float32Array(cellCount);
  const spill = new Float32Array(cellCount);
  const amount = new Float32Array(cellCount);
  const dug = new Float32Array(cellCount);
  const dugCells = new Set<number>();
  const liveCells: number[] = [];
  for (let index = 0; index < cellCount; index++) {
    const surface = surfaces[index];
    base[index] = surface === 0 ? 1 : surface === 3 ? .5 : 0;
  }
  for (let row = 0; row < gridDepth; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const index = row * gridWidth + col;
      if (base[index] > 0) { liveCells.push(index); continue; }
      // 扩围源：与任一基线雪格相邻（含斜邻）才可能被雪线漫延。
      let near = 0;
      for (let dr = -1; dr <= 1 && !near; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr, c = col + dc;
          if (r < 0 || c < 0 || r >= gridDepth || c >= gridWidth) continue;
          if (base[r * gridWidth + c] > 0) { near = 1; break; }
        }
      }
      if (near) { spill[index] = spillDepthCap; liveCells.push(index); }
    }
  }

  let cover = 0;
  let intensity = 1;
  let active = false;
  let weather: SnowFieldWeather = { targetCover: .18, pilingRate: .25 };
  let fieldTime = 0;
  let pendingSeconds = 0;
  const tracks: TrackRecord[] = [];

  function cellIndex(x: number, north: number) {
    const col = Math.round(x / gridStep);
    const row = Math.round(north / gridStep);
    if (col < 0 || row < 0 || col >= gridWidth || row >= gridDepth) return -1;
    return row * gridWidth + col;
  }

  function hasSnowAtFeet(x: number, north: number, ground: number) {
    return !bridgeAt(x, north) && !isWater(x, north) && Math.abs(ground - grid.heightAt(x, north)) <= .18;
  }

  function stepField(seconds: number) {
    cover = advanceWeatherCover(cover, seconds, weather);
    const heavyFactor = Math.max(0, Math.min(1,
      (weather.targetCover - spillStartTarget) / (spillFullTarget - spillStartTarget)));
    const upPerCoverage = weather.pilingRate / 55;
    const downPerCoverage = 1 / 150;
    for (const index of liveCells) {
      const b = base[index];
      const factor = b > 0 ? b : spill[index];
      const target = b > 0 ? b * cover : spill[index] * cover * heavyFactor;
      const current = amount[index];
      if (target > current) amount[index] = Math.min(target, current + seconds * factor * upPerCoverage);
      else if (target < current) amount[index] = Math.max(target, current - seconds * factor * downPerCoverage);
    }
    if (dugCells.size) {
      const refill = seconds * (1 + weather.pilingRate) / digRefillSeconds;
      for (const index of dugCells) {
        dug[index] = Math.max(0, dug[index] - refill);
        if (dug[index] === 0) dugCells.delete(index);
      }
    }
    if (tracks.length) {
      const coverGain = seconds * weather.pilingRate * trackCoverPerPilingSecond;
      for (let i = tracks.length - 1; i >= 0; i--) {
        const track = tracks[i];
        track.cover += coverGain;
        if (track.cover >= 1 || fieldTime - track.born > snowFieldTrackLifeSeconds) {
          tracks[i] = tracks[tracks.length - 1];
          tracks.pop();
        }
      }
    }
  }

  function depthAt(x: number, north: number, ground: number, isCleared?: GroundMask) {
    if (!active || intensity <= 1 || cover < .25) return 0;
    const index = cellIndex(x, north);
    if (index < 0) return 0;
    const depth = amount[index] - dug[index];
    if (depth < .25 || !hasSnowAtFeet(x, north, ground) || bridgeMouthKeepClear(x, north, 0) ||
      extensionRoadClearance(x, north, 0) || extensionStreetClearance(x, north, 0) ||
      isCleared?.(x, north, ground)) return 0;
    return depth;
  }

  return {
    depthAt,
    setIntensity(nextIntensity: number) {
      if (Number.isFinite(nextIntensity)) intensity = Math.max(1, Math.min(4, nextIntensity));
    },
    setWeather(nextWeather: SnowFieldWeather) {
      if (Number.isFinite(nextWeather.targetCover) && Number.isFinite(nextWeather.pilingRate)) {
        weather = {
          targetCover: Math.max(0, Math.min(1, nextWeather.targetCover)),
          pilingRate: Math.max(0, nextWeather.pilingRate),
        };
      }
    },
    movementScale(x: number, north: number, ground: number, isCleared?: GroundMask, sprint = false) {
      const depth = depthAt(x, north, ground, isCleared);
      if (depth < .25) return 1;
      if (depth >= .6) return sprint ? deepSprintScale : .62;
      return sprint ? .8 : .85;
    },
    update(seconds: number, isActive: boolean) {
      active = isActive;
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      fieldTime += seconds;
      pendingSeconds += seconds;
      while (pendingSeconds >= fieldStepSeconds) {
        stepField(fieldStepSeconds);
        pendingSeconds -= fieldStepSeconds;
      }
    },
    /** 测试与回执用：把场推到给定秒数（绕过节流分步的浮点尾差）。 */
    amount() { return cover; },
    depth() {
      return snowDepths[cover >= 2 / 3 ? 2 : cover >= 1 / 3 ? 1 : 0];
    },
    canGather(x: number, north: number, ground: number) {
      const index = cellIndex(x, north);
      return index >= 0 && surfaces[index] === 0 && hasSnowAtFeet(x, north, ground);
    },
    /** 挖坑登记：就地削去雪量，返回实际削深；回填由 update 按 digRefillSeconds 推进。 */
    digAt(x: number, north: number, depth = .18) {
      const index = cellIndex(x, north);
      if (index < 0 || !(depth > 0)) return 0;
      const available = amount[index] - dug[index];
      const taken = Math.min(depth, Math.max(0, available));
      if (taken <= 0) return 0;
      dug[index] += taken;
      dugCells.add(index);
      return taken;
    },
    dugDepthAt(x: number, north: number) {
      const index = cellIndex(x, north);
      return index < 0 ? 0 : dug[index];
    },
    /** 雪痕登记（D2 长雪痕）：一段轨迹，强度由深雪/普通决定，留存与积盖由场统一推进。 */
    addTrack(x1: number, n1: number, x2: number, n2: number, strength: number, drifting = false) {
      if (![x1, n1, x2, n2, strength].every(Number.isFinite) || strength <= 0) return;
      if (tracks.length >= snowFieldTrackCapacity) tracks.shift();
      tracks.push({ x1, n1, x2, n2, strength: Math.min(1, strength), born: fieldTime, cover: 0, ...(drifting ? { drifting } : {}) });
    },
    trackSegments(): SnowFieldTrack[] {
      const life = snowFieldTrackLifeSeconds;
      return tracks.map(track => {
        const age = fieldTime - track.born;
        const fade = age <= life * .7 ? 1 : Math.max(0, 1 - (age - life * .7) / (life * .3));
        return {
          x1: track.x1, n1: track.n1, x2: track.x2, n2: track.n2,
          strength: track.strength, alpha: track.strength * (1 - track.cover) * fade,
          ...(track.drifting ? { drifting: true } : {}),
        };
      });
    },
    trackCount() { return tracks.length; },
    /** 原始格雪量（未扣挖坑），供测试与回执核账。 */
    cellAmountAt(x: number, north: number) {
      const index = cellIndex(x, north);
      return index < 0 ? 0 : amount[index];
    },
  };
}

export type TownSnowField = ReturnType<typeof createTownSnowField>;
