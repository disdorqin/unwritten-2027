export const fuelSecondsPerStardustOre = 600;

export const flightThrustSpec = {
  rampSeconds: .5, ceilingWeakeningHeight: 900, ceilingHeight: 1000,
  fullClimb: 4, fullSpeed: 38, diveSpeed: 40,
} as const;

export type FlightThrottle = 'off' | 'cruise' | 'full';
const burnRate: Readonly<Record<FlightThrottle, number>> = { off: 0, cruise: .5, full: 1 };

/** Powered portion of a step. The caller continues its snow-wing glide when the tank empties. */
export function createFlightThrust(fuelSeconds = 0) {
  if (!Number.isFinite(fuelSeconds) || fuelSeconds < 0) throw new RangeError('Invalid flight fuel');
  let throttle: FlightThrottle = 'off';
  let thrust = 0;

  function snapshot() { return { throttle, fuelSeconds, thrust }; }

  function step(seconds: number, requested: FlightThrottle, height: number, diving = false) {
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(height) || !Object.hasOwn(burnRate, requested)) {
      throw new RangeError('Invalid powered flight step');
    }
    const consumption = burnRate[requested];
    const poweredSeconds = consumption === 0 ? 0 : Math.min(seconds, fuelSeconds / consumption);
    const startingFuel = fuelSeconds;
    const powered = consumption > 0 && startingFuel > 0;
    const desired = powered ? consumption : 0;
    const difference = desired - thrust;
    const rampSeconds = Math.min(poweredSeconds, Math.abs(difference) * flightThrustSpec.rampSeconds);
    const endThrust = thrust + Math.sign(difference) * rampSeconds / flightThrustSpec.rampSeconds;
    const thrustSeconds = (thrust + endThrust) * rampSeconds / 2 + endThrust * (poweredSeconds - rampSeconds);
    const altitudeScale = Math.max(0, Math.min(1,
      (flightThrustSpec.ceilingHeight - height) / (flightThrustSpec.ceilingHeight - flightThrustSpec.ceilingWeakeningHeight),
    ));
    const liftMetres = Math.min(Math.max(0, flightThrustSpec.ceilingHeight - height),
      thrustSeconds * altitudeScale * flightThrustSpec.fullClimb);

    fuelSeconds = Math.max(0, startingFuel - poweredSeconds * consumption);
    if (fuelSeconds < 1e-9) fuelSeconds = 0;
    const depleted = powered && fuelSeconds === 0;
    throttle = powered && !depleted ? requested : 'off';
    thrust = throttle === 'off' ? 0 : endThrust;
    const speedLimit = powered ? (diving ? flightThrustSpec.diveSpeed : flightThrustSpec.fullSpeed) : 22;
    return { ...snapshot(), poweredSeconds, liftMetres, speedLimit, depleted };
  }

  return { step, snapshot };
}
