export type OrbitalGate = 'starport' | 'core';
export type OrbitalGateSite = OrbitalGate | 'airlock';
export type OrbitalGateEndpoint = 'starport-ground' | 'core-ground' | 'starport-airlock' | 'core-airlock';
export type OrbitalGatePose = Readonly<{ east: number; north: number; height: number; yaw: number }>;
export type OrbitalGateState = Readonly<{ site: OrbitalGateSite; pose: OrbitalGatePose }>;
export type OrbitalGateRequest = Readonly<{ gate: OrbitalGate; direction: 'enter' | 'return' }>;

export type OrbitalGateHost = {
  isOpen(gate: OrbitalGate): boolean;
  isAtOpening(endpoint: OrbitalGateEndpoint, pose: OrbitalGatePose): boolean;
  landingAt(endpoint: OrbitalGateEndpoint): OrbitalGateState | undefined;
  isLegalLanding(endpoint: OrbitalGateEndpoint, pose: OrbitalGatePose): boolean;
};

type OrbitalGateRejection = 'invalid-request' | 'locked' | 'wrong-origin' | 'invalid-landing';
export type OrbitalGateTravel =
  | { ok: true; destination: OrbitalGateEndpoint; state: OrbitalGateState }
  | { ok: false; reason: OrbitalGateRejection };

const gates = {
  starport: { ground: 'starport-ground', airlock: 'starport-airlock' },
  core: { ground: 'core-ground', airlock: 'core-airlock' },
} as const;

function isGateRequest(value: unknown): value is OrbitalGateRequest {
  return typeof value === 'object' && value !== null &&
    'gate' in value && (value.gate === 'starport' || value.gate === 'core') &&
    'direction' in value && (value.direction === 'enter' || value.direction === 'return');
}

function isFinitePose(pose: OrbitalGatePose) {
  return Number.isFinite(pose.east) && Number.isFinite(pose.north) &&
    Number.isFinite(pose.height) && Number.isFinite(pose.yaw);
}

/**
 * The caller reads the current accepted player state and applies the successful
 * result in the same host transaction. A request supplies only a gate and direction.
 */
export function resolveOrbitalGateTravel(
  request: unknown,
  current: OrbitalGateState,
  host: OrbitalGateHost,
): OrbitalGateTravel {
  if (!isGateRequest(request)) return { ok: false, reason: 'invalid-request' };
  const { gate, direction } = request;
  const { ground, airlock } = gates[gate];
  const entering = direction === 'enter';
  const origin = entering ? ground : airlock;
  const originSite = entering ? gate : 'airlock';
  if (current.site !== originSite || !isFinitePose(current.pose) || !host.isAtOpening(origin, current.pose)) {
    return { ok: false, reason: 'wrong-origin' };
  }
  if (!host.isOpen(gate)) return { ok: false, reason: 'locked' };

  const destination = entering ? airlock : ground;
  const destinationSite = entering ? 'airlock' : gate;
  const landing = host.landingAt(destination);
  if (!landing || landing.site !== destinationSite || !isFinitePose(landing.pose) ||
      !host.isLegalLanding(destination, landing.pose)) {
    return { ok: false, reason: 'invalid-landing' };
  }
  return { ok: true, destination, state: { site: landing.site, pose: { ...landing.pose } } };
}
