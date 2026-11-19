export const sledMaximumSpeed = 17;
export const sledRadius = .35;
const restSpeed = .025;
const sledGravity = 12;
const drag = .0127;
const pushSpeed = 7.5;

type SledControls = { forward: number; turn: number };
type SledSurface = { grade: number; surface: number; deepSnow: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function friction({ grade, surface, deepSnow }: SledSurface) {
  if (surface === 4) return .35;
  if (surface === 1 || surface === 2) return .8;
  if (surface === 3) return .9;
  return deepSnow && Math.abs(grade) <= .04 ? 1.1 : .95;
}

export function createSledMotion() {
  let east = 0, north = 0, heading = 0, vertical = 0;
  let airborne = false;
  let driftTime = 0, uphillTime = 0;
  const state = { east, north, heading, vertical, airborne, speed: 0, lateral: 0, uphillStalled: false };

  function updateState() {
    state.east = east;
    state.north = north;
    state.heading = heading;
    state.vertical = vertical;
    state.airborne = airborne;
    state.speed = Math.hypot(east, north);
    state.lateral = east * Math.cos(heading) - north * Math.sin(heading);
    state.uphillStalled = uphillTime >= 1;
    return state;
  }

  function setSpeed(speed: number) {
    const current = Math.hypot(east, north);
    const target = clamp(speed, 0, sledMaximumSpeed);
    if (current > restSpeed) {
      east *= target / current;
      north *= target / current;
    } else {
      east = Math.sin(heading) * target;
      north = Math.cos(heading) * target;
    }
  }

  function reset(yaw: number, speed = 0) {
    heading = yaw;
    east = north = vertical = 0;
    airborne = false;
    driftTime = uphillTime = 0;
    setSpeed(speed);
    return updateState();
  }

  function takeOff(speedY: number) {
    if (airborne) return;
    airborne = true;
    vertical = speedY;
    driftTime = 0;
    updateState();
  }

  function step(dt: number, controls: SledControls, ground: SledSurface, boost = 0) {
    const speed = Math.hypot(east, north);
    const braking = controls.forward < -.1;
    const drifting = !airborne && braking && Math.abs(controls.turn) > .1 && speed >= 5;
    heading += clamp(controls.turn, -1, 1) * (airborne ? .9 : drifting ? 2.4 : 1.5) * dt;
    let targetSpeed = speed;
    if (airborne) {
      const gliding = speed >= 5.5;
      if (gliding) {
        const ratio = braking ? 3.6 : controls.forward > .1 ? 2.2 : 3;
        const desired = -speed / ratio;
        vertical += (desired - vertical) * -Math.expm1(-dt / .5);
      } else vertical -= 22 * dt;
      const pitchAcceleration = braking ? -1.1 : controls.forward > .1 ? 1 : 0;
      targetSpeed = Math.max(0, speed + (pitchAcceleration - drag * speed * speed) * dt);
    } else {
      const slopeAcceleration = -sledGravity * ground.grade / Math.hypot(1, ground.grade);
      const normalFriction = friction(ground);
      const resistance = (braking && !drifting ? 3.5 : normalFriction) + drag * speed * speed;
      const pushing = controls.forward > .1 && Math.abs(ground.grade) <= .04 && speed < pushSpeed;
      targetSpeed = Math.max(0, speed + (slopeAcceleration + (pushing ? 1.6 * controls.forward : 0) - resistance) * dt);
      if (pushing) targetSpeed = Math.min(targetSpeed, pushSpeed);
      if (drifting) driftTime += dt;
      else {
        if (driftTime >= .6 && !braking) {
          const terminal = slopeAcceleration > normalFriction ? Math.sqrt((slopeAcceleration - normalFriction) / drag) : sledMaximumSpeed;
          targetSpeed = Math.max(targetSpeed, Math.min(targetSpeed * 1.1, terminal));
        }
        driftTime = 0;
      }
      uphillTime = ground.grade > .08 && targetSpeed < .8 ? uphillTime + dt : 0;
      if (uphillTime >= 1) targetSpeed = 0;
      // D2 drift boost: extra acceleration from sled-drift, grounded only.
      // The shared factor clamp below still enforces the 17 m/s hard cap.
      if (boost > 0) targetSpeed = Math.min(sledMaximumSpeed, targetSpeed + boost * dt);
    }

    const tau = airborne || drifting ? .55 : ground.surface === 4 ? .45 : ground.surface === 0 ? .18 : .16;
    const blend = -Math.expm1(-dt / tau);
    const currentEast = speed > restSpeed ? east / speed : Math.sin(heading);
    const currentNorth = speed > restSpeed ? north / speed : Math.cos(heading);
    const towardEast = currentEast + (Math.sin(heading) - currentEast) * blend;
    const towardNorth = currentNorth + (Math.cos(heading) - currentNorth) * blend;
    const direction = Math.hypot(towardEast, towardNorth);
    const moving = targetSpeed >= restSpeed || targetSpeed > speed;
    const factor = direction && moving ? Math.min(targetSpeed, sledMaximumSpeed) / direction : 0;
    east = towardEast * factor;
    north = towardNorth * factor;
    return updateState();
  }

  function land(grade: number) {
    const impact = Math.abs(vertical);
    const kind = impact > 14 ? 'spill' : impact > 9 || grade >= 0 ? 'hard' : 'smooth';
    airborne = false;
    vertical = 0;
    setSpeed(state.speed * (kind === 'spill' ? 0 : kind === 'hard' ? .45 : .92));
    updateState();
    return kind;
  }

  return { reset, takeOff, step, land, state };
}

export function sledCrashKind(speed: number) {
  return speed > 6 ? 'tumble' : 'fall';
}
