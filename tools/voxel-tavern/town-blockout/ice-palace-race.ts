import { icePalaceRecord, readIcePalaceProgress, writeIcePalaceProgress, type IcePalaceStorage } from './ice-palace-progress';

export { icePalaceProgressKey } from './ice-palace-progress';

export const icePalaceBalconyRace = {
  start: [-22.9, .12, 1.4],
  finish: [18.55, 3.09, .48],
  radius: .8,
} as const;

type Point = readonly [x: number, feet: number, z: number];
function browserStorage(): IcePalaceStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function bestTime(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function seconds(ms: number) {
  return (ms / 1000).toFixed(1) + ' 秒';
}

export function createIcePalaceRace(storage = browserStorage(), now = () => performance.now()) {
  const { start, finish, radius } = icePalaceBalconyRace;
  let best = bestTime(icePalaceRecord(readIcePalaceProgress(storage).race).balconyBestMs);
  let startedAt: number | undefined;
  let finishedAt: number | undefined;
  let onStart = false;

  function cancel() {
    startedAt = undefined;
    finishedAt = undefined;
    onStart = false;
  }

  function finishRun(elapsed: number) {
    finishedAt = elapsed;
    startedAt = undefined;
    const race = icePalaceRecord(readIcePalaceProgress(storage).race);
    const existing = bestTime(race.balconyBestMs);
    const fastest = Math.min(elapsed, best ?? Infinity, existing ?? Infinity);
    best = fastest;
    if (existing === fastest) return;
    writeIcePalaceProgress(storage, { race: { ...race, balconyBestMs: fastest } });
  }

  function update(x: number, feet: number, z: number, grounded: boolean) {
    if (Math.abs(x) > 24.5 || Math.abs(z) > 19) {
      cancel();
      return '';
    }
    const isNear = ([px, py, pz]: Point, r: number) =>
      Math.abs(feet - py) <= .30 && (x - px) ** 2 + (z - pz) ** 2 <= r ** 2;
    if (grounded) {
      const steppingOnStart = isNear(start, radius);
      if (steppingOnStart && !onStart) {
        startedAt = now();
        finishedAt = undefined;
      }
      onStart = steppingOnStart;
      if (startedAt !== undefined && isNear(finish, radius)) {
        finishRun(Math.max(1, Math.round(now() - startedAt)));
      }
    }

    const result = best === undefined ? '' : ' · 个人最佳 ' + seconds(best);
    if (startedAt !== undefined) return '观景台计时 ' + seconds(now() - startedAt) + ' · 经大殿南侧楼梯登台';
    if (isNear(finish, 1.8)) return finishedAt === undefined
      ? '观景台终点 · 到西门踏上起点板开始' + result
      : '抵达观景台 · 用时 ' + seconds(finishedAt) + result;
    if (isNear(start, 2.1)) return '观景台计时 · 踏上箭头板开始' + result;
    return '';
  }

  return { update, cancel, get running() { return startedAt !== undefined; } };
}

export type IcePalaceRace = ReturnType<typeof createIcePalaceRace>;
