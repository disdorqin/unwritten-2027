export type UndergroundSurvivalMode = 'peace' | 'survival';
export type UndergroundSurvivalPoint = Readonly<{ layer: string; east: number; north: number; height: number }>;
type AcceptedFoot = Readonly<{
  playerId: string;
  point: UndergroundSurvivalPoint;
  standingStill: boolean;
  fireId?: string;
}>;
type Fire = Readonly<{
  id: string;
  point: UndergroundSurvivalPoint;
  healPerSecond: number;
  recovery?: boolean;
}>;
type Ore = Readonly<{ id: string; count: number }>;
type Drop = Readonly<{ id: string; owner: string; point: UndergroundSurvivalPoint; ore: readonly Ore[] }>;
type Down = Readonly<{ sequence: number; deadline: number; point: UndergroundSurvivalPoint }>;
type Spawn = Readonly<{ ticket: number; kind: 'wake' | 'reconnect-fire'; point: UndergroundSurvivalPoint }>;
type Player = Readonly<{
  id: string;
  mode: UndergroundSurvivalMode;
  health: number;
  layer?: string;
  connected: boolean;
  lastSequence: number;
  spawnSequence: number;
  monsterInvulnerableUntil?: number;
  down?: Down;
  spawn?: Spawn;
}>;

export type UndergroundSurvivalSnapshot = Readonly<{ players: readonly Player[]; drops: readonly Drop[] }>;
export type UndergroundSurvivalOreChange =
  | Readonly<{ kind: 'finish-trip'; playerId: string; remove: readonly Ore[] }>
  | Readonly<{ kind: 'recover-drop'; playerId: string; credit: readonly Ore[] }>;

export type UndergroundSurvivalOptions = Readonly<{
  maxHealth: number;
  reconnectFromZeroHealth: number;
  fires: readonly Fire[];
  defaultWakePoint: UndergroundSurvivalPoint;
  readBoundBed(playerId: string): UndergroundSurvivalPoint | undefined;
  // Read the result of B-01's confirmed physical crossing (or a confirmed host relocation).
  readEntryMode(playerId: string): UndergroundSurvivalMode;
  readAcceptedFoot(playerId: string): AcceptedFoot | undefined;
  areTeammates(rescuer: string, target: string): boolean;
  canReach(from: UndergroundSurvivalPoint, to: UndergroundSurvivalPoint, purpose: 'fire' | 'revive' | 'pickup' | 'arrival'): boolean;
  // Use the authority's clock in the same time frame as any restored deadline.
  now(): number;
  readTripOre(playerId: string): readonly Ore[];
  chooseHalf(ore: readonly Ore[]): readonly Ore[];
  initial?: UndergroundSurvivalSnapshot;
  // Publish the snapshot and inventory change together. A recovered drop is
  // credited as retained ore. A failed save must leave both unchanged.
  save(snapshot: UndergroundSurvivalSnapshot, oreChange?: UndergroundSurvivalOreChange): undefined;
}>;

const downedDurationMs = 10_000;
const monsterInvulnerabilityMs = 500;
type Damage = Readonly<{
  sequence: number;
  kind: 'monster' | 'abyss' | 'ordinary-fall' | 'first-fall';
  amount: number;
}>;

function validPoint(point: UndergroundSurvivalPoint) {
  return Boolean(point.layer) && [point.east, point.north, point.height].every(Number.isFinite);
}

function oreCounts(stacks: readonly Ore[]) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const { id, count } of stacks) {
    if (!id || counts.has(id) || !Number.isSafeInteger(count) || count <= 0) throw new RangeError('Invalid ore stack');
    total += count;
    counts.set(id, count);
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Invalid ore total');
  return { counts, total };
}

