import { northRidgeNorthWall, sampleNorthRidge350 } from './north-ridge-350-terrain';

type Vector = { east: number; north: number; y: number };
type ClimbMode = 'standing' | 'climbing' | 'slipping' | 'sled' | 'flight';
type ClimbControls = { up: number; right: number };

export const northRidgeClimbSpec = {
  firstHeight: 68, lastHeight: 233, shelfRise: 15, routePitch: 57.5,
  routeLane: .64, gripStandOff: .41, verticalSpeed: 1.4, horizontalSpeed: 1.2,
  flagPitchMetres: 6.5, iceHoldSeconds: 2, bootRadius: .27,
} as const;

const meshStep = .25;
const gripStepMetres = .43;
const riseCount = (northRidgeClimbSpec.lastHeight - northRidgeClimbSpec.firstHeight) / meshStep;
const angle = (degrees: number) => degrees * Math.PI / 180;
const { firstHeight, lastHeight, shelfRise, routeLane, gripStandOff, verticalSpeed, horizontalSpeed } = northRidgeClimbSpec;
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(x, max));

function wallNorthAt(east: number, height: number) {
  let south: number = northRidgeNorthWall.south;
  let north: number = northRidgeNorthWall.north;
  for (let i = 0; i < 35; i++) {
    const middle = (south + north) / 2;
    if (sampleNorthRidge350(east, middle) > height) south = middle;
    else north = middle;
  }
  return (south + north) / 2;
}

const centreline: readonly Vector[] = (() => {
  let east = 320;
  let north = wallNorthAt(east, firstHeight);
  const samples: Vector[] = [{ east, north, y: firstHeight }];
  const preferredRun = meshStep / Math.tan(angle(northRidgeClimbSpec.routePitch));
  for (let index = 1; index <= riseCount; index++) {
    const y = firstHeight + index * meshStep;
    const rawRun = Math.abs(wallNorthAt(east, y) - north);
    // Turn at the surveyed ledges. Traverses moderate the pitch without flattening the reserved rock face.
    const side = Math.floor((y - firstHeight - meshStep) / shelfRise) % 2 === 0 ? 1 : -1;
    east += side * Math.sqrt(Math.max(0, preferredRun ** 2 - rawRun ** 2));
    north = wallNorthAt(east, y);
    samples.push({ east, north, y });
  }
  return samples;
})();

export function northRidgeClimbFaceAt(height: number, lane = 0): Vector {
  const y = clamp(height, firstHeight, lastHeight);
  const index = Math.min(riseCount - 1, Math.floor((y - firstHeight) / meshStep));
  const start = centreline[index]!, end = centreline[index + 1]!;
  const east = start.east + (end.east - start.east) * (y - start.y) / meshStep + lane;
  return { east, north: wallNorthAt(east, y), y };
}

export function northRidgeClimbPitchAt(height: number) {
  const index = clamp(Math.floor((height - firstHeight) / meshStep), 0, riseCount - 1);
  const start = centreline[index]!, end = centreline[index + 1]!;
  return Math.atan2(end.y - start.y, Math.hypot(end.east - start.east, end.north - start.north));
}

export function northRidgeWallPitchAt(east: number, north: number) {
  const eastGrade = (sampleNorthRidge350(east + .01, north) - sampleNorthRidge350(east - .01, north)) / .02;
  const northGrade = (sampleNorthRidge350(east, north + .01) - sampleNorthRidge350(east, north - .01)) / .02;
  return Math.atan(Math.hypot(eastGrade, northGrade));
}

function facingWall({ east, north }: Vector) {
  const eastGrade = sampleNorthRidge350(east + .05, north) - sampleNorthRidge350(east - .05, north);
  const northGrade = sampleNorthRidge350(east, north + .05) - sampleNorthRidge350(east, north - .05);
  return Math.atan2(eastGrade, northGrade);
}

export const northRidgeRockShelves = Array.from({ length: (lastHeight - firstHeight) / shelfRise + 1 }, (_, id) => {
  const face = northRidgeClimbFaceAt(firstHeight + id * shelfRise);
  const standing = { east: face.east + 1.68, north: face.north + 1.48, y: face.y };
  const pads = [-1, 1].map(side => ({
    east: face.east + side * 1.68, north: face.north + 1.48, width: 1.42, depth: 1.54,
  }));
  return { id, face, standing, pads };
});

const iceShelves = [2, 6] as const;
export const northRidgeIceTongues = iceShelves.map(shelf => ({
  shelf, from: northRidgeRockShelves[shelf]!.face.y + .35, to: northRidgeRockShelves[shelf]!.face.y + 1.95,
}));

export function northRidgeClimbStandingAt(east: number, north: number, shelf: number, radius: number = northRidgeClimbSpec.bootRadius) {
  const grade = northRidgeRockShelves[shelf];
  if (!grade || !Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(radius) || radius < 0) return undefined;
  return grade.pads.some(pad => Math.abs(east - pad.east) + radius <= pad.width / 2 &&
    Math.abs(north - pad.north) + radius <= pad.depth / 2) ? grade.face.y : undefined;
}

function gripPose(height: number, lane: number) {
  const face = northRidgeClimbFaceAt(height, lane);
  return { ...face, north: face.north + gripStandOff };
}

function shelfAt(height: number) {
  return Math.round((height - firstHeight) / shelfRise);
}

