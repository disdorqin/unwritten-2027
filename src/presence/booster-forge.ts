import { fuelSecondsPerStardustOre } from '../shared/flight-thrust.js';
import { zodiacStarStoneIds, type ZodiacStarStoneId } from '../shared/zodiac-star-stones.js';

export const boosterForgeHeatMs = 8_000;

type ForgeAction = 'install-core' | 'place' | 'stoke' | 'collect' | 'fuel';
type ForgePhase = 'materials' | 'ready' | 'heating' | 'outlet';
type ForgeCore = 'unformed' | 'formed' | 'installed';
type HeatingFailure = 'outage' | 'overheat';
export type BoosterForgeProfile = Readonly<{
  iceCrystalShards: number; stardustOre: number; boosterOwned: boolean; fuelSeconds: number;
}>;
type Recipe = Readonly<Pick<BoosterForgeProfile, 'iceCrystalShards' | 'stardustOre'>>;
export type BoosterForgeHeatingPolicy = Readonly<{
  durationMs: number;
  min: number;
  max: number;
  initialLevel: number;
  heatPerStoke: number;
  decayPerSecond: number;
  orePerStoke: number;
  refundRounding: 'down' | 'up';
}>;
type HeatingBatch = Readonly<{
  policy: BoosterForgeHeatingPolicy;
  refund: Recipe;
  fire?: Readonly<{ at: number; level: number }>;
}>;
type Command = Readonly<{
  playerId: string; requestId: string; action: ForgeAction; forgeId: string; socketId: string; expectedRevision: number;
}>;
type Receipt = Readonly<{
  playerId: string; requestId: string; action: ForgeAction; revision: number;
  heatingFailure?: HeatingFailure;
}>;
export type BoosterForgeState = Readonly<{
  version: 2; coreInstalled: boolean;
  revision: number; owner?: string; readyAt?: number; receipts: readonly Receipt[];
  heatingBatch?: HeatingBatch;
}>;
type PreviousForgeState = Omit<BoosterForgeState, 'version' | 'coreInstalled' | 'heatingBatch'>;
type ProfileCommit = Readonly<{ playerId: string; prior: BoosterForgeProfile; next: BoosterForgeProfile }>;
type Options = Readonly<{
  forgeId: string;
  socketIds: Readonly<Record<ForgeAction, string>>;
  recipe: Recipe;
  heating?: BoosterForgeHeatingPolicy;
  /** The shared town ring authority returns inlaid IDs. A personal claim cannot provide these. */
  readInstalledStones(): readonly ZodiacStarStoneId[];
  now(): number;
  readProfile(playerId: string): BoosterForgeProfile | undefined;
  // The host compares the prior station revision and profile, then commits both together.
  // Any thrown or rejected commit leaves both unchanged.
  save(state: BoosterForgeState, profile: ProfileCommit | undefined, priorRevision: number): boolean;
  initial?: BoosterForgeState | PreviousForgeState;
}>;

const text = (value: string) => typeof value === 'string' && value.trim().length > 0;
const validProfile = (p: BoosterForgeProfile) => Number.isSafeInteger(p.iceCrystalShards) && p.iceCrystalShards >= 0 &&
  Number.isSafeInteger(p.stardustOre) && p.stardustOre >= 0 && typeof p.boosterOwned === 'boolean' &&
  Number.isFinite(p.fuelSeconds) && p.fuelSeconds >= 0;

function validHeatingPolicy(policy: BoosterForgeHeatingPolicy) {
  const { durationMs, min, max, initialLevel, heatPerStoke, decayPerSecond, orePerStoke, refundRounding } = policy;
  return Number.isSafeInteger(durationMs) && durationMs > 0 && Number.isSafeInteger(orePerStoke) && orePerStoke > 0 &&
    Number.isFinite(heatPerStoke) && heatPerStoke > 0 && Number.isFinite(decayPerSecond) && decayPerSecond > 0 &&
    min > 0 && max <= 1 && min < max && initialLevel >= min && initialLevel <= max &&
    (refundRounding === 'down' || refundRounding === 'up');
}

function validHeatingBatch(batch: HeatingBatch, readyAt?: number) {
  const { policy, refund, fire } = batch;
  if (!policy || !refund || !validHeatingPolicy(policy) ||
      ![refund.iceCrystalShards, refund.stardustOre].every(value => Number.isSafeInteger(value) && value >= 0)) return false;
  if (!fire) return readyAt === undefined;
  return readyAt !== undefined && Number.isFinite(fire.at) && fire.at < readyAt &&
    fire.level >= policy.min && fire.level <= policy.max;
}

function refundedProfile(profile: BoosterForgeProfile, { refund }: HeatingBatch, oreSpent = 0) {
  return { ...profile, iceCrystalShards: profile.iceCrystalShards + refund.iceCrystalShards,
    stardustOre: profile.stardustOre - oreSpent + refund.stardustOre };
}

