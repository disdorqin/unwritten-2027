/**
 * ZB-41 · Bellkeeper duty — the rules host, not a second clock.
 *
 * Every clock boundary MUST be supplied from the authoritative ZB-17 night
 * beacon schedule. This module never derives a night from local time, never
 * sends a broadcast and never grants the persistent witness flag itself.
 * The presence server is responsible for authenticated profile resolution,
 * persistence, audio broadcast, and checking whether a bell rope is reachable.
 */
export type TownBellName = 'dusk' | 'midnight' | 'second-midnight' | 'dawn';
export type TownManualBell = Exclude<TownBellName, 'dawn'>;
export type TownBellGrade = 'accurate' | 'missed' | 'over' | 'automatic';
export type TownBellkeeperSchedule = Readonly<{
  nightId: string;
  duskAt: number;
  midnightAt: number;
  secondMidnightAt: number;
  beaconAt: number;
  /** End of the full one-minute gaze trial, NOT the broadcast cue's TTL. */
  beaconExpiresAt: number;
  dawnAt: number;
}>;
export type TownBellkeeperTuning = Readonly<{
  /** Scene balance supplied by approved design; no arbitrary global threshold. */
  minimumChargeMs: number;
  maximumChargeMs: number;
  /** How long a gaze sample may cover; guards against disconnected clients. */
  maxGazeSampleGapMs: number;
}>;
export type TownBellRecord = Readonly<{
  bell: TownBellName;
  at: number | null;
  chargeMs: number | null;
  grade: TownBellGrade;
}>;
export type TownBellkeeperPage = Readonly<{
  nightId: string;
  beganAt: number;
  closedAt: number;
  records: readonly TownBellRecord[];
  observedMs: number;
  requiredMs: number;
  witnessed: boolean;
  interrupted: boolean;
}>;
type Pull = { bell: TownManualBell; at: number };
type Session = {
  schedule: TownBellkeeperSchedule;
  beganAt: number;
  latestAt: number;
  records: Map<TownManualBell, TownBellRecord>;
  pull: Pull | null;
  lastGazeAt: number | null;
  lastGaze: boolean;
  observedMs: number;
  interrupted: boolean;
  page: TownBellkeeperPage | null;
};

const ORDER: readonly TownManualBell[] = ['dusk', 'midnight', 'second-midnight'];
const WINDOW_MS = 6_000;
const MIN_WITNESS_RATIO = 0.8;

function validTime(time: number) {
  return Number.isSafeInteger(time) && time >= 0;
}
function requireSchedule(s: TownBellkeeperSchedule) {
  if (!s || !s.nightId || s.nightId.length > 96 ||
    ![s.duskAt, s.midnightAt, s.secondMidnightAt, s.beaconAt,
      s.beaconExpiresAt, s.dawnAt].every(validTime) ||
    !(s.duskAt < s.midnightAt && s.midnightAt < s.secondMidnightAt &&
      s.secondMidnightAt < s.beaconAt && s.beaconAt < s.beaconExpiresAt &&
      s.beaconExpiresAt < s.dawnAt) ||
    s.beaconExpiresAt - s.beaconAt !== 60_000) {
    throw new RangeError('Bellkeeper requires ordered authoritative ZB-17 night boundaries');
  }
}
function requireTuning(t: TownBellkeeperTuning) {
  if (![t.minimumChargeMs, t.maximumChargeMs, t.maxGazeSampleGapMs].every(validTime) ||
    t.minimumChargeMs === 0 || t.minimumChargeMs >= t.maximumChargeMs ||
    t.maxGazeSampleGapMs === 0 || t.maxGazeSampleGapMs > 2_000) {
    throw new RangeError('Invalid bellkeeper tuning');
  }
}
function targetOf(s: TownBellkeeperSchedule, bell: TownBellName) {
  switch (bell) {
    case 'dusk': return s.duskAt;
    case 'midnight': return s.midnightAt;
    case 'second-midnight': return s.secondMidnightAt;
    case 'dawn': return s.dawnAt;
  }
}
function isProfile(profile: string) {
  return typeof profile === 'string' && profile.length > 0 && profile.length <= 128;
}

