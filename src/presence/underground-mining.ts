import type {
  UndergroundMiningCore, UndergroundMiningPoint, UndergroundMiningReceipt,
  UndergroundMiningSurface, UndergroundMiningTargetKind, UndergroundMiningTargetView,
} from '../shared/underground-mining.js';

type OpeningKind = Exclude<UndergroundMiningTargetKind, 'ore'>;
type Ore = Readonly<{
  // Use an installed marker returned by createUndergroundOreDistribution.
  marker: Readonly<{
    id: string; position: readonly [number, number, number]; mineral: string; amount: number;
    depth?: number; region?: string; grade?: 'scatter' | 'deposit';
  }>;
  layer: string;
  coreAt: UndergroundMiningPoint;
  surface: 'rock' | 'crystal';
  strikes: 3 | 4 | 5;
}>;
type Opening = Readonly<{ id: string; kind: OpeningKind; at: UndergroundMiningPoint; strikes: number }>;
type Site = Readonly<{ id: string; at: UndergroundMiningPoint; surface: UndergroundMiningSurface; strikes: number }> & (
  | Readonly<{ kind: 'ore'; mineral: string; amount: number; coreAt: UndergroundMiningPoint; regrowMs: number }>
  | Readonly<{ kind: OpeningKind }>
);

type AcceptedMiningAction = Readonly<{
  sequence: number;
  action: 'strike' | 'pickup';
  targetId: string;
  feet: UndergroundMiningPoint;
  active: boolean;
  held: 'pickaxe' | 'other' | null;
}>;
type Deposit = Readonly<{ id: string; hits: number; regrowAt?: number }>;
type Player = Readonly<{ id: string; sequence: number; nextStrikeAt: number }>;
export type UndergroundMiningState = Readonly<{
  deposits: readonly Deposit[];
  cores: readonly UndergroundMiningCore[];
  players: readonly Player[];
}>;
export type UndergroundMiningReward = Readonly<{
  kind: 'fragment' | 'core'; mineral: string; amount: number;
}>;
type Options = Readonly<{
  ore: readonly Ore[];
  openings: readonly Opening[];
  reach: number;
  regrowMs: number;
  now(): number;
  strikeDelayMs(playerId: string): number;
  /** The host validates the live pose, single input edge, held slot and unobstructed target ray. */
  accept(playerId: string, sequence: number): AcceptedMiningAction | undefined;
  /** Persist state and backpack credit together. Only a core credit carries the full ore yield. */
  commit(playerId: string, next: UndergroundMiningState, reward?: UndergroundMiningReward): boolean;
}>;

const openingSurfaces = Object.freeze({ 'gate-rubble': 'rubble', 'gate-ice': 'ice', 'gate-wood': 'wood', 'thin-wall': 'rock' } as const);

function validPoint(at: UndergroundMiningPoint) {
  return !!at.layer && [at.east, at.north, at.height].every(Number.isFinite) && at.height < 0;
}

function positiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

