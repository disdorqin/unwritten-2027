import { testFireworksShowMs } from '../../../src/presence/test-fireworks';

export const showPointLimit = 26_000;
export const showFlightSeconds = .8;
export const ordinaryBurstLifetime = 2.65;
export const showBurstTail = ordinaryBurstLifetime + .22;
export const ceremonyCueOffsets = {
  'fireworks-main': 1, 'fireworks-far': 8, 'fireworks-finale': 14,
} as const;
export type CeremonyFireworksCue = keyof typeof ceremonyCueOffsets;

const shapeCycle = ['peony', 'ring', 'willow', 'chrysanthemum', 'double-ring', 'brocade'] as const;
const shellRadii = { S: 12, M: 17.5, L: 24, XL: 31 };
const shellSparks = { S: 96, M: 144, L: 216, XL: 288 };
export type ShellGrade = keyof typeof shellRadii;
export type ShellShape = typeof shapeCycle[number];
export type CelebrationBurst = {
  time: number; x: number; y: number; z: number; radius: number; shape: ShellShape;
  outer: string; inner: string; launchId: string; grade: ShellGrade;
};

const launchSites = [
  { id: 'center', x: 218, z: -196, ring: 0, y: 15 },
  { id: 'east', x: 262, z: -176, ring: 0 },
  { id: 'west', x: 186, z: -176, ring: 0 },
  { id: 'stage', x: 224, z: -146, ring: 0 },
  { id: 'tower', x: 226, z: -228, ring: 1 },
  { id: 'lanterns', x: 150, z: -95, ring: 1 },
  { id: 'lake', x: 344, z: -66, ring: 2, y: 7 },
  { id: 'memorial', x: 373, z: -264, ring: 2, y: 28 },
  { id: 'ridge', x: 209, z: -306, ring: 2 },
] as const;
type LaunchSite = typeof launchSites[number];

export type CelebrationScore = {
  duration: number;
  bursts: readonly CelebrationBurst[];
  launchPoints: readonly { id: string; x: number; y: number; z: number }[];
};

const colors = ['#ffc26b', '#fff1c7', '#ff5767', '#f599df', '#7ad9ff', '#76f6db', '#b48cff', '#ff9440', '#eef2ff'];
const cores = ['#fff1c7', '#ffc26b', '#f599df', '#7ad9ff', '#eef2ff'];
const eye = { x: 224, y: 13.7, z: -188 };
const elevations = [
  { eyeAngle: 65, ring: 0, minY: 48, maxY: 95 },
  { eyeAngle: 42.5, ring: 1, minY: 55, maxY: 85 },
  { eyeAngle: 20, ring: 2, minY: 65, maxY: 80 },
] as const;

function aim(index: number, sites: readonly LaunchSite[], seed = 0) {
  const sector = (index * 5 + seed % 12) % 12;
  const { eyeAngle, ring, minY, maxY } = elevations[(Math.floor(index / 12) + index % 3) % 3];
  const angle = (sector + .5) * Math.PI / 6;
  const preferred = sites.filter(site => site.ring === ring);
  const y = minY + (maxY - minY) * ((index * 7) % 11) / 10;
  const distance = (y - eye.y) / Math.tan(eyeAngle * Math.PI / 180);
  const x = eye.x + Math.sin(angle) * distance;
  const z = eye.z - Math.cos(angle) * distance;
  const launchSite = (preferred.length ? preferred : sites).reduce((nearest, candidate) =>
    Math.hypot(candidate.x - x, candidate.z - z) < Math.hypot(nearest.x - x, nearest.z - z) ? candidate : nearest);
  return { x, y, z, launchSite };
}

function shell(time: number, index: number, grade: ShellGrade, sites: readonly LaunchSite[], seed = 0): CelebrationBurst {
  const { x, y, z, launchSite } = aim(index, sites, seed);
  const shape = shapeCycle[(index + seed % shapeCycle.length) % shapeCycle.length];
  const outer = shape === 'brocade' ? colors[index % 2 ? 0 : 8] : colors[(index + seed % colors.length) % colors.length];
  return { time, x, y, z, radius: shellRadii[grade], shape, outer, inner: cores[index % cores.length], launchId: launchSite.id, grade };
}

