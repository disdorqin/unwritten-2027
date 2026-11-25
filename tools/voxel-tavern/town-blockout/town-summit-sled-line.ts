/**
 * Summit sled line — descent rules (atlas package B3, branch window B).
 *
 * The course: from the summit departure platform (atlas m58, night
 * m84) down the main-peak sled line, canon length 6,037.881 m with 12
 * flag gates in order. Sleds only ever go DOWN this line; a run can
 * only start at the platform. Gate geometry is host-supplied (window
 * D's line survey); everything about timing, order and endings lives
 * here.
 *
 * Falling is part of the course (ZB-16 canon): a crash never ends a
 * run, never resets position and never stops the clock — the player
 * walks back to the sled and re-mounts where it lies. The clock also
 * keeps running through stops and detours. A run ends only by
 * finishing, by the host signalling abandonment (domain change /
 * teleport / explicit give-up), or not at all.
 *
 * Ledger: records share the course-keyed store shape with the ZB-33
 * ring race (总包 B3: 计时共用账本). A best must be a full run — all
 * 12 gates in order — and beats purely on time. Partial runs are
 * practice records, never bests.
 */
export const summitSledLineLengthM = 6037.881;
export const summitSledGateCount = 12;
export const summitSledCourseId = 'summit-sled-line';

export type SledGate = Readonly<{ east: number; north: number; halfWidth: number }>;
export type SledPoint = Readonly<{ east: number; north: number }>;

export type SummitSledRecord = Readonly<{
  courseId: string;
  totalMs: number;
  /** Per-gate split times (ms since start), length = gates passed. */
  splitsMs: readonly number[];
  gatesPassed: number;
  finishedAtMs: number;
}>;

export function summitSledRecordBeats(candidate: SummitSledRecord, current: SummitSledRecord | undefined): boolean {
  if (candidate.gatesPassed !== summitSledGateCount) return false;
  if (!current) return true;
  return candidate.totalMs < current.totalMs;
}

/** The ring race's mountain segment = splits between two gate indices. */
export function segmentSplitMs(splitsMs: readonly number[], fromGate: number, toGate: number): number | undefined {
  if (fromGate < 0 || toGate >= splitsMs.length || toGate <= fromGate) return undefined;
  return splitsMs[toGate]! - splitsMs[fromGate]!;
}

export function createSummitSledRun(gates: readonly SledGate[]) {
  if (gates.length !== summitSledGateCount) {
    throw new Error(`summit sled line needs exactly ${summitSledGateCount} gates, got ${gates.length}`);
  }
  let startedAt: number | undefined;
  let previous: SledPoint | undefined;
  let nextGate = 0;
  const splitsMs: number[] = [];
  let result: (SummitSledRecord & { status: 'finished' | 'abandoned' }) | undefined;

  /** Crossing of segment a→b with the gate line through gate g (perpendicular to travel a→b is NOT assumed; gates are crossed along the course direction: use the gate's own line = the line through g perpendicular to the segment direction). */
  function crossedGate(a: SledPoint, b: SledPoint, gate: SledGate): boolean {
    const dx = b.east - a.east, dy = b.north - a.north;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return false;
    const ux = dx / length, uy = dy / length;
    const da = (a.east - gate.east) * ux + (a.north - gate.north) * uy;
    const db = (b.east - gate.east) * ux + (b.north - gate.north) * uy;
    if (da > 0 || db < 0 || db === da) return false;
    const mix = -da / (db - da);
    const crossEast = a.east + dx * mix, crossNorth = a.north + dy * mix;
    // Lateral distance from the gate centre along the gate line.
    const lateral = Math.abs((crossEast - gate.east) * -uy + (crossNorth - gate.north) * ux);
    return lateral <= gate.halfWidth;
  }

  return {
    /** Arm the run at the departure platform. The clock starts on the first movement step. */
    arm() {
      startedAt = undefined; previous = undefined; nextGate = 0; splitsMs.length = 0; result = undefined;
    },
    /**
     * Feed one sled movement step. Falling, stopping and walking back
     * are not steps of the sled — the host simply stops feeding while
     * the player is off the sled, and the clock keeps running.
     */
    step(to: SledPoint, atMs: number) {
      if (result) return result;
      if (startedAt === undefined) { startedAt = atMs; previous = to; return undefined; }
      const from = previous!;
      previous = to;
      const gate = gates[nextGate];
      if (gate && crossedGate(from, to, gate)) {
        splitsMs.push(atMs - startedAt);
        nextGate += 1;
        if (nextGate === gates.length) {
          result = { courseId: summitSledCourseId, totalMs: atMs - startedAt, splitsMs: [...splitsMs], gatesPassed: nextGate, finishedAtMs: atMs, status: 'finished' };
          return result;
        }
      }
      return undefined;
    },
    /** Host-signalled end (domain change / teleport / give-up). Falls never call this. */
    abandon(atMs: number) {
      if (result || startedAt === undefined) return result;
      result = { courseId: summitSledCourseId, totalMs: atMs - startedAt, splitsMs: [...splitsMs], gatesPassed: nextGate, finishedAtMs: atMs, status: 'abandoned' };
      return result;
    },
    state() {
      return { running: startedAt !== undefined && !result, nextGate, splitsMs: [...splitsMs], result };
    },
  };
}
