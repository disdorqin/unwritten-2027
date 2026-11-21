/**
 * U-19 certified 120 m mine-cart route.
 * All waypoints and repair stations originate from the real U-15 host survey.
 * The U-7 two-step 1.4m fixture is deliberately rejected here.
 */
export type UndergroundMainlinePoint = Readonly<{ east: number; north: number; height: number }>;
export type UndergroundMainlineFault = 'sleepers' | 'gauge' | 'turnout-rust';
export type UndergroundMainlineStation = 'camp' | 'gate';
export type UndergroundMainlineProfile = Readonly<{
  domainId: string;
  waypoints: readonly UndergroundMainlinePoint[];
  /** Actual chainage of the turnout and three visually distinct repair bays. */
  turnoutMetres: number;
  faults: Readonly<Record<UndergroundMainlineFault, number>>;
  gaugeMetres: number;
  /** Real car clearance radius, including the ore bin and rider, not a zero-width rail. */
  clearanceRadius: number;
  /** Exact live movement-host support/swept clearance validator. */
  acceptsTrackStep(from: UndergroundMainlinePoint, to: UndergroundMainlinePoint, radius: number): boolean;
  acceptsWorkFoot(kind: UndergroundMainlineFault | UndergroundMainlineStation | 'turnout',
    at: UndergroundMainlinePoint): boolean;
}>;
export type UndergroundMainlinePose = Readonly<{
  position: UndergroundMainlinePoint;
  heading: number; // Three.js local cart nose faces -Z.
  grade: number;
  chainage: number;
}>;
const faultNames: readonly UndergroundMainlineFault[] = ['sleepers', 'gauge', 'turnout-rust'];
const validPoint = (point: UndergroundMainlinePoint) =>
  [point.east, point.north, point.height].every(Number.isFinite);
const distance3 = (a: UndergroundMainlinePoint, b: UndergroundMainlinePoint) =>
  Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height);

/** Reject false poses, unsupported segments or phantom '120m' made from the two-step U-7 fixture. */
export function createUndergroundMainlineTrack(profile: UndergroundMainlineProfile) {
  const { waypoints, gaugeMetres, clearanceRadius } = profile;
  if (!profile.domainId.trim() || profile.domainId !== profile.domainId.trim() ||
      waypoints.length < 4 || waypoints.length > 120 || !waypoints.every(validPoint) ||
      !Number.isFinite(gaugeMetres) || gaugeMetres < .6 || gaugeMetres > 1.5 ||
      !Number.isFinite(clearanceRadius) || clearanceRadius < .3 || clearanceRadius > 2.0) {
    throw new RangeError('U-19 requires a surveyed mine domain, complete route and body clearance');
  }
  const segments: Array<{ from: UndergroundMainlinePoint; to: UndergroundMainlinePoint;
    start: number; length: number; planar: number }> = [];
  let length = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1]!;
    const to = waypoints[i]!;
    const planar = Math.hypot(to.east - from.east, to.north - from.north);
    const span = distance3(from, to);
    if (!Number.isFinite(span) || planar < .8 || planar > 28 ||
        span / planar > 1.025 || span < .8 || !profile.acceptsTrackStep(from, to, clearanceRadius)) {
      throw new RangeError('U-19 route segment has no accepted walkable rail clearance');
    }
    segments.push({ from: { ...from }, to: { ...to }, start: length, length: span, planar });
    length += span;
  }
  if (length < 115 || length > 125 || !Number.isFinite(profile.turnoutMetres) ||
      profile.turnoutMetres <= 15 || profile.turnoutMetres >= length - 10) {
    throw new RangeError('U-19 expects the real approximately 120m camp-to-gate corridor');
  }
  const chainages = Object.values(profile.faults);
  if (!chainages.every(m => Number.isFinite(m) && m >= 3 && m < length - 3) ||
      chainages.length !== faultNames.length ||
      chainages.some((m, i) => chainages.some((n, j) => i !== j && Math.abs(m - n) < 4))) {
    throw new RangeError('U-19 needs three separated certified fault bays');
  }

  function sample(chainage: number): UndergroundMainlinePose {
    if (!Number.isFinite(chainage) || chainage < 0 || chainage > length) {
      throw new RangeError('U-19 pose outside confirmed route');
    }
    const segment = segments.find(s => chainage <= s.start + s.length) ?? segments[segments.length - 1]!;
    const ratio = Math.min(1, Math.max(0, (chainage - segment.start) / segment.length));
    const position = {
      east: segment.from.east + (segment.to.east - segment.from.east) * ratio,
      north: segment.from.north + (segment.to.north - segment.from.north) * ratio,
      height: segment.from.height + (segment.to.height - segment.from.height) * ratio,
    };
    const dx = segment.to.east - segment.from.east;
    const dn = segment.to.north - segment.from.north;
    return { position, heading: Math.atan2(-dx, dn),
      grade: (segment.to.height - segment.from.height) / segment.planar, chainage };
  }
  // The host also validates approach feet; rendering a plausible repair point is not permission.
  const work: Record<UndergroundMainlineFault | UndergroundMainlineStation | 'turnout', UndergroundMainlinePose> = {
    sleepers: sample(profile.faults.sleepers), gauge: sample(profile.faults.gauge),
    'turnout-rust': sample(profile.faults['turnout-rust']),
    camp: sample(0), gate: sample(length), turnout: sample(profile.turnoutMetres),
  };
  for (const [role, pose] of Object.entries(work)) {
    if (profile.acceptsWorkFoot(role as keyof typeof work, pose.position) !== true) {
      throw new RangeError('U-19 station, switch or repair foot is not movement-authorized: ' + role);
    }
  }
  // An empty branch is ONLY a visual endpoint until U-15 formally registers a branch domain.
  return Object.freeze({
    domainId: profile.domainId, length, gaugeMetres, clearanceRadius,
    turnoutMetres: profile.turnoutMetres, faults: { ...profile.faults }, work,
    sample, sections: segments.map(s => Object.freeze({ ...s })),
    /** Used by the same cart model and movement sweep, no independent visual spline. */
    sampleSleepers(spacingMetres: number) {
      if (!Number.isFinite(spacingMetres) || spacingMetres < .45 || spacingMetres > 3) {
        throw new RangeError('Invalid U-19 sleeper spacing');
      }
      const out: UndergroundMainlinePose[] = [];
      for (let m = 0; m <= length; m += spacingMetres) out.push(sample(m));
      out.push(sample(length));
      return out;
    },
  });
}