function fixedShell(time: number, index: number, grade: ShellGrade, site: LaunchSite, y: number): CelebrationBurst {
  return { time, x: site.x, y, z: site.z, radius: shellRadii[grade], shape: shapeCycle[index % shapeCycle.length],
    outer: colors[index % colors.length], inner: cores[index % cores.length], launchId: site.id, grade };
}

export function burstLifetime(burst: { shape: ShellShape }) {
  return burst.shape === 'brocade' ? ordinaryBurstLifetime * 1.25 : ordinaryBurstLifetime;
}

export function burstSparks(burst: Pick<CelebrationBurst, 'shape'> & { grade?: ShellGrade }) {
  const sparks = burst.grade ? shellSparks[burst.grade] : shellSparks.S;
  return burst.shape === 'double-ring' ? Math.round(sparks * 1.6) : sparks;
}

export function burstEchoes(burst: Pick<CelebrationBurst, 'shape'> & { grade?: ShellGrade }) {
  return burst.shape === 'chrysanthemum' && (burst.grade === 'L' || burst.grade === 'XL') ? 5 : 3;
}

export function burstEnd(burst: { shape: ShellShape; time: number }) {
  return burst.time + burstLifetime(burst) + .22;
}

export function scorePeak(bursts: readonly (Pick<CelebrationBurst, 'shape' | 'time'> & { grade?: ShellGrade })[]) {
  let points = 0;
  let blooms = 0;
  for (const t of bursts.flatMap(burst => [burst.time, burst.time - showFlightSeconds])) {
    let total = 0;
    let lit = 0;
    for (const burst of bursts) {
      if (t >= burst.time && t < burstEnd(burst)) {
        total += burstSparks(burst) * burstEchoes(burst);
        lit++;
      } else if (t < burst.time && t >= burst.time - showFlightSeconds) total += 6;
    }
    points = Math.max(points, total);
    blooms = Math.max(blooms, lit);
  }
  return { points, blooms };
}

function share<T extends string>(slots: readonly number[], quotas: readonly [T, number][]) {
  const counts = quotas.map(() => 0);
  return slots.map((time, step) => {
    let winner = 0;
    let deficit = -Infinity;
    for (const [index, [, quota]] of quotas.entries()) {
      const need = (step + 1) * quota / slots.length - counts[index];
      if (counts[index] < quota && need > deficit) {
        deficit = need;
        winner = index;
      }
    }
    counts[winner]++;
    return { time, cue: quotas[winner][0] };
  });
}

type GroundHeight = (x: number, n: number) => number;

