import { sampleNorthRidge350 } from '../town-blockout/north-ridge-350-terrain';
import { createR2EngineeringCandidate } from './candidate';

const dt = 1 / 60;
const maximumRollSeconds = 150;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function surveyR2EngineeringCandidate(candidate = createR2EngineeringCandidate()) {
  const { track } = candidate;
  let minimumNetWidth = Infinity, maximumNetWidth = -Infinity;
  let deepestCut = { metres: 0, east: 0, north: 0, height: 0, terrain: 0, difference: 0 };
  let highestFill = { ...deepestCut };
  let minimumAreaSeparation = Infinity;
  let greatestSampleRise = -Infinity;
  let previous = track.entrance;

  function measureLimit(contains: (offset: number) => boolean) {
    let inner = 0, outer = track.widthMetres;
    for (let step = 0; step < 14; step++) {
      const offset = (inner + outer) / 2;
      if (contains(offset)) inner = offset;
      else outer = offset;
    }
    return inner;
  }

  function clearLimit(metres: number, side: number) {
    return measureLimit(offset => {
      const { east, north } = candidate.pointsAt(metres, side * offset);
      return !candidate.blocked(east, north);
    });
  }

  function gateLimit(side: number) {
    return measureLimit(offset => {
      const approach = candidate.pointsAt(candidate.gate.metres + 1, side * offset);
      const beyond = candidate.pointsAt(candidate.gate.metres - 1, side * offset);
      return !!candidate.gateContact(
        { x: approach.east, n: approach.north, y: approach.height },
        { x: beyond.east, n: beyond.north, y: beyond.height },
      );
    });
  }

  // Survey both real collider edges at every snowbed sample, including the
  // endpoints. Sample earthwork at the center and both snowbed edges.
  for (const [index, point] of track.points.entries()) {
    if (index > 0) greatestSampleRise = Math.max(greatestSampleRise, point.height - previous.height);
    previous = point;
    const netWidth = clearLimit(point.metres, 1) + clearLimit(point.metres, -1);
    minimumNetWidth = Math.min(minimumNetWidth, netWidth);
    maximumNetWidth = Math.max(maximumNetWidth, netWidth);
    for (const offset of [-track.widthMetres / 2, 0, track.widthMetres / 2]) {
      const { east, north, height } = candidate.pointsAt(point.metres, offset);
      const terrain = sampleNorthRidge350(east, north);
      const difference = height - terrain;
      const result = { metres: point.metres, offset, east, north, height, terrain, difference };
      if (difference < deepestCut.difference) deepestCut = result;
      if (difference > highestFill.difference) highestFill = result;
    }
    for (let earlier = 0; earlier < index && track.points[earlier]!.metres <= point.metres - 25; earlier++) {
      const other = track.points[earlier]!;
      minimumAreaSeparation = Math.min(minimumAreaSeparation, Math.hypot(point.east - other.east, point.north - other.north));
    }
  }

  const finishTieIn = Array.from({ length: 6 }, (_, index) => {
    const point = track.sampleAt(track.horizontalMetres - 5 + index);
    return { metres: point.metres, east: point.east, north: point.north, height: point.height,
      referenceHeight: sampleNorthRidge350(point.east, point.north) };
  });
  return {
    horizontalMetres: track.horizontalMetres,
    surfaceMetres: track.totalSurfaceMetres,
    entrance: track.entrance,
    finish: track.exit,
    finishTieIn,
    grade: { minimum: track.minimumGrade, maximum: track.maximumGrade },
    width: { deck: track.widthMetres, minimumNetWidth, maximumNetWidth },
    gate: {
      ...candidate.gate,
      captureOffsets: [-gateLimit(-1), gateLimit(1)],
    },
    greatestSampleRise,
    minimumAreaSeparation,
    deepestCut,
    highestFill,
  };
}

