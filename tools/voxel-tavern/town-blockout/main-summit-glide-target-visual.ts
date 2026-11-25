import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PointLight, RingGeometry,
} from 'three';
import { summitGlideTargetRadii, type SummitGlideTarget } from './main-summit-glide-target';

/** Display-only art. The server-owned target and accepted touchdown remain the authority. */
export function mountSummitGlideTargetVisual(owner: Object3D, target: SummitGlideTarget) {
  const group = new Group();
  group.name = 'summit-glide-practice-landing-target';
  group.position.set(target.east, target.height, -target.north);
  const geometries = [
    new RingGeometry(0, summitGlideTargetRadii.bullseye, 48),
    new RingGeometry(summitGlideTargetRadii.bullseye + .06, summitGlideTargetRadii.inner, 48),
    new RingGeometry(summitGlideTargetRadii.inner + .06, summitGlideTargetRadii.outer, 48),
    new RingGeometry(summitGlideTargetRadii.outer + .1, summitGlideTargetRadii.outer + .3, 48),
  ];
  const stone = new MeshLambertMaterial({ color: 0x9bb0b5, side: 2 });
  const copper = new MeshLambertMaterial({ color: 0xae6b40, side: 2 });
  const pale = new MeshLambertMaterial({ color: 0xe9d4a2, side: 2 });
  const dark = new MeshLambertMaterial({ color: 0x4b6172, side: 2 });
  const materials = [stone, copper, pale, dark];
  for (let i = 0; i < geometries.length; i++) {
    const disk = new Mesh(geometries[i]!, materials[i]!);
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = .035 + i * .004;
    disk.name = ['target-bullseye', 'target-inner', 'target-outer', 'target-rim'][i]!;
    group.add(disk);
  }

  // Copper stakes are instanced so a full course does not multiply draw calls.
  const pegShape = new BoxGeometry(.19, .53, .19);
  const pegMaterial = new MeshLambertMaterial({ color: 0x604b3e });
  const pegs = new InstancedMesh(pegShape, pegMaterial, 20);
  pegs.name = 'target-snow-stakes';
  const transform = new Object3D();
  for (let index = 0; index < pegs.count; index++) {
    const theta = (index / pegs.count) * Math.PI * 2;
    transform.position.set(8.55 * Math.cos(theta), .13, 8.55 * Math.sin(theta));
    transform.rotation.y = theta;
    transform.updateMatrix();
    pegs.setMatrixAt(index, transform.matrix);
  }
  pegs.computeBoundingSphere();
  group.add(pegs);

  const postShape = new CylinderGeometry(.09, .12, 2.1, 6);
  const capShape = new BoxGeometry(.45, .22, .45);
  const torchMaterial = new MeshLambertMaterial({ color: 0x685143 });
  const flameMaterial = new MeshBasicMaterial({ color: 0xffc46e, toneMapped: false });
  const lights: PointLight[] = [];
  for (const direction of [-1, 1]) {
    const pole = new Mesh(postShape, torchMaterial);
    pole.position.set(direction * 9.6, 1.05, 0);
    const cap = new Mesh(capShape, flameMaterial);
    cap.position.set(direction * 9.6, 2.08, 0);
    const lamp = new PointLight(0xffc889, 7, 14, 2);
    lamp.position.set(direction * 9.6, 2.2, 0);
    group.add(pole, cap, lamp);
    lights.push(lamp);
  }

  owner.add(group);
  let disposed = false;
  return {
    group,
    lights,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      pegs.dispose();
      for (const geometry of [...geometries, pegShape, postShape, capShape]) geometry.dispose();
      for (const material of [...materials, pegMaterial, torchMaterial, flameMaterial]) material.dispose();
      group.clear();
    },
  };
}
