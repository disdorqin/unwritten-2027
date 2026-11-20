import { createSledMotion, sledCrashKind, sledReverseSpeed, type SledControls } from './sled-motion';
import { sledSnowAmount, sledYawDelta } from './sled-animation';
import { WALL_CELL, sledWallImpact, sledWallReportSpeed, wallCellOf } from '../../../src/presence/snowfight';

type WallColumn = { height: number; ground: number };
type WallReport = { speed: number; blocked: boolean; normalEast: number; normalNorth: number };

export function createSledWallCollider(
  columnAt: (gx: number, gy: number) => WallColumn | undefined,
  report: (gx: number, gy: number, speed: number) => boolean,
  now = () => performance.now(),
) {
  let pending: { gx: number; gy: number; height: number; remaining: number; until: number } | undefined;

  function collide(from: Spot, to: Spot, incomingSpeed: number): WallReport | undefined {
    const east = to.x - from.x, north = to.n - from.n;
    let gx = wallCellOf(from.x), gy = wallCellOf(from.n);
    const lastX = wallCellOf(to.x), lastY = wallCellOf(to.n);
    const dx = Math.sign(east), dy = Math.sign(north);
    const stepX = east ? WALL_CELL / Math.abs(east) : Infinity;
    const stepY = north ? WALL_CELL / Math.abs(north) : Infinity;
    let crossX = east ? ((gx + (dx > 0 ? 1 : 0)) * WALL_CELL - from.x) / east : Infinity;
    let crossY = north ? ((gy + (dy > 0 ? 1 : 0)) * WALL_CELL - from.n) / north : Infinity;
    let t = 0;
    let normalEast = dx / Math.hypot(dx, dy), normalNorth = dy / Math.hypot(dx, dy);
    let speed = incomingSpeed;
    if (gx === lastX && gy === lastY && !east && !north) return;
    const time = now();
    if (pending && (time >= pending.until || columnAt(pending.gx, pending.gy)?.height !== pending.height)) {
      pending = undefined;
    }
    for (;;) {
      const column = columnAt(gx, gy);
      if (column) {
        const current = pending?.gx === gx && pending.gy === gy ? pending : undefined;
        const height = current?.remaining ?? column.height;
        const y = from.y + (to.y - from.y) * t;
        if (height > 0 && y < column.ground + height * WALL_CELL) {
          const impact = sledWallImpact(speed);
          const sent = impact.layers > 0 && report(gx, gy, sledWallReportSpeed(speed));
          const remaining = sent ? Math.max(0, height - impact.layers) : height;
          if (sent) pending = { gx, gy, height: column.height, remaining, until: time + 750 };
          const blocked = remaining > 0 && y < column.ground + remaining * WALL_CELL;
          speed *= blocked ? .5 : impact.multiplier;
          if (blocked) return { speed, blocked, normalEast, normalNorth };
        }
      }
      if (gx === lastX && gy === lastY) break;
      const nextX = gx === lastX ? Infinity : crossX;
      const nextY = gy === lastY ? Infinity : crossY;
      t = Math.min(nextX, nextY);
      normalEast = normalNorth = 0;
      if (nextX === t) { gx += dx; crossX += stepX; normalEast = dx; }
      if (nextY === t) { gy += dy; crossY += stepY; normalNorth = dy; }
      if (normalEast && normalNorth) { normalEast *= Math.SQRT1_2; normalNorth *= Math.SQRT1_2; }
    }
    return speed === incomingSpeed ? undefined : { speed, blocked: false, normalEast: 0, normalNorth: 0 };
  }

  return { collide };
}

type SledWorld = {
  height(x: number, n: number): number;
  surface(x: number, n: number, y: number): { surface: number; deepSnow: boolean };
  blocked(x: number, n: number, y: number): boolean;
  canTraverse?(from: Readonly<SledPoint>, to: Readonly<SledPoint>): boolean;
  wallBlocked?(x: number, n: number, y: number): boolean;
  wallImpact?(from: Spot, to: Spot, speed: number): WallReport | undefined;
  snow(x: number, n: number, y: number, yaw: number, count: number, effect?: 'brake' | 'land'): void;
  stopped(): void;
  smoothFlight?(): void;
};
type Spot = { x: number; n: number; y: number; yaw: number };
type SledPoint = Pick<Spot, 'x' | 'n' | 'y'>;

