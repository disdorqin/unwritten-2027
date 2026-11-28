/**
 * C-2 fixed *scenery* work lights on the B-01 pit floor (local east/north).
 * These never represent collectible camp lanterns, ore sites, a new miner
 * camp, or a separate action/authority. Kept in one file so C3 loose rock
 * masks cannot grow into the lamp plinths in later art revisions.
 */
export const craterFloorWorklightSites = Object.freeze([
  { id:'c2/winch-watch', east:9.8, north:-3.2 },
  { id:'c2/south-brace',east:3.4, north:-10.6 },
  // Batch98: retain the true-light chain; move away from the lamp-room door pool.
  { id:'c2/haulage-turn',east:15,north:-6 },
  // B33: reuse this carrier for the dark haul-road exit. Its new pad is
  // inside the surveyed floor, clear of the spiral and descent approach.
  { id:'c2/west-platform',east:-14,north:-10 },
  { id:'c2/north-rest',east:-5.5,north:9.5 },
  { id:'c2/return-side',east:6.0,north:9.2 },
] as const);
export const craterFloorLampRockBufferM = 1.45;
