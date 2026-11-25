/**
 * Glide run record — persistence + atlas shape (atlas package B1;
 * window D's ZD-08 receipt names window B for 持久化与图鉴接线).
 *
 * Scoring canon for ZD-08 is D's flight-tested nine-ring half-point
 * system (rings at process mileages 60/120/190/260/330/400/470/540/
 * 610 m): a clean pass is +2 half-points, a graze +1, a missed ring
 * breaks the combo, and the run settles on the landing target by
 * distance to the bullseye. This leaf does NOT score — the course
 * host scores and its ledger is the only one that may be recorded
 * (双账: the display ledger never writes records). What lives here is
 * the shared record shape, the best-run ordering and the atlas rule,
 * so ZD-08, the ZB-33 ring race and the B3 summit sled line all keep
 * ONE ledger format keyed by course id (总包 B3: 共用账本).
 */
export type GlideRunRecord = Readonly<{
  courseId: string;
  /** Host-verified half-points (clean 2 / graze 1 per ring). */
  halfPoints: number;
  /** Rings passed in order (clean or grazed). */
  ringsPassed: number;
  /** Best combo streak inside the run. */
  bestCombo: number;
  /** Landing distance to the bullseye in metres; null = no landing. */
  landingOffsetM: number | null;
  durationMs: number;
  finishedAtMs: number;
}>;

/** Better = more half-points, then tighter landing, then faster. */
export function glideRecordBeats(candidate: GlideRunRecord, current: GlideRunRecord | undefined): boolean {
  if (!current) return true;
  if (candidate.halfPoints !== current.halfPoints) return candidate.halfPoints > current.halfPoints;
  const candidateOffset = candidate.landingOffsetM ?? Number.POSITIVE_INFINITY;
  const currentOffset = current.landingOffsetM ?? Number.POSITIVE_INFINITY;
  if (candidateOffset !== currentOffset) return candidateOffset < currentOffset;
  return candidate.durationMs < current.durationMs;
}

/**
 * Atlas rule: the glide page is recorded on the first FINISHED run
 * (all rings attempted and a landing settled — a bail-out records
 * nothing), and the stored best only ever moves by glideRecordBeats.
 * The page shows numbers, never a grade ladder.
 */
export function glideAtlasShouldRecord(record: GlideRunRecord, ringsTotal: number): boolean {
  return record.ringsPassed >= 0 && record.landingOffsetM !== null && ringsTotal > 0;
}