/** Local climbing ownership. A host calls the same gates before starting its flight or sled action. */
export function createNorthRidgeClimb() {
  let mode: ClimbMode = 'standing';
  let shelf = 0;
  let y: number = firstHeight;
  let lane = 0;
  let position = { ...northRidgeRockShelves[0]!.standing };
  let yaw = facingWall(northRidgeRockShelves[0]!.face);
  let moving = false;
  let handProgress = 0, handSwaps = 0, slips = 0, recoveries = 0;
  let iceIndex = -1, iceTravel = 0, icePause = 0, iceSettled = false;
  let iceWarning = false, stormClosed = false;
  let catchPose: Vector | undefined, catchTime = 0;

  function clearIce() {
    iceIndex = -1;
    iceTravel = icePause = 0;
    iceWarning = iceSettled = false;
  }

  function stand(id: number) {
    const target = northRidgeRockShelves[id]!;
    shelf = id;
    y = target.face.y;
    lane = 0;
    mode = 'standing';
    position = { ...target.standing };
    yaw = facingWall(target.face);
    moving = false;
    catchPose = undefined;
    catchTime = 0;
    clearIce();
  }

  function grip(lookYaw: number) {
    if (mode !== 'standing' || !Number.isFinite(lookYaw) || stormClosed) return false;
    const rock = northRidgeRockShelves[shelf]!;
    if (northRidgeClimbStandingAt(position.east, position.north, shelf) === undefined ||
        Math.cos(lookYaw - facingWall(rock.face)) < Math.cos(angle(48))) return false;
    mode = 'climbing';
    handProgress = 0;
    position = gripPose(y, lane);
    yaw = facingWall(rock.face);
    return true;
  }

  function release() {
    if (mode !== 'climbing') return false;
    const rest = shelfAt(y);
    if (Math.abs(y - northRidgeRockShelves[rest]!.face.y) > .18) return false;
    stand(rest);
    return true;
  }

  function startOther(action: 'sled' | 'flight') {
    if (mode !== 'standing') return false;
    mode = action;
    return true;
  }

  function endOther() {
    if (mode !== 'sled' && mode !== 'flight') return false;
    stand(shelf);
    return true;
  }

  function walkOnShelf(east: number, north: number) {
    if (mode !== 'standing' || northRidgeClimbStandingAt(east, north, shelf) === undefined) return false;
    position = { east, north, y };
    return true;
  }

  function slip(targetShelf: number) {
    shelf = targetShelf;
    mode = 'slipping';
    moving = false;
    catchPose = undefined;
    catchTime = 0;
    clearIce();
    slips++;
  }

  function advanceSlip(dt: number) {
    const target = northRidgeRockShelves[shelf]!;
    if (y > target.face.y) {
      y = Math.max(target.face.y, y - 3.3 * dt);
      position = gripPose(y, lane);
      return;
    }
    // Finish with a short supported recovery onto the flat shelf, in the same scene.
    catchPose ??= position;
    catchTime += dt;
    const amount = Math.min(1, catchTime / .36);
    position = { east: catchPose.east + (target.standing.east - catchPose.east) * amount,
      north: catchPose.north + (target.standing.north - catchPose.north) * amount, y: target.face.y };
    if (amount === 1) {
      recoveries++;
      stand(shelf);
    }
  }

  function step(controls: ClimbControls, seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(.05, seconds);
    if (mode === 'slipping') return advanceSlip(dt);
    if (mode !== 'climbing' || !Number.isFinite(controls.up) || !Number.isFinite(controls.right)) return;
    const up = clamp(controls.up, -1, stormClosed ? 0 : 1);
    const right = clamp(controls.right, -1, 1);
    const inputNorm = Math.max(1, Math.hypot(up, right));
    const oldY = y;
    const nextY = clamp(y + up * verticalSpeed * Math.sin(northRidgeClimbPitchAt(y)) * dt / inputNorm, firstHeight, lastHeight);
    // The north wall is approached facing south, so the player's right points west.
    const nextLane = clamp(lane - right * horizontalSpeed * dt / inputNorm, -routeLane, routeLane);
    const before = position;
    const after = gripPose(nextY, nextLane);
    const newIce = northRidgeIceTongues.findIndex(tongue => nextY >= tongue.from && nextY <= tongue.to);
    if (iceIndex !== newIce) {
      clearIce();
      iceIndex = newIce;
    }
    y = nextY;
    lane = nextLane;
    position = after;
    const distance = Math.hypot(after.east - before.east, after.north - before.north, after.y - before.y);
    moving = distance > 1e-7;
    if (newIce >= 0 && !iceSettled) {
      if (moving) {
        icePause = 0;
        iceTravel += distance;
        iceWarning = iceTravel >= .39;
        if (iceTravel >= .83) { slip(northRidgeIceTongues[newIce]!.shelf); return; }
      } else if (iceWarning) {
        icePause += dt;
        if (icePause + 1e-8 >= northRidgeClimbSpec.iceHoldSeconds) {
          iceSettled = true;
          iceWarning = false;
        }
      }
    }
    if (moving) {
      handProgress += distance;
      if (handProgress >= gripStepMetres) {
        handProgress -= gripStepMetres;
        handSwaps++;
      }
    }
    const below = Math.floor((y - firstHeight + 1e-8) / shelfRise);
    if (y < oldY) shelf = Math.min(shelf, Math.ceil((y - firstHeight - 1e-8) / shelfRise));
    else shelf = Math.max(shelf, below);
    if (y !== oldY && (y === firstHeight || y === lastHeight)) stand(shelfAt(y));
  }

  function state() {
    return { mode, position: { ...position }, yaw, shelf,
      blockedActions: mode === 'climbing' || mode === 'slipping',
      iceWarning, iceSettled, slips, recoveries, handSwaps, damageTaken: 0,
      gripHands: { moving, lead: handSwaps % 2 === 0 ? 'left' : 'right', phase: handProgress / gripStepMetres } };
  }

  return { state, grip, release, step, startOther, endOther, walkOnShelf,
    setStormClosed(closed: boolean) { stormClosed = closed; } };
}
