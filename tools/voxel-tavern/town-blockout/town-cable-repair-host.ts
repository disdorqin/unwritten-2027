import type {
  Za36CableRepairEvent, Za36CableRepairLine, Za36CableRepairState,
} from './town-za36-cable-repair';

/**
 * Cable repair interaction host (atlas package B2 continuation,
 * branch window B). The state machine (town-za36-cable-repair) is
 * owned by the presence authority; this leaf is the client-side hand:
 * given the latest broadcast state and where the player stands, it
 * decides which repair actions exist and turns a player's action into
 * the event to send. It keeps NO repair state of its own — the only
 * local fact is which weight block is in the player's hands, and even
 * that is reconciled against the authority state on every frame.
 *
 * Stations (forms by window D's D3 package; anchors host-supplied):
 * the rust brake and the cable wheel live in the mid-station machine
 * room (atlas m26 / m06), the counterweights at the weight tower
 * (m27) — take a block at the tower, carry it (one at a time, hands
 * full), hang it at the machine-room frame.
 *
 * Wake mapping (host canon, flagged for 总控 confirmation): only a
 * sled strike or a ROLLED BIG snowball wakes the line. A thrown hand
 * snowball never does — the state machine's 'snowball' impact word
 * means the rolled kind, and this mapper is where that is enforced.
 */
export type RepairAnchor = Readonly<{ east: number; north: number }>;
export type RepairAnchors = Readonly<{
  brake: RepairAnchor;
  cableWheel: RepairAnchor;
  weightTower: RepairAnchor;
  weightFrame: RepairAnchor;
}>;

export const repairReachM = 2.2;

export type RepairAction = Readonly<{
  id: 'strike-rust' | 'pull-brake' | 'pry-cable' | 'tighten-cable' | 'take-weight' | 'hang-weight';
  label: string;
  event: Za36CableRepairEvent;
}>;

const near = (a: RepairAnchor, b: RepairAnchor) => Math.hypot(a.east - b.east, a.north - b.north) <= repairReachM;

/** Map a physical impact on the station structure to a wake event, if it qualifies. */
export function cableWakeEvent(kind: 'sled' | 'big-snowball' | 'snowball' | 'snow-wall'): Za36CableRepairEvent | undefined {
  if (kind === 'sled') return { kind: 'wake', impact: 'sled' };
  if (kind === 'big-snowball') return { kind: 'wake', impact: 'snowball' };
  if (kind === 'snow-wall') return { kind: 'wake', impact: 'snow-wall' };
  return undefined; // a hand-thrown snowball never wakes the line
}

export function createCableRepairHost(line: Za36CableRepairLine, anchors: RepairAnchors) {
  let carrying: number | null = null;

  return {
    /** Reconcile the local hand against the authority state (call on every broadcast frame). */
    sync(state: Za36CableRepairState) {
      if (state.line !== line) return;
      carrying = state.carriedWeight;
    },
    carrying: () => carrying,
    /** The repair actions available to a player standing at `player`, under `state`. */
    actions(state: Za36CableRepairState, player: RepairAnchor): RepairAction[] {
      if (state.line !== line || state.stage !== 'one-station') return [];
      const offered: RepairAction[] = [];
      if (near(player, anchors.brake)) {
        if (state.impacts < 9) {
          offered.push({ id: 'strike-rust', label: `敲锈（${state.impacts}/9）`, event: { kind: 'strike-rust' } });
        } else if (!state.brakePulled) {
          offered.push({ id: 'pull-brake', label: '拉下锈闸', event: { kind: 'pull-brake' } });
        }
      }
      if (near(player, anchors.cableWheel) && state.brakePulled && !state.cableAligned) {
        offered.push({ id: 'pry-cable', label: '撬正缆绳', event: { kind: 'pry-cable', effort: 1 } });
      }
      if (near(player, anchors.cableWheel) && state.cableAligned && state.cableTurns < 3) {
        offered.push({ id: 'tighten-cable', label: `紧缆（${state.cableTurns}/3）`, event: { kind: 'tighten-cable' } });
      }
      if (near(player, anchors.weightTower) && carrying === null) {
        const index = state.weightMounted.findIndex(mounted => !mounted);
        if (index >= 0) offered.push({ id: 'take-weight', label: '扛起配重块', event: { kind: 'take-weight', index } });
      }
      if (near(player, anchors.weightFrame) && carrying !== null) {
        offered.push({ id: 'hang-weight', label: '挂上配重块', event: { kind: 'hang-weight', index: carrying } });
      }
      return offered;
    },
  };
}