export function makeCeremonyScores(groundHeight: GroundHeight) {
  const launchPoints = surveyedLaunchPoints(launchSites, groundHeight);
  const main = 'fireworks-main' as const, far = 'fireworks-far' as const, finale = 'fireworks-finale' as const;
  // Slots follow one shared clock. Per-act quotas distribute the existing cue envelopes.
  const beats = [2, 1, 2, 4, 3, 5, 3, 5, 5, 5, 5, 5, 5, 5, 5, 4, 5, 4, 4, 4, 3, 3, 4, 2, 1, 1, 6, 1];
  const timeline = beats.flatMap((count, second) => {
    if (second === 0) return [1.8, 1.95];
    if (second === 1) return [2];
    if (second === 26) return [27.1, 27.5, 27.5, 27.5, 27.5, 27.5];
    return Array.from({ length: count }, (_, beat) => second + 1.1 + beat * .82 / count);
  });
  const scheduled = [
    ...share(timeline.filter(time => time < 8.8), [[main, 25]]),
    ...share(timeline.filter(time => time >= 8.8 && time < 14.8), [[main, 12], [far, 18]]),
    ...share(timeline.filter(time => time >= 14.8 && time !== 27.5), [[main, 17], [far, 10], [finale, 15]]),
    ...share(timeline.filter(time => time === 27.5), [[finale, 5]]),
  ].sort((left, right) => left.time - right.time);
  const scores: Record<CeremonyFireworksCue, CelebrationScore> = {
    [main]: { duration: 29, bursts: [], launchPoints },
    [far]: { duration: 22, bursts: [], launchPoints },
    [finale]: { duration: 16, bursts: [], launchPoints },
  };
  const bursts: Record<CeremonyFireworksCue, CelebrationBurst[]> = { [main]: [], [far]: [], [finale]: [] };
  const closeSites = launchSites.filter(site => site.ring === 0 || site.id === 'tower');
  let closingShell = 0;
  for (const [index, { time, cue }] of scheduled.entries()) {
    const elapsed = time - ceremonyCueOffsets[cue];
    const grade = time === 27.5 ? 'XL' : time < 8 ? (index % 3 ? 'M' : 'S') : time >= 28 ? 'S' : index % 4 < 2 ? 'L' : 'M';
    const burst = time === 27.5 ? fixedShell(elapsed, closingShell, grade, closeSites[closingShell++], 73) :
      time === 2 ? fixedShell(elapsed, 0, 'M', launchSites[5], 65) : shell(elapsed, index, grade, launchSites);
    bursts[cue].push(burst);
  }
  for (const cue of Object.keys(scores) as CeremonyFireworksCue[]) scores[cue].bursts = bursts[cue];
  const outer = launchSites.filter(site => site.ring === 2);
  const prelude: CelebrationScore = {
    duration: 590,
    launchPoints,
    bursts: Array.from({ length: 12 }, (_item, index) => fixedShell(
      showFlightSeconds + index * 45, index, 'S', outer[index % outer.length], 80 + index % 3 * 5,
    )),
  };
  return { prelude, scores };
}

function surveyedLaunchPoints(sites: readonly LaunchSite[], groundHeight: GroundHeight) {
  return sites.map(site => ({ id: site.id, x: site.x, z: site.z, y: 'y' in site ? site.y : groundHeight(site.x, -site.z) }));
}

const testSites = launchSites.filter(site => site.ring === 0 || site.id === 'lake');

export function makeCelebrationTestScore(seed: number, groundHeight: GroundHeight): CelebrationScore {
  const phases = [
    { begins: 0, ends: 5, count: 6 },
    { begins: 5, ends: 15, count: 15 },
    { begins: 15, ends: 27, count: 15 },
    { begins: 27, ends: 33, count: 4 },
  ];
  const seconds = phases.flatMap(({ begins, ends, count }) =>
    Array.from({ length: count }, (_, index) => begins + .85 + (ends - begins - 1) * index / count));
  const bursts = seconds.map((time, index) => shell(time, index, index < 6 ? 'S' : index % 3 ? 'M' : 'L', testSites, seed >>> 0));
  for (const [index, site] of testSites.entries()) bursts.push(fixedShell(33, index, 'L', site, 72));
  return { duration: testFireworksShowMs / 1000, launchPoints: surveyedLaunchPoints(testSites, groundHeight), bursts };
}

export function coverageCells(bursts: readonly Pick<CelebrationBurst, 'x' | 'y' | 'z'>[]) {
  const cells = new Set<string>();
  const azimuths = new Set<number>();
  for (const burst of bursts) {
    const dx = burst.x - eye.x, dz = burst.z - eye.z;
    const azimuth = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const elevation = Math.atan2(burst.y - eye.y, Math.hypot(dx, dz)) * 180 / Math.PI;
    const band = elevation < 10 || elevation > 85 ? -1 : elevation < 30 ? 0 : elevation < 55 ? 1 : 2;
    if (band < 0) continue;
    const sector = Math.floor(azimuth / 30);
    cells.add(`${sector}:${band}`);
    azimuths.add(sector);
  }
  const sectors = [...azimuths].sort((a, b) => a - b);
  const widestGap = Math.max(0, ...sectors.map((sector, index) => (sectors[index + 1] ?? sectors[0] + 12) - sector));
  return { cells: cells.size, azimuthSpan: sectors.length ? (12 - widestGap) * 30 : 0 };
}
