import type { createSledRide } from '../town-blockout/sled-ride';
import { createR2EngineeringCandidate } from './candidate';

type Foot = Readonly<{ x: number; n: number; y: number }>;
type Port = 'entry' | 'exit';
type TrackPart = Port | 'r2';
type Endpoint = { east: number; north: number; height: number; headingFromEast: number; grade: number };
type Transfer = Readonly<{
  port: Port;
  downhill: boolean;
  point: { east: number; north: number; height: number };
  tangent: { east: number; north: number };
  grade: number;
  lateral: number;
}>;
type TransferPort = {
  surfaceAt(east: number, north: number, radius: number): number | undefined;
  permitsTransfer(transfer: Transfer): boolean;
  blocked?(point: Foot, radius: number): boolean;
};
type R2Host = Partial<Record<Port, TransferPort>>;
type RideWorld = Parameters<typeof createSledRide>[0];
type RideEffects = Pick<RideWorld, 'snow' | 'stopped' | 'smoothFlight'> & {
  onGateImpact?(event: { lateral: number; elevation: number; speed: number }): void;
};

// ZB-26 sends this radius to the mountain support and aperture queries; the
// generic sled motion separately keeps its legacy .35 m collision constant.
export const r2SledFootRadius = .36;
const edgeTolerance = 1e-6;
const surfaceTolerance = .025;
const gradeProbeMetres = 1.5;
const maximumProbeDrop = .43;

const validFoot = ({ x, n, y }: Foot) => Number.isFinite(x) && Number.isFinite(n) && Number.isFinite(y);
const tangentAt = (endpoint: Endpoint) => ({ east: Math.cos(endpoint.headingFromEast), north: Math.sin(endpoint.headingFromEast) });

