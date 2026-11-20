import { snowWingSpec } from './snow-wing.js';

export type AircraftPoint = Readonly<{ east: number; north: number; height: number }>;
export type AircraftLoadout = Readonly<{
  snowWingClaimed: boolean;
  boosterOwned: boolean;
  aircraftAssembled: boolean;
}>;
export type AircraftThrottle = 'off' | 'cruise' | 'full';

export const aircraftFlightSpec = Object.freeze({
  assemblyReach: 1.25,
  runwayMetres: 40,
  minimumRunwayWidth: 4,
  takeoffSpeed: snowWingSpec.takeoffSpeed,
  runwayAcceleration: snowWingSpec.takeoffSpeed ** 2 / 80,
  glideRatio: snowWingSpec.glideRatio,
  levelSpeedLimit: 38,
  diveSpeedLimit: 40,
  thrustFadeHeight: 900,
  ceiling: 1_000,
  recoverySeconds: 3,
} as const);
/** Crafting unlocks the current chapter's airspace. The S-1 gate authority stays locked. */
export const aircraftChapterGateOpen = false;

type AssemblyResult =
  | { ok: true; loadout: AircraftLoadout; changed: boolean }
  | { ok: false; reason: 'wrong-station' | 'out-of-reach' | 'missing-equipment' };

function finitePoint(point: AircraftPoint) {
  return [point.east, point.north, point.height].every(Number.isFinite);
}

/** The host supplies the owned items, accepted player feet and registered socket in one transaction. */
export function assembleAircraftAtStarport(
  loadout: AircraftLoadout,
  station: string,
  feet: AircraftPoint,
  socket: AircraftPoint,
): AssemblyResult {
  if (station !== 'starport-assembly-pad') return { ok: false, reason: 'wrong-station' };
  const distance = Math.hypot(feet.east - socket.east, feet.north - socket.north, feet.height - socket.height);
  if (!finitePoint(feet) || !finitePoint(socket) || distance > aircraftFlightSpec.assemblyReach) {
    return { ok: false, reason: 'out-of-reach' };
  }
  if (loadout.aircraftAssembled) return { ok: true, loadout, changed: false };
  if (!loadout.snowWingClaimed || !loadout.boosterOwned) return { ok: false, reason: 'missing-equipment' };
  return { ok: true, loadout: { ...loadout, aircraftAssembled: true }, changed: true };
}

export function aircraftAirspaceAt(height: number) {
  if (height >= aircraftFlightSpec.ceiling) return 'ceiling';
  if (height > snowWingSpec.cloudHigh) return 'above-clouds';
  if (height >= snowWingSpec.cloudLow) return 'cloud-belt';
  return 'below-clouds';
}

export type AircraftSurface = Readonly<{
  height: number;
  kind: 'snow' | 'ice' | 'roof' | 'deep-snow' | 'water';
  slopeDegrees: number;
  obstacleAhead: number;
}>;
export type AircraftImpact = 'wall' | 'tree' | 'snowbank' | 'interior';
type RecoveryReason = AircraftImpact | 'unsafe-surface' | 'water' | 'runway-blocked';

export type AircraftWorld = Readonly<{
  // During approach and rollout, the previous height distinguishes stacked surfaces.
  surfaceAt(east: number, north: number, heading: number, previousHeight?: number): AircraftSurface | undefined;
  sweep(from: AircraftPoint, to: AircraftPoint, clearance: number): AircraftImpact | undefined;
  contains(point: AircraftPoint): boolean;
  recoveryAt(from: AircraftPoint, reason: RecoveryReason): AircraftPoint | undefined;
}>;

export type AircraftRunway = Readonly<{ id: string; start: AircraftPoint; end: AircraftPoint; width: number }>;

const fixedTime = 1 / 60;
const epsilon = 1e-8;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const approach = (value: number, target: number, amount: number) => value + clamp(target - value, -amount, amount);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const forward = ({ east, north, height }: AircraftPoint, heading: number, metres: number) => ({
  east: east + Math.sin(heading) * metres, north: north + Math.cos(heading) * metres, height,
});

