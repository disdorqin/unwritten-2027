import { createSledMotion, sledCrashKind } from './sled-motion';
import { sledSnowAmount, sledYawDelta } from './sled-animation';

type SledWorld = {
  height(x: number, n: number): number;
  surface(x: number, n: number, y: number): { surface: number; deepSnow: boolean };
  blocked(x: number, n: number, y: number): boolean;
  snow(x: number, n: number, y: number, yaw: number, count: number, effect?: 'brake' | 'land'): void;
  stopped(): void;
};
type Spot = { x: number; n: number; y: number; yaw: number };
type SledControls = { forward: number; turn: number; brake?: boolean };

export function createSledRide(world: SledWorld) {
  const motion = createSledMotion();
  const spot: Spot = { x: 0, n: 0, y: 0, yaw: 0 };
  const lastGrounded: Spot = { ...spot };
  let active = false;
  let parked: Readonly<Spot> | undefined;
  let recovery = 0, recoveryDuration = 0, rollTurns = 0;
  let snowTime = 0, curbCooldown = 0, wasStalled = false;
  let landingCompression = 0;
  let braking = false, turnRate = 0, deepSnow = false;

  function canMountAt({ x, n, y }: Pick<Spot, 'x' | 'n' | 'y'>) {
    return !world.blocked(x, n, y);
  }

  function mountAt({ x, n, y, yaw }: Spot) {
    Object.assign(spot, { x, n, y, yaw });
    Object.assign(lastGrounded, spot);
    motion.reset(yaw);
    active = true;
    parked = undefined;
    recovery = recoveryDuration = rollTurns = landingCompression = 0;
    snowTime = curbCooldown = turnRate = 0;
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
    snowTime = curbCooldown = turnRate = 0;
    braking = false;
    motion.reset(spot.yaw);
  }

  function step(dt: number, controls: SledControls) {
    if (!active || recovery > 0 || dt <= 0) return;
    const state = motion.state;
    const from = world.height(spot.x, spot.n);
    const momentum = state.speed > .15;
    const de = momentum ? state.east / state.speed : Math.sin(spot.yaw);
    const dn = momentum ? state.north / state.speed : Math.cos(spot.yaw);
    const ahead = world.height(spot.x + de * 1.5, spot.n + dn * 1.5);
    const grade = (ahead - from) / 1.5;
    const surface = world.surface(spot.x, spot.n, from);
    const accelerating = !state.airborne && grade < -.43 / 1.5 && state.speed >= 6;
    if (accelerating) {
      const recent = world.height(spot.x - de * .6, spot.n - dn * .6);
      motion.takeOff((from - recent) * state.speed / .6);
    }
    const drive = controls.brake ? { ...controls, forward: -1 } : controls;
    braking = drive.forward < -.1;
    deepSnow = surface.deepSnow;
    const next = motion.step(dt, drive, { ...surface, grade });
    turnRate = sledYawDelta(spot.yaw, next.heading) / dt;
    spot.yaw = next.heading;
    if (next.uphillStalled && !wasStalled) world.stopped();
    wasStalled = next.uphillStalled;
    if (next.speed === 0 && !next.airborne) return;
    const x = spot.x + next.east * dt;
    const n = spot.n + next.north * dt;
    const floor = world.height(x, n);
    const curbRise = world.height(spot.x + de * .8, spot.n + dn * .8) - from;
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
    const nextY = next.airborne ? Math.max(floor, spot.y + next.vertical * dt) : floor;
    if (world.blocked(x, n, nextY)) {
      crash(next.speed);
      return;
    }
    spot.x = x;
    spot.n = n;
    spot.y = nextY;
    if (next.airborne && next.vertical <= 0 && nextY === floor) {
      const impact = Math.abs(next.vertical);
      const landing = motion.land(grade);
      world.snow(x, n, floor, spot.yaw, landing === 'smooth' ? 8 : landing === 'hard' ? 16 : 24, 'land');
      if (landing === 'spill') { crash(0); return; }
      if (landing === 'hard') landingCompression = Math.min(.17, impact * .012);
    }
    if (!next.airborne) Object.assign(lastGrounded, spot);
    const mist = next.airborne ? 0 : sledSnowAmount(next.speed, braking, Math.abs(curbRise));
    snowTime = mist ? snowTime + dt : 0;
    if (mist && snowTime >= .05) {
      const side = turnRate > .05 ? 1 : -1;
      world.snow(x + (braking ? Math.cos(spot.yaw) * side * .42 : 0),
        n - (braking ? Math.sin(spot.yaw) * side * .42 : 0),
        floor, spot.yaw, mist, braking ? 'brake' : undefined);
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
    turnRate: () => active ? turnRate : 0,
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
