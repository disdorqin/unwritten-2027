import { shiftSummitGlideCourseWithDailyWind, type SummitWindCourse } from './main-summit-glide-day-course';
import type { SummitGlideRing } from './main-summit-glide-rings';

/**
 * Proposed host-to-course boundary, not an established G-09 wire frame.
 * The current G-09 TownOutdoorWeatherState has only unit direction and
 * normalized strength 0..1; neither specifies mountain velocity in m/s.
 * Never infer a physical velocity or generate pseudo-wind here.
 */
export type SummitGlideWindReceipt = Readonly<{
  kind: 'summit-glide-day-wind';
  source: 'G-09';
  unit: 'm/s';
  dayId: string;
  revision: number;
  issuedAtMs: number;
  effectiveAtMs: number;
  expiresAtMs: number;
  eastMetresPerSecond: number;
  northMetresPerSecond: number;
}>;

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseSummitGlideWindReceipt(raw: unknown): SummitGlideWindReceipt | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const v = raw as Record<string, unknown>;
  if (v.kind !== 'summit-glide-day-wind' || v.source !== 'G-09' || v.unit !== 'm/s' ||
      typeof v.dayId !== 'string' || !v.dayId || v.dayId.trim() !== v.dayId ||
      v.dayId.length > 64 || !timestamp(v.revision) ||
      !timestamp(v.issuedAtMs) || !timestamp(v.effectiveAtMs) || !timestamp(v.expiresAtMs) ||
      v.effectiveAtMs >= v.expiresAtMs || v.issuedAtMs > v.expiresAtMs ||
      typeof v.eastMetresPerSecond !== 'number' || typeof v.northMetresPerSecond !== 'number' ||
      !Number.isFinite(v.eastMetresPerSecond) || !Number.isFinite(v.northMetresPerSecond) ||
      Math.hypot(v.eastMetresPerSecond, v.northMetresPerSecond) > 35) return;

  // The existing normalized strength and snowball acceleration interfaces
  // are different units; do not silently mix the two on the same receipt.
  if ('windStrength' in v || 'accelerationEast' in v || 'accelerationNorth' in v) return;
  return Object.freeze({
    kind: 'summit-glide-day-wind', source: 'G-09', unit: 'm/s',
    dayId: v.dayId, revision: v.revision,
    issuedAtMs: v.issuedAtMs, effectiveAtMs: v.effectiveAtMs,
    expiresAtMs: v.expiresAtMs,
    eastMetresPerSecond: v.eastMetresPerSecond,
    northMetresPerSecond: v.northMetresPerSecond,
  });
}

export type SummitOfficialDayCourse = Readonly<{
  receipt: SummitGlideWindReceipt;
  course: SummitWindCourse;
}>;

type Host = Readonly<{
  /** MUST read from the authenticated G-09 host, never a client-supplied packet. */
  receive: () => unknown;
  /** Same authoritative epoch as the host; no local Date.now fallback. */
  nowMs: () => number;
  groundAt: (east: number, north: number) => number | undefined;
}>;

/**
 * Read-only host gate:
 *  - refuses undated/expired/non-m/s inputs instead of fabricating a course;
 *  - freezes the source on receipt and rejects out-of-order revisions;
 *  - never mutates the published base rings;
 *  - does not treat a 100-minute weather phase as a physical "day" by itself.
 */
export function createSummitOfficialDayCourseGate(base: readonly SummitGlideRing[], host: Host) {
  if (base.length < 8 || base.length > 10) throw new RangeError('Official race course needs 8–10 surveyed rings');
  let lastRevision = -1;
  let lastFingerprint = '';
  let current: SummitOfficialDayCourse | undefined;

  function atServerNow(): SummitOfficialDayCourse | undefined {
    const now = host.nowMs();
    if (!timestamp(now)) return;
    const next = parseSummitGlideWindReceipt(host.receive());
    if (!next) {
      if (current && now >= current.receipt.effectiveAtMs && now < current.receipt.expiresAtMs) return current;
      return;
    }
    if (now < next.effectiveAtMs || now >= next.expiresAtMs || next.issuedAtMs > now) return;
    const fingerprint = [next.dayId, next.revision, next.effectiveAtMs, next.expiresAtMs,
      next.eastMetresPerSecond, next.northMetresPerSecond].join('|');
    if (next.revision < lastRevision || next.revision === lastRevision && fingerprint !== lastFingerprint) return;
    if (current && lastRevision === next.revision && fingerprint === lastFingerprint) return current;

    const course = shiftSummitGlideCourseWithDailyWind(base, {
      dayId: next.dayId, eastMetresPerSecond: next.eastMetresPerSecond,
      northMetresPerSecond: next.northMetresPerSecond,
    }, host.groundAt);
    if (!course) return;
    current = Object.freeze({ receipt: next, course });
    lastRevision = next.revision;
    lastFingerprint = fingerprint;
    return current;
  }

  return { atServerNow };
}
