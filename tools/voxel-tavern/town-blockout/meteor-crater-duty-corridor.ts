type CorridorPoint = Readonly<{ east: number; north: number }>;
type Side = 'left' | 'right';
type Station = Readonly<{ north: number; height: number }>;
type Constriction = Readonly<{
  id: string;
  north: number;
  gap: number;
  rubbleDepth: number;
  approachWidth: number;
  entrySide: Side;
}>;

export type MeteorCraterDutyCorridorPlan = Readonly<{
  floor: readonly Station[];
  width: number;
  headroom: number;
  blastDoor: Readonly<{ north: number; depth: number; openSide: Side }>;
  constrictions: readonly [Constriction, Constriction];
}>;

type CorridorBody = Readonly<{ radius: number; height: number }>;
type CorridorStep = CorridorBody & Readonly<{ maxStride: number; maxStep: number }>;
type Blocker = {
  id: string;
  kind: 'blast-door-leaf' | 'rubble';
  west: number;
  east: number;
  south: number;
  north: number;
};

function sweptIntersects(from: CorridorPoint, to: CorridorPoint, blocker: Blocker, radius: number) {
  let enter = 0;
  let leave = 1;
  const axes = [
    [from.east, to.east, blocker.west - radius, blocker.east + radius],
    [from.north, to.north, blocker.south - radius, blocker.north + radius],
  ];
  // Use the enclosing expanded box for the sweep so a corner cannot be tunneled through.
  for (const [start, end, low, high] of axes) {
    const delta = end - start;
    if (delta === 0) {
      if (start < low || start > high) return false;
      continue;
    }
    const first = (low - start) / delta;
    const last = (high - start) / delta;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
    if (enter > leave) return false;
  }
  return true;
}

