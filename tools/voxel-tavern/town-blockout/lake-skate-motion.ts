import { iceTreasureTurnRadiusMultiplier } from '../../../src/shared/ice-treasure';

const maxSpeed = 10;
const steeringRate = 4.4;
const coastRate = 2.9;
const restSpeed = .035;

export function createLakeSkateMotion() {
  let east = 0;
  let north = 0;

  function reset() {
    east = 0;
    north = 0;
  }

  // Inputs and outputs are velocities in east/north world meters per second.
  // The caller owns integration, collision checks and resets at surface changes.
  function step(eastVelocity: number, northVelocity: number, dt: number, carryingTreasure = false) {
    if (!Number.isFinite(dt) || dt <= 0) return { east, north };

    let targetEast = Number.isFinite(eastVelocity) ? eastVelocity : 0;
    let targetNorth = Number.isFinite(northVelocity) ? northVelocity : 0;
    const requestedSpeed = Math.hypot(targetEast, targetNorth);
    if (requestedSpeed > maxSpeed) {
      const scale = maxSpeed / requestedSpeed;
      targetEast *= scale;
      targetNorth *= scale;
    }

    const steering = requestedSpeed > 0;
    const blend = -Math.expm1(-(steering ? steeringRate : coastRate) * dt);
    const nextEast = east + (targetEast - east) * blend;
    const nextNorth = north + (targetNorth - north) * blend;
    if (carryingTreasure && steering && east * east + north * north >= restSpeed * restSpeed) {
      // Change the angular response at the same speed so the curve radius grows by 1.5×.
      const heading = Math.atan2(north, east);
      const turn = Math.atan2(east * nextNorth - north * nextEast, east * nextEast + north * nextNorth);
      const nextHeading = heading + turn / iceTreasureTurnRadiusMultiplier;
      const speed = Math.hypot(nextEast, nextNorth);
      east = Math.cos(nextHeading) * speed;
      north = Math.sin(nextHeading) * speed;
    } else {
      east = nextEast;
      north = nextNorth;
    }

    if (!steering && east * east + north * north < restSpeed * restSpeed) reset();
    return { east, north };
  }

  return { step, reset };
}
