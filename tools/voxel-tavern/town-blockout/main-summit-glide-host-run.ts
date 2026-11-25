import { createSummitGlideRingScore } from './main-summit-glide-ring-score';
import { summitGlideRingBodyLift, type SummitGlideRing } from './main-summit-glide-rings';
import { createSummitGlideTargetRun, type SummitGlideTarget } from './main-summit-glide-target';

type Point = Readonly<{ east: number; north: number; height: number }>;
export type SummitGlideAcceptedFrame = Readonly<{
  flightId: string;
  playerId: string;
  dayId: string;
  frame: number;
  atMs: number;
  accepted: boolean;
  point: Point;
  phase: 'airborne' | 'landed';
  touchdown: 'soft' | 'seated' | null;
}>;

export type SummitGlideHostConfig = Readonly<{
  flightId: string;
  playerId: string;
  dayId: string;
  startedAtMs: number;
  launch: Point;
  rings: readonly SummitGlideRing[];
  target: SummitGlideTarget;
  groundAt: (east: number, north: number) => number | undefined;
}>;

export type SummitGlideFrameDecision =
  | Readonly<{ accepted: false; reason: 'identity' | 'unauthorized' | 'stale-frame' | 'unsafe-step' | 'completed' }>
  | Readonly<{ accepted: true; finalized: boolean; ringCount: number; scoreHalfPoints: number; streak: number }>;

/**
 * Host-only coordinator for already-authoritative flight frames. This cannot
 * itself authenticate clients or certify a host clock: it must never be wired
 * straight to untrusted websocket packets. The hosting presence domain must
 * supply validated player identity, movement receipts, and the G-09 day course.
 *
 * The coordinator never moves a player and never generates a synthetic wind.
 * All repeated/late/implausible frames are rejected before they affect score.
 */
export function createSummitGlideHostRun(config: SummitGlideHostConfig) {
  const validId = (s: string) => typeof s === 'string' && s.trim().length > 0 && s.trim() === s && s.length <= 128;
  const finitePoint = (p: Point) => [p?.east, p?.north, p?.height].every(Number.isFinite);
  if (![config.flightId, config.playerId, config.dayId].every(validId) ||
      !Number.isSafeInteger(config.startedAtMs) || config.startedAtMs < 0 ||
      !finitePoint(config.launch) || !config.rings.length) {
    throw new RangeError('A glide host run requires a valid accepted launch identity and course');
  }
  const score = createSummitGlideRingScore(config.rings);
  const target = createSummitGlideTargetRun(config.flightId, config.target, config.groundAt);
  const expected = Object.freeze({
    flightId: config.flightId, playerId: config.playerId, dayId: config.dayId,
  });
  let previous = { ...config.launch };
  let lastFrame = 0;
  let lastMs = config.startedAtMs;
  let finalized = false;

  function snapshot() {
    const current = score.snapshot();
    return {
      ...expected,
      lastFrame, atMs: lastMs,
      lastAccepted: { ...previous },
      finalized,
      ...current,
      target: target.snapshot(),
    };
  }

  function consume(receipt: SummitGlideAcceptedFrame): SummitGlideFrameDecision {
    if (receipt.flightId !== expected.flightId || receipt.playerId !== expected.playerId ||
        receipt.dayId !== expected.dayId) return { accepted: false, reason: 'identity' };
    if (finalized) return { accepted: false, reason: 'completed' };
    if (!receipt.accepted || !finitePoint(receipt.point) ||
        (receipt.phase !== 'airborne' && receipt.phase !== 'landed') ||
        (receipt.phase === 'airborne' && receipt.touchdown !== null) ||
        (receipt.phase === 'landed' && receipt.touchdown !== 'soft' && receipt.touchdown !== 'seated')) {
      return { accepted: false, reason: 'unauthorized' };
    }
    if (!Number.isSafeInteger(receipt.frame) || receipt.frame <= lastFrame ||
        !Number.isSafeInteger(receipt.atMs) || receipt.atMs <= lastMs) {
      return { accepted: false, reason: 'stale-frame' };
    }
    const dt = (receipt.atMs - lastMs) / 1000;
    const travelled = Math.hypot(
      receipt.point.east - previous.east, receipt.point.north - previous.north,
      receipt.point.height - previous.height,
    );
    const floor = config.groundAt(receipt.point.east, receipt.point.north);
    if (dt > 1 || travelled > Math.min(8, dt * 30 + .2) ||
        floor !== undefined && (!Number.isFinite(floor) || receipt.point.height < floor - .1)) {
      return { accepted: false, reason: 'unsafe-step' };
    }
    if (receipt.phase === 'airborne') {
      score.advance({ ...previous, height: previous.height + summitGlideRingBodyLift },
        { ...receipt.point, height: receipt.point.height + summitGlideRingBodyLift }, true);
    } else {
      const settled = target.settle({
        ...receipt.point, flightId: receipt.flightId, accepted: true,
        phase: 'landed', touchdown: receipt.touchdown,
      });
      if (!settled) return { accepted: false, reason: 'unsafe-step' };
      finalized = true;
    }
    previous = { ...receipt.point };
    lastFrame = receipt.frame;
    lastMs = receipt.atMs;
    const current = score.snapshot();
    return {
      accepted: true, finalized, ringCount: current.nextRing,
      scoreHalfPoints: current.scoreHalfPoints, streak: current.streak,
    };
  }

  return { snapshot, consume };
}
