/**
 * P-2 repair authority for the second summit cable. The first visit must be
 * on foot: only a confirmed summit release enables one downhill trip.
 * No client-provided position, tool, time or weather may enter this reducer.
 */
export type SummitCableRepairAction =
  | { kind: 'release-summit' }
  | { kind: 'confirm-single-trip' }
  | { kind: 'strike-rust' }
  | { kind: 'pull-brake' }
  | { kind: 'pry-cable' }
  | { kind: 'release-cable' }
  | { kind: 'crank-cable' }
  | { kind: 'pick-weight'; index: number }
  | { kind: 'hang-weight'; index: number };

export type SummitCableRepairStage = 'dormant' | 'single-trip' | 'halted' | 'open';
export type SummitCableRepairWeight =
  Readonly<{ status: 'ground' | 'carried' | 'hung'; holder: string | null }>;
export type SummitCableRepairState = Readonly<{
  revision: number;
  stage: SummitCableRepairStage;
  /** The one upper-station cabin authorized to descend; never all downward cabins. */
  singleTripCabin: 0 | 1 | null;
  rustStrikes: number;
  brakeReleased: boolean;
  cableLift: number;
  cableLastAt: number | null;
  cableCranks: number;
  weights: readonly SummitCableRepairWeight[];
}>;

export const summitCableRepairSpec = Object.freeze({
  rustStrikes: 9,
  cablePrySeconds: 8,
  cableCranks: 3,
  weightBlocks: 4,
  maximumPryIntervalMs: 250,
});

export function initialSummitCableRepairState(): SummitCableRepairState {
  return {
    revision: 0, stage: 'dormant', singleTripCabin: null, rustStrikes: 0, brakeReleased: false,
    cableLift: 0, cableLastAt: null, cableCranks: 0,
    weights: Array.from({ length: summitCableRepairSpec.weightBlocks },
      () => ({ status: 'ground' as const, holder: null })),
  };
}

export type SummitCableRepairHost = Readonly<{
  read(): SummitCableRepairState | undefined | Promise<SummitCableRepairState | undefined>;
  /** Authoritative accepted position / tool availability / shoulder slot and the required first ascent. */
  authorize(player: string, action: SummitCableRepairAction): boolean;
  /** Server clock, never the request timestamp. */
  now(): number;
  /** Return only a real cabin currently docked at the summit, accepted by the same cable clock. */
  releasableCabin(): 0 | 1 | undefined;
  /** True only after the released cabin actually reached the lower station. */
  singleTripArrived(cabin: 0 | 1): boolean;
  /** Compare-and-swap and re-check the player's accepted pose at write time. */
  commit(expectedRevision: number, next: SummitCableRepairState, guard: () => boolean):
    boolean | Promise<boolean>;
}>;

export type SummitCableRepairResponse =
  | Readonly<{ kind: 'applied'; state: SummitCableRepairState }>
  | Readonly<{ kind: 'invalid-action' | 'unavailable' | 'unauthorized' | 'not-ready' | 'already-done' | 'conflict' }>;

function validAction(value: unknown): value is SummitCableRepairAction {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  switch (value.kind) {
    case 'release-summit': case 'confirm-single-trip': case 'strike-rust':
    case 'pull-brake': case 'pry-cable': case 'release-cable': case 'crank-cable': return true;
    case 'pick-weight': case 'hang-weight':
      return 'index' in value && typeof value.index === 'number' &&
        Number.isInteger(value.index) && value.index >= 0 && value.index < summitCableRepairSpec.weightBlocks;
    default: return false;
  }
}

function valid(state: SummitCableRepairState | undefined): state is SummitCableRepairState {
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
    !['dormant', 'single-trip', 'halted', 'open'].includes(state.stage) ||
    (state.stage === 'single-trip' ? state.singleTripCabin !== 0 && state.singleTripCabin !== 1
      : state.singleTripCabin !== null) ||
    !Number.isInteger(state.rustStrikes) || state.rustStrikes < 0 ||
    state.rustStrikes > summitCableRepairSpec.rustStrikes ||
    typeof state.brakeReleased !== 'boolean' ||
    !Number.isFinite(state.cableLift) || state.cableLift < 0 || state.cableLift > 1 ||
    (state.cableLastAt !== null && !Number.isSafeInteger(state.cableLastAt)) ||
    !Number.isInteger(state.cableCranks) || state.cableCranks < 0 ||
    state.cableCranks > summitCableRepairSpec.cableCranks ||
    !Array.isArray(state.weights) || state.weights.length !== summitCableRepairSpec.weightBlocks) return false;
  const holders = new Set<string>();
  for (const weight of state.weights) {
    if (!weight || !['ground', 'carried', 'hung'].includes(weight.status) ||
      (weight.status === 'carried' ? !weight.holder : weight.holder !== null)) return false;
    if (weight.holder && (holders.has(weight.holder) || typeof weight.holder !== 'string')) return false;
    if (weight.holder) holders.add(weight.holder);
  }
  const finished = allRepaired(state);
  if ((state.stage === 'open') !== finished ||
    (state.brakeReleased && state.rustStrikes !== summitCableRepairSpec.rustStrikes) ||
    (state.cableCranks && state.cableLift !== 1)) return false;
  return true;
}

