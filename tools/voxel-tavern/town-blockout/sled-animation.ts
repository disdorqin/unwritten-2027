const rad = Math.PI / 180;
const mountSeconds = .4;
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const toward = (from: number, to: number, dt: number, tau: number) => from + (to - from) * -Math.expm1(-dt / tau);
export const sledYawDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

type HeightAt = (east: number, north: number) => number;
type SledCue = { mounted: boolean; east: number; north: number; height: number; yaw: number;
  speed: number; turn: number; braking: boolean; airborne: boolean };

export function sledSnowAmount(speed: number, braking: boolean, roughness = 0) {
  if (braking && speed > .5) return 14;
  if (speed < 3) return 0;
  if (speed <= 8) return roughness > .045 ? 3 : 2;
  return 9;
}

export function createSledAnimation(heightAt: HeightAt) {
  let mount = 0, bend = 0, pitch = 0, slopeRoll = 0, brake = 0, flight = 0, bob = 0;
  let elapsed = 0, idle = 0, dip = 0, fov = 0;
  let brakingBefore = false, airborneBefore = false;
  let side = 1;
  function reset() {
    mount = bend = pitch = slopeRoll = brake = flight = bob = elapsed = idle = dip = fov = 0;
    brakingBefore = airborneBefore = false;
    side = 1;
  }
  function step(dt: number, cue: SledCue) {
    const { mounted, east, north, height, yaw, speed, turn, braking, airborne } = cue;
    dt = clamp(dt, 0, .25);
    elapsed += dt;
    mount = clamp(mount + (mounted ? dt : -dt) / mountSeconds, 0, 1);
    const weight = ease(mount);
    const dx = Math.sin(yaw) * .5, dn = Math.cos(yaw) * .5;
    const front = heightAt(east + dx, north + dn), rear = heightAt(east - dx, north - dn);
    const left = heightAt(east - dn, north + dx), right = heightAt(east + dn, north - dx);
    const center = heightAt(east, north);
    const uneven = Math.max(Math.abs(front + rear - 2 * center), Math.abs(left + right - 2 * center));
    const vibration = mounted && !airborne && speed > 4 ? clamp((uneven - .035) / .11, 0, 1) * clamp(speed / 10, 0, 1) : 0;
    const bending = mounted ? clamp(turn * 11, -18, 18) * rad : 0;
    bend = toward(bend, bending, dt, .2);
    pitch = toward(pitch, mounted ? airborne ? -8 * rad : -clamp(Math.atan(front - rear), -.32, .32) : 0, dt, .15);
    slopeRoll = toward(slopeRoll, mounted && !airborne ? clamp(Math.atan(left - right), -.23, .23) : 0, dt, .15);
    const brakingNow = mounted && braking && !airborne;
    if (brakingNow && !brakingBefore) {
      side = turn > .05 ? -1 : 1;
      dip = .06;
    }
    if (mounted && !airborne && airborneBefore) dip = .06;
    brakingBefore = brakingNow;
    airborneBefore = mounted && airborne;
    brake = toward(brake, brakingNow ? 1 : 0, dt, brakingNow ? .075 : .13);
    flight = toward(flight, mounted && airborne ? 1 : 0, dt, .08);
    bob = toward(bob, Math.sin(elapsed * 48) * .05 * vibration, dt, .035);
    idle = mounted && speed < .25 && !airborne && !braking ? idle + dt : 0;
    const idleBeat = Math.max(0, idle - 5);
    fov = toward(fov, mounted ? 6 * clamp(speed / 12, 0, 1) : 0, dt, .18);
    const cameraDip = dip > 0 ? .055 * Math.sin(Math.PI * (1 - dip / .06)) : 0;
    dip = Math.max(0, dip - dt);
    const shellPitch = pitch + vibration * .014 * Math.sin(elapsed * 54);
    const shellRoll = slopeRoll + bend + vibration * .013 * Math.cos(elapsed * 49);
    let shellLift = 0;
    if (mounted && !airborne) {
      for (const along of [-.70, .70]) for (const side of [-.29, .29]) {
        const runnerGround = heightAt(east + 2 * (dx * along - dn * side), north + 2 * (dn * along + dx * side));
        const runnerHeight = height - along * Math.sin(shellPitch) + side * Math.sin(shellRoll);
        shellLift = Math.max(shellLift, runnerGround - runnerHeight);
      }
    }
    return {
      weight, crossing: Math.sin(Math.PI * mount) * (mounted ? 1 : -1), bend,
      shellPitch, shellRoll, shellLift: Math.min(.18, shellLift),
      seatBob: bob - .04 * Math.sin(Math.PI * mount) ** 2 - cameraDip * .45,
      torso: weight * (clamp(speed / 10, 0, 1) * 8 * (1 - brake) - 6 * brake - 4 * flight) * rad,
      brake, side, flight,
      idleLook: idleBeat ? .27 * Math.sin(idleBeat * 1.15) : 0,
      idlePat: idleBeat ? .32 * Math.max(0, Math.sin(idleBeat * 2.3)) ** 8 : 0,
      fov, cameraDip, jitter: vibration * .3 * rad * Math.sin(elapsed * 46),
      uneven,
    };
  }
  return { step, reset };
}

export type SledAnimationFrame = ReturnType<ReturnType<typeof createSledAnimation>['step']>;
type MotionSample = { east: number; north: number; height: number; yaw: number; time: number };

export function createRemoteSledCues(heightAt: HeightAt) {
  let previous: MotionSample | undefined;
  let speed = 0, turn = 0, braking = false, airborne = false, landing = false;
  function reset() {
    previous = undefined;
    speed = turn = 0;
    braking = airborne = landing = false;
  }
  function observe(sample: MotionSample) {
    if (sample.time === previous?.time) return;
    const older = previous;
    previous = sample;
    if (!older) return;
    const seconds = (sample.time - older.time) / 1000;
    const east = sample.east - older.east, north = sample.north - older.north;
    const distance = Math.hypot(east, north);
    if (seconds <= .02 || seconds > .65 || distance >= 12) {
      speed = turn = 0;
      braking = airborne = landing = false;
      return;
    }
    const oldSpeed = speed;
    speed = Math.min(17, distance / seconds);
    turn = sledYawDelta(older.yaw, sample.yaw) / seconds;
    const ground = heightAt(sample.east, sample.north);
    const wasAirborne = airborne;
    airborne = sample.height - ground > (wasAirborne ? .035 : .10);
    landing ||= wasAirborne && !airborne;
    const grade = distance > .1 ? (ground - heightAt(older.east, older.north)) / distance : 0;
    const coast = -12 * grade / Math.hypot(1, grade) - .8 - .0127 * oldSpeed ** 2;
    const drift = distance > .1 && Math.abs(turn) > .55 &&
      Math.abs(sledYawDelta(Math.atan2(east, north), sample.yaw)) > .24 && speed > 4;
    braking = !airborne && oldSpeed > .7 && ((speed - oldSpeed) / seconds < coast - 1.4 || drift);
  }
  return { observe, reset, get speed() { return speed; }, get turn() { return turn; },
    get braking() { return braking; }, get airborne() { return airborne; },
    takeLanding() { const value = landing; landing = false; return value; } };
}