/** Accept commands after the trusted U-4 foot/socket boundary. IDs never come from display text or player claims. */
export function createBoosterForge(options: Options) {
  const { forgeId, socketIds } = options;
  const recipe = { ...options.recipe };
  const heating = options.heating && { ...options.heating };
  if (!text(forgeId) || ![socketIds['install-core'], socketIds.place, socketIds.stoke, socketIds.collect, socketIds.fuel].every(text) ||
      ![recipe.iceCrystalShards, recipe.stardustOre].every(value => Number.isSafeInteger(value) && value > 0) ||
      new Set([socketIds.place, socketIds.stoke, socketIds.collect]).size !== 3 || (heating && !validHeatingPolicy(heating))) {
    throw new RangeError('Invalid booster forge installation');
  }
  const sockets = { ...socketIds };
  let state: BoosterForgeState = { version: 2, coreInstalled: false, revision: 0, receipts: [] };
  if (options.initial) {
    const initial = options.initial;
    if ('version' in initial && initial.version === 2) state = structuredClone(initial);
    else if ('version' in initial || initial.revision !== 0 || initial.owner !== undefined ||
        initial.readyAt !== undefined || !Array.isArray(initial.receipts) || initial.receipts.length !== 0) {
      // A prior in-flight recipe reserved iron. The host must explicitly reconcile it before
      // restoring; neither the old reserved ingredients nor the old profile become ice shards.
      throw new RangeError('Booster forge save requires explicit legacy recipe reconciliation');
    }
  }
  const batch = state.heatingBatch;
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 ||
      typeof state.coreInstalled !== 'boolean' || (!state.coreInstalled && state.owner !== undefined) ||
      !Array.isArray(state.receipts) ||
      (state.owner !== undefined && !text(state.owner)) ||
      (state.readyAt !== undefined && (!Number.isFinite(state.readyAt) || state.owner === undefined)) ||
      (batch !== undefined && (!batch || state.owner === undefined || !validHeatingBatch(batch, state.readyAt)))) {
    throw new RangeError('Invalid booster forge state');
  }
  let saving = false;

  function coreState(): ForgeCore {
    if (state.coreInstalled) return 'installed';
    const inlaid = options.readInstalledStones();
    return inlaid.length === zodiacStarStoneIds.length && zodiacStarStoneIds.every(id => inlaid.includes(id))
      ? 'formed' : 'unformed';
  }

  function readAt(now: number) {
    if (!Number.isFinite(now)) throw new RangeError('Invalid forge clock');
    const { revision, owner, readyAt, heatingBatch } = state;
    const fire = heatingBatch?.fire;
    const policy = heatingBatch?.policy;
    const temperature = fire && policy && readyAt !== undefined ? {
      level: Math.max(0, fire.level - Math.max(0, Math.min(now, readyAt) - fire.at) / 1000 * policy.decayPerSecond),
      min: policy.min, max: policy.max,
    } : undefined;
    const outage = temperature !== undefined && temperature.level < temperature.min;
    const phase: ForgePhase = !owner ? 'materials' : readyAt === undefined ? 'ready' :
      now >= readyAt && !outage ? 'outlet' : 'heating';
    const heat = temperature?.level ?? (readyAt === undefined ? 0 :
      Math.max(0, Math.min(1, (now - readyAt + boosterForgeHeatMs) / boosterForgeHeatMs)));
    return { revision, owner, phase, heat, core: coreState(), temperature, outage,
      acceptsHeatingStoke: fire !== undefined && phase === 'heating' && !outage && now >= fire.at };
  }

  function readForge(_forgeId = forgeId) {
    if (_forgeId !== forgeId) throw new RangeError('Unknown booster forge');
    return readAt(options.now());
  }

  function receipt(playerId: string, requestId: string, action: ForgeAction) {
    const prior = state.receipts.find(entry => entry.playerId === playerId && entry.requestId === requestId);
    if (prior) return prior.action === action
      ? { kind: 'replayed', revision: prior.revision,
        ...(prior.heatingFailure && { heatingFailure: prior.heatingFailure }) } as const : { kind: 'invalid' } as const;
  }

  function commit(next: BoosterForgeState, change?: ProfileCommit, failure?: HeatingFailure) {
    if (!Number.isSafeInteger(next.revision) || (change && !validProfile(change.next))) return { kind: 'invalid' } as const;
    saving = true;
    try {
      if (!options.save(structuredClone(next), structuredClone(change), state.revision)) return { kind: 'save-failed' } as const;
      state = next;
    } catch {
      return { kind: 'save-failed' } as const;
    } finally {
      saving = false;
    }
    return { kind: 'accepted', revision: next.revision, ...(failure && { heatingFailure: failure }) } as const;
  }

  /** The host calls this to settle a burned-out batch even if its owner has left. */
  function advance() {
    if (saving) return { kind: 'stale', revision: state.revision } as const;
    const { owner, outage, revision } = readForge();
    const batch = state.heatingBatch;
    if (!owner || !outage || !batch) return;
    const profile = options.readProfile(owner);
    if (!profile || !validProfile(profile)) return { kind: 'invalid' } as const;
    return commit({ ...state, owner: undefined, readyAt: undefined, heatingBatch: undefined, revision: revision + 1 },
      { playerId: owner, prior: profile, next: refundedProfile(profile, batch) }, 'outage');
  }

  function submit(command: Command) {
    const { playerId, requestId, action, expectedRevision } = command;
    if (!text(playerId) || !text(requestId) || command.forgeId !== forgeId || !Object.hasOwn(sockets, action) ||
        command.socketId !== sockets[action] || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return { kind: 'invalid' } as const;
    }
    const replay = receipt(playerId, requestId, action);
    if (replay) return replay;
    const now = options.now();
    const current = readAt(now);
    if (saving || expectedRevision !== current.revision) return { kind: 'stale', revision: current.revision } as const;
    const profile = action === 'install-core' ? undefined : options.readProfile(playerId);
    if (action !== 'install-core' && (!profile || !validProfile(profile))) return { kind: 'invalid' } as const;

    let owner = state.owner;
    let readyAt = state.readyAt;
    let coreInstalled = state.coreInstalled;
    let heatingBatch = state.heatingBatch;
    let failure: HeatingFailure | undefined;
    let change: ProfileCommit | undefined;
    if (action === 'install-core') {
      if (current.core !== 'formed') return { kind: 'unavailable', phase: current.phase } as const;
      coreInstalled = true;
    } else if (!profile) {
      return { kind: 'invalid' } as const;
    } else if (!coreInstalled) {
      return { kind: 'core-required' } as const;
    } else if (action === 'place') {
      if (profile.boosterOwned) return { kind: 'owned' } as const;
      if (current.phase !== 'materials') return { kind: 'unavailable', phase: current.phase } as const;
      if (profile.iceCrystalShards < recipe.iceCrystalShards || profile.stardustOre < recipe.stardustOre) {
        return { kind: 'materials-missing' } as const;
      }
      owner = playerId;
      if (heating) {
        const round = heating.refundRounding === 'up' ? Math.ceil : Math.floor;
        heatingBatch = { policy: heating, refund: { iceCrystalShards: round(recipe.iceCrystalShards / 2),
          stardustOre: round(recipe.stardustOre / 2) } };
      }
      change = { playerId, prior: profile, next: { ...profile,
        iceCrystalShards: profile.iceCrystalShards - recipe.iceCrystalShards,
        stardustOre: profile.stardustOre - recipe.stardustOre } };
    } else if (action === 'fuel') {
      if (!profile.boosterOwned) return { kind: 'unavailable', phase: current.phase } as const;
      if (profile.stardustOre < 1 || !Number.isFinite(profile.fuelSeconds + fuelSecondsPerStardustOre)) {
        return { kind: 'materials-missing' } as const;
      }
      change = { playerId, prior: profile, next: { ...profile, stardustOre: profile.stardustOre - 1,
        fuelSeconds: profile.fuelSeconds + fuelSecondsPerStardustOre } };
    } else {
      if (owner !== playerId) return { kind: 'unavailable', phase: current.phase } as const;
      if (action === 'stoke') {
        if (current.phase === 'ready') {
          readyAt = now + (heatingBatch?.policy.durationMs ?? boosterForgeHeatMs);
          if (!Number.isFinite(readyAt) || readyAt <= now) return { kind: 'invalid' } as const;
          if (heatingBatch) heatingBatch = { ...heatingBatch, fire: { at: now, level: heatingBatch.policy.initialLevel } };
        } else if (heatingBatch && current.acceptsHeatingStoke && current.temperature) {
          const { policy } = heatingBatch;
          if (profile.stardustOre < policy.orePerStoke) return { kind: 'materials-missing' } as const;
          const level = current.temperature.level + policy.heatPerStoke;
          if (level > policy.max) {
            change = { playerId, prior: profile, next: refundedProfile(profile, heatingBatch, policy.orePerStoke) };
            failure = 'overheat';
            owner = readyAt = heatingBatch = undefined;
          } else {
            change = { playerId, prior: profile, next: { ...profile, stardustOre: profile.stardustOre - policy.orePerStoke } };
            heatingBatch = { ...heatingBatch, fire: { at: now, level } };
          }
        } else {
          return { kind: 'unavailable', phase: current.phase } as const;
        }
      } else {
        if (current.phase !== 'outlet') return { kind: 'unavailable', phase: current.phase } as const;
        if (profile.boosterOwned) return { kind: 'owned' } as const;
        change = { playerId, prior: profile, next: { ...profile, boosterOwned: true } };
        owner = readyAt = heatingBatch = undefined;
      }
    }

    const revision = current.revision + 1;
    return commit({ version: 2, coreInstalled, revision, owner, readyAt, ...(heatingBatch && { heatingBatch }),
      receipts: [...state.receipts, { playerId, requestId, action, revision, ...(failure && { heatingFailure: failure }) }] },
    change, failure);
  }

  return { readForge, submit, receipt, advance, snapshot: () => structuredClone(state) };
}