function allRepaired(state: SummitCableRepairState) {
  return state.brakeReleased && state.cableCranks === summitCableRepairSpec.cableCranks &&
    state.weights.every(weight => weight.status === 'hung');
}

function advanceRepair(state: SummitCableRepairState, player: string, action: SummitCableRepairAction,
  now: number, host: SummitCableRepairHost): SummitCableRepairState | SummitCableRepairResponse['kind'] {
  if (action.kind === 'release-summit') {
    if (state.stage !== 'dormant') return 'already-done';
    const cabin = host.releasableCabin();
    return cabin === 0 || cabin === 1
      ? { ...state, stage: 'single-trip', singleTripCabin: cabin } : 'not-ready';
  }
  if (action.kind === 'confirm-single-trip') {
    return state.stage === 'single-trip' && state.singleTripCabin !== null &&
      host.singleTripArrived(state.singleTripCabin)
      ? { ...state, stage: 'halted', singleTripCabin: null } : 'not-ready';
  }
  if (state.stage === 'dormant' || state.stage === 'single-trip') return 'not-ready';
  if (state.stage === 'open') return 'already-done';
  switch (action.kind) {
    case 'strike-rust':
      return state.rustStrikes < summitCableRepairSpec.rustStrikes
        ? { ...state, rustStrikes: state.rustStrikes + 1 } : 'already-done';
    case 'pull-brake':
      return state.brakeReleased ? 'already-done' :
        state.rustStrikes === summitCableRepairSpec.rustStrikes
          ? { ...state, brakeReleased: true } : 'not-ready';
    case 'pry-cable': {
      if (state.cableLift >= 1) return 'already-done';
      const delta = state.cableLastAt === null ? 0 : now - state.cableLastAt;
      if (delta < 0) return 'unavailable';
      const lift = delta > summitCableRepairSpec.maximumPryIntervalMs
        ? state.cableLift / 2 : Math.min(1,
          state.cableLift + delta / (summitCableRepairSpec.cablePrySeconds * 1000));
      return { ...state, cableLift: lift, cableLastAt: now };
    }
    case 'release-cable':
      if (state.cableLift === 0 && state.cableLastAt === null) return 'already-done';
      return state.cableLift < 1 ? {
        ...state, cableLift: state.cableLift / 2, cableLastAt: null,
      } : 'already-done';
    case 'crank-cable':
      return state.cableLift < 1 ? 'not-ready' :
        state.cableCranks < summitCableRepairSpec.cableCranks
          ? { ...state, cableCranks: state.cableCranks + 1 } : 'already-done';
    case 'pick-weight': {
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= state.weights.length ||
        state.weights[index]!.status !== 'ground') return 'not-ready';
      if (state.weights.some(weight => weight.holder === player)) return 'not-ready';
      return { ...state, weights: state.weights.map((weight, i) =>
        i === index ? { status: 'carried' as const, holder: player } : weight) };
    }
    case 'hang-weight': {
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= state.weights.length ||
        state.weights[index]!.status !== 'carried' || state.weights[index]!.holder !== player) {
        return 'not-ready';
      }
      return { ...state, weights: state.weights.map((weight, i) =>
        i === index ? { status: 'hung' as const, holder: null } : weight) };
    }
  }
}

/** All mutations go through the server's one-revision transaction. */
export function createMainSummitCableRepair(host: SummitCableRepairHost) {
  return {
    async snapshot() {
      const state = await host.read();
      return valid(state) ? { ...state, weights: state.weights.map(w => ({ ...w })) } : undefined;
    },
    async act(player: string, action: unknown): Promise<SummitCableRepairResponse> {
      if (!validAction(action)) return { kind: 'invalid-action' };
      if (!player || !host.authorize(player, action)) return { kind: 'unauthorized' };
      const state = await host.read();
      if (!valid(state) || !Number.isSafeInteger(state.revision + 1)) return { kind: 'unavailable' };
      const now = host.now();
      if (!Number.isSafeInteger(now)) return { kind: 'unavailable' };
      const next = advanceRepair(state, player, action, now, host);
      if (typeof next === 'string') return { kind: next === 'already-done' ? next :
        next === 'not-ready' ? next : 'unavailable' };
      const updated: SummitCableRepairState = {
        ...next, revision: state.revision + 1,
        stage: allRepaired(next) ? 'open' : next.stage,
      };
      if (!valid(updated)) return { kind: 'unavailable' };
      const committed = await host.commit(state.revision, updated, () =>
        host.authorize(player, action) && Number.isSafeInteger(host.now()) &&
        (action.kind !== 'release-summit' || host.releasableCabin() === updated.singleTripCabin) &&
        (action.kind !== 'confirm-single-trip' ||
          (state.singleTripCabin !== null && host.singleTripArrived(state.singleTripCabin))));
      return committed ? { kind: 'applied',
        state: { ...updated, weights: updated.weights.map(w => ({ ...w })) } } : { kind: 'conflict' };
    },
    /** Night-window stoppage applies even after the repairs. The host supplies the official clock phase. */
    canRun(state: SummitCableRepairState, officialDayRunning: boolean) {
      return valid(state) && officialDayRunning === true && state.stage === 'open';
    },
    /** The one sanctioned descent terminates after one actual station advance. */
    canMakeSingleDownhillTrip(state: SummitCableRepairState) {
      return valid(state) && state.stage === 'single-trip';
    },
  };
}
