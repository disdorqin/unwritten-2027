export const sledMaximumSpeed = 30;
export const sledSoftSpeed = 28;
export const sledRadius = .35;
export const sledIceFriction = .12;
export const sledGlideRatio = 4.5;

const restSpeed = .025;
const gradeVelocityThreshold = .15;
const sledGravity = 16;
const baseDrag = .0045;
const highDragStartSpeed = 24;
const levelPushSpeed = 9.5;
const uphillPushSpeed = 4;
const levelSlope = .06;
const pushableSlope = .25;
const driftMinSpeed = 8;
const driftAngleLimit = 35 * Math.PI / 180;
const driftReleaseTime = .5;

type SledControls = { forward: number; turn: number; drift?: boolean };
type SledSurface = { grade: number; surface: number; deepSnow: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function friction({ surface, deepSnow }: SledSurface) {
  if (surface === 4) return sledIceFriction;
  if (surface === 1 || surface === 2) return .6;
  if (surface === 3) return .7;
  return deepSnow ? .45 : .25;
}

function dragAt(speed: number) {
  const highSpeed = clamp((speed - highDragStartSpeed) / (sledMaximumSpeed - highDragStartSpeed), 0, 1);
  return baseDrag * speed * speed * (1 + 2 * highSpeed ** 3);
}

function unwrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function createSledMotion() {
  let east = 0, north = 0, heading = 0, vertical = 0;
  let airborne = false;
  let rollingBack = false;
  let drifting = false;
  let driftTime = 0, uphillTime = 0;
  const state = { east, north, heading, vertical, airborne, speed: 0, lateral: 0,
    rollingBack: false, drifting: false, slipAngle: 0, uphillStalled: false };

  function travelHeading() {
    return rollingBack ? heading + Math.PI : heading;
  }

  function updateState() {
    state.east = east;
    state.north = north;
    state.heading = heading;
    state.vertical = vertical;
    state.airborne = airborne;
    state.speed = Math.hypot(east, north);
    state.lateral = east * Math.cos(heading) - north * Math.sin(heading);
    state.rollingBack = rollingBack;
    state.drifting = drifting;
    state.slipAngle = state.speed > restSpeed ? unwrapAngle(Math.atan2(east, north) - travelHeading()) : 0;
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
      east = Math.sin(travelHeading()) * target;
      north = Math.cos(travelHeading()) * target;
    }
  }

  function reset(yaw: number, speed = 0) {
    heading = yaw;
    east = north = vertical = 0;
    airborne = rollingBack = drifting = false;
    driftTime = uphillTime = 0;
    setSpeed(speed);
    return updateState();
  }

  function takeOff(speedY: number) {
    if (airborne) return;
    airborne = true;
    vertical = speedY;
    drifting = false;
    driftTime = uphillTime = 0;
    updateState();
  }

  function step(dt: number, controls: SledControls, ground: SledSurface, boost = 0) {
    if (!(dt > 0) || !Number.isFinite(dt)) return state;
    const speed = Math.hypot(east, north);
    const braking = controls.forward < -.1;
    const turn = clamp(controls.turn, -1, 1);
    const forwardMomentum = east * Math.sin(heading) + north * Math.cos(heading);
    // The ride samples ahead along momentum above the threshold, otherwise along the nose.
    const sampledBackward = speed > gradeVelocityThreshold && forwardMomentum < 0;
    const facingGrade = sampledBackward ? -ground.grade : ground.grade;
    drifting = !airborne && !rollingBack && (braking || controls.drift === true) && Math.abs(turn) > .1 && speed >= driftMinSpeed;
    heading += turn * (airborne ? .9 : drifting ? 2.4 : 1.5) * dt;
    let targetSpeed: number;
    let directionChanged = false;
    if (airborne) {
      const gliding = speed >= 5.5;
      const diving = gliding && controls.forward > .1;
      if (gliding) {
        const ratio = braking ? 5.4 : diving ? 3.3 : sledGlideRatio;
        const desired = -speed / ratio;
        vertical += (desired - vertical) * -Math.expm1(-dt / .5);
      } else vertical -= 22 * dt;
      // Diving trades altitude for speed, but the high-speed drag ramp still applies.
      const pitchDrive = diving && speed < sledSoftSpeed ? 1 + baseDrag * speed * speed : braking ? -1.1 : 0;
      targetSpeed = Math.max(0, speed + (pitchDrive - dragAt(speed)) * dt);
      if (diving && speed < sledSoftSpeed) targetSpeed = Math.min(targetSpeed, sledSoftSpeed);
    } else {
      const slopeAcceleration = -sledGravity * facingGrade / Math.hypot(1, facingGrade);
      const normalFriction = friction(ground);
      const resistance = (braking && !drifting ? 3.5 : normalFriction) + dragAt(speed);
      const uphill = facingGrade > levelSlope && facingGrade <= pushableSlope;
      const level = Math.abs(facingGrade) <= levelSlope;
      const pushLimit = uphill ? uphillPushSpeed : levelPushSpeed;
      const pushing = controls.forward > .1 && (uphill || level) && (rollingBack || speed <= pushLimit + 1e-9);
      let push = 0;
      if (pushing && uphill) {
        // Offset the uphill load while pushing. A raw 1.8 m/s² cannot overcome a 25% grade.
        const slopeFraction = (facingGrade - levelSlope) / (pushableSlope - levelSlope);
        const reserve = 1.8 - 1.6 * slopeFraction;
        push = -slopeAcceleration + normalFriction + reserve;
      } else if (pushing) push = 2.2;
      const facingDrive = slopeAcceleration + push * clamp(controls.forward, 0, 1);
      const acceleration = (rollingBack ? -facingDrive : facingDrive) - resistance;
      targetSpeed = Math.max(0, speed + acceleration * dt);
      if (pushing && !rollingBack) targetSpeed = Math.min(targetSpeed, pushLimit);

      if (targetSpeed === 0 && rollingBack) {
        rollingBack = false;
        directionChanged = true;
      } else if (!rollingBack && targetSpeed <= restSpeed && -facingDrive > resistance) {
        rollingBack = true;
        directionChanged = true;
        targetSpeed = (-facingDrive - resistance) * dt;
      }

      if (drifting) driftTime += dt;
      else {
        if (driftTime >= driftReleaseTime && !braking && !rollingBack && targetSpeed < sledSoftSpeed) {
          const reward = .1 * Math.min(1, driftTime / 1.2);
          targetSpeed = Math.min(targetSpeed * (1 + reward), sledSoftSpeed);
        }
        driftTime = 0;
      }
      uphillTime = facingGrade > .08 && targetSpeed < .8 && !rollingBack ? uphillTime + dt : 0;
      // D2's separate charged boost keeps its original stages and shares the new soft cap.
      if (boost > 0 && !rollingBack && targetSpeed < sledSoftSpeed) {
        targetSpeed = Math.min(sledSoftSpeed, targetSpeed + boost * dt);
      }
    }

    const directionHeading = travelHeading();
    const tau = airborne ? .55 : drifting ? .8 : ground.surface === 4 ? .45 : ground.surface === 0 ? .18 : .16;
    const blend = -Math.expm1(-dt / tau);
    const desiredEast = Math.sin(directionHeading);
    const desiredNorth = Math.cos(directionHeading);
    const hasMomentum = speed > restSpeed && !directionChanged;
    const currentEast = hasMomentum ? east / speed : desiredEast;
    const currentNorth = hasMomentum ? north / speed : desiredNorth;
    const towardEast = currentEast + (desiredEast - currentEast) * blend;
    const towardNorth = currentNorth + (desiredNorth - currentNorth) * blend;
    let momentumHeading = Math.atan2(towardEast, towardNorth);
    if (drifting) momentumHeading = heading + clamp(unwrapAngle(momentumHeading - heading), -driftAngleLimit, driftAngleLimit);
    const moving = targetSpeed >= restSpeed || targetSpeed > speed || (rollingBack && targetSpeed > 0);
    const magnitude = moving ? Math.min(targetSpeed, sledMaximumSpeed) : 0;
    east = Math.sin(momentumHeading) * magnitude;
    north = Math.cos(momentumHeading) * magnitude;
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
