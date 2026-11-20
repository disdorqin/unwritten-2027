export type FlightFieldPoint = Readonly<{ east: number; north: number; height: number }>;
export type FlightEmergencySiteId = 'cloud-deck' | 'square' | 'mirror-lake';
type EmergencySurface = 'terrace' | 'pavement' | 'ice';

const emergencySurfaces: Readonly<Record<FlightEmergencySiteId, EmergencySurface>> = {
  'cloud-deck': 'terrace', square: 'pavement', 'mirror-lake': 'ice',
};

export const flightFieldLimits = {
  cloudBase: 380, cloudTop: 560, frostFrom: 900, ceiling: 1_000, detailedDistance: 80,
} as const;

export function isFlightFieldPoint(at: FlightFieldPoint) {
  return [at.east, at.north, at.height].every(Number.isFinite);
}

export function flightAirspaceAt(height: number) {
  if (!Number.isFinite(height)) throw new RangeError('Invalid flight altitude');
  const band = height >= flightFieldLimits.ceiling ? '升限' : height >= flightFieldLimits.frostFrom ? '结霜' :
    height >= flightFieldLimits.cloudTop ? '云上' : height >= flightFieldLimits.cloudBase ? '云中' : '云下';
  return { band, overCeiling: height > flightFieldLimits.ceiling, frost: height >= flightFieldLimits.frostFrom,
    sparsePresence: height > flightFieldLimits.cloudBase } as const;
}

export type FlightEmergencySite = Readonly<{
  id: FlightEmergencySiteId; area: string; pad: FlightFieldPoint; exit: readonly FlightFieldPoint[];
}>;

/** A host registers only the pads it can land at and walk away from. */
export function registerFlightEmergencySites(sites: readonly FlightEmergencySite[], host: {
  surfaceAt(area: string, at: FlightFieldPoint): EmergencySurface | undefined;
  canWalk(area: string, from: FlightFieldPoint, to: FlightFieldPoint): boolean;
}) {
  const registered = new Map<FlightEmergencySiteId, FlightEmergencySite>();
  for (const { id, area, pad, exit } of sites) {
    if (!Object.hasOwn(emergencySurfaces, id) || registered.has(id) || !area || !isFlightFieldPoint(pad) ||
        !exit.length || exit.some(point => !isFlightFieldPoint(point)) ||
        host.surfaceAt(area, pad) !== emergencySurfaces[id] ||
        !exit.every((point, index) => host.canWalk(area, index ? exit[index - 1]! : pad, point))) continue;
    registered.set(id, { id, area, pad: { ...pad }, exit: exit.map(point => ({ ...point })) });
  }
  return {
    sites: () => [...registered.values()],
    nearest(area: string, at: FlightFieldPoint) {
      if (!isFlightFieldPoint(at)) return;
      return [...registered.values()].filter(site => site.area === area && site.pad.height <= at.height)
        .sort((a, b) => Math.hypot(a.pad.east - at.east, a.pad.north - at.north) -
          Math.hypot(b.pad.east - at.east, b.pad.north - at.north))[0];
    },
  };
}

type CircuitGate = Readonly<{ at: FlightFieldPoint; forwardEast: number; forwardNorth: number }>;
type CircuitSample = Readonly<{ at: FlightFieldPoint; airborne: boolean; elapsedMs: number; recovered?: boolean }>;

/** Local circuit around the accepted Cloud Deck runway; no world anchor is implied. */
export function createCloudDeckCircuit(pad: FlightFieldPoint, heading: number) {
  if (!isFlightFieldPoint(pad) || !Number.isFinite(heading)) throw new RangeError('Invalid circuit runway');
  const east = Math.sin(heading), north = Math.cos(heading);
  const local = (along: number, cross: number, lift: number): FlightFieldPoint => ({
    east: pad.east + along * east + cross * north,
    north: pad.north + along * north - cross * east,
    height: pad.height + lift,
  });
  const gates: readonly CircuitGate[] = [
    { at: local(72, 0, 24), forwardEast: east, forwardNorth: north },
    { at: local(85, 78, 34), forwardEast: north, forwardNorth: -east },
    { at: local(-72, 78, 34), forwardEast: -east, forwardNorth: -north },
    { at: local(-85, 0, 24), forwardEast: -north, forwardNorth: east },
  ];
  let stage: 'idle' | 'ready' | 'airborne' | 'complete' | 'aborted' = 'idle';
  let previous: CircuitSample | undefined;
  let startMs = 0;
  let nextGate = 0;
  let durationMs: number | undefined;

  function atPad(at: FlightFieldPoint) {
    return Math.abs(at.height - pad.height) <= .43 && Math.hypot(at.east - pad.east, at.north - pad.north) <= 24;
  }

  function crosses(gate: CircuitGate, from: FlightFieldPoint, to: FlightFieldPoint) {
    const projection = (point: FlightFieldPoint) => (point.east - gate.at.east) * gate.forwardEast +
      (point.north - gate.at.north) * gate.forwardNorth;
    const before = projection(from), after = projection(to);
    if (before >= 0 || after < 0) return false;
    const fraction = -before / (after - before);
    return Math.hypot(from.east + (to.east - from.east) * fraction - gate.at.east,
      from.north + (to.north - from.north) * fraction - gate.at.north,
      from.height + (to.height - from.height) * fraction - gate.at.height) <= 15;
  }

  function snapshot() { return { stage, nextGate, durationMs }; }

  return {
    gates, snapshot,
    prepare(checks: { assembled: boolean; fuelSeconds: number; clearAirspace: boolean }) {
      const checklist = { 合体: checks.assembled, 燃料: Number.isFinite(checks.fuelSeconds) && checks.fuelSeconds > 0,
        空域: checks.clearAirspace };
      if (stage !== 'airborne') {
        stage = checklist.合体 && checklist.燃料 && checklist.空域 ? 'ready' : 'aborted';
        previous = undefined;
        nextGate = 0;
        durationMs = undefined;
      }
      return checklist;
    },
    update(sample: CircuitSample) {
      if (stage === 'idle' || stage === 'complete' || stage === 'aborted') return snapshot();
      if (sample.recovered || !isFlightFieldPoint(sample.at) || !Number.isFinite(sample.elapsedMs) || sample.elapsedMs < 0 ||
          (previous && sample.elapsedMs <= previous.elapsedMs) || flightAirspaceAt(sample.at.height).overCeiling) {
        stage = 'aborted';
        return snapshot();
      }
      if (stage === 'ready' && sample.airborne) {
        stage = previous && !previous.airborne && atPad(previous.at) ? 'airborne' : 'aborted';
        startMs = sample.elapsedMs;
      } else if (stage === 'airborne' && !sample.airborne) {
        if (nextGate !== gates.length || !atPad(sample.at)) stage = 'aborted';
        else { stage = 'complete'; durationMs = sample.elapsedMs - startMs; }
      } else if (stage === 'airborne' && previous && nextGate < gates.length &&
          crosses(gates[nextGate]!, previous.at, sample.at)) nextGate++;
      previous = { ...sample, at: { ...sample.at } };
      return snapshot();
    },
  };
}
