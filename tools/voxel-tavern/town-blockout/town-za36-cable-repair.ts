export type Za36CableRepairLine = 1 | 2;
export type Za36CableRepairStage = 'dormant' | 'one-station' | 'full-line';
export type Za36CableRepairState = Readonly<{
  line: Za36CableRepairLine;
  stage: Za36CableRepairStage;
  impacts: number;
  brakePulled: boolean;
  cableHeight: number;
  cableAligned: boolean;
  cableTurns: number;
  weightMounted: readonly boolean[];
  carriedWeight: number | null;
  repaired: readonly ['rust-brake' | 'pending', 'cable-wheel' | 'pending', 'counterweight' | 'pending'];
  version: number;
}>;
export type Za36CableRepairEvent =
  | { kind: 'wake'; impact: 'sled' | 'snow-wall' | 'snowball' | 'night-window' }
  | { kind: 'strike-rust' }
  | { kind: 'pull-brake' }
  | { kind: 'pry-cable'; effort: number }
  | { kind: 'release-cable' }
  | { kind: 'tighten-cable' }
  | { kind: 'take-weight'; index: number }
  | { kind: 'hang-weight'; index: number };

/**
 * Stage-only A-window rule candidate, not a server state or a UI binding.
 * The host must authenticate each input, persist versioned accepted events
 * and gate cable runs until cableLine{1,2}Open has authoritative approval.
 */
export function createZa36CableRepair(line: Za36CableRepairLine) {
  let stage: Za36CableRepairStage = 'dormant';
  let impacts = 0, brakePulled = false, cableHeight = 0;
  let cableAligned = false, cableTurns = 0, carriedWeight: number | null = null;
  const weightMounted = [false, false, false, false];
  let version = 0;

  const repaired = (): Za36CableRepairState['repaired'] => [
    brakePulled ? 'rust-brake' : 'pending',
    cableAligned && cableTurns === 3 ? 'cable-wheel' : 'pending',
    weightMounted.every(Boolean) ? 'counterweight' : 'pending',
  ];
  function snapshot(): Za36CableRepairState {
    return Object.freeze({
      line, stage, impacts, brakePulled, cableHeight, cableAligned, cableTurns,
      weightMounted: Object.freeze([...weightMounted]),
      carriedWeight, repaired: repaired(), version,
    });
  }
  function apply(event: Za36CableRepairEvent): Readonly<{ accepted: boolean; state: Za36CableRepairState; opened: boolean }> {
    let accepted = false, opened = false;
    if (event.kind === 'wake') {
      if (stage === 'dormant') {
        stage = 'one-station';
        accepted = true;
      }
    } else if (stage === 'one-station') {
      switch (event.kind) {
        case 'strike-rust':
          if (impacts < 9) { impacts++; accepted = true; }
          break;
        case 'pull-brake':
          if (impacts === 9 && !brakePulled) { brakePulled = true; accepted = true; }
          break;
        case 'pry-cable':
          // A scene can map a held key and real cable geometry into [0,1].
          if (Number.isFinite(event.effort) && event.effort > 0 && event.effort <= 1 &&
            !cableAligned && cableHeight < 1) {
            cableHeight = Math.min(1, cableHeight + event.effort);
            if (cableHeight === 1) cableAligned = true;
            accepted = true;
          }
          break;
        case 'release-cable':
          if (!cableAligned && cableHeight > 0) {
            cableHeight *= .5; // physically droops halfway, never resets the other two repairs
            accepted = true;
          }
          break;
        case 'tighten-cable':
          if (cableAligned && cableTurns < 3) { cableTurns++; accepted = true; }
          break;
        case 'take-weight':
          if (Number.isInteger(event.index) && event.index >= 0 && event.index < 4 &&
            carriedWeight === null && !weightMounted[event.index]) {
            carriedWeight = event.index; accepted = true;
          }
          break;
        case 'hang-weight':
          if (event.index === carriedWeight && carriedWeight !== null &&
            !weightMounted[carriedWeight]) {
            weightMounted[carriedWeight] = true; carriedWeight = null; accepted = true;
          }
          break;
      }
      if (accepted && repaired().every(item => item !== 'pending')) {
        stage = 'full-line';
        opened = true;
      }
    }
    if (accepted) version++;
    return { accepted, state: snapshot(), opened };
  }
  return { apply, snapshot };
}
