export type SummitCablePoint = { east: number; north: number; height: number };
type Direction = 'up' | 'down';
type Station = 'cloud-deck' | 'summit';
type Phase = 'station' | 'departure' | 'enter-cloud' | 'whiteout' | 'arrival';

// P-2 survey in the P-1 local frame. The ends stand on the 350 m approach
// and the west edge of the 800 m plateau. P-7 owns the station buildings.
const centreline: readonly SummitCablePoint[] = [
  { east: -15, north: 6, height: 352.4 },
  { east: -220, north: 60, height: 369 },
  { east: -558, north: 141, height: 380 },
  { east: -675, north: 324, height: 451 },
  { east: -675, north: 554, height: 560 },
  { east: -535, north: 722, height: 650 },
  { east: -263, north: 848, height: 760 },
  { east: -16, north: 979, height: 804 },
  { east: 24, north: 999, height: 802.4 },
];

export const summitCableSpec = {
  speedMetresPerSecond: 8,
  rampSeconds: 2.5,
  cabinHalfWidth: 1.2,
  cabinHalfLength: 1.5,
  cabinFloorBelowRope: 2.4,
  standBackFromRope: 3.2,
  enterCloudMs: 70_000,
  whiteoutMs: 100_000,
  emergeMs: 130_000,
} as const;

function horizontalNormal(from: SummitCablePoint, to: SummitCablePoint) {
  const east = to.east - from.east;
  const north = to.north - from.north;
  const length = Math.hypot(east, north);
  return { east: -north / length, north: east / length };
}

function createRope(offset: number, cloudDeckFloor: number) {
  const points = centreline.map((centre, index) => {
    const before = index === 0 ? horizontalNormal(centre, centreline[1]!)
      : horizontalNormal(centreline[index - 1]!, centre);
    const after = index === centreline.length - 1 ? before : horizontalNormal(centre, centreline[index + 1]!);
    const corner = 1 + before.east * after.east + before.north * after.north;
    return { east: centre.east + offset * (before.east + after.east) / corner,
      north: centre.north + offset * (before.north + after.north) / corner,
      height: index === 0 ? cloudDeckFloor + summitCableSpec.cabinFloorBelowRope : centre.height };
  });
  let length = 0;
  const segments = points.slice(1).map((to, index) => {
    const from = points[index]!;
    const east = to.east - from.east;
    const north = to.north - from.north;
    const height = to.height - from.height;
    const span = Math.hypot(east, north, height);
    const start = length;
    length += span;
    return { from, east, north, height, start, end: length, span };
  });
  const totalMetres = length;

  function sample(distanceMetres: number) {
    const distance = Math.max(0, Math.min(totalMetres, distanceMetres));
    const segment = segments.find(part => distance <= part.end) ?? segments[segments.length - 1]!;
    const fraction = (distance - segment.start) / segment.span;
    return {
      east: segment.from.east + segment.east * fraction,
      north: segment.from.north + segment.north * fraction,
      height: segment.from.height + segment.height * fraction,
      heading: Math.atan2(segment.east, segment.north),
    };
  }

  function dock(station: Station) {
    const index = station === 'cloud-deck' ? 0 : points.length - 1;
    const ropePoint = points[index]!;
    const normal = station === 'cloud-deck' ? horizontalNormal(points[0]!, points[1]!)
      : horizontalNormal(points[index - 1]!, ropePoint);
    const standOffset = Math.sign(offset) * summitCableSpec.standBackFromRope;
    return {
      board: { ...ropePoint, height: ropePoint.height - summitCableSpec.cabinFloorBelowRope },
      approach: { east: ropePoint.east + normal.east * standOffset,
        north: ropePoint.north + normal.north * standOffset,
        height: ropePoint.height - summitCableSpec.cabinFloorBelowRope },
    };
  }

  return { points, totalMetres, sample, dock };
}

function phaseAt(elapsedMs: number): Phase {
  if (elapsedMs < summitCableSpec.enterCloudMs) return 'departure';
  if (elapsedMs < summitCableSpec.whiteoutMs) return 'enter-cloud';
  if (elapsedMs < summitCableSpec.emergeMs) return 'whiteout';
  return 'arrival';
}

/**
 * The host supplies shared world time. End dwell is independent of ride time.
 * Both ropes turn at the same instant, with the longer rope defining the speed cap.
 */
export function createMainSummitCable(epochMs: number, terminalDwellMs: number, cloudDeckFloor: number) {
  if (!Number.isSafeInteger(epochMs) || !Number.isSafeInteger(terminalDwellMs) || terminalDwellMs <= 0) {
    throw new RangeError('The summit cable needs an integer world epoch and positive terminal dwell.');
  }
  if (!Number.isFinite(cloudDeckFloor) || cloudDeckFloor < 347 || cloudDeckFloor > 350) {
    throw new RangeError('The lower dock needs the surveyed P-1 arrival deck height.');
  }
  const ropes = [createRope(-3, cloudDeckFloor), createRope(3, cloudDeckFloor)] as const;
  const longest = Math.max(...ropes.map(rope => rope.totalMetres));
  const { speedMetresPerSecond, rampSeconds } = summitCableSpec;
  const rideMs = Math.ceil(1000 * (longest / speedMetresPerSecond + rampSeconds));
  const legMs = rideMs + terminalDwellMs;
  const cycleMs = legMs * 2;
  const rideSeconds = rideMs / 1000;
  const cruiseSeconds = rideSeconds - rampSeconds;

  function cabinAt(legTimeMs: number, halfCycle: boolean, index: 0 | 1) {
    const rope = ropes[index];
    const direction: Direction = halfCycle === (index === 1) ? 'up' : 'down';
    const station: Station | null = legTimeMs < terminalDwellMs
      ? direction === 'up' ? 'cloud-deck' : 'summit'
      : null;
    const elapsedMs = Math.max(0, legTimeMs - terminalDwellMs);
    const seconds = elapsedMs / 1000;
    // Integrate a linear speed ramp at each end so the car can stop at a dock.
    const rampDistance = rampSeconds / 2;
    const remaining = rideSeconds - seconds;
    const progressSeconds = seconds < rampSeconds ? seconds ** 2 / (2 * rampSeconds)
      : remaining < rampSeconds ? cruiseSeconds - remaining ** 2 / (2 * rampSeconds)
      : seconds - rampDistance;
    const progress = progressSeconds / cruiseSeconds;
    const distanceMetres = (direction === 'up' ? progress : 1 - progress) * rope.totalMetres;
    const phase: Phase = station ? 'station' : phaseAt(elapsedMs);
    return {
      index, direction, station, distanceMetres, phase, elapsedMs,
      ropePoint: rope.sample(distanceMetres),
      showRouteHints: phase !== 'whiteout',
      canBoardOrExit: station !== null,
    };
  }

  return {
    ropes, rideMs, legMs, cycleMs,
    cabinsAt(nowMs: number) {
      if (!Number.isFinite(nowMs)) throw new RangeError('The summit cable needs finite world time.');
      const remainder = (nowMs - epochMs) % cycleMs;
      const phaseMs = remainder < 0 ? remainder + cycleMs : remainder;
      const halfCycle = phaseMs >= legMs;
      const legTimeMs = phaseMs % legMs;
      return [cabinAt(legTimeMs, halfCycle, 0), cabinAt(legTimeMs, halfCycle, 1)] as const;
    },
  };
}
