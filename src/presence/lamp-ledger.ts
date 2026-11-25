/**
 * The lamp ledger — the single lamp authority (总控裁定 2026-11-22, batch 64).
 *
 * One ledger, kept by the shaft-head lamp room on the presence side. The
 * camp keeps NO inventory of its own: a lamp exists in exactly one place in
 * this book at any time. Rules, as ruled:
 *
 * - Registration comes first: a borrower registers at the muster point
 *   （集结地， with 石九斤 — the K-22 sign states this rule) and the lamp
 *   room issues only against a registration. Unregistered: no issue.
 * - Return cancels the record （还灯销记）; damage is reported onto the
 *   same record （灯损报记） — never a second book.
 * - Death does not drop the lamp: it is public property. The ledger marks
 *   it lost （挂失） and the camp re-issues a replacement （营地补发）.
 * - A lamp offered at a camp niche is placed: it leaves the borrower's
 *   hand and stays on their record as placed.
 *
 * Pure state machine: the hosting room owns the instance and the protocol
 * endpoints; this module owns the rules and nothing else.
 */

export type LampStage = 'registered' | 'holding' | 'placed' | 'lost';

export type LampRecord = Readonly<{
  stage: LampStage;
  damaged: boolean;
}>;

export type LampLedger = ReturnType<typeof createLampLedger>;

export function createLampLedger() {
  const records = new Map<string, LampRecord>();

  const set = (playerId: string, record: LampRecord) => {
    records.set(playerId, record);
    return true;
  };

  return {
    /** 石九斤's registration: the prerequisite for any issue. */
    register(playerId: string): boolean {
      if (records.has(playerId)) return false;
      return set(playerId, { stage: 'registered', damaged: false });
    },

    /** The lamp room issues only against a live registration. */
    issue(playerId: string): boolean {
      const record = records.get(playerId);
      if (record?.stage !== 'registered') return false;
      return set(playerId, { stage: 'holding', damaged: record.damaged });
    },

    /** Return cancels the record outright （销记）. */
    returnLamp(playerId: string): boolean {
      if (records.get(playerId)?.stage !== 'holding') return false;
      records.delete(playerId);
      return true;
    },

    /** Damage is reported onto the same record; the lamp stays held. */
    reportDamage(playerId: string): boolean {
      const record = records.get(playerId);
      if (record?.stage !== 'holding' || record.damaged) return false;
      return set(playerId, { stage: 'holding', damaged: true });
    },

    /** Offering the lamp at a camp niche places it out of the hand. */
    placeAtNiche(playerId: string): boolean {
      const record = records.get(playerId);
      if (record?.stage !== 'holding') return false;
      return set(playerId, { stage: 'placed', damaged: record.damaged });
    },

    /**
     * Death never drops a lamp. A held lamp is marked lost （挂失） on the
     * same record; a placed lamp is not the borrower's to lose.
     */
    onDeath(playerId: string): boolean {
      const record = records.get(playerId);
      if (record?.stage !== 'holding') return false;
      return set(playerId, { stage: 'lost', damaged: record.damaged });
    },

    /** The camp re-issues a replacement against a lost report （补发）. */
    reissueAtCamp(playerId: string): boolean {
      if (records.get(playerId)?.stage !== 'lost') return false;
      return set(playerId, { stage: 'holding', damaged: false });
    },

    holdsLamp(playerId: string): boolean {
      return records.get(playerId)?.stage === 'holding';
    },

    record(playerId: string): LampRecord | undefined {
      return records.get(playerId);
    },
  };
}
