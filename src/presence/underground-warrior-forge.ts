import type { UndergroundSurvivalPoint } from './underground-survival.js';

type CraftAction = 'place' | 'stoke' | 'collect';
type ServiceAction = 'install-core' | 'fuel';
type ForgeAction = CraftAction | ServiceAction;
type ForgePhase = 'materials' | 'ready' | 'heating' | 'outlet';
type ForgeSocket = Readonly<{ id: string; point: UndergroundSurvivalPoint }>;
type ForgeCommand = Readonly<{ playerId: string; requestId: string; action: ForgeAction }>;
type ForgeSnapshot = Readonly<{
  phase: ForgePhase;
  revision: number;
  acceptsHeatingStoke?: boolean;
}>;
type AcceptedForgeCommand = ForgeCommand & Readonly<{
  forgeId: string;
  socketId: string;
  expectedRevision: number;
}>;

type Options<Result> = Readonly<{
  forgeId: string;
  sockets: Readonly<Record<CraftAction, ForgeSocket> & Partial<Record<ServiceAction, ForgeSocket>>>;
  readAcceptedFoot(playerId: string): UndergroundSurvivalPoint | undefined;
  canReach(foot: UndergroundSurvivalPoint, socket: ForgeSocket): boolean;
  readForge(forgeId: string): ForgeSnapshot;
  // F-2 owns revision checks, request replay and the atomic inventory transaction.
  receipt?(playerId: string, requestId: string, action: ForgeAction): Result | undefined;
  submit(command: AcceptedForgeCommand): Result;
}>;

// F-2 decides whether the core can be installed or a player's booster can be fueled.
const phaseByAction = {
  place: 'materials', stoke: 'ready', collect: 'outlet', 'install-core': undefined, fuel: undefined,
} as const;

/** U-4 interaction boundary between actual shop sockets and F-2's station authority. */
export function createUndergroundWarriorForge<Result>(options: Options<Result>) {
  const forgeId = options.forgeId;
  const sockets = structuredClone(options.sockets);
  const layer = sockets.place.point.layer;
  if (!forgeId.trim() || !layer.trim() || new Set([sockets.place.id, sockets.stoke.id, sockets.collect.id]).size !== 3) {
    throw new RangeError('Warrior forge needs three distinct sockets in the same confirmed domain');
  }
  // Collection and fueling may share the outlet; each action still needs an explicit point.
  for (const socket of Object.values(sockets)) {
    if (socket && (!socket.id.trim() || socket.point.layer !== layer ||
        ![socket.point.east, socket.point.north, socket.point.height].every(Number.isFinite))) {
      throw new RangeError('Warrior forge sockets need finite points in the same confirmed domain');
    }
  }

  return {
    interact(command: ForgeCommand) {
      const { playerId, requestId, action } = command;
      if (!playerId.trim() || !requestId.trim() || !Object.hasOwn(phaseByAction, action)) return { kind: 'invalid' } as const;
      const socket = sockets[action];
      if (!socket) return { kind: 'invalid' } as const;
      const foot = options.readAcceptedFoot(playerId);
      if (!foot || foot.layer !== layer || !options.canReach(foot, socket)) return { kind: 'unreachable' } as const;
      const replay = options.receipt?.(playerId, requestId, action);
      if (replay !== undefined) return { kind: 'submitted', result: replay } as const;
      const current = options.readForge(forgeId);
      const canRefuel = action === 'stoke' && current.phase === 'heating' && current.acceptsHeatingStoke === true;
      const requiredPhase = phaseByAction[action];
      if (requiredPhase !== undefined && current.phase !== requiredPhase && !canRefuel) {
        return { kind: 'unavailable', phase: current.phase } as const;
      }
      const result = options.submit({ playerId, requestId, action, forgeId, socketId: socket.id, expectedRevision: current.revision });
      return { kind: 'submitted', result } as const;
    },
  };
}
