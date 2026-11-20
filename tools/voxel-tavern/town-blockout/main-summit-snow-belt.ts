export type SnowBeltKnot = readonly [east: number, north: number, headingFromEast: number, height: number];
type Point = { east: number; north: number; height: number };
type TrackSample = Point & { metres: number; headingFromEast: number; grade: number };

const indexCellMetres = 8;
const halfWidth = 2.1;
const surveyStepMetres = 0.6;
const sinc = (angle: number) => Math.abs(angle) < 1e-7 ? 1 : Math.sin(angle) / angle;
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const integratedSmoothstep = (t: number) => t * t * t * (1 - t / 2);

export function createMainSummitSnowBelt(knots: readonly SnowBeltKnot[], exitGrade: number) {
  if (knots.length < 2 || !Number.isFinite(exitGrade) || exitGrade <= 0 ||
      knots.some(knot => !knot.every(Number.isFinite))) {
    throw new RangeError('The snow belt requires finite surveyed knots and a downhill exit grade.');
  }
  let run = 0;
  const spans = knots.slice(1).map((to, index) => {
    const from = knots[index]!;
    const turn = Math.atan2(Math.sin(to[2] - from[2]), Math.cos(to[2] - from[2]));
    const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const half = from[2] + turn / 2;
    const length = chord / sinc(turn / 2);
    if (length <= 0 || to[3] >= from[3] ||
        Math.hypot(from[0] + chord * Math.cos(half) - to[0], from[1] + chord * Math.sin(half) - to[1]) > 1e-5) {
      throw new RangeError(`Invalid descending snow belt span ${index}.`);
    }
    const span = { from, to, turn, length, start: run, end: run + length, slope: (from[3] - to[3]) / length };
    run = span.end;
    return span;
  });

  // Harmonic interior derivatives preserve downhill monotonicity at grade changes.
  const grades = spans.map((span, index) => {
    if (index === 0) return span.slope;
    const previous = spans[index - 1]!;
    const firstWeight = 2 * span.length + previous.length;
    const secondWeight = span.length + 2 * previous.length;
    return (firstWeight + secondWeight) / (firstWeight / previous.slope + secondWeight / span.slope);
  });
  grades.push(exitGrade);
  if (exitGrade >= 3 * spans.at(-1)!.slope) throw new RangeError('The exit derivative would reverse its downhill span.');

  function sampleSpan(index: number, offset: number): TrackSample {
    const span = spans[index]!;
    const { from, to, turn, length, start, slope } = span;
    const fraction = offset >= length - 1e-10 ? 1 : clamp(offset / length, 0, 1);
    const halfTurn = turn * fraction / 2;
    const chord = length * fraction * sinc(halfTurn);
    const bearing = from[2] + halfTurn;
    const firstGrade = grades[index]!;
    const lastGrade = grades[index + 1]!;
    // Limit the easing to each knot's immediate neighbourhood. The middle
    // gradient compensates for the two feathers to meet both surveyed heights.
    const feather = Math.min(0.75, length / 4);
    const middleGrade = (slope * length - feather * (firstGrade + lastGrade) / 2) / (length - feather);
    const along = length * fraction;
    const left = length - along;
    let grade = middleGrade;
    let height = from[3] - feather * (firstGrade + middleGrade) / 2 - (along - feather) * middleGrade;
    if (along < feather) {
      const t = along / feather;
      grade = firstGrade + (middleGrade - firstGrade) * smoothstep(t);
      height = from[3] - firstGrade * along - (middleGrade - firstGrade) * feather * integratedSmoothstep(t);
    } else if (left <= feather) {
      const t = left / feather;
      grade = lastGrade + (middleGrade - lastGrade) * smoothstep(t);
      height = to[3] + lastGrade * left + (middleGrade - lastGrade) * feather * integratedSmoothstep(t);
    }
    return {
      east: fraction === 1 ? to[0] : from[0] + chord * Math.cos(bearing),
      north: fraction === 1 ? to[1] : from[1] + chord * Math.sin(bearing),
      height,
      metres: start + length * fraction,
      headingFromEast: from[2] + turn * fraction,
      grade,
    };
  }

  function sampleAt(metres: number): TrackSample {
    if (!Number.isFinite(metres)) throw new RangeError('Snow belt chainage must be finite.');
    const distance = clamp(metres, 0, run);
    let first = 0, last = spans.length - 1;
    while (first < last) {
      const middle = (first + last) >>> 1;
      if (spans[middle]!.end < distance) first = middle + 1;
      else last = middle;
    }
    return sampleSpan(first, distance - spans[first]!.start);
  }

  const points = [sampleAt(0)];
  let totalSurfaceMetres = 0;
  const bandMetres = [0, 0, 0];
  let minimumGrade = Infinity, maximumGrade = -Infinity;
  for (const [index, span] of spans.entries()) {
    const steps = Math.ceil(span.length / surveyStepMetres);
    for (let step = 1; step <= steps; step++) {
      const point = sampleSpan(index, span.length * step / steps);
      const previous = points.at(-1)!;
      const length = Math.hypot(point.east - previous.east, point.north - previous.north, point.height - previous.height);
      const band = span.from[3] > 560 ? 0 : span.from[3] > 380 ? 1 : 2;
      bandMetres[band] = bandMetres[band]! + length;
      totalSurfaceMetres += length;
      minimumGrade = Math.min(minimumGrade, point.grade);
      maximumGrade = Math.max(maximumGrade, point.grade);
      points.push(point);
    }
  }

  const cells = new Map<string, Array<{ from: TrackSample; to: TrackSample }>>();
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!, to = points[index]!;
    for (let x = Math.floor((Math.min(from.east, to.east) - halfWidth) / indexCellMetres);
      x <= Math.floor((Math.max(from.east, to.east) + halfWidth) / indexCellMetres); x++) {
      for (let z = Math.floor((Math.min(from.north, to.north) - halfWidth) / indexCellMetres);
        z <= Math.floor((Math.max(from.north, to.north) + halfWidth) / indexCellMetres); z++) {
        const key = `${x}:${z}`;
        const entries = cells.get(key);
        if (entries) entries.push({ from, to });
        else cells.set(key, [{ from, to }]);
      }
    }
  }

  function sampleSurface(east: number, north: number) {
    const candidates = cells.get(`${Math.floor(east / indexCellMetres)}:${Math.floor(north / indexCellMetres)}`);
    if (!candidates) return undefined;
    // The chord sampling departs from a 27 m arc by under 2 mm.
    let radius = (halfWidth + 0.002) ** 2, chainage: number | undefined;
    for (const { from, to } of candidates) {
      const dx = to.east - from.east, dn = to.north - from.north;
      const fraction = clamp(((east - from.east) * dx + (north - from.north) * dn) / (dx * dx + dn * dn), 0, 1);
      const distance = (east - from.east - dx * fraction) ** 2 + (north - from.north - dn * fraction) ** 2;
      if (distance > radius) continue;
      radius = distance;
      chainage = from.metres + (to.metres - from.metres) * fraction;
    }
    return chainage === undefined ? undefined : sampleAt(chainage).height;
  }

  return {
    points, sampleAt, sampleSurface, horizontalMetres: run, totalSurfaceMetres, bandMetres,
    minimumGrade, maximumGrade, widthMetres: halfWidth * 2,
    entrance: points[0]!, exit: points.at(-1)!,
  };
}
