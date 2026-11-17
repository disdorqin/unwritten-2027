import { BoxGeometry, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import { monthStops } from './museum-timeline';

export const aprilMonth = 4;

export function createMuseumGuide(scene: Scene, toWorld: (x: number, y: number, z: number) => readonly [number, number, number]) {
  const banner = document.querySelector<HTMLElement>('#museum-guide')!;
  const cancel = banner.querySelector<HTMLButtonElement>('button')!;
  const april = monthStops[aprilMonth - 1];
  const path = [[0, 10.3], [april.x, 10.3], [april.x, april.z]] as const;
  const points: { x: number; z: number; yaw: number }[] = [];
  for (let index = 1; index < path.length; index++) {
    const [x0, z0] = path[index - 1];
    const [x1, z1] = path[index];
    const samples = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .77);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 1; i <= samples; i++) {
      points.push({ x: x0 + (x1 - x0) * i / samples, z: z0 + (z1 - z0) * i / samples, yaw });
    }
  }
  const lights = new InstancedMesh(new BoxGeometry(.17, .018, .044),
    new MeshBasicMaterial({ color: '#ffd08c' }), points.length * 2);
  lights.name = 'April exhibit wayfinding lights';
  const transform = new Object3D();
  points.forEach(({ x, z, yaw }, i) => {
    for (const side of [-1, 1]) {
      const offset = side * .063;
      transform.position.set(...toWorld(x + Math.cos(yaw) * offset, .313, z - Math.sin(yaw) * offset));
      transform.rotation.y = yaw + side * Math.PI * .24;
      transform.updateMatrix();
      lights.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), transform.matrix);
    }
  });
  lights.computeBoundingSphere();
  scene.add(lights);
  function setActive(active: boolean) {
    lights.visible = active;
    banner.hidden = !active;
  }
  cancel.onclick = () => setActive(false);
  setActive(false);
  return { setActive };
}
