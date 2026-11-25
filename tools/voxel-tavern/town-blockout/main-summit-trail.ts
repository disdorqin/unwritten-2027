export type MainSummitTrailPoint = { east: number; north: number; height: number };
type GroundSampler = (east: number, north: number) => number | undefined;
type SurveyPoint = MainSummitTrailPoint & { metres: number };

export const mainSummitTrailSpec = {
  width: 3,
  minimumHorizontalMetres: 5_400,
  maximumGrade: 0.12,
  switchbackAzimuth: 70 * Math.PI / 180,
  targetRisePerMetre: 0.082,
  summitHeight: 800,
} as const;

const halfWidth = mainSummitTrailSpec.width / 2;
const surveyStepMetres = 1;
const sampleTolerance = 1e-8;
const indexCellMetres = 8;

function groundHeight(groundAt: GroundSampler, east: number, north: number): number {
  const height = groundAt(east, north);
  if (height === undefined || !Number.isFinite(height)) {
    throw new RangeError(`The main summit trail has missing ground at E${east}, N${north}.`);
  }
  return height;
}

function surveyCentreline(groundAt: GroundSampler, cloudDeckHeight: number) {
  const summitHeight = mainSummitTrailSpec.summitHeight;
  const points: SurveyPoint[] = [{ east: 0, north: -10, height: cloudDeckHeight, metres: 0 }];
  const turns: number[] = [];
  let east = 0;
  let north = 40;
  let metres = 50;
  let sweep = 1;
  points.push({ east, north, height: groundHeight(groundAt, east, north), metres });

  // Sweep both faces of the southern flank along the contours. The height
  // sampler supplies the actual P-1 shape, including its gate transition.
  const epsilon = 0.05;
  for (let step = 0; step < 9_000; step++) {
    const height = points[points.length - 1]!.height;
    if (height >= summitHeight - 1e-6) {
      const landing = { east: 30, north: 982 };
      const landingHeight = groundHeight(groundAt, landing.east, landing.north);
      if (Math.abs(landingHeight - summitHeight) > sampleTolerance) {
        throw new RangeError('The main summit trail landing must meet the 800 m plateau.');
      }
      metres += Math.hypot(east - landing.east, north - landing.north);
      points.push({ ...landing, height: landingHeight, metres });
      return { points, turns };
    }

    const gradEast = groundHeight(groundAt, east + epsilon, north) - groundHeight(groundAt, east - epsilon, north);
    const gradNorth = groundHeight(groundAt, east, north + epsilon) - groundHeight(groundAt, east, north - epsilon);
    const uphill = Math.hypot(gradEast, gradNorth) > 1e-10
      ? Math.atan2(gradNorth, gradEast)
      : Math.atan2(1_000 - north, 50 - east);
    const azimuth = Math.atan2(east - 50, 1_000 - north);
    if (sweep * azimuth > mainSummitTrailSpec.switchbackAzimuth) {
      sweep = -sweep;
      turns.push(points.length - 1);
    }

    const stepHeight = (bearing: number) => groundHeight(
      groundAt, east + Math.cos(bearing) * surveyStepMetres, north + Math.sin(bearing) * surveyStepMetres,
    );
    let steep = 0;
    if (stepHeight(uphill) - height > mainSummitTrailSpec.targetRisePerMetre) {
      let gentle = Math.PI;
      for (let iteration = 0; iteration < 18; iteration++) {
        const angle = (steep + gentle) / 2;
        if (stepHeight(uphill - sweep * angle) - height > mainSummitTrailSpec.targetRisePerMetre) {
          steep = angle;
        } else {
          gentle = angle;
        }
      }
    }
    const bearing = uphill - sweep * steep;
    east += Math.cos(bearing) * surveyStepMetres;
    north += Math.sin(bearing) * surveyStepMetres;
    metres += surveyStepMetres;
    points.push({ east, north, height: groundHeight(groundAt, east, north), metres });
  }
  throw new RangeError('The main summit trail did not reach the summit.');
}

