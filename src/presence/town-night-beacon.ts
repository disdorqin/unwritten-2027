import { thirteenthBellCatalogueEntry, type TownNightBeaconFrame } from '../shared/town-night-beacon.js';
import type { createTownNightWindow, TownNightWindowState } from '../shared/town-night-window.js';

type TownNightWindow = ReturnType<typeof createTownNightWindow>;

/** One dispatcher for a town. The host supplies the same window to the ledger, entry gates and witnesses. */
export function createTownNightBeaconHost(window: TownNightWindow, broadcast: (cue: TownNightBeaconFrame) => void) {
  return {
    snapshot: window.snapshot,
    tick() {
      const state = window.snapshot();
      if (state.phase !== 'awaiting-beacon' || state.beaconAt === null) return state;
      const cue = window.recordBeacon(state.beaconAt);
      if (!cue) return state;
      broadcast({ type: 'event', kind: cue.kind, at: cue.at, expiresAt: cue.expiresAt });
      return cue.state;
    },
  };
}

const milestones = { hear: 1, watch: 2, verify: 3 } as const;
export type TownNightWitnessStep = keyof typeof milestones;
export type TownNightWitnessProgress = 0 | typeof milestones[TownNightWitnessStep];
export { thirteenthBellCatalogueEntry };

type TownNightWitnessHost<Session, Evidence> = Readonly<{
  window: Pick<TownNightWindow, 'snapshot'>;
  profileOf: (session: Session) => string | undefined;
  /** Match the host's audited action or scene evidence. A player naming a step is not evidence. */
  confirm: (session: Session, step: TownNightWitnessStep, evidence: Evidence, state: TownNightWindowState) => boolean;
  load: (profile: string) => TownNightWitnessProgress | undefined;
  save: (profile: string, progress: TownNightWitnessProgress) => void;
}>;

function witnessState(progress: TownNightWitnessProgress) {
  return {
    heard: progress >= milestones.hear,
    keptWatch: progress >= milestones.watch,
    verified: progress === milestones.verify,
    catalogueEntry: progress === milestones.verify ? thirteenthBellCatalogueEntry : null,
  };
}

/** Use authenticated sessions with persistent profile keys. Action details stay in the host's evidence adapter. */
export function createTownNightWitness<Session, Evidence>(host: TownNightWitnessHost<Session, Evidence>) {
  const writing = new Set<string>();
  return {
    snapshot(session: Session) {
      const profile = host.profileOf(session);
      return profile ? witnessState(host.load(profile) ?? 0) : undefined;
    },
    record(session: Session, step: TownNightWitnessStep, evidence: Evidence) {
      const profile = host.profileOf(session);
      if (!profile || writing.has(profile)) return;
      writing.add(profile);
      try {
        const progress = host.load(profile) ?? 0;
        const next = milestones[step];
        if (next !== progress + 1 || host.confirm(session, step, evidence, host.window.snapshot()) !== true) return;
        host.save(profile, next);
        return witnessState(next);
      } finally {
        writing.delete(profile);
      }
    },
  };
}
