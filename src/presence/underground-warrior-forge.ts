import type { UndergroundSurvivalPoint } from './underground-survival.js';

type ForgeAction = 'place' | 'stoke' | 'collect';
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
  sockets: Readonly<Record<ForgeAction, ForgeSocket>>;
  readAcceptedFoot(playerId: string): UndergroundSurvivalPoint | undefined;
  canReach(foot: UndergroundSurvivalPoint, socket: ForgeSocket): boolean;
  readForge(forgeId: string): ForgeSnapshot;
  // F-2 owns revision checks, request replay and the atomic inventory transaction.
  receipt?(playerId: string, requestId: string, action: ForgeAction): Result | undefined;
  submit(command: AcceptedForgeCommand): Result;
}>;

const phaseByAction = { place: 'materials', stoke: 'ready', collect: 'outlet' } as const;

/** U-4 interaction boundary between actual shop sockets and F-2's station authority. */
export function createUndergroundWarriorForge<Result>(options: Options<Result>) {
  const forgeId = options.forgeId;
  const sockets = structuredClone(options.sockets);
  const registeredSockets = Object.values(sockets);
  const layer = sockets.place.point.layer;
  if (!forgeId.trim() || !layer.trim() || new Set(registeredSockets.map(socket => socket.id)).size !== 3 ||
      registeredSockets.some(({ id, point }) => !id.trim() || point.layer !== layer ||
        ![point.east, point.north, point.height].every(Number.isFinite))) {
    throw new RangeError('Warrior forge needs three distinct sockets in the same confirmed domain');
  }

  return {
    interact(command: ForgeCommand) {
      const { playerId, requestId, action } = command;
      if (!playerId.trim() || !requestId.trim() || !Object.hasOwn(phaseByAction, action)) return { kind: 'invalid' } as const;
      const socket = sockets[action];
      const foot = options.readAcceptedFoot(playerId);
      if (!foot || foot.layer !== layer || !options.canReach(foot, socket)) return { kind: 'unreachable' } as const;
      const replay = options.receipt?.(playerId, requestId, action);
      if (replay !== undefined) return { kind: 'submitted', result: replay } as const;
      const current = options.readForge(forgeId);
      const canRefuel = action === 'stoke' && current.phase === 'heating' && current.acceptsHeatingStoke === true;
      if (current.phase !== phaseByAction[action] && !canRefuel) {
        return { kind: 'unavailable', phase: current.phase } as const;
      }
      const result = options.submit({ playerId, requestId, action, forgeId, socketId: socket.id, expectedRevision: current.revision });
      return { kind: 'submitted', result } as const;
    },
  };
}
