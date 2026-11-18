import {
  BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D, Vector3,
} from 'three';
import type { Box, Ramp } from './landmark-kit';
import type { TownActivity, TownActivityContext, TownSeat } from './town-activity';

type LocalPoint = readonly [x: number, y: number, z: number];

const trackX = -21.6;
const stairX = -23.13;
const base = .12;
const seatedEye = 1.16;
const launch = [stairX, 2.28, 21.78] as const;
const arrival = [-19.82, base, 31.68] as const;

export const castleIceSlideProfile = [
  [22.05, 2.28], [22.50, 2.27], [23.60, 2.01], [24.60, 1.73],
  [25.80, 1.394], [27.00, 1.058], [28.20, .722], [29.40, .386],
  [30.45, base], [31.75, base],
] as const;

const startZ = castleIceSlideProfile[0][0];
const finishZ = castleIceSlideProfile.at(-1)![0];
const length = finishZ - startZ;
const brakingDistance = 2.4;
// Match S1's strong braking reference, with a shorter chute and lower entry speed.
const braking = 3.5;
const speed = Math.sqrt(2 * braking * brakingDistance);
const accelerateFor = 2 * (length - brakingDistance) / speed;
const brakeFor = speed / braking;
const acceleration = speed / accelerateFor;
export const castleIceSlideDuration = accelerateFor + brakeFor;

type SlidePose = { x: number; y: number; z: number; pitch: number; speed: number };

export function sampleCastleIceSlide(seconds: number): SlidePose {
  const time = Number.isFinite(seconds) ? Math.min(Math.max(0, seconds), castleIceSlideDuration) : 0;
  const brakeTime = Math.max(0, time - accelerateFor);
  const distance = brakeTime
    ? length - brakingDistance + speed * brakeTime - braking * brakeTime * brakeTime / 2
    : acceleration * time * time / 2;
  const z = time === castleIceSlideDuration ? finishZ : startZ + distance;
  for (let i = 1; i < castleIceSlideProfile.length; i++) {
    const [fromZ, fromY] = castleIceSlideProfile[i - 1];
    const [toZ, toY] = castleIceSlideProfile[i];
    if (z > toZ) continue;
    const grade = (toY - fromY) / (toZ - fromZ);
    return {
      x: trackX, y: fromY + (z - fromZ) * grade, z,
      pitch: Math.atan(grade) * .55,
      speed: Math.max(0, brakeTime ? speed - braking * brakeTime : acceleration * time),
    };
  }
  return { x: trackX, y: base, z: finishZ, pitch: 0, speed: 0 };
}

type Piece = {
  centre: LocalPoint;
  size: LocalPoint;
  tint: string;
  rotation: number;
};

export function mountCastleIceSlide(castle: Group) {
  const previous = castle.userData.castleIceSlideGeometry as InstancedMesh | undefined;
  if (previous) return previous;
  const pieces: Piece[] = [];
  const floors: Box[] = [];
  const colliders: Box[] = [];
  const ramps: Ramp[] = [];
  const snow = '#d7edf5';
  const ice = '#77bad3';
  const inset = '#a3d1e8';
  const shade = '#4d819e';
  const stripe = '#d9fafc';
  const put = (x: number, y: number, z: number, w: number, h: number, d: number, tint: string, rotation = 0) =>
    pieces.push({ centre: [x, y, z], size: [w, h, d], tint, rotation });
  const bounds = (x: number, bottom: number, z: number, w: number, h: number, d: number): Box => ({
    min: [x - w / 2, bottom, z - d / 2], max: [x + w / 2, bottom + h, z + d / 2],
  });
  function floor(x: number, top: number, z: number, w: number, d: number, tint: string, depth = .20) {
    floors.push(bounds(x, top - depth, z, w, depth, d));
    put(x, top - depth / 2, z, w, depth, d, tint);
  }

  floor(-22.23, launch[1], 21.78, 3.15, .66, inset);
  floor(stairX, launch[1], 22.34, 1.32, .51, snow);
  const tread = .56;
  for (let index = 0; index < 8; index++) {
    const z = 22.595 + (index + .5) * tread;
    const top = base + (8 - index) * .27;
    floor(stairX, top, z, 1.32, tread, index % 2 ? inset : snow, top - base);
    put(stairX, top + .012, z + .20, 1.24, .018, .08, stripe);
  }
  floor(stairX, base, 27.40, 1.36, .72, inset, .11);

  const firstRailZ = 22.86;
  for (const side of [-1, 1]) {
    const x = stairX + side * .72;
    for (let index = 0; index < 7; index++) {
      const z = firstRailZ + index * tread;
      const top = base + (8 - index) * .27;
      put(x, top + .30, z, .12, .60, .59, index % 2 ? ice : shade);
      colliders.push(bounds(x, top, z, .12, .60, .59));
      put(x, top + .62, z, .18, .075, .58, snow);
    }
  }

  for (let i = 1; i < castleIceSlideProfile.length; i++) {
    const [nearZ, nearY] = castleIceSlideProfile[i - 1];
    const [farZ, farY] = castleIceSlideProfile[i];
    const z = (nearZ + farZ) / 2, height = (nearY + farY) / 2;
    const run = farZ - nearZ, slant = Math.atan2(nearY - farY, run);
    const deckDepth = Math.hypot(run, nearY - farY);
    const tint = i < 7 ? ice : inset;
    put(trackX, height - .09 * Math.cos(slant), z - .09 * Math.sin(slant),
      1.76, .18, deckDepth + .012, tint, slant);
    for (const side of [-1, 1]) {
      put(trackX + side * .67, height + .009, z, .043, .018, deckDepth, stripe, slant);
      if (nearZ >= 30.45) continue;
      const x = trackX + side * .95;
      put(x, height + .235, z, .205, .49, deckDepth + .04, shade, slant);
      put(x, height + .49, z, .235, .11, deckDepth + .025, snow, slant);
      colliders.push(bounds(x, farY, z, .205, nearY - farY + .53, run));
    }
    if (nearY !== farY) {
      ramps.push({ min: [trackX - .88, farY, nearZ], max: [trackX + .88, nearY, farZ], axis: 'z', ascending: -1 });
    } else {
      floors.push(bounds(trackX, nearY - .18, z, 1.76, .18, run));
    }
  }

  for (const [z, height] of [[22.37, 2.25], [25.60, 1.46], [28.78, .54]] as const) {
    for (const side of [-1, 1]) {
      const x = trackX + side * .69;
      put(x, (base + height) / 2, z, .18, height - base, .37, shade);
      colliders.push(bounds(x, base, z, .18, height - base, .37));
    }
  }
  floor(-20.17, base, 31.40, 1.94, 1.59, '#b2cdda', .13);
  for (const x of [trackX - .51, trackX, trackX + .51]) put(x, base + .012, 31.53, .28, .016, .09, '#cce1ec');

  const mesh = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial({ color: '#ffffff' }), pieces.length);
  mesh.name = '城堡冰滑梯、上梯与减速滩';
  const pose = new Object3D();
  const color = new Color();
  for (const [index, piece] of pieces.entries()) {
    pose.position.set(...piece.centre);
    pose.scale.set(...piece.size);
    pose.rotation.x = piece.rotation;
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    mesh.setColorAt(index, color.set(piece.tint));
  }
  mesh.computeBoundingSphere();
  castle.add(mesh);
  (castle.userData.floors ??= []).push(...floors);
  (castle.userData.colliders ??= []).push(...colliders);
  (castle.userData.ramps ??= []).push(...ramps);
  castle.userData.castleIceSlideGeometry = mesh;
  return mesh;
}

