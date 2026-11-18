import type { VoxelPersonPart } from './town-voxel-person';

export type TownAvatarPose = 0 | 1 | 2 | 3 | 4 | 5 | 7;

export function isTownAvatarPose(value: unknown): value is TownAvatarPose {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && (value <= 5 || value === 7);
}

export function effectiveTownAvatarPose(drinking: boolean, soaking: boolean, riding: boolean, seated: boolean, skateSpeed: number, sledding = false): TownAvatarPose {
  if (drinking) return 4;
  if (soaking) return 2;
  if (riding) return 5;
  if (sledding) return 7;
  if (seated) return 1;
  return skateSpeed > .5 ? 3 : 0;
}

export function avatarRootOffset(pose: TownAvatarPose) {
  if (pose === 2) return -.55;
  if (pose === 7) return -.37;
  return pose === 1 || pose === 5 ? -.45 : 0;
}

export function writeAvatarPart(
  out: Float32Array, index: number, part: VoxelPersonPart, pose: TownAvatarPose,
  east: number, height: number, worldZ: number, cosine: number, sine: number, gait: number, throwPitch: number,
) {
  const [[x, y, z], [width, tall, depth], , swing = 0] = part;
  const arm = Math.abs(x) > .32 && y > .75;
  const leg = y < .74 && swing !== 0;
  const seated = pose === 1 || pose === 5 || pose === 7;
  let pitch = 0;
  let roll = 0;
  let pivotY = y;
  if (arm) {
    pivotY = 1.43;
    if (pose === 0) pitch = gait * swing * .55;
    if (pose === 2) roll = Math.sign(x) * 1.25;
    if (pose === 3) { roll = Math.sign(x) * .65; pitch = .105; }
    if (pose === 4 && x > 0) { pitch = -2.48; roll = -.45; }
    if (x > 0 && throwPitch) pitch = throwPitch;
  } else if (leg) {
    pivotY = .74;
    if (seated) pitch = -Math.PI / 2;
    else if (pose === 0 || pose === 3) pitch = gait * swing * (pose === 3 ? 1.02 : .75);
  } else if (pose === 3 && y > .74) {
    pivotY = .74;
    pitch = .105;
  }

  const cp = pitch ? Math.cos(pitch) : 1;
  const sp = pitch ? Math.sin(pitch) : 0;
  const cr = roll ? Math.cos(roll) : 1;
  const sr = roll ? Math.sin(roll) : 0;
  const dy = y - pivotY;
  const turnedX = x - sr * dy;
  const turnedY = pivotY + cp * cr * dy - sp * z;
  const turnedZ = sp * cr * dy + cp * z;

  out[index] = width * (cosine * cr + sine * sp * sr);
  out[index + 1] = width * cp * sr;
  out[index + 2] = width * (-sine * cr + cosine * sp * sr);
  out[index + 4] = tall * (-cosine * sr + sine * sp * cr);
  out[index + 5] = tall * cp * cr;
  out[index + 6] = tall * (sine * sr + cosine * sp * cr);
  out[index + 8] = depth * sine * cp;
  out[index + 9] = -depth * sp;
  out[index + 10] = depth * cosine * cp;
  out[index + 12] = east + turnedX * cosine + turnedZ * sine;
  out[index + 13] = height + turnedY;
  out[index + 14] = worldZ - turnedX * sine + turnedZ * cosine;
}
