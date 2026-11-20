export type UndergroundEntryMode = 'peace' | 'survival';
export type UndergroundEntryDirection = 'down' | 'up';
export type UndergroundEntryPoint = { east: number; north: number; height: number };

export type UndergroundWellState =
  | { kind: 'covered' }
  | { kind: 'open'; openedBy: string; firstFallPending: boolean };

type PlayerEntry = { playerId: string; mode: UndergroundEntryMode; hasEntered: boolean };

export type UndergroundEntrySnapshot = {
  well: UndergroundWellState;
  players: readonly PlayerEntry[];
};

export type UndergroundEntryOptions = {
  depthLine: number;
  firstFallLanding: UndergroundEntryPoint;
  canUseWinch(playerId: string): boolean;
  canBoardCage(playerId: string, direction: UndergroundEntryDirection): boolean;
  isDepthLineCrossing(point: UndergroundEntryPoint, direction: UndergroundEntryDirection): boolean;
  isFirstFallPool(point: UndergroundEntryPoint): boolean;
  /** The current opener entered the actual uncovered shaft from this accepted foot. */
  isFirstFallDeparture?(playerId: string, point: UndergroundEntryPoint): boolean;
  initial?: UndergroundEntrySnapshot;
  // Commit synchronously through the world's single authority before publishing an event.
  // Throw on failure so the caller can retry the same transition.
  save(snapshot: UndergroundEntrySnapshot): undefined;
};

function isFinitePoint(point: UndergroundEntryPoint): boolean {
  return Number.isFinite(point.east) && Number.isFinite(point.north) && Number.isFinite(point.height);
}

export function createUndergroundEntry(options: UndergroundEntryOptions) {
  const { depthLine } = options;
  const firstFallLanding = { ...options.firstFallLanding };
  if (!Number.isFinite(depthLine) || !isFinitePoint(firstFallLanding) || firstFallLanding.height >= depthLine) {
    throw new RangeError('The first-fall landing must be below a finite depth line');
  }

  let well: UndergroundWellState = options.initial ? { ...options.initial.well } : { kind: 'covered' };
  let players = new Map(options.initial?.players.map(player => [player.playerId, { ...player }]));

  function snapshotOf(wellState: UndergroundWellState, entries: Map<string, PlayerEntry>): UndergroundEntrySnapshot {
    return { well: { ...wellState }, players: [...entries.values()].map(player => ({ ...player })) };
  }

  function commit(nextWell: UndergroundWellState, nextPlayer?: PlayerEntry) {
    const nextPlayers = nextPlayer ? new Map(players).set(nextPlayer.playerId, nextPlayer) : players;
    options.save(snapshotOf(nextWell, nextPlayers));
    well = nextWell;
    players = nextPlayers;
  }

  function modeOf(playerId: string): UndergroundEntryMode {
    return players.get(playerId)?.mode ?? 'peace';
  }

  function firstFallOrder(playerId: string) {
    return {
      kind: 'first-fall',
      playerId,
      destination: { ...firstFallLanding },
      fallDamage: 0,
    } as const;
  }

  function pendingFirstFall(playerId: string) {
    if (well.kind === 'open' && well.openedBy === playerId && well.firstFallPending) return firstFallOrder(playerId);
  }

  function resolveDepthCrossing(playerId: string, before: UndergroundEntryPoint, after: UndergroundEntryPoint,
      originMode: UndergroundEntryMode = modeOf(playerId)) {
    if (!isFinitePoint(before) || !isFinitePoint(after)) return;
    const wasBelow = before.height < depthLine;
    const isBelow = after.height < depthLine;
    if (wasBelow === isBelow || originMode !== (wasBelow ? 'survival' : 'peace')) return;

    const fraction = (depthLine - before.height) / (after.height - before.height);
    const point = {
      east: before.east + (after.east - before.east) * fraction,
      north: before.north + (after.north - before.north) * fraction,
      height: depthLine,
    };
    const direction = isBelow ? 'down' : 'up';
    if (!isFinitePoint(point) || !options.isDepthLineCrossing(point, direction)) return;

    const mode = isBelow ? 'survival' : 'peace';
    const firstEntry = isBelow && !players.get(playerId)?.hasEntered;
    return { direction, mode, firstEntry } as const;
  }

  return {
    snapshot: () => snapshotOf(well, players),
    // R3-11: the three surface approaches stop at the crater floor.
    // Only the shaft and its lift depend on the underground entry state.
    sceneState() {
      const open = well.kind === 'open';
      const cageAvailable = well.kind === 'open' && !well.firstFallPending;
      return {
        coverVisible: !open,
        shaftVisible: open,
        cageAvailable: { down: cageAvailable, up: cageAvailable },
      };
    },
    modeOf,
    pendingFirstFall,
    openWell(playerId: string) {
      if (well.kind === 'open') return { kind: 'already-open' } as const;
      if (!options.canUseWinch(playerId)) return { kind: 'denied' } as const;
      commit({ kind: 'open', openedBy: playerId, firstFallPending: true });
      return { kind: 'opened', firstFall: firstFallOrder(playerId) } as const;
    },
    requestCageRide(playerId: string, direction: UndergroundEntryDirection) {
      if (well.kind !== 'open') return { kind: 'locked' } as const;
      if (well.firstFallPending) return { kind: 'first-fall-required' } as const;
      const boardingMode = direction === 'down' ? 'peace' : 'survival';
      if (modeOf(playerId) !== boardingMode || !options.canBoardCage(playerId, direction)) {
        return { kind: 'denied' } as const;
      }
      return { kind: 'ride-cage', direction } as const;
    },
    // The movement authority submits consecutive positions after its physical collision checks.
    confirmDepthCrossing(playerId: string, before: UndergroundEntryPoint, after: UndergroundEntryPoint) {
      if (well.kind !== 'open') return;
      const crossing = resolveDepthCrossing(playerId, before, after);
      if (!crossing) return;
      commit(well, { playerId, mode: crossing.mode, hasEntered: true });
      return { kind: 'depth-crossing', ...crossing } as const;
    },
    // The host supplies the authorized first fall's departure and verified pool landing.
    confirmFirstFallTransfer(playerId: string, before: UndergroundEntryPoint, after: UndergroundEntryPoint) {
      if (well.kind !== 'open' || !pendingFirstFall(playerId) || !isFinitePoint(before) ||
          options.isFirstFallDeparture?.(playerId, before) !== true) return;
      // A legacy save may have committed survival mode before clearing the pending fall.
      const crossing = resolveDepthCrossing(playerId, before, after, 'peace');
      if (crossing?.direction !== 'down' || !options.isFirstFallPool(after)) return;
      commit({ ...well, firstFallPending: false }, { playerId, mode: crossing.mode, hasEntered: true });
      return { kind: 'first-fall-landed', fallDamage: 0 } as const;
    },
    // This acknowledgement is valid only for the forced first fall, at its verified pool landing.
    confirmFirstFallLanding(playerId: string, point: UndergroundEntryPoint) {
      if (well.kind !== 'open' || !pendingFirstFall(playerId) || modeOf(playerId) !== 'survival' ||
          !isFinitePoint(point) || point.height >= depthLine || !options.isFirstFallPool(point)) return;
      commit({ ...well, firstFallPending: false });
      return { kind: 'first-fall-landed', fallDamage: 0 } as const;
    },
  };
}
