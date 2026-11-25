export const snowWingSpec = {
  minimumDrop: 15, takeoffSpeed: 8, cruiseSpeed: 15, diveSpeed: 22, glideRatio: 6,
  flutterSpeed: 10.5, stallSpeed: 10, stallSink: 6, recoverSeconds: 1,
  liftSeconds: .3, liftDrop: .5, flapSeconds: 1, maximumBank: 35 * Math.PI / 180,
  cloudLow: 380, cloudHigh: 560, cloudVisibility: 400, cloudReferenceSeconds: 20,
} as const;

type Point = { east: number; north: number; height: number };
type SnowWingPhase = 'lift-off' | 'flap-assist' | 'glide' | 'settling' | 'landed';

export type SnowWingLaunch = Readonly<Point & {
  claimed: boolean; heading: number; speed: number; drop: number; pathClear: boolean;
}>;
export type SnowWingInput = Readonly<{
  pitch?: number; turn?: number; aimHeading?: number; cloudReferenceVisible?: boolean;
}>;

type Flight = Point & {
  phase: SnowWingPhase;
  heading: number;
  speed: number;
  bank: number;
  elapsed: number;
  horizontalMetres: number;
  touchdown: 'soft' | 'seated' | null;
  unreferencedCloudSeconds: number;
};

// Same summit-only claim guard as candidate-F1. The world host resolves lodge
// interaction reach and supplies the approved P-4 profile.
export function claimSnowWing(claimed: boolean, station: string, profile: Readonly<{ snowWingEligible: boolean }>) {
  return claimed || (station === 'summit-lodge' && profile.snowWingEligible);
}

export function snowWingLaunchAllowed(input: SnowWingLaunch) {
  return input.claimed && input.pathClear && input.drop >= snowWingSpec.minimumDrop && input.speed >= 0 &&
    [input.drop, input.speed, input.heading, input.east, input.north, input.height].every(Number.isFinite);
}

export function snowWingStallCue(speed: number): 'clear' | 'flutter' | 'dim' | 'settling' {
  if (speed < snowWingSpec.stallSpeed) return 'settling';
  if (speed === snowWingSpec.stallSpeed) return 'dim';
  return speed <= snowWingSpec.flutterSpeed ? 'flutter' : 'clear';
}

