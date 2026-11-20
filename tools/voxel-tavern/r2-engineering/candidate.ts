import { createMainSummitSnowBelt, type SnowBeltKnot } from '../town-blockout/main-summit-snow-belt';
import { northRidgeMidStation, sampleNorthRidge350 } from '../town-blockout/north-ridge-350-terrain';
import { sledRadius } from '../town-blockout/sled-motion';
import { createSledRide } from '../town-blockout/sled-ride';

type Point = { east: number; north: number };
type Bearing = Point & { headingFromEast: number };
type Position = { metres: number; offset: number };
type Spot = { x: number; n: number; y: number };
type GateImpact = { lateral: number; elevation: number; speed: number };

// These are the intersections of the straight tangents, not interpolation knots.
const tangents = [
  [northRidgeMidStation.east, northRidgeMidStation.north],
  [421.8, 507.1], [335.5, 452], [214, 464.2], [185, 526.9],
  [72, 514], [197, 450], [317, 374.2], [437, 400.7], [505, 339.1],
  [420, 340.8], [352.6, 305.5], [320, 300], [320, 270],
] as const;
const turnRadius = 27;
const surveyCell = 8;
const surveyReach = 8;
const endRunout = 5;
const gateMetres = 10;
const gateHeight = 1.2;
const steepSection = { start: 30, end: 46, grade: .264 } as const;
const fullTurn = Math.PI * 2;
const wrap = (angle: number) => angle - Math.round(angle / fullTurn) * fullTurn;

function buildTrack() {
  const headings = tangents.slice(1).map(([east, north], index) =>
    Math.atan2(north - tangents[index]![1], east - tangents[index]![0]));
  const bearings: Bearing[] = [{ east: tangents[0][0], north: tangents[0][1], headingFromEast: headings[0]! }];
  for (let index = 1; index < tangents.length - 1; index++) {
    const [east, north] = tangents[index]!;
    const arrive = headings[index - 1]!, depart = headings[index]!;
    const setback = turnRadius * Math.abs(Math.tan(wrap(depart - arrive) / 2));
    bearings.push(
      { east: east - setback * Math.cos(arrive), north: north - setback * Math.sin(arrive), headingFromEast: arrive },
      { east: east + setback * Math.cos(depart), north: north + setback * Math.sin(depart), headingFromEast: depart },
    );
  }
  const [east, north] = tangents.at(-1)!;
  bearings.push({ east, north, headingFromEast: headings.at(-1)! });

  const stations = [0];
  for (let index = 1; index < bearings.length; index++) {
    const from = bearings[index - 1]!, to = bearings[index]!;
    const turn = wrap(to.headingFromEast - from.headingFromEast);
    const chord = Math.hypot(to.east - from.east, to.north - from.north);
    stations.push(stations[index - 1]! + (turn === 0 ? chord : turnRadius * Math.abs(turn)));
  }
  const startHeight = northRidgeMidStation.height;
  const finishHeight = sampleNorthRidge350(east, north);
  const steepLength = steepSection.end - steepSection.start;
  const grade = (startHeight - finishHeight - steepLength * steepSection.grade) / (stations.at(-1)! - steepLength);

  function knotAt(bearing: Bearing, metres: number): SnowBeltKnot {
    const onSteep = Math.max(0, Math.min(steepLength, metres - steepSection.start));
    const height = startHeight - grade * (metres - onSteep) - steepSection.grade * onSteep;
    return [bearing.east, bearing.north, bearing.headingFromEast, height];
  }

  const straight = stations.findIndex(metres => metres > steepSection.end) - 1;
  const rampBearing = bearings[straight]!;
  const heading = rampBearing.headingFromEast;
  if (stations[straight]! >= steepSection.start || heading !== bearings[straight + 1]!.headingFromEast) {
    throw new Error('The steep section requires a straight tangent.');
  }
  const knots = bearings.flatMap((bearing, index) => {
    const knot = knotAt(bearing, stations[index]!);
    if (index !== straight) return [knot];
    return [knot, ...[steepSection.start, steepSection.end].map(metres => {
      const offset = metres - stations[straight]!;
      return knotAt({ east: bearing.east + offset * Math.cos(heading),
        north: bearing.north + offset * Math.sin(heading), headingFromEast: heading }, metres);
    })];
  });
  return createMainSummitSnowBelt(knots, grade);
}