/** Only installed ore, sealed gates and authored thin walls are strike targets. */
export function createUndergroundMining(options: Options, initial?: UndergroundMiningState) {
  if (!Number.isFinite(options.reach) || options.reach <= 0 || !positiveInteger(options.regrowMs)) {
    throw new RangeError('Mining requires a reach limit and ore regrowth time');
  }

  const sites = new Map<string, Site>();
  function register(site: Site) {
    if (!site.id.trim() || sites.has(site.id) || !validPoint(site.at) || !positiveInteger(site.strikes) || !site.surface) {
      throw new RangeError('Invalid or duplicate underground mining site: ' + site.id);
    }
    sites.set(site.id, structuredClone(site));
  }
  for (const { marker, layer, coreAt, surface, strikes } of options.ore) {
    const [east, north, height] = marker.position;
    if (![3, 4, 5].includes(strikes) || !marker.mineral || marker.mineral === 'meteor-iron' || !positiveInteger(marker.amount) ||
        !validPoint(coreAt) || coreAt.layer !== layer || coreAt.height > height ||
        (surface !== 'rock' && surface !== 'crystal')) {
      throw new RangeError('Invalid ore or missing same-layer core landing: ' + marker.id);
    }
    const slowRegrowth = marker.mineral === 'moonstone' && marker.depth === -140 &&
      marker.region === 'moonstone-vein' && marker.grade === 'deposit';
    const regrowMs = slowRegrowth ? options.regrowMs * 2 : options.regrowMs;
    if (!positiveInteger(regrowMs)) throw new RangeError('Invalid regrowth interval for underground ore: ' + marker.id);
    register({ id: marker.id, kind: 'ore', mineral: marker.mineral, amount: marker.amount,
      at: { layer, east, north, height }, coreAt, surface, strikes, regrowMs });
  }
  for (const opening of options.openings) {
    if (!Object.hasOwn(openingSurfaces, opening.kind)) throw new RangeError('Unknown underground opening: ' + opening.id);
    register({ ...opening, surface: openingSurfaces[opening.kind] });
  }

  let state: UndergroundMiningState = structuredClone(initial ?? { deposits: [], cores: [], players: [] });
  let applying = false;

  function clock() {
    const now = options.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid mining clock');
    return now;
  }

  function reachable(feet: UndergroundMiningPoint, at: UndergroundMiningPoint) {
    return feet.layer === at.layer && Math.hypot(feet.east - at.east, feet.north - at.north, feet.height - at.height) <= options.reach;
  }

  function targetView(site: Site, now: number, deposit = state.deposits.find(item => item.id === site.id)): UndergroundMiningTargetView {
    const regrowAt = site.kind === 'ore' ? deposit?.regrowAt : undefined;
    const regrown = regrowAt !== undefined && now >= regrowAt;
    const hits = regrown ? 0 : deposit?.hits ?? 0;
    return {
      id: site.id, kind: site.kind, at: { ...site.at }, surface: site.surface, strikes: site.strikes,
      hits, open: hits >= site.strikes,
      ...(site.kind === 'ore' ? { mineral: site.mineral } : {}),
      ...(!regrown && regrowAt !== undefined ? { regrowAt } : {}),
    };
  }

  function persist(player: Player, next: UndergroundMiningState, reward?: UndergroundMiningReward) {
    const snapshot = { ...next, players: [...next.players.filter(item => item.id !== player.id), player] };
    if (!options.commit(player.id, structuredClone(snapshot), reward)) return false;
    state = snapshot;
    return true;
  }

  function strike(action: AcceptedMiningAction, player: Player, now: number): UndergroundMiningReceipt | undefined {
    const site = sites.get(action.targetId);
    if (!site || action.held !== 'pickaxe' || now < player.nextStrikeAt || !reachable(action.feet, site.at)) return;
    const before = targetView(site, now);
    if (before.open) return;

    const delay = options.strikeDelayMs(player.id);
    const nextStrikeAt = now + delay;
    if (!positiveInteger(delay) || !Number.isSafeInteger(nextStrikeAt)) throw new RangeError('Invalid mining strike interval');
    const hits = before.hits + 1;
    const broke = hits === site.strikes;
    let core: UndergroundMiningCore | undefined;
    let regrowAt: number | undefined;
    if (broke && site.kind === 'ore') {
      regrowAt = now + site.regrowMs;
      if (!Number.isSafeInteger(regrowAt)) throw new RangeError('Invalid mining regrowth deadline');
      core = { id: JSON.stringify([site.id, now]), at: { ...site.coreAt }, mineral: site.mineral, amount: site.amount };
    }
    const deposit: Deposit = { id: site.id, hits, ...(regrowAt === undefined ? {} : { regrowAt }) };
    const reward: UndergroundMiningReward | undefined = site.kind === 'ore'
      ? { kind: 'fragment', mineral: site.mineral, amount: 1 } : undefined;
    const next: UndergroundMiningState = {
      ...state, deposits: [...state.deposits.filter(item => item.id !== site.id), deposit],
      cores: core ? [...state.cores, core] : state.cores,
    };
    if (!persist({ ...player, nextStrikeAt }, next, reward)) return;
    return {
      action: 'strike', target: targetView(site, now, deposit),
      ...(core ? { core: structuredClone(core) } : {}),
      sound: { at: { ...site.at }, surface: site.surface },
    };
  }

  function pickup(action: AcceptedMiningAction, player: Player): UndergroundMiningReceipt | undefined {
    const core = state.cores.find(item => item.id === action.targetId);
    if (!core || !reachable(action.feet, core.at)) return;
    const reward: UndergroundMiningReward = { kind: 'core', mineral: core.mineral, amount: core.amount };
    if (!persist(player, { ...state, cores: state.cores.filter(item => item.id !== core.id) }, reward)) return;
    return { action: 'pickup', core: structuredClone(core) };
  }

  return {
    snapshot: () => structuredClone(state),
    readLayer(layer: string) {
      const now = clock();
      return {
        targets: [...sites.values()].filter(site => site.at.layer === layer).map(site => targetView(site, now)),
        cores: structuredClone(state.cores.filter(core => core.at.layer === layer)),
      };
    },
    apply(playerId: string, sequence: number): UndergroundMiningReceipt | undefined {
      if (applying || !playerId.trim() || !positiveInteger(sequence)) return;
      applying = true;
      try {
        const previous = state.players.find(item => item.id === playerId);
        if (previous && sequence <= previous.sequence) return;
        const action = options.accept(playerId, sequence);
        if (!action?.active || action.sequence !== sequence || !validPoint(action.feet)) return;
        const player = { id: playerId, sequence, nextStrikeAt: previous?.nextStrikeAt ?? 0 };
        if (action.action === 'strike') return strike(action, player, clock());
        if (action.action === 'pickup') return pickup(action, player);
      } finally {
        applying = false;
      }
    },
  };
}
