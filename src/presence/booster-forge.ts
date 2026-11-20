import { fuelSecondsPerStardustOre } from '../shared/flight-thrust.js';

export const boosterForgeHeatMs = 8_000;

type ForgeAction = 'place' | 'stoke' | 'collect' | 'fuel';
type ForgePhase = 'materials' | 'ready' | 'heating' | 'outlet';
export type BoosterForgeProfile = Readonly<{
  meteorIron: number; stardustOre: number; boosterOwned: boolean; fuelSeconds: number;
}>;
type Command = Readonly<{
  playerId: string; requestId: string; action: ForgeAction; forgeId: string; socketId: string; expectedRevision: number;
}>;
type Receipt = Readonly<{
  playerId: string; requestId: string; action: ForgeAction; revision: number;
}>;
export type BoosterForgeState = Readonly<{
  revision: number; owner?: string; readyAt?: number; receipts: readonly Receipt[];
}>;
type ProfileCommit = Readonly<{ playerId: string; prior: BoosterForgeProfile; next: BoosterForgeProfile }>;
type Options = Readonly<{
  forgeId: string;
  socketIds: Readonly<Record<ForgeAction, string>>;
  now(): number;
  readProfile(playerId: string): BoosterForgeProfile | undefined;
  // The host commits the station snapshot and the checked inventory change together.
  // Any thrown or rejected commit leaves both unchanged.
  save(state: BoosterForgeState, profile?: ProfileCommit): boolean;
  initial?: BoosterForgeState;
}>;

const text = (value: string) => typeof value === 'string' && value.trim().length > 0;
const validProfile = (p: BoosterForgeProfile) => Number.isSafeInteger(p.meteorIron) && p.meteorIron >= 0 &&
  Number.isSafeInteger(p.stardustOre) && p.stardustOre >= 0 && typeof p.boosterOwned === 'boolean' &&
  Number.isFinite(p.fuelSeconds) && p.fuelSeconds >= 0;

/** Accept commands after the trusted U-4 foot/socket boundary. IDs never come from display text or player claims. */
export function createBoosterForge(options: Options) {
  const { forgeId, socketIds } = options;
  if (!text(forgeId) || ![socketIds.place, socketIds.stoke, socketIds.collect, socketIds.fuel].every(text) ||
      new Set([socketIds.place, socketIds.stoke, socketIds.collect]).size !== 3) {
    throw new RangeError('Invalid booster forge installation');
  }
  const sockets = { ...socketIds };
  let state: BoosterForgeState = structuredClone(options.initial ?? { revision: 0, receipts: [] });
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 ||
      (state.owner !== undefined && !text(state.owner)) ||
      (state.readyAt !== undefined && (!Number.isFinite(state.readyAt) || state.owner === undefined))) {
    throw new RangeError('Invalid booster forge state');
  }
  let saving = false;

  function readForge(_forgeId = forgeId) {
    if (_forgeId !== forgeId) throw new RangeError('Unknown booster forge');
    const now = options.now();
    if (!Number.isFinite(now)) throw new RangeError('Invalid forge clock');
    const { revision, owner, readyAt } = state;
    const phase: ForgePhase = !owner ? 'materials' : readyAt === undefined ? 'ready' : now >= readyAt ? 'outlet' : 'heating';
    const heat = readyAt === undefined ? 0 : Math.max(0, Math.min(1, (now - readyAt + boosterForgeHeatMs) / boosterForgeHeatMs));
    return { revision, owner, phase, heat };
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
    const profile = options.readProfile(playerId);
    if (!profile || !validProfile(profile)) return { kind: 'invalid' } as const;

    let owner = state.owner;
    let readyAt = state.readyAt;
    let change: ProfileCommit | undefined;
    if (action === 'place') {
      if (profile.boosterOwned) return { kind: 'owned' } as const;
      if (current.phase !== 'materials') return { kind: 'unavailable', phase: current.phase } as const;
      if (profile.meteorIron < 1 || profile.stardustOre < 1) return { kind: 'materials-missing' } as const;
      owner = playerId;
      change = { playerId, prior: profile, next: { ...profile, meteorIron: profile.meteorIron - 1, stardustOre: profile.stardustOre - 1 } };
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
    const next = { revision, owner, readyAt, receipts: [...state.receipts, { playerId, requestId, action, revision }] };
    saving = true;
    try {
      if (!options.save(structuredClone(next), structuredClone(change))) return { kind: 'save-failed' } as const;
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
