import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import type { TownPlot } from './landmark-kit';
import { tavernSeatPlacements } from './tavern-seats';
import { voxelPersonParts } from './town-voxel-person';

const glimpseMs = 1_500;
const seatedWaist = .60;
// The seated visitors use the existing torso, head and arms. The stools hide the lower silhouette.
const silhouette = voxelPersonParts.filter(([[, y]]) => y > .7);

/** Local first-person presentation only. The host supplies the accepted drink moment. */
export function mountTavernAncestorGlimpse(owner: Scene, plot: TownPlot, now = () => performance.now()) {
  const seats = tavernSeatPlacements(plot);
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial({
    color: '#d4a675', transparent: true, opacity: 0, depthWrite: false,
  });
  const mesh = new InstancedMesh(geometry, material, seats.length * silhouette.length);
  mesh.name = '未写酒馆 · 热酒幻影';
  mesh.visible = false;
  const pose = new Object3D();
  let index = 0;
  for (const { pose: seat, seatY } of seats) {
    const cosine = Math.cos(seat.yaw), sine = Math.sin(seat.yaw);
    for (const [[x, y, z], size] of silhouette) {
      pose.position.set(seat.x + x * cosine + z * sine, seatY + y - seatedWaist,
        -seat.n - x * sine + z * cosine);
      pose.rotation.set(0, seat.yaw, 0);
      pose.scale.set(...size);
      pose.updateMatrix();
      mesh.setMatrixAt(index++, pose.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  owner.add(mesh);
  let beganAt: number | undefined;
  let disposed = false;

  function update(inTavern: boolean) {
    if (disposed) return;
    const age = beganAt === undefined ? Infinity : now() - beganAt;
    if (!inTavern || age < 0 || age >= glimpseMs) {
      beganAt = undefined;
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    // Fast onset without a screen flash, then fall back into the actual room lights.
    material.opacity = .23 * Math.min(1, (age + 80) / 180, (glimpseMs - age) / 460);
  }

  return {
    reveal() {
      if (disposed) return;
      beganAt = now();
      update(true);
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      beganAt = undefined;
      mesh.visible = false;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
