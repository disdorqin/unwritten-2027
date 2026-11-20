import { fuelSecondsPerStardustOre } from '../shared/flight-thrust.js';
import { zodiacStarStoneIds, type ZodiacStarStoneId } from '../shared/zodiac-star-stones.js';

export const boosterForgeHeatMs = 8_000;

type ForgeAction = 'install-core' | 'place' | 'stoke' | 'collect' | 'fuel';
type ForgePhase = 'materials' | 'ready' | 'heating' | 'outlet';
type ForgeCore = 'unformed' | 'formed' | 'installed';
export type BoosterForgeProfile = Readonly<{
  iceCrystalShards: number; stardustOre: number; boosterOwned: boolean; fuelSeconds: number;
}>;
type Recipe = Readonly<Pick<BoosterForgeProfile, 'iceCrystalShards' | 'stardustOre'>>;
type Command = Readonly<{
  playerId: string; requestId: string; action: ForgeAction; forgeId: string; socketId: string; expectedRevision: number;
}>;
type Receipt = Readonly<{
  playerId: string; requestId: string; action: ForgeAction; revision: number;
}>;
export type BoosterForgeState = Readonly<{
  version: 2; coreInstalled: boolean;
  revision: number; owner?: string; readyAt?: number; receipts: readonly Receipt[];
}>;
type PreviousForgeState = Omit<BoosterForgeState, 'version' | 'coreInstalled'>;
type ProfileCommit = Readonly<{ playerId: string; prior: BoosterForgeProfile; next: BoosterForgeProfile }>;
type Options = Readonly<{
  forgeId: string;
  socketIds: Readonly<Record<ForgeAction, string>>;
  recipe: Recipe;
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

/** Accept commands after the trusted U-4 foot/socket boundary. IDs never come from display text or player claims. */
export function createBoosterForge(options: Options) {
  const { forgeId, socketIds } = options;
  const recipe = { ...options.recipe };
  if (!text(forgeId) || ![socketIds['install-core'], socketIds.place, socketIds.stoke, socketIds.collect, socketIds.fuel].every(text) ||
      ![recipe.iceCrystalShards, recipe.stardustOre].every(value => Number.isSafeInteger(value) && value > 0) ||
      new Set([socketIds.place, socketIds.stoke, socketIds.collect]).size !== 3) {
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
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 ||
      typeof state.coreInstalled !== 'boolean' || (!state.coreInstalled && state.owner !== undefined) ||
      !Array.isArray(state.receipts) ||
      (state.owner !== undefined && !text(state.owner)) ||
      (state.readyAt !== undefined && (!Number.isFinite(state.readyAt) || state.owner === undefined))) {
    throw new RangeError('Invalid booster forge state');
  }
  let saving = false;

  function coreState(): ForgeCore {
    if (state.coreInstalled) return 'installed';
    const inlaid = options.readInstalledStones();
    return inlaid.length === zodiacStarStoneIds.length && zodiacStarStoneIds.every(id => inlaid.includes(id))
      ? 'formed' : 'unformed';
  }

  function readForge(_forgeId = forgeId) {
    if (_forgeId !== forgeId) throw new RangeError('Unknown booster forge');
    const now = options.now();
    if (!Number.isFinite(now)) throw new RangeError('Invalid forge clock');
    const { revision, owner, readyAt } = state;
    const phase: ForgePhase = !owner ? 'materials' : readyAt === undefined ? 'ready' : now >= readyAt ? 'outlet' : 'heating';
    const heat = readyAt === undefined ? 0 : Math.max(0, Math.min(1, (now - readyAt + boosterForgeHeatMs) / boosterForgeHeatMs));
    return { revision, owner, phase, heat, core: coreState() };
  }

  function receipt(playerId: string, requestId: string, action: ForgeAction) {
    const prior = state.receipts.find(entry => entry.playerId === playerId && entry.requestId === requestId);
    if (prior) return prior.action === action
      ? { kind: 'replayed', revision: prior.revision } as const : { kind: 'invalid' } as const;
  }

  function submit(command: Command) {
    const { playerId, requestId, action, expectedRevision } = command;
    if (!text(playerId) || !text(requestId) || command.forgeId !== forgeId || !Object.hasOwn(sockets, action) ||
        command.socketId !== sockets[action] || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return { kind: 'invalid' } as const;
    }
    const replay = receipt(playerId, requestId, action);
    if (replay) return replay;
    const current = readForge();
    if (saving || expectedRevision !== current.revision) return { kind: 'stale', revision: current.revision } as const;
    const profile = action === 'install-core' ? undefined : options.readProfile(playerId);
    if (action !== 'install-core' && (!profile || !validProfile(profile))) return { kind: 'invalid' } as const;

    let owner = state.owner;
    let readyAt = state.readyAt;
    let coreInstalled = state.coreInstalled;
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
        if (current.phase !== 'ready') return { kind: 'unavailable', phase: current.phase } as const;
        readyAt = options.now() + boosterForgeHeatMs;
        if (!Number.isFinite(readyAt)) return { kind: 'invalid' } as const;
      } else {
        if (current.phase !== 'outlet') return { kind: 'unavailable', phase: current.phase } as const;
        if (profile.boosterOwned) return { kind: 'owned' } as const;
        change = { playerId, prior: profile, next: { ...profile, boosterOwned: true } };
        owner = readyAt = undefined;
      }
    }

    const revision = current.revision + 1;
    if (!Number.isSafeInteger(revision)) return { kind: 'invalid' } as const;
    const next: BoosterForgeState = { version: 2, coreInstalled, revision, owner, readyAt,
      receipts: [...state.receipts, { playerId, requestId, action, revision }] };
    saving = true;
    try {
      if (!options.save(structuredClone(next), structuredClone(change), current.revision)) return { kind: 'save-failed' } as const;
      state = next;
    } catch {
      return { kind: 'save-failed' } as const;
    } finally {
      saving = false;
    }
    return { kind: 'accepted', revision } as const;
  }

  return { readForge, submit, receipt, snapshot: () => structuredClone(state) };
}