/** Scene-only cues: a water-clock mark and next bell. No HUD arrows/cards. */
export function townBellkeeperWaterClock(schedule: TownBellkeeperSchedule, now: number) {
  requireSchedule(schedule);
  if (!Number.isFinite(now)) return null;
  const bells: readonly TownBellName[] = [...ORDER, 'dawn'];
  const next = bells.find(bell => now <= targetOf(schedule, bell));
  if (!next) return null;
  const index = bells.indexOf(next);
  const start = index === 0 ? schedule.duskAt - WINDOW_MS : targetOf(schedule, bells[index - 1]);
  const end = targetOf(schedule, next);
  return Object.freeze({
    bell: next,
    remainingMs: Math.max(0, end - now),
    liquidLevel: Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start))),
    withinMark: Math.abs(end - now) <= WINDOW_MS,
  });
}

export function createTownBellkeeperDuty(tuning: TownBellkeeperTuning) {
  requireTuning(tuning);
  const active = new Map<string, Session>();
  const pages = new Map<string, TownBellkeeperPage[]>();

  function sessionFor(profile: string, now: number) {
    if (!isProfile(profile) || !validTime(now)) return;
    const s = active.get(profile);
    if (!s || now < s.latestAt) return;
    s.latestAt = now;
    return s;
  }
  function addGaze(s: Session, now: number) {
    if (s.lastGazeAt !== null && now > s.lastGazeAt) {
      const from = Math.max(s.lastGazeAt, s.schedule.beaconAt);
      const to = Math.min(now, s.schedule.beaconExpiresAt);
      const gap = now - s.lastGazeAt;
      if (s.lastGaze && gap <= tuning.maxGazeSampleGapMs && to > from) {
        s.observedMs += to - from;
      }
    }
    s.lastGazeAt = now;
  }
  function recordView(s: Session) {
    return [...ORDER].map(bell => s.records.get(bell) ?? {
      bell, at: null, chargeMs: null, grade: 'missed' as const,
    });
  }
  function snapshotSession(s: Session) {
    const witnessDuration = s.schedule.beaconExpiresAt - s.schedule.beaconAt;
    const requiredMs = witnessDuration * MIN_WITNESS_RATIO;
    return Object.freeze({
      nightId: s.schedule.nightId,
      onDuty: !s.page,
      charging: s.pull?.bell ?? null,
      records: recordView(s),
      observedMs: s.observedMs,
      requiredMs,
      interrupted: s.interrupted,
      witnessed: s.page?.witnessed ?? false,
      completed: Boolean(s.page),
    });
  }
  function close(s: Session) {
    if (s.page) return s.page;
    const requiredMs = (s.schedule.beaconExpiresAt - s.schedule.beaconAt) * MIN_WITNESS_RATIO;
    // Merely holding the rope during the supernatural minute breaks the
    // hands-off requirement, even without a release or additional UI event.
    if (s.pull && s.pull.at < s.schedule.beaconExpiresAt) s.interrupted = true;
    const records: TownBellRecord[] = [
      ...recordView(s),
      { bell: 'dawn', at: s.schedule.dawnAt, chargeMs: null, grade: 'automatic' },
    ];
    const page = Object.freeze({
      nightId: s.schedule.nightId,
      beganAt: s.beganAt,
      closedAt: s.schedule.dawnAt,
      records: Object.freeze(records),
      observedMs: Math.min(s.observedMs, s.schedule.beaconExpiresAt - s.schedule.beaconAt),
      requiredMs,
      witnessed: !s.interrupted && s.observedMs >= requiredMs,
      interrupted: s.interrupted,
    });
    s.page = page;
    return page;
  }
  return {
    /**
     * Call only after verified Qi Gengsheng / duty-hook interaction. The host
     * resolves 'profile' from the authenticated connection, never from a
     * client-provided string. A second player has an independent shift.
     */
    beginDuty(profile: string, schedule: TownBellkeeperSchedule, now: number) {
      requireSchedule(schedule);
      if (!isProfile(profile) || !validTime(now) ||
        now < schedule.duskAt - WINDOW_MS || now >= schedule.beaconAt) return false;
      const prior = active.get(profile);
      if (prior && prior.schedule.nightId === schedule.nightId) return false;
      if (prior && !prior.page && now < prior.schedule.dawnAt) return false;
      active.set(profile, {
        schedule: Object.freeze({ ...schedule }), beganAt: now, latestAt: now,
        records: new Map(), pull: null, lastGazeAt: null, lastGaze: false,
        observedMs: 0, interrupted: false, page: null,
      });
      return true;
    },
    /** Live gaze samples, using verified bell hitbox raycasts in the scene. */
    observe(profile: string, now: number, lookingAtBell: boolean, interacted = false) {
      const s = sessionFor(profile, now);
      if (!s || s.page || now > s.schedule.dawnAt) return false;
      addGaze(s, now);
      if ((interacted || s.pull) && now >= s.schedule.beaconAt &&
        now < s.schedule.beaconExpiresAt) s.interrupted = true;
      s.lastGaze = lookingAtBell === true;
      return true;
    },
    /** Explicit interaction hook: any attempted interaction spoils the watch. */
    interact(profile: string, now: number) {
      const s = sessionFor(profile, now);
      if (!s || s.page) return false;
      addGaze(s, now);
      s.lastGaze = false;
      if (now >= s.schedule.beaconAt && now < s.schedule.beaconExpiresAt) {
        s.interrupted = true;
      }
      return true;
    },
    pressRope(profile: string, bell: TownManualBell, now: number) {
      const s = isProfile(profile) ? active.get(profile) : undefined;
      if (!s || !validTime(now) || now < s.latestAt || s.page ||
        now >= s.schedule.dawnAt || !ORDER.includes(bell) ||
        s.pull || s.records.has(bell)) return false;
      const index = ORDER.indexOf(bell);
      const target = targetOf(s.schedule, bell);
      // A too-early attempt is not a bell action. An honest missed previous
      // bell remains a ledger miss; it must not soft-lock this night's duty.
      const earliest = target - WINDOW_MS * 2;
      const rightBound = index === ORDER.length - 1
        ? s.schedule.beaconAt : targetOf(s.schedule, ORDER[index + 1]);
      if (now < earliest || now >= rightBound) return false;
      for (let i = 0; i < index; i++) {
        const skipped = ORDER[i];
        if (!s.records.has(skipped)) {
          s.records.set(skipped, Object.freeze({
            bell: skipped, at: null, chargeMs: null, grade: 'missed',
          }));
        }
      }
      s.latestAt = now;
      s.pull = { bell, at: now };
      return true;
    },
    releaseRope(profile: string, now: number) {
      const s = sessionFor(profile, now);
      if (!s || s.page || !s.pull || now >= s.schedule.dawnAt) return null;
      const pull = s.pull;
      s.pull = null;
      const chargeMs = Math.max(0, now - pull.at);
      const delta = now - targetOf(s.schedule, pull.bell);
      const grade: TownBellGrade =
        chargeMs < tuning.minimumChargeMs || delta < -WINDOW_MS ? 'missed' :
        chargeMs > tuning.maximumChargeMs || delta > WINDOW_MS ? 'over' : 'accurate';
      const record: TownBellRecord = Object.freeze({
        bell: pull.bell, at: now, chargeMs, grade,
      });
      s.records.set(pull.bell, record);
      if (now >= s.schedule.beaconAt && now < s.schedule.beaconExpiresAt) s.interrupted = true;
      return record;
    },
    /** At dawn the host calls this once with its verified server timestamp. */
    finishDawn(profile: string, now: number) {
      const s = sessionFor(profile, now);
      if (!s || now < s.schedule.dawnAt) return null;
      addGaze(s, now);
      const already = s.page;
      const page = close(s);
      if (!already) {
        const history = pages.get(profile) ?? [];
        history.push(page);
        if (history.length > 12) history.shift();
        pages.set(profile, history);
      }
      return page;
    },
    snapshot(profile: string) {
      if (!isProfile(profile)) return null;
      const s = active.get(profile);
      return s ? snapshotSession(s) : null;
    },
    /** Data-only maintenance ledger: writing/display belongs to the scene. */
    ledger(profile: string) {
      return [...(pages.get(profile) ?? [])];
    },
  };
}
