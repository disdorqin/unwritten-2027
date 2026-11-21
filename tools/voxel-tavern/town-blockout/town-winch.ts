/**
 * Winch feel leaf, implemented to Window B's handover contract
 * (docs/交流区/Muse/窗B移交C-绞盘协作规则-2026-11-21, batch 27):
 * the leaf owns cranking pace, the steady-rope duo rate and cage sway;
 * it carries no clock of its own for phase gating (the host overlays the
 * ZB-17 night gate) and it never issues the opening itself — the trunk
 * entry authority opens the well once this leaf reports complete through
 * the well bridge's external-completion path (ruling: 乙案, 2026-11-21).
 * If Window B's original leaf lands, it replaces this file wholesale:
 * same path, same contract.
 */
export const winchSoloSeconds = 40;
export const winchDuoRate = 1.8;

export type WinchTickInput = Readonly<{
  cranking: boolean;
  ropeHeld: boolean;
}>;

export function createWinch() {
  let progress = 0;

  return {
    get progress() { return progress; },
    get open() { return progress >= 1; },
    /**
     * Advance the crank by one host tick. Returns the progress increment
     * applied this tick (0 when not cranking or already open). Progress
     * never regresses: releasing the handle only stops the gain.
     */
    tick(dtSeconds: number, input: WinchTickInput): number {
      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || !input.cranking || progress >= 1) return 0;
      const rate = (input.ropeHeld ? winchDuoRate : 1) / winchSoloSeconds;
      const delta = Math.min(rate * dtSeconds, 1 - progress);
      progress += delta;
      return delta;
    },
    /**
     * Cage sway angle in radians at a trip's elapsed second. A held
     * steady rope zeroes the sway; otherwise the swing eases as the
     * cover nears fully open.
     */
    swayAt(elapsedSeconds: number, ropeHeld: boolean): number {
      if (ropeHeld || !Number.isFinite(elapsedSeconds)) return 0;
      return Math.sin(1.4 * elapsedSeconds) * 0.3 * (1 - 0.6 * progress);
    },
  };
}

export type TownWinch = ReturnType<typeof createWinch>;
