import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, type Object3D } from 'three';
import type { SummitCablePoint } from './main-summit-cable';
import { avatarRootOffset, writeAvatarPart } from './town-presence-pose';
import { voxelPersonParts } from './town-voxel-person';

const coatPalette = ['#d8a98b', '#27374a', '#3f7771', '#e1d1b3', '#303e4a', '#e4ac5d', '#efe0bf', '#855944'];
const ridePose = 5;
const seatedHeight = avatarRootOffset(ridePose);

export function mountSummitCablePeer(owner: Object3D) {
  const group = new Group();
  group.name = 'summit-cable-peer';
  const rider = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), voxelPersonParts.length);
  rider.name = 'summit-cable-peer-traveler';
  const matrices = rider.instanceMatrix.array as Float32Array;
  const palette = coatPalette.map(color => new Color(color));
  for (const [index, part] of voxelPersonParts.entries()) {
    writeAvatarPart(matrices, index * 16, part, ridePose, 0, seatedHeight, 0, 1, 0, 0, 0);
    rider.setColorAt(index, palette[part[2]]!);
  }
  rider.instanceMatrix.needsUpdate = true;
  if (rider.instanceColor) rider.instanceColor.needsUpdate = true;

  // The cabin floor slab sits 0.16 m above the rope-relative rider feet datum.
  rider.scale.set(.4, .7, .45);
  rider.position.y = .16;
  rider.computeBoundingSphere();
  group.add(rider);
  owner.add(group);
  let disposed = false;

  return {
    group,
    positionAt(feet: SummitCablePoint, heading: number) {
      group.position.set(feet.east, feet.height, -feet.north);
      group.rotation.y = Math.PI - heading;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      rider.dispose();
      rider.geometry.dispose();
      rider.material.dispose();
      group.clear();
    },
  };
}