/** Local surface candidate. The host supplies the registered entrance and exit transform. */
export function createMeteorCraterDutyCorridor(plan: MeteorCraterDutyCorridorPlan) {
  const { width, headroom, blastDoor, constrictions } = plan;
  const half = width / 2;
  const floor = plan.floor.map(({ north, height }) => ({
    north: Math.fround(north), height: Math.fround(height), roof: Math.fround(Math.fround(height) + headroom),
  }));
  const length = floor.at(-1)?.north ?? 0;
  if (![width, headroom, blastDoor.north, blastDoor.depth].every(Number.isFinite) ||
      width <= 0 || headroom <= 0 || blastDoor.depth <= 0 ||
      (blastDoor.openSide !== 'left' && blastDoor.openSide !== 'right') ||
      floor[0]?.north !== 0 || length <= 0 ||
      floor.some((station, index) => ![station.north, station.height, station.roof].every(Number.isFinite) ||
        (index > 0 && station.north <= floor[index - 1].north))) {
    throw new RangeError('The duty corridor needs finite ordered floor stations and blast door dimensions');
  }

  const doorStart = blastDoor.north - blastDoor.depth / 2;
  const doorEnd = blastDoor.north + blastDoor.depth / 2;
  const blockers: Blocker[] = [{
    id: 'blast-door', kind: 'blast-door-leaf', south: doorStart, north: doorEnd,
    west: blastDoor.openSide === 'left' ? 0 : -half,
    east: blastDoor.openSide === 'left' ? half : 0,
  }];

  const sections = constrictions.map(({ id, north, gap, rubbleDepth, approachWidth, entrySide }) => {
    if (!id || ![north, gap, rubbleDepth, approachWidth].every(Number.isFinite) ||
        gap <= 0 || rubbleDepth <= 0 || approachWidth <= 0 || approachWidth >= half ||
        (entrySide !== 'left' && entrySide !== 'right')) {
      throw new RangeError('A constriction needs two opposing rubble edges and three finite clearances');
    }
    const crossStart = north - gap / 2;
    const crossEnd = north + gap / 2;
    const south = crossStart - rubbleDepth;
    const end = crossEnd + rubbleDepth;
    const leftOpening = { west: -half + approachWidth, east: half };
    const rightOpening = { west: -half, east: half - approachWidth };
    blockers.push(
      { id: id + '/approach', kind: 'rubble', south, north: crossStart,
        ...(entrySide === 'left' ? leftOpening : rightOpening) },
      { id: id + '/exit', kind: 'rubble', south: crossEnd, north: end,
        ...(entrySide === 'left' ? rightOpening : leftOpening) },
    );
    return { id, south, north: end };
  });

  if (sections.length !== 2 || sections[0].id === sections[1].id || doorStart < 0 || doorEnd >= sections[0].south ||
      sections[0].north >= sections[1].south || sections[1].north > length) {
    throw new RangeError('The half-open gate and two distinct constrictions must follow the floor in order');
  }

  function elevationAt(north: number, layer: 'height' | 'roof') {
    if (!Number.isFinite(north) || north < 0 || north > length) return;
    const upper = floor.findIndex(station => station.north >= north);
    if (upper === 0) return floor[0][layer];
    const a = floor[upper - 1], b = floor[upper];
    return a[layer] + (b[layer] - a[layer]) * (north - a.north) / (b.north - a.north);
  }

  const positions = new Float32Array(floor.length * 6);
  const indices = new Uint32Array((floor.length - 1) * 6);
  const roofPositions = new Float32Array(positions.length);
  const roofIndices = new Uint32Array(indices.length);
  floor.forEach(({ north, height, roof }, index) => {
    positions.set([-half, height, -north, half, height, -north], index * 6);
    roofPositions.set([-half, roof, -north, half, roof, -north], index * 6);
    if (index === 0) return;
    const a = 2 * index - 2;
    indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], (index - 1) * 6);
    roofIndices.set([a, a + 2, a + 1, a + 2, a + 3, a + 1], (index - 1) * 6);
  });

  const solids = blockers.map(({ id, kind, west, east, south, north }) => {
    const span = floor.filter(point => point.north > south && point.north < north);
    return {
      id, kind,
      min: [west, Math.min(elevationAt(south, 'height')!, elevationAt(north, 'height')!, ...span.map(p => p.height)), -north] as const,
      max: [east, Math.max(elevationAt(south, 'roof')!, elevationAt(north, 'roof')!, ...span.map(p => p.roof)), -south] as const,
    };
  });

  function clearanceAt({ east, north }: CorridorPoint, { radius, height }: CorridorBody) {
    if (![east, north, radius, height].every(Number.isFinite) || radius < 0 || height <= 0 ||
        Math.abs(east) + radius >= half) return;
    const support = elevationAt(north, 'height');
    if (support === undefined) return;
    const rear = Math.max(0, north - radius);
    const front = Math.min(length, north + radius);
    let minimumRoof = Math.min(elevationAt(rear, 'roof')!, elevationAt(front, 'roof')!);
    for (const station of floor) {
      if (station.north > rear && station.north < front) minimumRoof = Math.min(minimumRoof, station.roof);
    }
    const availableHeight = minimumRoof - support;
    if (height > availableHeight) return;

    let west = east + half;
    let eastward = half - east;
    let south = Infinity;
    let northward = Infinity;
    for (const block of blockers) {
      const dx = Math.max(block.west - east, east - block.east, 0);
      const dz = Math.max(block.south - north, north - block.north, 0);
      if (Math.hypot(dx, dz) <= radius) return;
      if (dz === 0) {
        if (east < block.west) eastward = Math.min(eastward, block.west - east);
        if (east > block.east) west = Math.min(west, east - block.east);
      }
      if (dx === 0) {
        if (north < block.south) northward = Math.min(northward, block.south - north);
        if (north > block.north) south = Math.min(south, north - block.north);
      }
    }

    const across = west + eastward <= south + northward ?
      { left: west, right: eastward, axis: 'east' as const } :
      { left: south, right: northward, axis: 'north' as const };
    return {
      supportY: support,
      headroom: availableHeight,
      ...across,
      constriction: sections.find(section => north >= section.south && north <= section.north)?.id,
    };
  }

  function allowsSweep(from: CorridorPoint, to: CorridorPoint, body: CorridorStep): boolean {
    const a = clearanceAt(from, body);
    const b = clearanceAt(to, body);
    if (!a || !b || !Number.isFinite(body.maxStride) || !Number.isFinite(body.maxStep) ||
        body.maxStride < 0 || body.maxStep < 0 ||
        Math.hypot(to.east - from.east, to.north - from.north) > body.maxStride ||
        blockers.some(block => sweptIntersects(from, to, block, body.radius))) return false;
    let low = Math.min(a.supportY, b.supportY);
    let high = Math.max(a.supportY, b.supportY);
    const south = Math.min(from.north, to.north);
    const north = Math.max(from.north, to.north);
    for (const station of floor) {
      // The floor or the roof under either edge of the footprint changes slope here.
      for (const candidate of [station.north - body.radius, station.north, station.north + body.radius]) {
        if (candidate <= south || candidate >= north) continue;
        const fraction = (candidate - from.north) / (to.north - from.north);
        const east = from.east + (to.east - from.east) * fraction;
        const inside = clearanceAt({ east, north: candidate }, body);
        if (!inside) return false;
        low = Math.min(low, inside.supportY);
        high = Math.max(high, inside.supportY);
      }
    }
    return high - low <= body.maxStep;
  }

  return {
    length,
    width,
    headroom,
    floor: { positions, indices },
    ceiling: { positions: roofPositions, indices: roofIndices },
    solids,
    blastDoor: { state: 'half-open' as const, clearWidth: half },
    clearanceAt,
    allowsSweep,
  };
}