function widenTurns(points: SurveyPoint[], turnIndices: number[]) {
  for (const [index, pointIndex] of turnIndices.entries()) {
    const turn = points[pointIndex]!;
    const isSummitTurn = index === turnIndices.length - 1;
    const isBeforeSummitTurn = index === turnIndices.length - 2;
    // A switchback has a common level tread where its two 3 m arms meet.
    // Spread the grade correction over the approach and exit beyond that pad.
    const approachSamples = isSummitTurn ? 80 : 54;
    const padSamples = isSummitTurn ? 16 : 14;
    const exitSamples = isBeforeSummitTurn ? 46 : 54;
    const approach = points[pointIndex - approachSamples];
    const exit = isSummitTurn ? points[points.length - 1]! : points[pointIndex + exitSamples];
    if (!approach || !exit) throw new RangeError('A main summit trail hairpin has insufficient approach.');
    const padHeight = isSummitTurn ? exit.height : turn.height;

    for (let offset = pointIndex - approachSamples + 1; offset < points.length; offset++) {
      const point = points[offset]!;
      if (point.metres >= exit.metres) break;
      const along = point.metres - turn.metres;
      if (along < -padSamples) {
        const ratio = (point.metres - approach.metres) / (approachSamples - padSamples);
        point.height = approach.height + (padHeight - approach.height) * ratio;
      } else if (!isSummitTurn && along > padSamples) {
        const ratio = (along - padSamples) / (exitSamples - padSamples);
        point.height = padHeight + (exit.height - padHeight) * ratio;
      } else {
        point.height = padHeight;
      }
    }
  }
}

type TrailSegment = {
  from: SurveyPoint;
  east: number;
  north: number;
  height: number;
  span: number;
};

function indexSurface(segments: readonly TrailSegment[]) {
  const gateApproach = segments[0];
  const cells = new Map<string, TrailSegment[]>();
  const cellFor = (value: number) => Math.floor(value / indexCellMetres);
  const cellKey = (east: number, north: number) => `${east},${north}`;
  const halfWidthSquared = halfWidth ** 2;

  for (const segment of segments) {
    const { from, east, north } = segment;
    const west = cellFor(from.east + Math.min(0, east) - halfWidth);
    const south = cellFor(from.north + Math.min(0, north) - halfWidth);
    const eastbound = cellFor(from.east + Math.max(0, east) + halfWidth);
    const northbound = cellFor(from.north + Math.max(0, north) + halfWidth);
    for (let x = west; x <= eastbound; x++) {
      for (let z = south; z <= northbound; z++) {
        const key = cellKey(x, z);
        const bucket = cells.get(key);
        if (bucket) bucket.push(segment);
        else cells.set(key, [segment]);
      }
    }
  }

  return (east: number, north: number, radius: number, includeGate: boolean): number | undefined => {
    if (!Number.isFinite(east) || !Number.isFinite(north) || north < -10 ||
        !Number.isFinite(radius) || radius < 0 || radius > halfWidth) return undefined;
    const candidates = cells.get(cellKey(cellFor(east), cellFor(north)));
    if (!candidates) return undefined;

    const clearanceSquared = (halfWidth - radius) ** 2 + sampleTolerance;
    let supportsFoot = false;
    let closest = halfWidthSquared + sampleTolerance;
    let edgeHeight: number | undefined;
    let weightedHeight = 0;
    let totalWeight = 0;
    for (const segment of candidates) {
      if (!includeGate && segment === gateApproach) continue;
      const { from, span } = segment;
      const eastFromStart = east - from.east;
      const northFromStart = north - from.north;
      const along = Math.max(0, Math.min(1, (
        eastFromStart * segment.east + northFromStart * segment.north
      ) / (span * span)));
      const distanceSquared = (eastFromStart - along * segment.east) ** 2 +
        (northFromStart - along * segment.north) ** 2;
      if (distanceSquared > halfWidthSquared + sampleTolerance) continue;
      if (distanceSquared <= clearanceSquared) supportsFoot = true;
      const height = from.height + segment.height * along;
      if (distanceSquared <= sampleTolerance ** 2) return height;
      if (distanceSquared <= closest) {
        closest = distanceSquared;
        edgeHeight = height;
      }
      // Near overlapping turn approaches, fade each tread to zero weight at
      // its outer edge. The centreline itself retains its exact survey grade.
      const weight = Math.max(0, halfWidthSquared - distanceSquared) / distanceSquared;
      weightedHeight += height * weight;
      totalWeight += weight;
    }
    if (!supportsFoot) return undefined;
    return totalWeight > 0 ? weightedHeight / totalWeight : edgeHeight;
  };
}

