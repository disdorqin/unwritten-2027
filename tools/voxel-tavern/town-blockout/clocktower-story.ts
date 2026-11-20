import { Vector3, type Group } from 'three';
import { towerTime } from './town-clocktower-time';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

type Point = readonly [east: number, height: number, south: number];
type Box = (kind: string, x: number, y: number, z: number, width: number, height: number, depth: number) => void;
type NightClock = Readonly<{
  phase: 'day' | 'awaiting-beacon' | 'night-window';
  beaconAt: number | null;
  morningBellAt: number | null;
}>;
export type ClocktowerStoryHost = Readonly<{
  now(): number;
  nightWindow(): NightClock | undefined;
  atWatchPoint?(): void;
  atNightLedger?(): void;
}>;

const floor = .3125;
const deskHeight = floor + .91;
const books = [
  { title: '活人账', x: -11.91, color: 'teal' },
  { title: '魂账', x: -11.34, color: 'oxblood' },
] as const;
export const clocktowerRepairApproaches = books.map(({ x }) => [x, floor, 3.62] as const);

/** Uses the existing ground-level west wing repair bench and its floor envelope. */
export function addClocktowerRepairBooks(box: Box) {
  for (const { x, color } of books) {
    box(color, x - .22, deskHeight, 2.48, .44, .036, .30);
    box('ivory', x - .20, deskHeight + .036, 2.49, .40, .045, .28);
    box(color, x - .22, deskHeight + .081, 2.48, .44, .03, .30);
    box('brass', x - .10, deskHeight + .111, 2.64, .20, .006, .038);
  }
}

// The half moon and the falling arc match the two motifs on the ship nameplate.
const crescent = ['....###', '..####.', '.###...', '.##....', '.##....', '..##...', '...####'] as const;
const fallingArc = ['##......', '..##....', '....#...', '.....#..', '......##'] as const;
type BellBand = readonly [rise: number, radius: number, height: number, color: string];
const cell = 1 / 32;
const ringSlice = .125;
const bellLip = .1875;

/** Cast the mark into the hollow far side so it rides the existing bell axle. */
export function addClocktowerBellCasting(box: Box, base: number, profile: readonly BellBand[]) {
  for (const [rows, east, top] of [[crescent, -.31, .75], [fallingArc, -.037, .67]] as const) {
    for (const [row, pixels] of rows.entries()) {
      const y = top - row * cell;
      const band = profile.find(([rise, , height]) => y >= rise && y + cell <= rise + height);
      if (!band) continue;
      const radius = band[1];
      const inner = radius - bellLip;
      for (const [column, pixel] of [...pixels].entries()) {
        if (pixel !== '#') continue;
        const x = east + column * cell;
        // Calculate the inner face of the same stepped ring used for the bell shell.
        for (let z = -radius; z < 0; z += ringSlice) {
          const radial = z + ringSlice / 2;
          const innerEdge = Math.round(Math.sqrt(Math.max(0, inner ** 2 - radial ** 2)) / cell) * cell;
          if (Math.abs(x + cell / 2) < innerEdge) {
            box('copperDark', x, base + y, z - .008, cell, cell, .026);
            break;
          }
        }
      }
    }
  }
}

export const clocktowerWatchApproach = (height: number): Point => [-.48, height, 1.29];

/** A recessed tread plate beside the existing lookout, clear of the stair landing. */
export function addClocktowerWatchPlate(box: Box, height: number) {
  const [x, , z] = clocktowerWatchApproach(height);
  box('copperDark', x - .31, height, z - .20, .62, cell / 4, .40);
  for (const [width, depth, dx, dz] of [
    [.62, cell, -.31, -.20], [.62, cell, -.31, .20 - cell],
    [cell, .40, -.31, -.20], [cell, .40, .31 - cell, -.20],
  ]) box('brass', x + dx, height + cell / 4, z + dz, width, cell / 4, depth);
}

const format = (ms: number) => towerTime(ms, null, false).plate;

export function readClocktowerNightLedger(host: ClocktowerStoryHost) {
  const now = host.now();
  const schedule = host.nightWindow();
  if (schedule === undefined || !Number.isFinite(now)) return;
  const { beaconAt: beacon, morningBellAt: morning } = schedule;
  if (typeof beacon !== 'number' || typeof morning !== 'number' ||
    !Number.isSafeInteger(beacon) || !Number.isSafeInteger(morning) || beacon < 0 || beacon >= morning || now >= morning) return;
  return {
    bellTime: format(beacon),
    morningTime: format(morning),
    openingObserved: schedule.phase === 'night-window' && now >= beacon,
  };
}

export function createClocktowerStorySpots(tower: Group, context: Pick<TownActivityContext, 'open' | 'face'>,
  host: ClocktowerStoryHost): TownActivitySpot[] {
  const { lookout } = tower.userData.stops as { lookout: Point };
  const spot = (at: Point, range: number, label: string, run: () => void): TownActivitySpot => {
    const point = tower.localToWorld(new Vector3(...at));
    return { x: point.x, n: -point.z, ground: point.y, range, label, run };
  };
  const [ordinary, night] = books;
  const [ordinaryApproach, nightApproach] = clocktowerRepairApproaches;
  const watch = clocktowerWatchApproach(lookout[1]);
  return [
    spot(ordinaryApproach, .65, '翻看活人账', () => {
      const current = host.now();
      const hour = 3_600_000;
      const lastHour = Math.floor(current / hour) * hour;
      context.open(ordinary.title, Number.isFinite(current)
        ? `日常报时 · ${format(lastHour)}　下一整点 · ${format(lastHour + hour)}`
        : '日常报时时刻未同步。');
    }),
    spot(nightApproach, .65, '翻看魂账', () => {
      const reading = readClocktowerNightLedger(host);
      if (!reading) {
        context.open(night.title, '第十三声时刻未同步。');
        return;
      }
      context.open(night.title, `第十三声${reading.openingObserved ? ' · ' : '预计 · '}${reading.bellTime}　晨钟 · ${reading.morningTime}`);
      host.atNightLedger?.();
    }),
    spot(watch, .17, '在塔顶守夜', () => {
      const sight = tower.localToWorld(new Vector3(watch[0], watch[1] + 1.58, 5));
      context.face(sight.x, -sight.z, sight.y);
      host.atWatchPoint?.();
    }),
  ];
}