/** Geometry on the surveyed R2 only. The real adjoining surfaces and crossing permissions come from the caller. */
export function createR2HostAdapter(candidate = createR2EngineeringCandidate()) {
  const { track } = candidate;
  const anchors = { entry: track.entrance, exit: track.exit };
  const halfNetWidth = track.widthMetres / 2 - r2SledFootRadius;

  function locateFoot(east: number, north: number) {
    if (!Number.isFinite(east) || !Number.isFinite(north)) return;
    const foot = candidate.locate(east, north);
    if (!foot || Math.abs(foot.offset) > halfNetWidth + edgeTolerance) return;
    const part: TrackPart = foot.metres < -edgeTolerance ? 'entry'
      : foot.metres > track.horizontalMetres + edgeTolerance ? 'exit' : 'r2';
    return { ...foot, part };
  }

  function supportAt(east: number, north: number) {
    const foot = locateFoot(east, north);
    return foot?.part === 'r2' ? track.sampleAt(foot.metres).height : undefined;
  }

  /** Describes a swept movement. An authority can consume this after the ride accepts the move. */
  function crossing(from: Foot, to: Foot): Transfer | undefined {
    if (!validFoot(from) || !validFoot(to)) return;
    const start = locateFoot(from.x, from.n), end = locateFoot(to.x, to.n);
    if (!start || !end || start.part === end.part) return;
    if (start.part !== 'r2' && end.part !== 'r2') return;
    const port = start.part === 'r2' ? end.part : start.part;
    if (port === 'r2') return;
    const endpoint = anchors[port];
    const tangent = tangentAt(endpoint);
    const signedDistance = ({ x, n }: Foot) => (x - endpoint.east) * tangent.east + (n - endpoint.north) * tangent.north;
    const a = signedDistance(from), b = signedDistance(to);
    if (Math.abs(b - a) < edgeTolerance) return;
    const downhill = b > a;
    if (downhill ? a > edgeTolerance || b < -edgeTolerance : b > edgeTolerance || a < -edgeTolerance) return;
    const fraction = Math.max(0, Math.min(1, a / (a - b)));
    const east = from.x + (to.x - from.x) * fraction;
    const north = from.n + (to.n - from.n) * fraction;
    const lateral = (north - endpoint.north) * tangent.east - (east - endpoint.east) * tangent.north;
    if (Math.abs(lateral) > halfNetWidth + edgeTolerance) return;
    return { port, downhill, point: { east, north, height: endpoint.height }, tangent, grade: -endpoint.grade, lateral };
  }

  function gateContact(from: Foot, to: Foot) {
    if (locateFoot(from.x, from.n)?.part !== 'r2' || locateFoot(to.x, to.n)?.part !== 'r2') return;
    return candidate.gateContact(from, to, r2SledFootRadius);
  }

  function portProfile(port: TransferPort, name: Port, east: number, north: number, survey = false) {
    const seamHeight = port.surfaceAt(east, north, r2SledFootRadius);
    const aligned = seamHeight !== undefined && Math.abs(seamHeight - anchors[name].height) <= surfaceTolerance;
    const tangent = tangentAt(anchors[name]);
    const outward = name === 'entry' ? -1 : 1;
    const probeEast = east + tangent.east * gradeProbeMetres * outward;
    const probeNorth = north + tangent.north * gradeProbeMetres * outward;
    const probeHeight = aligned || survey ? port.surfaceAt(probeEast, probeNorth, r2SledFootRadius) : undefined;
    const drop = seamHeight !== undefined && probeHeight !== undefined ? (seamHeight - probeHeight) * outward : undefined;
    // The stock ride launches for drops over .43 m across its 1.5 m grade probe.
    const supported = aligned && drop !== undefined && drop >= -surfaceTolerance && drop <= maximumProbeDrop;
    return { seamHeight, probe: { east: probeEast, north: probeNorth, height: probeHeight }, drop, supported };
  }

  /** Sample adjoining support and seam collisions without requesting a transfer grant. */
  function surveyPort(name: Port, port: TransferPort) {
    const anchor = anchors[name], tangent = tangentAt(anchor);
    const steps = Math.ceil(halfNetWidth / .05);
    const bands: Array<{ minimum: number; maximum: number }> = [];
    let previousClear = false;
    const samples = Array.from({ length: steps * 2 + 1 }, (_, index) => {
      const lateral = (index - steps) * halfNetWidth / steps;
      const east = anchor.east - tangent.north * lateral;
      const north = anchor.north + tangent.east * lateral;
      const profile = portProfile(port, name, east, north, true);
      const blocked = port.blocked?.({ x: east, n: north, y: anchor.height }, r2SledFootRadius);
      const clear = profile.supported && blocked !== true;
      if (clear) {
        if (previousClear) bands.at(-1)!.maximum = lateral;
        else bands.push({ minimum: lateral, maximum: lateral });
      }
      previousClear = clear;
      return { lateral, seam: { east, north, height: anchor.height }, ...profile, blocked, clear };
    });
    return { samples, bands, spacing: halfNetWidth / steps, footRadius: r2SledFootRadius, collisionChecked: !!port.blocked };
  }

  function sledWorld(host: R2Host, effects: RideEffects) {
    function worldSupport(east: number, north: number) {
      const foot = locateFoot(east, north);
      if (!foot) return;
      if (foot.part === 'r2') return { height: track.sampleAt(foot.metres).height, part: foot.part };
      const port = host[foot.part];
      if (!port) return;
      const anchor = anchors[foot.part], tangent = tangentAt(anchor);
      const eastAtSeam = anchor.east - tangent.north * foot.offset;
      const northAtSeam = anchor.north + tangent.east * foot.offset;
      // The 1.5 m physics probe must also stop at a missing or displaced port.
      if (!portProfile(port, foot.part, eastAtSeam, northAtSeam).supported) return;
      const height = port.surfaceAt(east, north, r2SledFootRadius);
      if (height === undefined || !Number.isFinite(height)) return;
      return { height, part: foot.part };
    }

    function canTraverse(from: Foot, to: Foot) {
      if (!validFoot(from) || !validFoot(to)) return false;
      const start = worldSupport(from.x, from.n), end = worldSupport(to.x, to.n);
      if (!start || !end) return false;
      if (start.part === end.part) return true;
      const transfer = crossing(from, to);
      if (!transfer?.downhill || Math.abs(from.y - start.height) > surfaceTolerance ||
          Math.abs(to.y - end.height) > surfaceTolerance) return false;
      const port = host[transfer.port];
      if (!port) return false;
      const { east, north, height } = transfer.point;
      return portProfile(port, transfer.port, east, north).supported &&
        port.blocked?.({ x: east, n: north, y: height }, r2SledFootRadius) !== true && port.permitsTransfer(transfer);
    }

    return {
      height: (east: number, north: number) => worldSupport(east, north)?.height ?? NaN,
      surface: () => ({ surface: 0, deepSnow: false }),
      blocked(x: number, n: number, y: number) {
        const support = worldSupport(x, n);
        if (!support || !Number.isFinite(y)) return true;
        return support.part !== 'r2' && host[support.part]?.blocked?.({ x, n, y }, r2SledFootRadius) === true;
      },
      canTraverse,
      wallImpact(from: Foot, to: Foot, speed: number) {
        const hit = gateContact(from, to);
        if (!hit) return;
        effects.onGateImpact?.({ ...hit, speed });
        return { speed: 0, blocked: true, normalEast: 0, normalNorth: 0 };
      },
      snow: effects.snow,
      stopped: effects.stopped,
      smoothFlight: effects.smoothFlight,
    } satisfies RideWorld & { canTraverse(from: Foot, to: Foot): boolean };
  }

  return { track, halfNetWidth, supportAt, crossing, gateContact, sledWorld, surveyPort };
}
