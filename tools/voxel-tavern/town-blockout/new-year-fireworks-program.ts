export const newYearFireworksLeadMs = 300_000;
export const newYearFireworksDuration = 900;

type LaunchPoint = { id: string; x: number; y: number; z: number };
type Grade = 'S' | 'M' | 'L' | 'XL';
type Shape = 'peony' | 'ring' | 'willow' | 'chrysanthemum' | 'brocade';
const radius: Record<Grade, number> = { S: 12, M: 17.5, L: 24, XL: 31 };
const gold = '#ffc26b';
const red = '#ff5767';
const silver = '#eef2ff';
const flight = .8;
const plaza = { x: 224, z: -188 };
const azimuth = ({ x, z }: LaunchPoint) => (Math.atan2(x - plaza.x, plaza.z - z) + 2 * Math.PI) % (2 * Math.PI);
const distance = ({ x, z }: LaunchPoint) => Math.hypot(x - plaza.x, z - plaza.z);

function shell(site: LaunchPoint, launchAt: number, height: number, grade: Grade, shape: Shape, color: string) {
  return {
    time: launchAt + flight, x: site.x, y: site.y + height, z: site.z, radius: radius[grade],
    shape, outer: color, inner: color, launchId: site.id, grade,
  };
}

/** Build the approved score from the nine surveyed M5 launch points. Times use the 23:55 program start. */
export function makeNewYearFireworksProgram(launchPoints: readonly LaunchPoint[]) {
  if (launchPoints.length !== 9 || new Set(launchPoints.map(point => point.id)).size !== 9 ||
      launchPoints.some(point => !point.id || ![point.x, point.y, point.z].every(Number.isFinite))) {
    throw new RangeError('The New Year show needs the nine surveyed launch points');
  }
  const clockwise = [...launchPoints].sort((a, b) => azimuth(a) - azimuth(b));
  const outerFirst = [...launchPoints].sort((a, b) => distance(b) - distance(a));
  const highCenter = [...outerFirst].reverse().slice(0, 4);
  const prelude = Array.from({ length: 12 }, (_, index) =>
    shell(clockwise[index % 9], 4 + index * 20.5, 48, 'S', 'peony', index % 4 === 3 ? gold : silver));
  const midnight = [300.5, 304.5].flatMap((launchAt, wave) => outerFirst.map((site, index) =>
    shell(site, launchAt + index * .04, wave === 0 ? 48 : 74, wave === 0 ? 'M' : 'L',
      wave === 0 ? 'ring' : 'peony', index % 2 === wave ? gold : red)));
  const watchStar = Array.from({ length: 16 }, (_, index) =>
    shell(highCenter[index % highCenter.length], 362 + index * 11, 88, 'S', 'peony', silver));

  const fan = Array.from({ length: 35 }, (_, index) => {
    const group = Math.floor(index / 3) % 3;
    const site = clockwise[group * 3 + index % 3];
    const launchAt = 540 + 145 * (1 - (1 - index / 34) ** 1.65);
    return shell(site, launchAt, 66 + index % 3 * 9, index % 3 === 0 ? 'L' : 'M',
      index % 2 ? 'peony' : 'willow', index % 2 ? red : gold);
  });
  const rotatingPeak = clockwise.map((site, index) => shell(site, 690 + index * 3.65, 80, 'L', 'willow', gold));

  const finaleOffsets = [0, 5, 14, 26, 40, 55, 70, 85, 100, 115, 130, 145];
  const finale = finaleOffsets.map((offset, index) => {
    const last = index === finaleOffsets.length - 1;
    return shell(last ? highCenter[0] : clockwise[index % 9], 745 + offset, last ? 86 : 63,
      last ? 'XL' : 'S', last ? 'brocade' : 'willow', gold);
  });

  return {
    duration: newYearFireworksDuration,
    launchPoints,
    bursts: [...prelude, ...midnight, ...watchStar, ...fan, ...rotatingPeak, ...finale],
  };
}
