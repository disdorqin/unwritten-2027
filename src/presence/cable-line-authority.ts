import {
  createZa36CableRepair,
  type Za36CableRepairEvent,
  type Za36CableRepairLine,
  type Za36CableRepairState,
} from '../shared/za36-cable-repair.js';

/**
 * Cable line authority (branch window B, flag alignment spec of
 * 2026-11-21). The presence server holds ONE repair state machine per
 * line and is the only writer. Clients submit repair events; the
 * server applies them here and broadcasts the returned frame so every
 * client reconciles on `version`. The world-facing flags are derived,
 * never set directly:
 *
 *   cableLine1Open ⇔ line 1 stage === 'full-line'
 *   cableLine2Open ⇔ line 2 stage === 'full-line'
 *
 * 'one-station' (woken by an impact) is NOT open — it authorises the
 * single-station run only. Window D's line-2 instance consumes this
 * same authority; it must not keep a shadow repair state. Scope is
 * the server run: a restart returns both lines to dormant.
 */
export type CableLineFlags = Readonly<{ cableLine1Open: boolean; cableLine2Open: boolean }>;

export type CableLineFrame = Readonly<{
  type: 'cable-line';
  line: Za36CableRepairLine;
  version: number;
  stage: Za36CableRepairState['stage'];
  /** True only on the single frame where the line flips to full-line. */
  openedNow: boolean;
  /** Server wall epoch at the only transition to full-line, retained on hello. */
  openedAt: number | null;
  /** Server epoch of the first accepted wake/release, immutable across rooms. */
  wokeAt: number | null;
  flags: CableLineFlags;
}>;

export function createCableLineAuthority(now:()=>number=Date.now) {
  const lines = {
    1: createZa36CableRepair(1),
    2: createZa36CableRepair(2),
  } as const;

  const openedAt:Record<Za36CableRepairLine,number|null>={1:null,2:null};
  const wokeAt:Record<Za36CableRepairLine,number|null>={1:null,2:null};
  const listeners = new Set<(frame: CableLineFrame) => void>();
  function flags(): CableLineFlags {
    return {
      cableLine1Open: lines[1].snapshot().stage === 'full-line',
      cableLine2Open: lines[2].snapshot().stage === 'full-line',
    };
  }

  function frame(line: Za36CableRepairLine, openedNow: boolean): CableLineFrame {
    const state = lines[line].snapshot();
    return { type: 'cable-line', line, version: state.version, stage: state.stage, openedNow, openedAt:openedAt[line], wokeAt:wokeAt[line], flags: flags() };
  }

  return {
    flags,
    subscribe(listener: (frame: CableLineFrame) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot: (line: Za36CableRepairLine) => lines[line].snapshot(),
    /** The frame a newly connected client needs for one line. */
    hello: (line: Za36CableRepairLine) => frame(line, false),
    /**
     * Apply one client repair event. Rejected events produce no frame
     * (nothing changed, nothing to broadcast); accepted events return
     * the frame to broadcast, with openedNow set exactly once per line.
     */
    applyEvent(line: Za36CableRepairLine, event: Za36CableRepairEvent): CableLineFrame | undefined {
      const epoch=now();
      if(!Number.isSafeInteger(epoch)||epoch<0)return undefined;
      const result = lines[line].apply(event);
      if (!result.accepted) return undefined;
      if(event.kind==='wake')wokeAt[line]=epoch;
      if(result.opened)openedAt[line]=epoch;
      const accepted = frame(line, result.opened);
      for (const listener of [...listeners]) listener(accepted);
      return accepted;
    },
  };
}

/**
 * Service gate (总包 B2 canon): the cable car does not run at night —
 * even a fully repaired line is out of service inside the night
 * window, the mirror image of the night train that runs empty and on
 * time. Consumers must gate boarding on this, not on the flags alone.
 * awaiting-beacon is still service time (dusk, last runs).
 */
export function cableServiceOpen(flags: CableLineFlags, line: Za36CableRepairLine,
  phase: 'day' | 'awaiting-beacon' | 'night-window' | undefined): boolean {
  if (phase === 'night-window') return false;
  return line === 1 ? flags.cableLine1Open : flags.cableLine2Open;
}