export function rollR2EngineeringCandidate(candidate = createR2EngineeringCandidate()) {
  let blockingGateContacts = 0;
  const ride = candidate.createRide({ onGateImpact: () => { blockingGateContacts++; } });
  const start = candidate.pointsAt(0, 0);
  if (!ride.mount(start.east, start.north, start.height, start.yaw)) throw new Error('Cannot mount at the survey start.');
  let greatestRise = 0, airborneFrames = 0, maxSpeed = 0, maxOffset = 0, frames = 0, travelledMetres = 0;
  const trace: Array<{ frame: number; east: number; north: number; height: number; metres: number; speed: number;
    airborne: boolean; input?: { forward: number; turn: number } }> = [];
  let gateCrossingFrame: number | undefined;
  while (ride.active() && frames < maximumRollSeconds / dt) {
    const position = candidate.locate(ride.spot.x, ride.spot.n);
    if (!position) throw new Error('Ride left the surveyed corridor.');
    const speed = ride.speed();
    const sample = { frame: frames, east: ride.spot.x, north: ride.spot.n, height: ride.spot.y,
      metres: position.metres, speed, airborne: ride.airborne() };
    const previous = trace.at(-1);
    if (previous) travelledMetres += Math.hypot(sample.east - previous.east, sample.north - previous.north);
    trace.push(sample);
    if (position.metres >= candidate.gate.metres) gateCrossingFrame ??= frames;
    if (position.metres >= candidate.track.horizontalMetres) break;
    const target = candidate.track.sampleAt(position.metres + Math.max(4, speed * .34));
    const targetYaw = Math.atan2(target.east - ride.spot.x, target.north - ride.spot.n);
    const error = wrap(targetYaw - ride.spot.yaw);
    const forward = speed > 17 ? -1 : 1;
    const turn = Math.abs(error) < .012 ? 0 : Math.sign(error);
    const before = ride.spot.y;
    const input = { forward, turn };
    trace.at(-1)!.input = input;
    ride.step(dt, input);
    frames++;
    greatestRise = Math.max(greatestRise, ride.spot.y - before);
    if (ride.airborne()) airborneFrames++;
    maxSpeed = Math.max(maxSpeed, speed);
    maxOffset = Math.max(maxOffset, Math.abs(position.offset));
  }

  const finish = { east: ride.spot.x, north: ride.spot.n, height: ride.spot.y };
  return { finish, finishPosition: candidate.locate(finish.east, finish.north), frames, travelledMetres, airborneFrames, maxSpeed,
    maxOffset, greatestRise, active: ride.active(), blockingGateContacts, gateCrossingFrame, trace };
}

export function reverseR2EngineeringGate(candidate = createR2EngineeringCandidate(), lateral = 0, hingedGate = true) {
  let contacts = 0;
  let firstContact: { lateral: number; elevation: number; speed: number } | undefined;
  const ride = candidate.createRide({ hingedGate, onGateImpact: contact => {
    contacts++;
    firstContact ??= contact;
  } });
  const start = candidate.pointsAt(candidate.gate.metres + 3, lateral);
  if (!ride.mount(start.east, start.north, start.height, start.yaw + Math.PI)) {
    throw new Error('Cannot mount inside the reverse gate approach.');
  }
  const control = { forward: 1, turn: 0 };
  let airborneFrames = 0, smallestChainage = candidate.gate.metres + 3;
  for (let frames = 0; frames < 5 / dt; frames++) {
    ride.step(dt, control);
    smallestChainage = Math.min(smallestChainage, candidate.locate(ride.spot.x, ride.spot.n)!.metres);
    if (ride.airborne()) airborneFrames++;
  }
  return { hingedGate, contacts, firstContact, airborneFrames, smallestChainage, startChainage: candidate.gate.metres + 3, active: ride.active(),
    finish: { east: ride.spot.x, north: ride.spot.n, height: ride.spot.y },
    finishPosition: candidate.locate(ride.spot.x, ride.spot.n) };
}

export function reverseR2EngineeringTerrain(candidate = createR2EngineeringCandidate()) {
  const ride = candidate.createRide({ hingedGate: false });
  const startChainage = candidate.steepSection.end + 4;
  const start = candidate.pointsAt(startChainage, 0);
  if (!ride.mount(start.east, start.north, start.height, start.yaw + Math.PI)) {
    throw new Error('Cannot mount below the reverse terrain approach.');
  }
  let smallestChainage = startChainage, airborneFrames = 0;
  const trace: Array<{ frame: number; metres: number; speed: number; height: number; airborne: boolean }> = [];
  for (let frame = 0; frame < 10 / dt; frame++) {
    ride.step(dt, { forward: 1, turn: 0 });
    const metres = candidate.locate(ride.spot.x, ride.spot.n)!.metres;
    const airborne = ride.airborne();
    smallestChainage = Math.min(smallestChainage, metres);
    if (airborne) airborneFrames++;
    trace.push({ frame, metres, speed: ride.speed(), height: ride.spot.y, airborne });
  }
  return { hingedGate: false, startChainage, smallestChainage, airborneFrames, active: ride.active(),
    finishChainage: trace.at(-1)!.metres, trace };
}