export function createSledRide(world: SledWorld) {
  const motion = createSledMotion();
  const spot: Spot = { x: 0, n: 0, y: 0, yaw: 0 };
  const lastGrounded: Spot = { ...spot };
  let active = false;
  let parked: Readonly<Spot> | undefined;
  let recovery = 0, recoveryDuration = 0, rollTurns = 0;
  let snowTime = 0, curbCooldown = 0, wasStalled = false;
  let landingCompression = 0, flightSeconds = 0;
  let braking = false, turnRate = 0, deepSnow = false;

  function canMountAt({ x, n, y }: SledPoint) {
    return Number.isFinite(x) && Number.isFinite(n) && Number.isFinite(y) &&
      !world.blocked(x, n, y) && !world.wallBlocked?.(x, n, y);
  }

  function mountAt({ x, n, y, yaw }: Spot) {
    Object.assign(spot, { x, n, y, yaw });
    Object.assign(lastGrounded, spot);
    motion.reset(yaw);
    active = true;
    parked = undefined;
    recovery = recoveryDuration = rollTurns = landingCompression = 0;
    snowTime = curbCooldown = turnRate = flightSeconds = 0;
    braking = deepSnow = false;
    wasStalled = false;
    return true;
  }

  function mount(x: number, n: number, y: number, yaw: number) {
    const start = { x, n, y, yaw };
    return !active && !parked && canMountAt(start) && mountAt(start);
  }

  function canRemount(x: number, n: number, y: number) {
    return !!parked && Math.hypot(parked.x - x, parked.n - n) <= 2.4 &&
      Math.abs(parked.y - y) <= .55 && canMountAt(parked);
  }

  function remount(x: number, n: number, y: number) {
    return !!parked && canRemount(x, n, y) && mountAt(parked);
  }

  function canRelocateMounted(x: number, n: number, y: number) {
    return active && Number.isFinite(x) && Number.isFinite(n) && Number.isFinite(y) &&
      y === world.height(x, n) && canMountAt({ x, n, y });
  }

  function relocateMounted(x: number, n: number, y: number, yaw: number) {
    return Number.isFinite(yaw) && canRelocateMounted(x, n, y) && mountAt({ x, n, y, yaw });
  }

  function leave() {
    if (!active) return false;
    if (motion.state.airborne) {
      const support = { ...spot, y: world.height(spot.x, spot.n) };
      Object.assign(spot, canMountAt(support) ? support : lastGrounded);
    }
    parked = { ...spot };
    active = false;
    recovery = recoveryDuration = rollTurns = landingCompression = 0;
    motion.reset(spot.yaw);
    return true;
  }

  function crash(speed: number) {
    const tumble = sledCrashKind(speed) === 'tumble';
    world.snow(spot.x, spot.n, spot.y, spot.yaw, tumble ? 34 : 15);
    spot.y = world.height(spot.x, spot.n);
    recovery = recoveryDuration = tumble ? 1.25 : .65;
    rollTurns = tumble ? 2 : 0;
    snowTime = curbCooldown = turnRate = flightSeconds = 0;
    braking = false;
    motion.reset(spot.yaw);
  }

  function reverseSupport(x: number, n: number, from: number, speed: number) {
    const candidate = { x, n, y: world.height(x, n), yaw: spot.yaw };
    if (!canMountAt(candidate) || Math.abs(candidate.y - from) > .25 ||
        world.canTraverse?.(spot, candidate) === false || world.wallImpact?.(spot, candidate, speed)?.blocked) return;
    return candidate;
  }

  function moveInReverse(x: number, n: number, from: number, speed: number) {
    const direct = reverseSupport(x, n, from, speed);
    if (direct) Object.assign(spot, direct);
    else {
      // Retain the tangential component when the combined step hits the side of an obstacle.
      const eastDistance = Math.abs(x - spot.x), northDistance = Math.abs(n - spot.n);
      const east = eastDistance > 1e-6 ? reverseSupport(x, spot.n, from, speed) : undefined;
      const north = northDistance > 1e-6 ? reverseSupport(spot.x, n, from, speed) : undefined;
      const useEast = !!east && (!north || eastDistance >= northDistance);
      motion.limitHorizontal(useEast, !!north && !useEast);
      const accepted = useEast ? east : north;
      if (accepted) Object.assign(spot, accepted);
    }
    Object.assign(lastGrounded, spot);
  }

  function step(dt: number, controls: SledControls, boost = 0) {
    if (!active || recovery > 0 || dt <= 0) return;
    const state = motion.state;
    const incomingSpeed = state.speed;
    const from = world.height(spot.x, spot.n);
    if (!Number.isFinite(from)) {
      motion.limitHorizontal(false, false);
      return;
    }
    const momentum = state.speed > .15;
    const noseEast = Math.sin(spot.yaw), noseNorth = Math.cos(spot.yaw);
    const backing = state.rollingBack || (state.speed === 0 && controls.forward < -.1 && !controls.brake);
    const de = momentum ? state.east / state.speed : noseEast * (backing ? -1 : 1);
    const dn = momentum ? state.north / state.speed : noseNorth * (backing ? -1 : 1);
    const sampledBackward = momentum ? de * noseEast + dn * noseNorth < 0 : backing;
    const ahead = world.height(spot.x + de * 1.5, spot.n + dn * 1.5);
    const grade = Number.isFinite(ahead) ? (ahead - from) / 1.5 : 0;
    const surface = world.surface(spot.x, spot.n, from);
    const accelerating = !state.airborne && grade < -.43 / 1.5 && state.speed >= 6;
    if (accelerating) {
      const recent = world.height(spot.x - de * .6, spot.n - dn * .6);
      if (Number.isFinite(recent)) motion.takeOff((from - recent) * state.speed / .6);
    }
    deepSnow = surface.deepSnow;
    const next = motion.step(dt, controls, { ...surface, grade, sampledBackward }, boost);
    braking = next.braking;
    turnRate = sledYawDelta(spot.yaw, next.heading) / dt;
    spot.yaw = next.heading;
    if (next.uphillStalled && !wasStalled) world.stopped();
    wasStalled = next.uphillStalled;
    if (next.speed === 0 && !next.airborne) return;
    const x = spot.x + next.east * dt;
    const n = spot.n + next.north * dt;
    if (!next.airborne && next.rollingBack && next.speed <= sledReverseSpeed + 1e-9) {
      moveInReverse(x, n, from, next.speed);
      return;
    }
    const floor = world.height(x, n);
    const nextY = next.airborne ? Math.max(floor, spot.y + next.vertical * dt) : floor;
    if (!Number.isFinite(nextY) || world.canTraverse?.(spot, { x, n, y: nextY }) === false) {
      motion.limitHorizontal(false, false);
      return;
    }
    const curb = world.height(spot.x + de * .8, spot.n + dn * .8);
    const curbRise = Number.isFinite(curb) ? curb - from : 0;
    curbCooldown = Math.max(0, curbCooldown - dt);
    if (!next.airborne && (curbRise > .9 || (curbRise > .25 && next.speed < 8) || Math.abs(grade) > .55)) {
      crash(next.speed);
      return;
    }
    if (!next.airborne && curbRise > .25 && next.speed >= 8) motion.takeOff(3.5);
    if (!next.airborne && curbCooldown === 0 && curbRise > .1 && floor - from > .03) {
      motion.reset(next.heading, next.speed * .97);
      curbCooldown = .22;
    }
    flightSeconds = next.airborne ? flightSeconds + dt : 0;
    const destinationY = next.airborne ? Math.max(floor, spot.y + next.vertical * dt) : floor;
    if (world.blocked(x, n, destinationY)) {
      crash(next.speed);
      return;
    }
    const impact = world.wallImpact?.(spot, { x, n, y: destinationY, yaw: spot.yaw }, incomingSpeed);
    if (impact) {
      motion.wallImpact(impact.speed, impact.normalEast, impact.normalNorth);
      spot.yaw = next.heading;
      if (impact.blocked) return;
    }
    spot.x = x;
    spot.n = n;
    spot.y = destinationY;
    if (next.airborne && next.vertical <= 0 && destinationY === floor) {
      const impact = Math.abs(next.vertical);
      const landing = motion.land(grade);
      if (landing === 'smooth' && flightSeconds >= 1.2) world.smoothFlight?.();
      flightSeconds = 0;
      world.snow(x, n, floor, spot.yaw, landing === 'smooth' ? 8 : landing === 'hard' ? 16 : 24, 'land');
      if (landing === 'spill') { crash(0); return; }
      if (landing === 'hard') landingCompression = Math.min(.17, impact * .012);
    }
    if (!next.airborne && !world.wallBlocked?.(x, n, destinationY)) Object.assign(lastGrounded, spot);
    const sideSpray = next.drifting || braking;
    const mist = next.airborne ? 0 : sledSnowAmount(next.speed, sideSpray, Math.abs(curbRise));
    snowTime = mist ? snowTime + dt : 0;
    if (mist && snowTime >= .05) {
      const side = next.drifting ? (Math.sign(next.slipAngle) || -Math.sign(turnRate)) : turnRate > .05 ? 1 : -1;
      world.snow(x + (sideSpray ? Math.cos(spot.yaw) * side * .42 : 0),
        n - (sideSpray ? Math.sin(spot.yaw) * side * .42 : 0),
        floor, spot.yaw, mist, sideSpray ? 'brake' : undefined);
      snowTime = 0;
    }
  }

  function finishFrame(dt: number, _playerX?: number, _playerN?: number) {
    recovery = Math.max(0, recovery - dt);
    landingCompression *= Math.exp(-12 * dt);
  }

  return {
    spot, mount, leave, canRemount, remount, canRelocateMounted, relocateMounted, step, finishFrame,
    interrupt() {
      if (active) leave();
      recovery = recoveryDuration = rollTurns = landingCompression = 0;
    },
    braking: () => active && braking,
    drifting: () => active && motion.state.drifting,
    turnRate: () => active ? turnRate : 0,
    lateral: () => motion.state.lateral,
    deepSnow: () => deepSnow,
    active: () => active,
    parked: () => parked,
    recovering: () => recovery > 0,
    speed: () => motion.state.speed,
    airborne: () => motion.state.airborne,
    faceDown: () => recovery > 0 && recoveryDuration >= .65 && !rollTurns ? Math.sin(Math.PI * recovery / recoveryDuration) : 0,
    roll() { return recovery > 0 && rollTurns ? 2 * Math.PI * rollTurns * (1 - recovery / recoveryDuration) : 0; },
    compression() { return recovery > 0 && !rollTurns ? .4 * Math.min(1, recovery * 4) : landingCompression; },
    jump(speed: number) { if (active && recovery === 0 && !motion.state.airborne) motion.takeOff(speed); },
  };
}