/**
 * Builds the P-3 walkable strip in P-1 local E/N/Y. The host should select
 * its surface before natural ground inside the ribbon, including at cuts.
 */
export function createMainSummitTrail(groundAt: GroundSampler, cloudDeckHeight: number) {
  const groundAtGate = groundHeight(groundAt, 0, -10);
  if (!Number.isFinite(cloudDeckHeight) || cloudDeckHeight < 347 || cloudDeckHeight > 350 ||
      Math.abs(groundAtGate - cloudDeckHeight) > sampleTolerance) {
    throw new RangeError('The main summit trail needs the surveyed 347–350 m cloud deck height matching P-1 ground.');
  }
  const { points, turns } = surveyCentreline(groundAt, cloudDeckHeight);
  widenTurns(points, turns);

  let surfaceMetres = 0;
  let maxGrade = 0;
  const segments = points.slice(1).map((point, index): TrailSegment => {
    const from = points[index]!;
    const east = point.east - from.east;
    const north = point.north - from.north;
    const height = point.height - from.height;
    const span = Math.hypot(east, north);
    surfaceMetres += Math.hypot(span, height);
    maxGrade = Math.max(maxGrade, Math.abs(height) / span);
    return { from, east, north, height, span };
  });
  const horizontalMetres = points[points.length - 1]!.metres;
  if (horizontalMetres < mainSummitTrailSpec.minimumHorizontalMetres || maxGrade > mainSummitTrailSpec.maximumGrade) {
    throw new RangeError(`Main summit trail does not meet P-3: ${horizontalMetres} m, grade ${maxGrade}.`);
  }

  const sampleIndexedSurface = indexSurface(segments);
  const sampleSurface = (east: number, north: number) => sampleIndexedSurface(east, north, 0, true);
  let maxCutMetres = 0;
  let maxFillMetres = 0;
  for (const segment of segments) {
    const { from, east, north, span } = segment;
    const count = Math.ceil(span / 0.250001);
    for (let sample = 0; sample <= count; sample++) {
      const fraction = sample / count;
      for (const offset of [-halfWidth, -halfWidth / 2, 0, halfWidth / 2, halfWidth]) {
        const sampleEast = from.east + east * fraction - offset * north / span;
        const sampleNorth = from.north + north * fraction + offset * east / span;
        const surface = sampleSurface(sampleEast, sampleNorth);
        if (surface === undefined) throw new RangeError('Main summit trail contains a gap in its walkable surface.');
        const difference = surface - groundHeight(groundAt, sampleEast, sampleNorth);
        maxCutMetres = Math.max(maxCutMetres, -difference);
        maxFillMetres = Math.max(maxFillMetres, difference);
      }
    }
  }

  const lowerAnchor = points[turns[0]!];
  const upperAnchor = points.find(point => point.metres >= 2_160);
  if (!lowerAnchor || !upperAnchor ||
      ![lowerAnchor, upperAnchor].every(point => point.height >= 380 && point.height <= 560)) {
    throw new RangeError('The main summit trail needs two pavilion anchors in the cloud belt.');
  }
  const pavilionAnchors = [
    { id: 'lower-cloud', ...lowerAnchor },
    { id: 'upper-cloud', ...upperAnchor },
  ] as const;
  return {
    points: points.map(({ east, north, height }) => ({ east, north, height })) as readonly MainSummitTrailPoint[],
    turnarounds: turns.map(index => ({ ...points[index]! })),
    metrics: { horizontalMetres, surfaceMetres, maxGrade, maxCutMetres, maxFillMetres },
    pavilionAnchors,
    sampleSurface,
    // The plaza supplies the approach. Require the player's standing circle
    // to fit within at least one surveyed section of the three-metre strip.
    sampleWalkwaySurface(east: number, north: number, radius = .27) {
      return sampleIndexedSurface(east, north, radius, false);
    },
  };
}
