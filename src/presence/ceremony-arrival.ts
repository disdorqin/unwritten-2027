import { MAX_SESSIONS } from './protocol.js';

/** docs/PLAN.md — the only formal midnight, 2027-01-01 00:00 Beijing time. */
export const townCeremonyMidnight = Date.UTC(2026, 11, 31, 16);
export const ceremonyLandingLeadMs = 10_000;
export const ceremonyLateWindowMs = 10 * 60_000;
export const ceremonyLandingCentre = [224, 188] as const;
// The guide specifies the T−10 cue but gives no verbatim announcement for it.
export const ceremonyLandingAnnouncement = '跨年仪式即将开始，全镇将前往中央广场。';

type Landing = { east: number; north: number; focus: 'stage' | 'tree' };
export type CeremonyArrival = {
  type: 'event';
  kind: 'ceremony-arrival';
  startAt: number;
  slot: number;
  edge: boolean;
};

const lampColumns = [216.5, 231.5].flatMap(east =>
  Array.from({ length: 6 }, (_, tier) => [east, 157 + tier * 11, 1.05] as const));
const plannedExclusions = [
  ...lampColumns,
  [208, 198, 7.4], [221.05, 181.05, 1.3],
  [226, 200, 2.6], [240, 200, 2.6],
  [218, 190, 2], [216, 196, 1.8],
  [238, 186, 1.75], [238, 191, 1.75], [238, 196, 1.75],
  [240, 173, 4.2], [238, 205, 4.2],
] as const;

function ring(radius: number, count: number, rotation: number) {
  const [centreEast, centreNorth] = ceremonyLandingCentre;
  const spots: Landing[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index + rotation) * 2 * Math.PI / count;
    const east = Math.round((centreEast + Math.cos(angle) * radius) * 100) / 100;
    const north = Math.round((centreNorth + Math.sin(angle) * radius) * 100) / 100;
    if (plannedExclusions.some(([x, n, clearance]) => Math.hypot(east - x, north - n) < clearance)) continue;
    spots.push({ east, north, focus: east < centreEast ? 'tree' : 'stage' });
  }
  return spots;
}

// Put the next guest as far from the occupied slots as possible, even for a small crowd.
function spreadRings(rings: Landing[][]): readonly Landing[] {
  const remaining = rings.flat().map(spot => ({ spot, clearance: Infinity }));
  const landings: Landing[] = [];
  while (remaining.length) {
    let next = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (remaining[i].clearance > remaining[next].clearance) next = i;
    }
    const [{ spot }] = remaining.splice(next, 1);
    landings.push(spot);
    for (const candidate of remaining) {
      const distance = Math.hypot(candidate.spot.east - spot.east, candidate.spot.north - spot.north);
      candidate.clearance = Math.min(candidate.clearance, distance);
    }
  }
  return landings;
}

export const ceremonyMainLandings = spreadRings([ring(4, 18, 0), ring(7, 30, .5), ring(10, 44, .25)]);
export const ceremonyEdgeLandings = spreadRings([ring(13.5, 60, .5), ring(16.5, 74, .25)]);

export function ceremonyArrivalAt(slot: number, edge: boolean): Landing | undefined {
  return (edge ? ceremonyEdgeLandings : ceremonyMainLandings)[slot];
}

export function readCeremonyArrival(value: unknown): CeremonyArrival | undefined {
  if (!value || typeof value !== 'object') return;
  const event = value as Partial<CeremonyArrival>;
  if (event.type !== 'event' || event.kind !== 'ceremony-arrival' ||
      typeof event.startAt !== 'number' || !Number.isSafeInteger(event.startAt) ||
      typeof event.slot !== 'number' || !Number.isInteger(event.slot) || event.slot < 0 ||
      typeof event.edge !== 'boolean' || !ceremonyArrivalAt(event.slot, event.edge)) return;
  return { type: 'event', kind: 'ceremony-arrival', startAt: event.startAt, slot: event.slot, edge: event.edge };
}

if (ceremonyMainLandings.length < MAX_SESSIONS || ceremonyEdgeLandings.length < MAX_SESSIONS) {
  throw new Error('The ceremony plaza cannot seat all allowed presence sessions.');
}