function canLand(surface: AircraftSurface | undefined): surface is AircraftSurface {
  return !!surface && Number.isFinite(surface.height) && surface.kind !== 'water' &&
    surface.slopeDegrees >= 0 && surface.slopeDegrees < 25 &&
    surface.obstacleAhead >= 0 && surface.obstacleAhead <= 1;
}

/** Register a straight strip only after sampling its width and sweeping the real collision host. */
export function surveyAircraftRunway(runway: AircraftRunway, world: AircraftWorld) {
  const length = Math.hypot(runway.end.east - runway.start.east, runway.end.north - runway.start.north);
  const heading = Math.atan2(runway.end.east - runway.start.east, runway.end.north - runway.start.north);
  if (!finitePoint(runway.start) || !finitePoint(runway.end) || !Number.isFinite(runway.width) ||
      length < aircraftFlightSpec.runwayMetres || runway.width < aircraftFlightSpec.minimumRunwayWidth) {
    return { ok: false, length, heading, checkedMetres: 0 };
  }
  let previous = runway.start;
  for (let metres = 0; ; metres = Math.min(length, metres + .5)) {
    const centre = forward(runway.start, heading, metres);
    const offsets = [-runway.width / 2, 0, runway.width / 2];
    const heights = offsets.map(offset => {
      const point = forward(centre, heading + Math.PI / 2, offset);
      const surface = world.surfaceAt(point.east, point.north, heading);
      return world.contains(point) && canLand(surface) && surface.kind !== 'roof' ? surface.height : NaN;
    });
    const ground = { ...centre, height: heights[1]! };
    if (heights.some(height => !Number.isFinite(height) || Math.abs(height - ground.height) > .43) ||
        Math.abs(previous.height - ground.height) > .43 || world.sweep(previous, ground, runway.width / 2)) {
      return { ok: false, length, heading, checkedMetres: metres };
    }
    if (metres === length) break;
    previous = ground;
  }
  return { ok: true, length, heading, checkedMetres: length };
}

type ThrustReading = Readonly<{
  throttle: AircraftThrottle;
  fuelSeconds: number;
  liftMetres: number;
  thrust: number;
}>;
export type AircraftThrust = {
  step(seconds: number, requested: AircraftThrottle, height: number): ThrustReading;
  snapshot(): Pick<ThrustReading, 'throttle' | 'fuelSeconds' | 'thrust'>;
};

export type AircraftInput = Readonly<{ throttle?: AircraftThrottle; turn?: number; pitch?: number }>;
type Phase = 'rolling' | 'airborne' | 'sliding' | 'recovering' | 'landed';
type Flight = {
  point: AircraftPoint; heading: number; speed: number; bank: number; phase: Phase;
  elapsed: number; metres: number; rollMetres: number; slideLeft: number; recoverLeft: number; glideShare: number;
  recovery: RecoveryReason | null; touchdown: AircraftSurface['kind'] | null; waterSkims: number; ceilingReached: boolean;
};