export function createR2EngineeringCandidate() {
  const track = buildTrack();
  const gate = track.sampleAt(gateMetres);
  const end = track.exit;
  const railOffset = track.widthMetres / 2 - sledRadius;
  const cells = new Map<string, number[]>();
  const key = (east: number, north: number) => `${east}:${north}`;
  const cell = (coordinate: number) => Math.floor(coordinate / surveyCell);

  for (let index = 1; index < track.points.length; index++) {
    const from = track.points[index - 1]!, to = track.points[index]!;
    for (let east = cell(Math.min(from.east, to.east) - surveyReach);
      east <= cell(Math.max(from.east, to.east) + surveyReach); east++) {
      for (let north = cell(Math.min(from.north, to.north) - surveyReach);
        north <= cell(Math.max(from.north, to.north) + surveyReach); north++) {
        const id = key(east, north);
        const indices = cells.get(id);
        if (indices) indices.push(index);
        else cells.set(id, [index]);
      }
    }
  }

  function endProjection(east: number, north: number, anchor: Bearing & { metres: number }): Position {
    const dx = east - anchor.east, dn = north - anchor.north;
    const de = Math.cos(anchor.headingFromEast), du = Math.sin(anchor.headingFromEast);
    return { metres: anchor.metres + dx * de + dn * du, offset: -dx * du + dn * de };
  }

  function locate(east: number, north: number): Position | undefined {
    const candidates = cells.get(key(cell(east), cell(north)));
    if (!candidates) return;
    let closest: Position | undefined, best = surveyReach ** 2;
    for (const index of candidates) {
      const from = track.points[index - 1]!, to = track.points[index]!;
      const dx = to.east - from.east, dn = to.north - from.north;
      const x = east - from.east, n = north - from.north;
      const raw = (x * dx + n * dn) / (dx * dx + dn * dn);
      const fraction = Math.max(0, Math.min(1, raw));
      const distance = (x - dx * fraction) ** 2 + (n - dn * fraction) ** 2;
      if (distance > best) continue;
      best = distance;
      const metres = from.metres + fraction * (to.metres - from.metres);
      const center = track.sampleAt(metres);
      closest = {
        metres,
        offset: (north - center.north) * Math.cos(center.headingFromEast) -
          (east - center.east) * Math.sin(center.headingFromEast),
      };
    }
    if (closest?.metres === 0) return endProjection(east, north, track.entrance);
    if (closest?.metres === track.horizontalMetres) return endProjection(east, north, end);
    return closest;
  }

  function height(east: number, north: number) {
    const position = locate(east, north);
    if (!position) return sampleNorthRidge350(east, north);
    const metres = position.metres;
    // Five metres of isolation-only runout keep the normal 1.5 m forward
    // physics probe grounded while crossing the surveyed finish plane.
    return metres > end.metres ? end.height - end.grade * Math.min(endRunout, metres - end.metres)
      : track.sampleAt(metres).height;
  }

  function blocked(east: number, north: number) {
    const position = locate(east, north);
    return !position || position.metres < -1e-6 || position.metres > end.metres + endRunout ||
      Math.abs(position.offset) > railOffset;
  }

  const gateEast = Math.cos(gate.headingFromEast), gateNorth = Math.sin(gate.headingFromEast);
  function gateDistance(east: number, north: number) {
    return (east - gate.east) * gateEast + (north - gate.north) * gateNorth;
  }

  function gateContact(from: Spot, to: Spot) {
    // The hinge opens downhill. The uphill face catches the swept front of
    // the sled before its center reaches the gate plane.
    const before = gateDistance(from.x, from.n) - sledRadius;
    const after = gateDistance(to.x, to.n) - sledRadius;
    if (before < 0 || after >= 0) return;
    const fraction = before / (before - after);
    const lateral = (from.n + (to.n - from.n) * fraction - gate.north) * gateEast -
      (from.x + (to.x - from.x) * fraction - gate.east) * gateNorth;
    const elevation = from.y + (to.y - from.y) * fraction;
    if (Math.abs(lateral) > railOffset || elevation < gate.height - .2 || elevation > gate.height + gateHeight) return;
    return { lateral, elevation };
  }

  function createRide({ hingedGate = true, onGateImpact }: {
    hingedGate?: boolean; onGateImpact?(contact: GateImpact): void;
  } = {}) {
    return createSledRide({
      height, blocked, surface: () => ({ surface: 0, deepSnow: false }),
      wallImpact(from, to, speed) {
        const contact = hingedGate && gateContact(from, to);
        if (!contact) return;
        onGateImpact?.({ ...contact, speed });
        return { speed: 0, blocked: true, normalEast: 0, normalNorth: 0 };
      },
      snow() {}, stopped() {},
    });
  }

  function pointsAt(metres: number, offset: number) {
    const sample = track.sampleAt(metres);
    return {
      east: sample.east - Math.sin(sample.headingFromEast) * offset,
      north: sample.north + Math.cos(sample.headingFromEast) * offset,
      height: sample.height,
      yaw: Math.PI / 2 - sample.headingFromEast,
    };
  }

  return { track, gate, steepSection, endRunout, height, blocked, locate, gateContact, createRide, pointsAt };
}
