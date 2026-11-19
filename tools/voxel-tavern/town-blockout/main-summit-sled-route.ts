export type SummitSledPoint = { east: number; north: number; height: number };
type HorizontalPoint = Pick<SummitSledPoint, 'east' | 'north'>;
type SledArcId = 'above-cloud' | 'through-cloud' | 'below-cloud';

// The 18 m foot is C-04. The old approximate leg lengths do not yield the specified
// grades between these levels. This survey preserves the levels and grade bands.
const elevations = [800, 560, 380, 18] as const;
const arcIds = ['above-cloud', 'through-cloud', 'below-cloud'] as const;
const arcLengths = [1590, 1810, 2615] as const;
const hostBoundaryNorth = -10;
const samplingIntervalMetres = 4;

// Run ends and the radius of each southward hairpin, in the P-1 local frame.
// After the southern boundary this is only a continuous preview fixture for
// the return to the front-ridge foot. It has no production frame transform.
const bends = [
  { east: 440, radius: 95 },
  { east: 172, radius: 83 },
  { east: 850, radius: 83 },
  { east: 275, radius: 86 },
  { east: 970, radius: 85 },
  { east: 245, radius: 100 },
  { east: 925, radius: 85 },
] as const;

type PlanPiece = {
  startMetres: number;
  endMetres: number;
  sample(metres: number): HorizontalPoint;
  heading(metres: number): number;
};

function planLine() {
  const start: HorizontalPoint = { east: 79, north: 1004 };
  const pieces: PlanPiece[] = [];
  let runStart = start;
  let distance = 0;
  let eastDirection = 1;
  let seamMetres = 0;

  function runTo(east: number) {
    const { east: startEast, north } = runStart;
    const startMetres = distance;
    const direction = eastDirection;
    distance += Math.abs(east - startEast);
    pieces.push({
      startMetres,
      endMetres: distance,
      sample: metres => ({ east: startEast + direction * metres, north }),
      heading: () => direction * Math.PI / 2,
    });
  }

  for (const { east, radius } of bends) {
    runTo(east);
    const north = runStart.north;
    const endNorth = north - 2 * radius;
    const startMetres = distance;
    const direction = eastDirection;
    distance += Math.PI * radius;
    if (north > hostBoundaryNorth && endNorth <= hostBoundaryNorth) {
      seamMetres = startMetres + radius * Math.acos(1 - (north - hostBoundaryNorth) / radius);
    }
    pieces.push({
      startMetres,
      endMetres: distance,
      sample: metres => {
        const angle = metres / radius;
        return { east: east + direction * radius * Math.sin(angle), north: north - radius * (1 - Math.cos(angle)) };
      },
      heading: metres => direction * (Math.PI / 2 + metres / radius),
    });
    eastDirection = -eastDirection;
    runStart = { east, north: endNorth };
  }
  runTo(300);
  return { pieces, seamMetres };
}

export function createMainSummitSledRoute() {
  const plan = planLine();
  let horizontalMetres = 0;
  let descentMetres = 0;
  const altitudeBands = arcIds.map((id, index) => {
    const startHeight = elevations[index]!;
    const endHeight = elevations[index + 1]!;
    const dropMetres = startHeight - endHeight;
    const lengthMetres = arcLengths[index]!;
    const runMetres = Math.sqrt(lengthMetres ** 2 - dropMetres ** 2);
    const band = {
      id,
      startHeight,
      endHeight,
      startMetres: descentMetres,
      endMetres: descentMetres + lengthMetres,
      lengthMetres,
      startHorizontal: horizontalMetres,
      runMetres,
      grade: dropMetres / runMetres,
    };
    horizontalMetres += runMetres;
    descentMetres += lengthMetres;
    return band;
  });
  const bottomBand = altitudeBands[altitudeBands.length - 1]!;
  const lengthMetres = descentMetres;
  const hostSeamMetres = bottomBand.startMetres + bottomBand.lengthMetres *
    (plan.seamMetres - bottomBand.startHorizontal) / bottomBand.runMetres;

  function locate(metres: number) {
    if (!Number.isFinite(metres)) throw new RangeError('The main summit sled route needs a finite distance.');
    const distance = Math.max(0, Math.min(lengthMetres, metres));
    const band = altitudeBands.find(arc => distance <= arc.endMetres) ?? bottomBand;
    const ratio = (distance - band.startMetres) / band.lengthMetres;
    const horizontalDistance = band.startHorizontal + band.runMetres * ratio;
    const piece = plan.pieces.find(part => horizontalDistance <= part.endMetres) ?? plan.pieces[plan.pieces.length - 1]!;
    const offset = horizontalDistance - piece.startMetres;
    return { band, piece, offset, ratio };
  }

  function sampleAtDistance(metres: number): SummitSledPoint {
    const { band, piece, offset, ratio } = locate(metres);
    return { ...piece.sample(offset), height: band.startHeight + (band.endHeight - band.startHeight) * ratio };
  }

  function headingAtDistance(metres: number) {
    const { piece, offset } = locate(metres);
    const angle = piece.heading(offset);
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  const arcs = altitudeBands.map(({ startHorizontal, runMetres, ...band }) => {
    const distances = new Set([band.startMetres, band.endMetres]);
    for (const { endMetres } of plan.pieces) {
      if (endMetres > startHorizontal && endMetres < startHorizontal + runMetres) {
        distances.add(band.startMetres + band.lengthMetres * (endMetres - startHorizontal) / runMetres);
      }
    }
    if (hostSeamMetres > band.startMetres && hostSeamMetres < band.endMetres) distances.add(hostSeamMetres);
    const subdivisions = Math.ceil(band.lengthMetres / samplingIntervalMetres);
    for (let index = 1; index < subdivisions; index++) {
      distances.add(band.startMetres + band.lengthMetres * index / subdivisions);
    }
    const sampleDistances = [...distances].sort((left, right) => left - right);
    return { ...band, points: sampleDistances.map(sampleAtDistance), sampleDistances };
  });

  return {
    lengthMetres,
    arcs,
    points: arcs.flatMap((arc, index) => index === 0 ? arc.points : arc.points.slice(1)),
    minimumPlanBendRadiusMetres: Math.min(...bends.map(bend => bend.radius)),
    hostSeam: {
      distanceMetres: hostSeamMetres,
      point: sampleAtDistance(hostSeamMetres),
      leaves: 'main-summit',
      enters: 'front-ridge-foot-preview',
    },
    sampleAtDistance,
    headingAtDistance,
  };
}
