/**
 * ZB-41 server-side admission adapter.
 *
 * No untrusted client-supplied player id, clock time, gaze, or rope location is
 * accepted here. The established Presence host owns identity, ZB-17 schedules,
 * bell/rope hitbox verification, persistence, and the public broadcast channel.
 * A full 60-second witness interval must be explicitly supplied; do NOT reuse
 * the short-lived ZB-17 broadcast cue TTL as the end of that trial.
 * This is a leaf module until the public server entrypoint is single-writer
 * mounted; simply importing it does not activate gameplay.
 */
import {
  createTownBellkeeperDuty,
  type TownBellkeeperPage, type TownBellkeeperSchedule,
  type TownBellkeeperTuning, type TownManualBell, type TownBellRecord,
} from '../shared/town-bellkeeper-duty.js';

export type TownBellkeeperHostHooks<Session> = Readonly<{
  clock: () => Readonly<{ at: number; night: TownBellkeeperSchedule | null }>;
  profileOf: (session: Session) => string | null | undefined;
  /** Verified Qi Gengsheng handoff near the physical maintenance room. */
  canHandoff: (session: Session) => boolean;
  /** Verified physical bell-room position and unoccluded rope hitbox. */
  canUseRope: (session: Session) => boolean;
  /** Verified first-person hitbox ray, not a client-reported boolean. */
  isLookingAtBell: (session: Session) => boolean;
  /** On the verified scene side, whether the player is still at the bell. */
  inBellRoom: (session: Session) => boolean;
  /** The caller persists a record under (profile, nightId) with upsert semantics. */
  recordLedger: (profile: string, page: TownBellkeeperPage) => void;
  /** Caller must validate the 'hear' prerequisite before granting 'watch'. */
  recordWatch?: (profile: string, page: TownBellkeeperPage) => void;
  ring?: (profile: string, record: TownBellRecord) => void;
}>;

export function createTownBellkeeperHost<Session>(
  tuning: TownBellkeeperTuning,
  hooks: TownBellkeeperHostHooks<Session>,
) {
  const duty = createTownBellkeeperDuty(tuning);
  const recorded = new Set<string>();
  const witnessed = new Set<string>();

  function identity(session: Session) {
    const profile = hooks.profileOf(session);
    return typeof profile === 'string' && profile.length > 0 ? profile : null;
  }
  function now() {
    return hooks.clock().at;
  }
  function flush(profile: string, at: number) {
    const page = duty.finishDawn(profile, at);
    if (!page) return null;
    const key = JSON.stringify([profile, page.nightId]);
    if (!recorded.has(key)) {
      // Do not falsely mark a ledger persisted if the storage adapter throws;
      // retry is safe because storage is required to use profile+night upsert.
      hooks.recordLedger(profile, page);
      recorded.add(key);
    }
    if (page.witnessed && !witnessed.has(key)) {
      hooks.recordWatch?.(profile, page);
      witnessed.add(key);
    }
    return page;
  }
  return {
    /** Start via the verified real NPC handoff, not a self-selected UI action. */
    handoff(session: Session) {
      const profile = identity(session);
      if (!profile || !hooks.canHandoff(session)) return false;
      const { at, night } = hooks.clock();
      return night ? duty.beginDuty(profile, night, at) : false;
    },
    /** Server frame tick at fixed rate; this uses a server-side hitbox raycast. */
    observe(session: Session) {
      const profile = identity(session);
      if (!profile) return false;
      const at = now();
      const inRoom = hooks.inBellRoom(session);
      return duty.observe(profile, at,
        inRoom && hooks.isLookingAtBell(session));
    },
    /** Any attempted use-key in the watch minute breaks that night's watch. */
    attemptedInteraction(session: Session) {
      const profile = identity(session);
      return profile ? duty.interact(profile, now()) : false;
    },
    press(session: Session, bell: TownManualBell) {
      const profile = identity(session);
      if (!profile) return false;
      const at = now();
      // Even a rejected E interaction counts as touching the rope at beacon.
      duty.interact(profile, at);
      if (!hooks.inBellRoom(session) || !hooks.canUseRope(session)) return false;
      return duty.pressRope(profile, bell, at);
    },
    release(session: Session) {
      const profile = identity(session);
      if (!profile) return null;
      const at = now();
      if (!hooks.inBellRoom(session) || !hooks.canUseRope(session)) {
        duty.interact(profile, at);
        return null;
      }
      const record = duty.releaseRope(profile, at);
      if (record) hooks.ring?.(profile, record);
      return record;
    },
    /** Called after authoritative dawn; idempotent across reconnects. */
    closeAtDawn(session: Session) {
      const profile = identity(session);
      return profile ? flush(profile, now()) : null;
    },
    /** No endpoint for clients to set a grade, player id, bell event or flag. */
    snapshot(session: Session) {
      const profile = identity(session);
      return profile ? duty.snapshot(profile) : null;
    },
    ledger(session: Session) {
      const profile = identity(session);
      return profile ? duty.ledger(profile) : [];
    },
  };
}
