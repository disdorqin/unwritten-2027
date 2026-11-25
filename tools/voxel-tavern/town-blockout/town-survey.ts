/**
 * Survey line & rubbings (新图修订章一 · rule 1, branch window B).
 *
 * Seven survey stations M1–M7 (M1–M3 sited by window A, M4–M7 by
 * window D) carry plate readings DERIVED from the ZB-17 beacon drift
 * table — the same table the night clock runs on
 * (src/presence/start.ts: beaconOffsetsAfterDusk = 50 s + 11 s·night,
 * 12 nights). Station Mk's reading is the table's (k−1)-th entry, in
 * seconds. The derivation is the design; no in-game text explains it,
 * and this leaf deliberately exports no explanatory copy.
 *
 * Players take a rubbing at each station; any 5 distinct rubbings
 * unlock the atlas page 「测绘手记」, whose entire text is one line
 * (surveyNotesPageText). The host renders the page; the leaf owns the
 * unlock rule and the line.
 */

export const surveyStationIds = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'] as const;
export type SurveyStationId = (typeof surveyStationIds)[number];

/** The full beacon drift table (seconds after dusk), mirrored from the
 *  night clock's canonical defaults so tests can pin the isomorphism. */
export const beaconDriftTableSeconds: readonly number[] =
  Array.from({ length: 12 }, (_, night) => 50 + night * 11);

/** Station Mk (1-based k) reads the drift table's (k−1)-th entry. */
export function surveyReadingSeconds(station: SurveyStationId): number {
  const index = surveyStationIds.indexOf(station);
  return beaconDriftTableSeconds[index];
}

/**
 * The exact plate inscription for a station, three lines, ready to be
 * carved by the siting window. Both numbers encode the same reading:
 * the staff reading is seconds/100 (0.500 … 1.160), the bearing is the
 * seconds as degrees. Nothing else goes on the plate.
 */
export function surveyPlateLines(station: SurveyStationId): readonly [string, string, string] {
  const seconds = surveyReadingSeconds(station);
  return [
    `觇标 ${station}`,
    `标尺 ${(seconds / 100).toFixed(3)}`,
    `方位 ${seconds}°00′`,
  ];
}

export const surveyRubbingUnlockCount = 5;
export const surveyNotesPageText = '七个站，一条线。他们量的不是地。';

export function createSurveyRubbings() {
  const taken = new Set<SurveyStationId>();
  return {
    /** Returns true when this rubbing is new. */
    record(station: SurveyStationId): boolean {
      if (taken.has(station)) return false;
      taken.add(station);
      return true;
    },
    has: (station: SurveyStationId) => taken.has(station),
    count: () => taken.size,
    stations: () => [...taken],
    notesUnlocked: () => taken.size >= surveyRubbingUnlockCount,
  };
}