export function createAircraftFlight(world: AircraftWorld, power: AircraftThrust) {
  let flight: Flight | undefined;
  let home: AircraftPoint | undefined;
  const available = () => !flight || flight.phase === 'landed';

  function begin(point: AircraftPoint, heading: number, speed: number, phase: 'rolling' | 'airborne') {
    home = { ...point };
    flight = { point: { ...point }, heading: wrap(heading), speed, bank: 0, phase, elapsed: 0, metres: 0,
      rollMetres: 0, slideLeft: 0, recoverLeft: 0, glideShare: phase === 'rolling' ? 0 : 1,
      recovery: null, touchdown: null, waterSkims: 0, ceilingReached: false };
  }

  function launchRunway(assembled: boolean, feet: AircraftPoint, runway: AircraftRunway) {
    if (!assembled || !available() || !finitePoint(feet) || power.snapshot().fuelSeconds <= 0 ||
        Math.hypot(feet.east - runway.start.east, feet.north - runway.start.north, feet.height - runway.start.height) > 1) return false;
    const survey = surveyAircraftRunway(runway, world);
    if (!survey.ok) return false;
    begin(runway.start, survey.heading, 0, 'rolling');
    return true;
  }

  function launchEdge(assembled: boolean, feet: AircraftPoint, heading: number) {
    if (!assembled || !available() || !finitePoint(feet) || !Number.isFinite(heading) || !world.contains(feet)) return false;
    const origin = world.surfaceAt(feet.east, feet.north, heading);
    if (!canLand(origin) || Math.abs(origin.height - feet.height) > .43 || feet.height >= aircraftFlightSpec.ceiling) return false;
    const away = forward(feet, heading, 40);
    const surface = world.surfaceAt(away.east, away.north, heading);
    if (!surface || feet.height - surface.height < snowWingSpec.minimumDrop || world.sweep(feet, away, 1.9)) return false;
    begin({ ...feet, height: Math.min(aircraftFlightSpec.ceiling, feet.height + .3) },
      heading, aircraftFlightSpec.takeoffSpeed, 'airborne');
    home = { ...feet };
    return true;
  }

  function recover(state: Flight, reason: RecoveryReason) {
    const candidate = world.recoveryAt(state.point, reason);
    if (candidate && finitePoint(candidate) && world.contains(candidate) &&
        canLand(world.surfaceAt(candidate.east, candidate.north, state.heading))) state.point = { ...candidate };
    else state.point = { ...home! };
    state.phase = 'recovering';
    state.recoverLeft = aircraftFlightSpec.recoverySeconds;
    state.recovery = reason;
    state.speed = state.bank = 0;
  }

  function advanceRolling(state: Flight, dt: number, input: AircraftInput) {
    const throttled = power.step(dt, input.throttle ?? 'off', state.point.height);
    const active = throttled.throttle !== 'off';
    const speed = approach(state.speed, active ? aircraftFlightSpec.takeoffSpeed : 0,
      dt * (active ? aircraftFlightSpec.runwayAcceleration : 5));
    const distance = Math.min((state.speed + speed) / 2 * dt, aircraftFlightSpec.runwayMetres - state.rollMetres);
    const next = forward(state.point, state.heading, distance);
    const floor = world.surfaceAt(next.east, next.north, state.heading);
    if (!canLand(floor) || !world.contains(next) || Math.abs(floor.height - state.point.height) > .43 ||
        world.sweep(state.point, { ...next, height: floor.height }, 1.9)) return recover(state, 'runway-blocked');
    state.point = { ...next, height: floor.height };
    state.speed = speed;
    state.rollMetres += distance;
    state.metres += distance;
    if (state.rollMetres >= aircraftFlightSpec.runwayMetres - epsilon && speed >= aircraftFlightSpec.takeoffSpeed - epsilon) {
      state.point = { ...state.point, height: state.point.height + .35 };
      state.phase = 'airborne';
    } else if (!active && speed === 0) recover(state, 'runway-blocked');
  }

  function advanceAirborne(state: Flight, dt: number, input: AircraftInput) {
    const pitch = clamp(input.pitch ?? 0, -1, 1);
    const throttle = power.step(dt, input.throttle ?? 'off', state.point.height);
    const maximumSpeed = pitch < -.05 ? aircraftFlightSpec.diveSpeedLimit : aircraftFlightSpec.levelSpeedLimit;
    const turn = clamp(input.turn ?? 0, -1, 1);
    state.bank = approach(state.bank, turn * snowWingSpec.maximumBank, 2.1 * dt);
    state.heading = wrap(state.heading + state.bank * Math.min(1.6, 18 / Math.max(8, state.speed)) * dt);
    const idleSpeed = snowWingSpec.cruiseSpeed - 7 * pitch;
    const target = clamp(idleSpeed + clamp(throttle.thrust, 0, 1) * (pitch < -.05 ? 18 : 23), 8, maximumSpeed);
    const speed = Math.min(maximumSpeed, approach(state.speed, target, dt * 3));
    const distance = (state.speed + speed) / 2 * dt;
    const next = forward(state.point, state.heading, distance);
    const sink = speed < snowWingSpec.stallSpeed ? snowWingSpec.stallSink : speed / aircraftFlightSpec.glideRatio;
    const energyHeight = (speed ** 2 - state.speed ** 2) / 19.62;
    const gliding = throttle.throttle === 'off';
    state.glideShare = approach(state.glideShare, gliding ? 1 : 0, dt / (gliding ? 1.5 : .5));
    const height = state.point.height + throttle.liftMetres - (sink * dt + energyHeight) * state.glideShare;
    next.height = Math.min(aircraftFlightSpec.ceiling, height);
    state.ceilingReached ||= height >= aircraftFlightSpec.ceiling;
    state.speed = speed;
    if (!world.contains(next)) {
      state.heading = wrap(state.heading + Math.PI);
      state.speed = Math.min(state.speed, snowWingSpec.cruiseSpeed);
      return;
    }
    const obstacle = world.sweep(state.point, next, 1.9);
    if (obstacle) return recover(state, obstacle);
    const floor = world.surfaceAt(next.east, next.north, state.heading, state.point.height);
    state.point = next;
    state.metres += distance;
    if (!floor || !Number.isFinite(floor.height) || next.height > floor.height) return;
    if (floor.kind === 'water') {
      if (state.waterSkims >= 2) return recover(state, 'water');
      state.waterSkims++;
      state.point = { ...next, height: floor.height + 1.15 };
      state.speed = Math.max(snowWingSpec.cruiseSpeed, state.speed);
      return;
    }
    if (!canLand(floor)) return recover(state, 'unsafe-surface');
    state.point = { ...next, height: floor.height };
    state.touchdown = floor.kind;
    state.phase = 'sliding';
    state.speed = Math.min(state.speed, aircraftFlightSpec.takeoffSpeed);
    state.slideLeft = floor.kind === 'ice' ? 8 : floor.kind === 'roof' ? 2 : floor.kind === 'deep-snow' ? .3 : 4;
  }

  function snapshot() {
    if (!flight) return;
    return { ...flight, point: { ...flight.point }, ...power.snapshot(), airspace: aircraftAirspaceAt(flight.point.height),
      usesBothHands: flight.phase === 'airborne' || flight.phase === 'rolling', damage: 0 as const };
  }

  function skipRecovery() {
    if (flight?.phase !== 'recovering') return false;
    flight.recoverLeft = 0;
    flight.phase = 'landed';
    return true;
  }

  function advance(seconds: number, input: AircraftInput = {}) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1 ||
        [input.turn, input.pitch].some(value => value !== undefined && !Number.isFinite(value))) {
      throw new RangeError('Invalid aircraft flight step');
    }
    if (!flight) return;
    const state = flight;
    for (let left = seconds; left > epsilon && state.phase !== 'landed'; ) {
      const dt = Math.min(left, fixedTime);
      left -= dt;
      state.elapsed += dt;
      if (state.phase === 'rolling') advanceRolling(state, dt, input);
      else if (state.phase === 'airborne') advanceAirborne(state, dt, input);
      else if (state.phase === 'recovering') {
        state.recoverLeft -= dt;
        if (state.recoverLeft <= epsilon) skipRecovery();
      } else {
        const distance = Math.min(state.slideLeft, state.speed * dt);
        const next = forward(state.point, state.heading, distance);
        const floor = world.surfaceAt(next.east, next.north, state.heading, state.point.height);
        if (!canLand(floor) || !world.contains(next) || world.sweep(state.point, next, .35)) {
          recover(state, 'unsafe-surface');
          continue;
        }
        state.point = { ...next, height: floor.height };
        state.slideLeft -= distance;
        state.metres += distance;
        if (state.slideLeft <= epsilon) {
          state.phase = 'landed';
          state.speed = state.bank = 0;
        } else state.speed = Math.max(.6, state.speed - 5 * dt);
      }
    }
    return snapshot();
  }

  return { launchRunway, launchEdge, advance, skipRecovery, snapshot };
}
