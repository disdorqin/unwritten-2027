import { Matrix4, Object3D, Vector3 } from 'three';
import type { SledAnimationFrame } from './sled-animation';
import type { VoxelPersonPart } from './town-voxel-person';

const shell = new Object3D();
const part = new Object3D();
const joint = new Object3D();
const matrix = new Matrix4();
const center = new Vector3();

export function createSledRiderMatrices(east: number, height: number, north: number, yaw: number, frame: SledAnimationFrame) {
  shell.position.set(east, height, -north);
  shell.rotation.set(frame.shellPitch, Math.PI - yaw, frame.shellRoll, 'YXZ');
  shell.updateMatrix();
}

export function writeSledShellPart(out: Float32Array, index: number, [at, size]: VoxelPersonPart) {
  part.position.set(...at);
  part.scale.set(...size);
  part.rotation.set(0, 0, 0);
  part.updateMatrix();
  matrix.multiplyMatrices(shell.matrix, part.matrix).toArray(out, index);
}

export function writeSledRiderPart(out: Float32Array, index: number, [at, size, , swing]: VoxelPersonPart,
  frame: SledAnimationFrame) {
  const [x, y, z] = at;
  const arm = Math.abs(x) > .32 && y > .75;
  const leg = y < .74 && swing !== undefined;
  const side = Math.sign(x);
  joint.position.set(0, .74, 0);
  joint.rotation.set(frame.torso, 0, 0);
  if (leg) {
    const footBrake = side === frame.side ? frame.brake : 0;
    joint.position.x = x;
    joint.rotation.set(frame.weight * (-Math.PI / 2 - .32 * frame.flight + .82 * footBrake),
      frame.crossing * (side === 1 ? .55 : 0), frame.crossing * (side === 1 ? -.48 : 0) - side * .12 * footBrake);
  } else if (arm) {
    joint.position.set(x, 1.43, 0);
    joint.rotation.set(frame.weight * (-.32 - frame.idlePat * (side < 0 ? 1 : 0)),
      0, -side * frame.weight * (.13 + .82 * frame.flight));
  } else if (y > 1.48) {
    joint.position.y = 1.45;
    joint.rotation.y = frame.idleLook;
  }
  center.set(x, y, z).sub(joint.position).applyEuler(joint.rotation).add(joint.position);
  part.position.set(center.x, center.y - .37 * frame.weight + frame.seatBob, center.z);
  part.rotation.copy(joint.rotation);
  part.scale.set(...size);
  part.updateMatrix();
  matrix.multiplyMatrices(shell.matrix, part.matrix).toArray(out, index);
}