export type CastleIceSlideLanding = { x: number; n: number; ground: number; yaw: number };
export type CastleIceSlideFrame =
  | { kind: 'riding'; seat: TownSeat; ground: number; pitch: number }
  | { kind: 'land'; landing: CastleIceSlideLanding };

export function createCastleIceSlideActivity(
  castle: Group, context: Pick<TownActivityContext, 'sit' | 'announce'>,
  canStand: (x: number, n: number, ground: number) => boolean = () => true,
): TownActivity & {
  active(): boolean;
  step(dt: number, hasSeat: boolean): CastleIceSlideFrame | undefined;
  cancel(): CastleIceSlideLanding | undefined;
  reset(): void;
} {
  let elapsed: number | undefined;
  const toGround = (point: LocalPoint, yaw: number): CastleIceSlideLanding => {
    const world = castle.localToWorld(new Vector3(...point));
    return { x: world.x, n: -world.z, ground: world.y, yaw };
  };
  const launchStand = toGround(launch, Math.PI / 2);
  const arrivalStand = toGround(arrival, Math.PI / 2);
  const exit = (stand: CastleIceSlideLanding) => canStand(stand.x, stand.n, stand.ground);
  function riding(time: number): Extract<CastleIceSlideFrame, { kind: 'riding' }> {
    const pose = sampleCastleIceSlide(time);
    const feet = toGround([pose.x, pose.y, pose.z], Math.PI);
    return {
      kind: 'riding', seat: { x: feet.x, n: feet.n, eyeY: feet.ground + seatedEye, yaw: feet.yaw },
      ground: feet.ground, pitch: pose.pitch,
    };
  }
  const ready = () => elapsed === undefined && exit(launchStand) && exit(arrivalStand);
  return {
    spots: [{
      x: launchStand.x, n: launchStand.n, ground: launchStand.ground, range: .58,
      label: '坐上冰滑梯', available: ready,
      run() {
        if (!ready()) return;
        elapsed = 0;
        context.sit(riding(elapsed).seat);
        context.announce('坐稳，沿冰滑道滑到底');
      },
    }],
    active: () => elapsed !== undefined,
    step(dt, hasSeat) {
      if (elapsed === undefined) return;
      if (!hasSeat) { elapsed = undefined; return; }
      elapsed = Math.min(castleIceSlideDuration, elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
      if (elapsed < castleIceSlideDuration) return riding(elapsed);
      if (!exit(arrivalStand)) return riding(castleIceSlideDuration);
      elapsed = undefined;
      return { kind: 'land', landing: arrivalStand };
    },
    cancel() {
      if (elapsed === undefined) return;
      const closerToStart = elapsed < castleIceSlideDuration * .4;
      const candidates = closerToStart ? [launchStand, arrivalStand] : [arrivalStand, launchStand];
      const safe = candidates.find(exit);
      if (safe) elapsed = undefined;
      return safe;
    },
    reset() { elapsed = undefined; },
  };
}