export function createUndergroundSurvival(options: UndergroundSurvivalOptions) {
  const { maxHealth, reconnectFromZeroHealth } = options;
  const defaultWakePoint = structuredClone(options.defaultWakePoint);
  if (!Number.isFinite(maxHealth) || maxHealth <= 0 || !Number.isFinite(reconnectFromZeroHealth) ||
      reconnectFromZeroHealth <= 0 || reconnectFromZeroHealth > maxHealth || !validPoint(defaultWakePoint)) {
    throw new RangeError('Invalid survival health or wake point');
  }
  const fires = new Map<string, Fire>();
  const recoveryFires = new Map<string, Fire>();
  for (const fire of options.fires) {
    if (!fire.id || fires.has(fire.id) || !validPoint(fire.point) ||
        !Number.isFinite(fire.healPerSecond) || fire.healPerSecond < 0 ||
        (fire.recovery && recoveryFires.has(fire.point.layer))) throw new RangeError('Invalid registered underground fire');
    const copy = structuredClone(fire);
    fires.set(copy.id, copy);
    if (copy.recovery) recoveryFires.set(copy.point.layer, copy);
  }

  const restored = structuredClone(options.initial ?? { players: [], drops: [] });
  // Saved connections cannot survive the authority that accepted them.
  let state: UndergroundSurvivalSnapshot = {
    players: restored.players.map(player => ({ ...player, connected: false, down: undefined })),
    drops: restored.drops,
  };
  let saving = false;
  function playerOf(id: string): Player {
    return state.players.find(player => player.id === id) ?? {
      id, mode: 'peace', health: maxHealth, connected: true, lastSequence: 0, spawnSequence: 0,
    };
  }

  function savePlayer(player: Player, oreChange?: UndergroundSurvivalOreChange, drops = state.drops) {
    if (saving) throw new Error('A survival transaction is already pending');
    const next = { players: [...state.players.filter(saved => saved.id !== player.id), player], drops };
    saving = true;
    try {
      options.save(structuredClone(next), structuredClone(oreChange));
      state = next;
    } finally {
      saving = false;
    }
  }

  function acceptedFoot(id: string) {
    const foot = id && options.readAcceptedFoot(id);
    return foot && foot.playerId === id && validPoint(foot.point) ? foot : undefined;
  }

  function active(id: string) {
    const player = playerOf(id);
    if (!player.connected || player.mode !== 'survival' || player.spawn || player.down ||
        options.readEntryMode(id) !== 'survival') return;
    const foot = acceptedFoot(id);
    if (foot && foot.point.layer === player.layer) return { player, foot };
  }

  function fresh(sequence: number, player: Player) {
    return Number.isSafeInteger(sequence) && sequence > player.lastSequence;
  }

  function time() {
    const now = options.now();
    if (!Number.isFinite(now)) throw new RangeError('Invalid authority time');
    return now;
  }

  return {
    snapshot: () => structuredClone(state),
    status(id: string) {
      const { mode, health, connected, down, spawn } = playerOf(id);
      return structuredClone({ mode, health: mode === 'survival' ? health : undefined, connected, down, spawn });
    },

    syncDepthMode(id: string): boolean {
      const player = playerOf(id);
      const foot = acceptedFoot(id);
      if (!foot || !player.connected || player.spawn || player.down) return false;
      const mode = options.readEntryMode(id);
      const layer = mode === 'survival' ? foot.point.layer : undefined;
      if (player.mode === mode && player.layer === layer) return false;
      const leaving = mode === 'peace';
      savePlayer({ ...player, mode, layer, health: leaving ? maxHealth : player.health,
        monsterInvulnerableUntil: leaving ? undefined : player.monsterInvulnerableUntil },
        leaving ? { kind: 'finish-trip', playerId: id, remove: [] } : undefined);
      return true;
    },

    // Host damage and heal events share one increasing per-actor sequence across reconnects.
    damage(id: string, event: Damage): boolean {
      if (event.kind !== 'monster' && event.kind !== 'abyss') return false;
      const contact = active(id);
      if (!contact || !fresh(event.sequence, contact.player) || !Number.isFinite(event.amount) || event.amount <= 0) return false;
      const { player, foot } = contact;
      const monster = event.kind === 'monster';
      if (monster && player.health === maxHealth && event.amount >= maxHealth) return false;
      const health = Math.max(0, player.health - event.amount);
      const now = monster || health === 0 ? time() : 0;
      if (monster && player.monsterInvulnerableUntil !== undefined && now < player.monsterInvulnerableUntil) {
        // This contact was resolved inside the window. A replay after expiry cannot cause damage.
        savePlayer({ ...player, lastSequence: event.sequence });
        return false;
      }
      const down = health === 0 ? { sequence: event.sequence, deadline: now + downedDurationMs, point: { ...foot.point } } : undefined;
      savePlayer({ ...player, health, lastSequence: event.sequence, down,
        monsterInvulnerableUntil: monster ? now + monsterInvulnerabilityMs : player.monsterInvulnerableUntil });
      return true;
    },

    healAtFire(id: string, sequence: number, elapsedMs: number): boolean {
      const contact = active(id);
      if (!contact || !fresh(sequence, contact.player) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
      const { player, foot } = contact;
      const fire = foot.fireId && fires.get(foot.fireId);
      if (!fire || !foot.standingStill || foot.point.layer !== fire.point.layer ||
          !options.canReach(foot.point, fire.point, 'fire')) return false;
      const health = Math.min(maxHealth, player.health + fire.healPerSecond * elapsedMs / 1000);
      if (health === player.health) return false;
      savePlayer({ ...player, health, lastSequence: sequence });
      return true;
    },

    revive(rescuer: string, target: string, downSequence: number): boolean {
      const player = playerOf(target);
      const helper = active(rescuer);
      if (!helper || rescuer === target || !player.connected || !player.down || player.down.sequence !== downSequence ||
          options.readEntryMode(target) !== 'survival' ||
          time() >= player.down.deadline || helper.foot.point.layer !== player.down.point.layer ||
          !options.areTeammates(rescuer, target) || !options.canReach(helper.foot.point, player.down.point, 'revive')) return false;
      savePlayer({ ...player, health: maxHealth / 2, down: undefined });
      return true;
    },

    wakeIfExpired(id: string, downSequence: number): boolean {
      const player = playerOf(id);
      if (!player.connected || !player.down || player.down.sequence !== downSequence || time() < player.down.deadline) return false;
      const point = options.readBoundBed(id) ?? defaultWakePoint;
      if (!validPoint(point)) throw new RangeError('Invalid bound wake point');
      const trip = structuredClone(options.readTripOre(id));
      const available = oreCounts(trip);
      const removed = structuredClone(options.chooseHalf(trip));
      const chosen = oreCounts(removed);
      if (Math.abs(chosen.total * 2 - available.total) > 1 ||
          removed.some(({ id: oreId, count }) => count > (available.counts.get(oreId) ?? 0))) {
        throw new RangeError('The inventory must choose half of the eligible trip ore');
      }

      const drops = removed.length ? [...state.drops, {
        id: JSON.stringify([id, downSequence]), owner: id, point: player.down.point, ore: removed,
      }] : state.drops;
      const ticket = player.spawnSequence + 1;
      savePlayer({ ...player, mode: 'peace', layer: undefined, health: maxHealth, down: undefined,
        monsterInvulnerableUntil: undefined, spawnSequence: ticket, spawn: { ticket, kind: 'wake', point: { ...point } },
      }, { kind: 'finish-trip', playerId: id, remove: removed }, drops);
      return true;
    },

    pickUp(id: string, dropId: string): boolean {
      const contact = active(id);
      const drop = state.drops.find(item => item.id === dropId);
      if (!contact || !drop || drop.owner !== id || contact.foot.point.layer !== drop.point.layer ||
          !options.canReach(contact.foot.point, drop.point, 'pickup')) return false;
      savePlayer(contact.player, { kind: 'recover-drop', playerId: id, credit: drop.ore },
        state.drops.filter(item => item.id !== dropId));
      return true;
    },

    disconnect(id: string): boolean {
      const player = playerOf(id);
      if (!id || !player.connected) return false;
      // The current session's disconnect is separate from death and never changes inventory.
      savePlayer({ ...player, connected: false, down: undefined });
      return true;
    },

    reconnect(id: string): Spawn | undefined {
      const player = playerOf(id);
      if (!id) return;
      if (player.connected) return structuredClone(player.spawn);
      if (player.spawn || player.mode === 'peace') {
        savePlayer({ ...player, connected: true });
        return structuredClone(player.spawn);
      }
      const fire = player.layer && recoveryFires.get(player.layer);
      if (!fire) return;
      const ticket = player.spawnSequence + 1;
      const spawn = { ticket, kind: 'reconnect-fire', point: fire.point } as const;
      savePlayer({ ...player, connected: true, spawnSequence: ticket, spawn,
        health: player.health > 0 ? player.health : reconnectFromZeroHealth });
      return structuredClone(spawn);
    },

    confirmSpawn(id: string, ticket: number): boolean {
      const player = playerOf(id);
      const foot = acceptedFoot(id);
      if (!player.connected || !player.spawn || player.spawn.ticket !== ticket || !foot ||
          foot.point.layer !== player.spawn.point.layer || options.readEntryMode(id) !== player.mode ||
          !options.canReach(foot.point, player.spawn.point, 'arrival')) return false;
      savePlayer({ ...player, spawn: undefined });
      return true;
    },
  };
}
