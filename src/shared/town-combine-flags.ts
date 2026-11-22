/**
 * Flight-craft combination, Plan B （乙案「全镇搭手」) — flags and
 * judgments only (branch window B; spec: 设计-飞行器合体乙案实现规格
 * -2026-11-22). The carry procession, assembly interactions and the
 * ignition staging belong to the D/C/A lines; this module owns the
 * world facts they read:
 *
 *   - the hands event fires exactly once: when the booster is forged
 *     AND the craft has never been assembled (forge ∧ first time);
 *   - the ignition window is the thirteenth bell's minute, read from
 *     the beacon's single source (the injected night schedule — this
 *     module keeps no clock and no drift table of its own), and it
 *     also needs the story key from the 讲古；
 *   - form switches first -> daily at the first successful ignition
 *     and never switches back: the craft stays assembled on the
 *     starport apron, and later openings are solo.
 */

export type CombineStage = 'awaiting-forge' | 'forged' | 'assembled' | 'ignited';
export type CombineMode = 'first' | 'daily';

/** The ignition window is the beacon minute itself. */
export const combineIgnitionWindowMs = 60_000;

export type CombineSchedule = Readonly<{ beaconAt: number }>;

export type CombineFlagsHost = Readonly<{
  /** The beacon single source: the ordinary town night schedule. */
  scheduleAt: (now: number) => CombineSchedule | undefined;
  /** Story key one, earned at the 讲古 — held by the story line's ledger. */
  hasStoryKey: () => boolean;
}>;

export type CombineSnapshot = Readonly<{
  stage: CombineStage;
  mode: CombineMode;
  /** The hands event is pending: forged for the first time, not yet carried/assembled. */
  handsEventPending: boolean;
  ignitionOpen: boolean;
  beaconAt: number | null;
}>;

export function createCombineFlags(host: CombineFlagsHost) {
  let stage: CombineStage = 'awaiting-forge';
  let handsEventFired = false;
  let firstIgnitionDone = false;

  function inIgnitionWindow(now: number): { open: boolean; beaconAt: number | null } {
    const schedule = host.scheduleAt(now);
    if (!schedule) return { open: false, beaconAt: null };
    return { open: now >= schedule.beaconAt && now < schedule.beaconAt + combineIgnitionWindowMs, beaconAt: schedule.beaconAt };
  }

  return {
    /**
     * The forge reports completion. Returns whether the one-time hands
     * event fires: only on the first-ever forge, before any assembly.
     */
    forgeCompleted(): { handsEvent: boolean } {
      if (stage === 'awaiting-forge') stage = 'forged';
      const handsEvent = !handsEventFired && !firstIgnitionDone && stage === 'forged';
      if (handsEvent) handsEventFired = true;
      return { handsEvent };
    },
    /** The three pieces are seated on the apron; the craft now lives there. */
    assemblyCompleted(): boolean {
      if (stage !== 'forged') return false;
      stage = 'assembled';
      return true;
    },
    snapshot(now: number): CombineSnapshot {
      const { open, beaconAt } = inIgnitionWindow(now);
      return {
        stage,
        mode: firstIgnitionDone ? 'daily' : 'first',
        handsEventPending: handsEventFired && stage === 'forged',
        ignitionOpen: (stage === 'assembled' || stage === 'ignited') && host.hasStoryKey() && open,
        beaconAt,
      };
    },
    /** Attempt ignition at `now`; succeeds only inside the beacon minute with the key held. */
    ignite(now: number): boolean {
      if (stage !== 'assembled' && stage !== 'ignited') return false;
      if (!host.hasStoryKey()) return false;
      if (!inIgnitionWindow(now).open) return false;
      stage = 'ignited';
      firstIgnitionDone = true;
      return true;
    },
  };
}
