/** Signed outdoor coordinates in meters, east then north. Feet height comes from town support. */
export type MascotPatrolPoint = readonly [east: number, north: number];

export const mascotPenBounds = {
  west: 61, east: 70, south: 213, north: 218,
  entrance: { south: 213.7, north: 216.3 },
} as const;

export const mascotPatrolSites = {
  pen: [66, 215],
  penEntrance: [70, 215],
  plazaSun: [184, 195],
  tavernDoor: [158, 218],
  // Public ground by old-town:117:202. The story's permanent old-home anchor is still under review.
  oldHomeSide: [109, 202],
  wishTreeNap: [198.3, 208.6],
} as const satisfies Record<string, MascotPatrolPoint>;

const { pen, penEntrance, plazaSun, tavernDoor, oldHomeSide, wishTreeNap } = mascotPatrolSites;
const penApproach = [73, 215] as const;
const westLane = [88, 215] as const;
const upperLane = [110, 217] as const;
const tavernApproach = [151, 215] as const;
const upperBend = [133, 234] as const;
const penToPlaza = [
  pen, penEntrance, penApproach, westLane,
  [89, 205], [112, 195], [114, 193], [152, 192], [161, 201], plazaSun,
] as const satisfies readonly MascotPatrolPoint[];
const plazaToTavern = [plazaSun, [161, 202], tavernApproach, tavernDoor] as const satisfies readonly MascotPatrolPoint[];
const tavernToUpperLane = [tavernDoor, tavernApproach, upperBend, upperLane] as const;
const upperLaneToPen = [upperLane, westLane, penApproach, penEntrance, pen] as const;
const tavernToOldHome = [...tavernToUpperLane, oldHomeSide] as const;
const oldHomeToPen = [oldHomeSide, ...upperLaneToPen] as const;
const plazaToNap = [plazaSun, [196.1, 207.5], wishTreeNap] as const satisfies readonly MascotPatrolPoint[];

/** Each leg includes its start and its next standing point. ZB-25 owns travel and dwell timing. */
export const mascotDayPatrolLegs = [penToPlaza, plazaToTavern, tavernToOldHome, oldHomeToPen] as const;
export const mascotWishTreeNapPath = plazaToNap;

/** Safe ground routes from the standing points. A weather cue is handled by ZB-25. */
type ReturnSite = Exclude<keyof typeof mascotPatrolSites, 'penEntrance'>;
const plazaToPen = [...penToPlaza].reverse();
const napToPlaza = [...plazaToNap].reverse();
export const mascotWhiteoutReturnPaths: Readonly<Record<ReturnSite, readonly MascotPatrolPoint[]>> = {
  pen: [pen],
  plazaSun: plazaToPen,
  tavernDoor: [...tavernToUpperLane, ...upperLaneToPen.slice(1)],
  oldHomeSide: oldHomeToPen,
  wishTreeNap: [...napToPlaza, ...plazaToPen.slice(1)],
};