const sampleStep = 1 / 60;
const epsilon = 1e-9;
const gravity = 9.81;
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(value, upper));
const approach = (value: number, target: number, amount: number) => value + clamp(target - value, -amount, amount);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createSnowWingFlight(groundAt: (east: number, north: number) => number | undefined) {
  let flight: Flight | undefined;
  let launchSpeed = 0;
  let phaseSeconds = 0;
  let diveHeld = 0;
  let takeoffProtected = false;

  function launch(input: SnowWingLaunch) {
    if ((flight && flight.phase !== 'landed') || !snowWingLaunchAllowed(input)) return false;
    launchSpeed = Math.min(input.speed, snowWingSpec.diveSpeed);
    phaseSeconds = diveHeld = 0;
    takeoffProtected = launchSpeed < snowWingSpec.stallSpeed;
    flight = {
      east: input.east, north: input.north, height: input.height, heading: wrap(input.heading),
      speed: launchSpeed, bank: 0, elapsed: 0, horizontalMetres: 0,
      phase: 'lift-off', touchdown: null, unreferencedCloudSeconds: 0,
    };
    return true;
  }

  function integrate(state: Flight, dt: number, input: SnowWingInput) {
    const previousSpeed = state.speed;
    const previousHeight = state.height;
    const startingPhase = state.phase;
    const pitch = clamp(input.pitch ?? 0, -1, 1);
    let descent: number;
    phaseSeconds += dt;

    if (startingPhase === 'lift-off') {
      descent = snowWingSpec.liftDrop * dt / snowWingSpec.liftSeconds;
      if (phaseSeconds >= snowWingSpec.liftSeconds - epsilon) {
        state.phase = launchSpeed < snowWingSpec.takeoffSpeed ? 'flap-assist' : 'glide';
        phaseSeconds = 0;
      }
    } else if (startingPhase === 'flap-assist') {
      const t = Math.min(1, phaseSeconds / snowWingSpec.flapSeconds);
      state.speed = launchSpeed + (snowWingSpec.takeoffSpeed - launchSpeed) * t * t * (3 - 2 * t);
      descent = (previousSpeed + state.speed) * dt / (2 * snowWingSpec.glideRatio);
      if (phaseSeconds >= snowWingSpec.flapSeconds - epsilon) {
        state.phase = 'glide';
        phaseSeconds = 0;
      }
    } else {
      const aim = input.aimHeading === undefined ? 0 : wrap(input.aimHeading - state.heading) * 2;
      const turn = clamp(aim + (input.turn ?? 0), -1, 1);
      state.bank = approach(state.bank, turn * snowWingSpec.maximumBank, 2.1 * dt);
      state.heading = wrap(state.heading + state.bank * 1.35 * dt);
      if (startingPhase === 'settling') {
        diveHeld = pitch <= -.95 ? diveHeld + dt : 0;
        state.speed = approach(state.speed, pitch <= -.95 ? snowWingSpec.diveSpeed : snowWingSpec.takeoffSpeed, 7 * dt);
        descent = snowWingSpec.stallSink * dt;
        if (diveHeld >= snowWingSpec.recoverSeconds - epsilon && state.speed >= snowWingSpec.flutterSpeed) {
          state.phase = 'glide';
        }
      } else {
        const target = pitch >= 0
          ? snowWingSpec.cruiseSpeed - (snowWingSpec.cruiseSpeed - snowWingSpec.takeoffSpeed) * pitch
          : snowWingSpec.cruiseSpeed - (snowWingSpec.diveSpeed - snowWingSpec.cruiseSpeed) * pitch;
        state.speed = approach(state.speed, target, 3 * dt);
        // Expose the second warning at 10 m/s even when a discrete tick spans
        // the exact threshold. A continued flare enters the soft stall next tick.
        if (previousSpeed > snowWingSpec.stallSpeed && state.speed < snowWingSpec.stallSpeed) {
          state.speed = snowWingSpec.stallSpeed;
        }
        const stillAirLoss = (previousSpeed + state.speed) * dt / (2 * snowWingSpec.glideRatio);
        const energyHeight = (state.speed ** 2 - previousSpeed ** 2) / (2 * gravity);
        descent = stillAirLoss + energyHeight + state.bank ** 2 * .9 * dt;
        if (state.speed >= snowWingSpec.stallSpeed) takeoffProtected = false;
        if ((!takeoffProtected || pitch > 0) && state.speed < snowWingSpec.stallSpeed) {
          state.phase = 'settling';
          diveHeld = 0;
          descent = snowWingSpec.stallSink * dt;
        }
      }
    }

    const travel = (previousSpeed + state.speed) * dt / 2;
    state.east += travel * Math.sin(state.heading);
    state.north += travel * Math.cos(state.heading);
    state.height -= descent;
    state.elapsed += dt;
    state.horizontalMetres += travel;
    const inCloud = state.height >= snowWingSpec.cloudLow && state.height <= snowWingSpec.cloudHigh;
    state.unreferencedCloudSeconds =
      inCloud && input.cloudReferenceVisible !== true ? state.unreferencedCloudSeconds + dt : 0;
    const floor = groundAt(state.east, state.north);
    if (floor !== undefined && state.height <= floor) {
      state.height = floor;
      // The low-speed edge assist can still skim the receding ground until
      // the wing beat builds lift. An uphill obstacle may cancel the launch.
      if (launchSpeed < snowWingSpec.takeoffSpeed &&
          (startingPhase === 'lift-off' || startingPhase === 'flap-assist') && floor <= previousHeight + epsilon) return;
      state.touchdown = state.phase === 'settling' ? 'seated' : 'soft';
      state.phase = 'landed';
      state.speed = state.bank = 0;
    }
  }

  function snapshot() {
    if (!flight) return;
    const active = flight.phase !== 'landed';
    const inCloud = active && flight.height >= snowWingSpec.cloudLow && flight.height <= snowWingSpec.cloudHigh;
    return {
      ...flight,
      usesBothHands: active,
      stallCue: flight.phase === 'settling' ? 'settling' :
        flight.phase === 'glide' && !takeoffProtected ? snowWingStallCue(flight.speed) : 'clear',
      visibilityMetres: inCloud ? snowWingSpec.cloudVisibility : null,
      needsCloudReference: inCloud && flight.unreferencedCloudSeconds >= snowWingSpec.cloudReferenceSeconds,
    };
  }

  function advance(seconds: number, input: SnowWingInput = {}) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1 ||
        [input.pitch, input.turn, input.aimHeading].some(value => value !== undefined && !Number.isFinite(value))) {
      throw new RangeError('Invalid snow-wing flight step.');
    }
    if (!flight) return;
    for (let left = seconds; left > epsilon && flight.phase !== 'landed'; ) {
      const phaseLimit = flight.phase === 'lift-off' ? snowWingSpec.liftSeconds :
        flight.phase === 'flap-assist' ? snowWingSpec.flapSeconds : Infinity;
      const dt = Math.min(left, sampleStep, phaseLimit - phaseSeconds);
      integrate(flight, dt, input);
      left -= dt;
    }
    return snapshot();
  }

  return { launch, advance, snapshot };
}
