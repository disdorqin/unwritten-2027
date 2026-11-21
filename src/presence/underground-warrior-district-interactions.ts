import {
  warriorDistrictStation, warriorDistrictStations,
  warriorDistrictTransform, warriorDistrictValidFrame,
  type WarriorDistrictAction, type WarriorDistrictFrame, type WarriorDistrictPoint,
} from '../shared/underground-warrior-district.js';

type AcceptedFoot = WarriorDistrictPoint & Readonly<{
  playerId: string;
  domainId: string;
}>;
type ActionCommand = Readonly<{
  playerId: string;
  requestId: string;
  locationId: string;
  role: WarriorDistrictAction;
  /** Optional caller revision; the host's current revision is the authoritative one. */
  expectedRevision?: number;
}>;
type SiteCommand = ActionCommand & Readonly<{
  worldFoot: WarriorDistrictPoint;
  domainId: string;
  serverRevision: number;
}>;
type Receipt<Result> = Readonly<{
  locationId: string;
  role: WarriorDistrictAction;
  result: Result;
}>;
type Authority<Result> = Readonly<{
  /** Surveyed world frame, NEVER one of the hardcoded fixture co-ordinates. */
  frame: WarriorDistrictFrame;
  isCertifiedFrame(frame: WarriorDistrictFrame): boolean;
  /** Each action station must have real ground / stair landing support. */
  supportsStation(worldFoot: WarriorDistrictPoint, role: WarriorDistrictAction): boolean;
  /** Reads actual foot state from server movement authority, not client-reported position. */
  readAcceptedFoot(playerId: string): AcceptedFoot | undefined;
  /** Re-evaluate real wall occlusion, stance and movement-domain reach at interaction time. */
  canReach(foot: AcceptedFoot, point: WarriorDistrictPoint, role: WarriorDistrictAction): boolean;
  /** Return a stable, monotone world snapshot revision. */
  readRevision(): number;
  /** Transaction host owns durable replay and inventory; no grant occurs in this adapter. */
  readReceipt(playerId: string, requestId: string): Promise<Receipt<Result> | undefined>;
  submit(command: SiteCommand): Promise<Result>;
}>;

/**
 * U-10 YS4/YS5 authoritative interaction boundary.
 * Search, cover, arcade, lookout and trace only have an effect after a
 * same-domain movement-authority foot and a host-controlled atomic receipt.
 * Neither client key presses nor decorative meshes grant ore, safety, or loot.
 */
export function createWarriorDistrictAuthority<Result>(options: Authority<Result>) {
  const frame = { ...options.frame };
  if (!warriorDistrictValidFrame(frame) || !options.isCertifiedFrame(frame)) {
    throw new RangeError('Warrior city requires a certified domain and ENY frame');
  }
  const surveyed = warriorDistrictStations.map(station => ({
    ...station, worldFoot: warriorDistrictTransform(frame, station.localFoot),
  }));
  if (surveyed.some(station => !options.supportsStation(station.worldFoot, station.role))) {
    throw new RangeError('Warrior city action station lacks a certified supported foot');
  }
  const stations = new Map(surveyed.map(station =>
    [station.id + '/' + station.role, station] as const));
  const inflight = new Set<string>();

  return {
    stationCount: stations.size,
    async interact(command: ActionCommand) {
      const { playerId, requestId, locationId, role } = command;
      if (typeof playerId !== 'string' || !playerId.trim() ||
          typeof requestId !== 'string' || !requestId.trim() ||
          typeof locationId !== 'string' || !locationId.trim() ||
          typeof role !== 'string') return { kind: 'invalid' } as const;
      const registered = warriorDistrictStation(locationId, role);
      const target = stations.get(locationId + '/' + role);
      if (!registered || !target) return { kind: 'invalid' } as const;
      if (command.expectedRevision !== undefined &&
          (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0))
        return { kind: 'invalid' } as const;
      // New packet must not bypass the accepted movement foot with only a valid station ID.
      const foot = options.readAcceptedFoot(playerId);
      if (!foot || foot.playerId !== playerId || foot.domainId !== frame.domainId ||
          ![foot.east, foot.north, foot.height].every(Number.isFinite) ||
          Math.hypot(foot.east - target.worldFoot.east,
            foot.north - target.worldFoot.north,
            foot.height - target.worldFoot.height) > 1.4 ||
          !options.isCertifiedFrame(frame) ||
          !options.supportsStation(target.worldFoot, role) ||
          !options.canReach(foot, target.worldFoot, role)) {
        return { kind: 'unreachable' } as const;
      }
      if (inflight.has(playerId)) return { kind: 'busy' } as const;
      inflight.add(playerId);
      try {
        const prior = await options.readReceipt(playerId, requestId);
        if (prior !== undefined) {
          return prior.locationId === locationId && prior.role === role
            ? { kind: 'replayed', result: prior.result } as const
            : { kind: 'conflicting-request' } as const;
        }
        const version = options.readRevision();
        if (!Number.isSafeInteger(version) || version < 0)
          return { kind: 'unavailable' } as const;
        if (command.expectedRevision !== undefined &&
            command.expectedRevision !== version)
          return { kind: 'stale', revision: version } as const;
        const result = await options.submit({
          playerId, requestId, locationId, role,
          worldFoot: { ...target.worldFoot },
          domainId: frame.domainId,
          serverRevision: version,
          ...(command.expectedRevision === undefined ? {} : {
            expectedRevision: command.expectedRevision,
          }),
        });
        return { kind: 'submitted', result } as const;
      } finally {
        inflight.delete(playerId);
      }
    },
  };
}
