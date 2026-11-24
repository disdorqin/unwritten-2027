/**
 * Lamp desk host — the production wiring face for taking and
 * returning lamps (transferred from window C to branch window B,
 * batch 92; the ledger itself landed in batch 96 and is NOT touched
 * here — this host only reads its judgments and calls its verbs).
 *
 * The single lamp authority is ./lamp-ledger.ts: one book, kept at
 * the shaft-head lamp room. This host adds what the ledger by design
 * does not know: WHO is acting (the presence session's verified
 * profile) and WHERE they stand (the desk, the lamp room's issue
 * window, a camp niche, the camp). An action the room cannot see
 * does not happen:
 *
 *   register    — at the muster desk, with 石九斤 (K-22's rule);
 *   issue       — at the lamp room window, against a registration;
 *   returnLamp  — at the lamp room window; cancels the record;
 *   reportDamage— anywhere the holder stands; onto the same record;
 *   placeAtNiche— at a camp niche; the lamp leaves the hand, the
 *                 record stays as placed;
 *   onDeath     — wherever death finds them; the lamp is marked
 *                 lost on the same record, never dropped;
 *   reissue     — at the camp; a replacement against a lost report.
 *
 * Leaf module: importing it does not activate gameplay; the server
 * entrypoint mounts it under the single-writer rule.
 */
import { createLampLedger, type LampLedger, type LampRecord } from './lamp-ledger.js';

export type LampDeskHooks<Session> = Readonly<{
  /** The authenticated profile for this session; never client-supplied. */
  profileOf: (session: Session) => string | null | undefined;
  /** Verified position: standing at the muster registration desk. */
  atDesk: (session: Session) => boolean;
  /** Verified position: at the lamp room's issue window. */
  atLampRoom: (session: Session) => boolean;
  /** Verified position: at a camp niche where a lamp may be offered. */
  atNiche: (session: Session) => boolean;
  /** Verified position: at the camp, where replacements are issued. */
  atCamp: (session: Session) => boolean;
}>;

export function createLampDeskHost<Session>(hooks: LampDeskHooks<Session>, ledger: LampLedger = createLampLedger()) {
  function profile(session: Session): string | null {
    const value = hooks.profileOf(session);
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
  function act(session: Session, where: (s: Session) => boolean, verb: (id: string) => boolean): boolean {
    const id = profile(session);
    if (id === null || !where(session)) return false;
    return verb(id);
  }

  return {
    register(session: Session): boolean {
      return act(session, hooks.atDesk, (id) => ledger.register(id));
    },
    issue(session: Session): boolean {
      return act(session, hooks.atLampRoom, (id) => ledger.issue(id));
    },
    returnLamp(session: Session): boolean {
      return act(session, hooks.atLampRoom, (id) => ledger.returnLamp(id));
    },
    reportDamage(session: Session): boolean {
      const id = profile(session);
      return id !== null && ledger.reportDamage(id);
    },
    placeAtNiche(session: Session): boolean {
      return act(session, hooks.atNiche, (id) => ledger.placeAtNiche(id));
    },
    onDeath(session: Session): boolean {
      const id = profile(session);
      return id !== null && ledger.onDeath(id);
    },
    reissue(session: Session): boolean {
      return act(session, hooks.atCamp, (id) => ledger.reissueAtCamp(id));
    },
    /** Scene/domain reads — the same judgments the underground host consumes. */
    holdsLamp(session: Session): boolean {
      const id = profile(session);
      return id !== null && ledger.holdsLamp(id);
    },
    recordOf(session: Session): LampRecord | undefined {
      const id = profile(session);
      return id === null ? undefined : ledger.record(id);
    },
  };
}
