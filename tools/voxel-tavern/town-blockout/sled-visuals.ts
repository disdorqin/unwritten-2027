import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh,
  Matrix4, MeshLambertMaterial, Object3D, Points, PointsMaterial, type Scene,
} from 'three';
import type { SledAnimationFrame } from './sled-animation';
import { particleDensityScale, scaledParticleCount } from './town-quality';
import { createSledRiderMatrices, writeSledRiderPart } from './sled-rider-pose';
import { voxelPersonParts } from './town-voxel-person';

const firstPersonParts = voxelPersonParts.slice(10);
const firstPersonPalette = ['#e6b18c', '#423541', '#a54345', '#e0caaf', '#4c4357', '#ddae5f'];

type SledPart = readonly [readonly [number, number, number], readonly [number, number, number], string];
export const sledParts: readonly SledPart[] = [
  [[-.29, .075, 0], [.095, .11, 1.65], '#4f3027'],
  [[.29, .075, 0], [.095, .11, 1.65], '#4f3027'],
  [[-.29, .16, .83], [.095, .10, .23], '#8c5036'],
  [[.29, .16, .83], [.095, .10, .23], '#8c5036'],
  [[-.23, .22, -.46], [.14, .26, .13], '#7f5534'],
  [[.23, .22, -.46], [.14, .26, .13], '#7f5534'],
  [[-.23, .22, .38], [.14, .26, .13], '#7f5534'],
  [[.23, .22, .38], [.14, .26, .13], '#7f5534'],
  [[0, .37, -.1], [.7, .1, 1.25], '#b47342'],
  [[0, .53, -.69], [.68, .28, .115], '#a44340'],
];
export const remoteSledParts = sledParts.filter((_, index) => index < 2 || index === 4 || index === 5 || index >= 8);

type SledSpot = { x: number; n: number; y: number; yaw: number };
export type SledRack = SledSpot & { id?: string };

export function createTownSledVisuals(scene: Scene, racks: readonly SledRack[]) {
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const sled = new InstancedMesh(geometry, material, sledParts.length + firstPersonParts.length);
  sled.count = sledParts.length;
  sled.frustumCulled = false;
  sled.instanceMatrix.setUsage(DynamicDrawUsage);
  const rackMesh = new InstancedMesh(geometry, material, racks.length * (4 + 2 * sledParts.length));
  rackMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  sled.name = 'town-local-sled';
  rackMesh.name = 'town-sled-racks';
  sled.visible = false;
  const part = new Object3D();
  const rackRoot = new Object3D();
  const matrix = new Matrix4();
  const color = new Color();
  scene.add(sled, rackMesh);
  function placePart(mesh: InstancedMesh, index: number, definition: SledPart, horizontal = 0, scale = 1) {
    const [center, size, tint] = definition;
    part.position.set(center[0] * scale + horizontal, center[1] * scale, center[2] * scale);
    part.scale.set(size[0] * scale, size[1] * scale, size[2] * scale);
    part.updateMatrix();
    matrix.multiplyMatrices(rackRoot.matrix, part.matrix);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.set(tint));
  }
  sledParts.forEach((definition, index) => placePart(sled, index, definition));
  firstPersonParts.forEach(([, , palette], index) => {
    sled.setColorAt(sledParts.length + index, color.set(firstPersonPalette[palette]));
  });
  const poles: readonly SledPart[] = [
    [[-.78, .385, -.36], [.12, .77, .14], '#7f5032'],
    [[.78, .385, -.36], [.12, .77, .14], '#7f5032'],
    [[0, .66, -.36], [1.68, .14, .14], '#9b6239'],
    [[0, .45, -.36], [.44, .22, .12], '#a74241'],
  ];
  const rackVehicles = new Map<string, SledSpot | undefined>();
  for (const rack of racks) if (rack.id) rackVehicles.set(rack.id, rack);
  function refreshRacks() {
    let rackIndex = 0;
    function placeAt(spot: SledSpot) {
      rackRoot.position.set(spot.x, spot.y, -spot.n);
      rackRoot.rotation.y = Math.PI - spot.yaw;
      rackRoot.updateMatrix();
    }
    for (const rack of racks) {
      placeAt(rack);
      for (const pole of poles) placePart(rackMesh, rackIndex++, pole);
      if (!rack.id) {
        for (const offset of [-.42, .42]) {
          for (const definition of sledParts) placePart(rackMesh, rackIndex++, definition, offset, .62);
        }
        continue;
      }
      const vehicle = rackVehicles.get(rack.id);
      if (vehicle) {
        placeAt(vehicle);
        for (const definition of sledParts) placePart(rackMesh, rackIndex++, definition);
      }
    }
    rackMesh.count = rackIndex;
    rackMesh.instanceMatrix.needsUpdate = true;
    if (rackMesh.instanceColor) rackMesh.instanceColor.needsUpdate = true;
    rackMesh.computeBoundingSphere();
  }
  refreshRacks();

  const count = 600;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetime = new Float32Array(count);
  const particlesGeometry = new BufferGeometry();
  const display = new Float32Array(count * 3);
  const attribute = new BufferAttribute(display, 3).setUsage(DynamicDrawUsage);
  particlesGeometry.setAttribute('position', attribute);
  const mist = new Points(particlesGeometry, new PointsMaterial({
    color: '#e5eff8', size: .115, opacity: .54, transparent: true, depthWrite: false,
  }));
  mist.name = 'town-sled-snow-mist';
  mist.frustumCulled = false;
  mist.visible = false;
  scene.add(mist);
  let head = 0;
  let active = 0;
  function puff(x: number, n: number, y: number, heading: number, amount: number, effect?: 'brake' | 'land') {
    // Quality tiers (M5) scale the mist spend; the spray pattern (angles use
    // the caller's amount) and velocities are unchanged.
    const spend = scaledParticleCount(amount, particleDensityScale());
    for (let i = 0; i < spend; i++) {
      const id = head++ % count;
      const offset = id * 3;
      if (lifetime[id] === 0) active++;
      lifetime[id] = .5 + Math.random() * .4;
      positions[offset] = x + (Math.random() - .5) * .5 - Math.sin(heading) * .65;
      positions[offset + 1] = y + .09;
      positions[offset + 2] = -n + (Math.random() - .5) * .5 + Math.cos(heading) * .65;
      const angle = effect === 'land' ? i / amount * Math.PI * 2 :
        Math.PI + heading + (Math.random() - .5) * (effect === 'brake' ? 1.9 : 1.1);
      const speed = (effect === 'brake' ? 2.45 : effect === 'land' ? 1.9 : 1.15) * (.5 + .6 * Math.random());
      velocities[offset] = Math.sin(angle) * speed;
      velocities[offset + 1] = .45 + Math.random() * 1.1;
      velocities[offset + 2] = -Math.cos(angle) * speed;
    }
  }
  function update(dt: number) {
    if (!active) { mist.visible = false; return; }
    let size = 0;
    for (let id = 0; id < count; id++) {
      if (lifetime[id] === 0) continue;
      lifetime[id] = Math.max(0, lifetime[id] - dt);
      if (lifetime[id] === 0) { active--; continue; }
      const offset = id * 3;
      velocities[offset + 1] -= 2 * dt;
      for (let axis = 0; axis < 3; axis++) {
        positions[offset + axis] += velocities[offset + axis] * dt;
        display[size++] = positions[offset + axis];
      }
    }
    mist.visible = size > 0;
    particlesGeometry.setDrawRange(0, size / 3);
    if (mist.visible) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, size);
      attribute.needsUpdate = true;
    }
  }
  return {
    setRackVehicle(id: string, spot?: SledSpot) {
      if (!rackVehicles.has(id)) return;
      rackVehicles.set(id, spot && { ...spot });
      refreshRacks();
    },
    setPose(x: number, n: number, y: number, heading: number, roll = 0, pitch = 0, rider?: SledAnimationFrame) {
      sled.position.set(x, y, -n);
      sled.rotation.set(pitch, Math.PI - heading, roll, 'YXZ');
      sled.count = sledParts.length;
      if (rider) {
        createSledRiderMatrices(0, 0, 0, Math.PI, { ...rider, shellPitch: 0, shellRoll: 0 });
        const output = sled.instanceMatrix.array as Float32Array;
        for (const bodyPart of firstPersonParts) writeSledRiderPart(output, sled.count++ * 16, bodyPart, rider);
        sled.instanceMatrix.clearUpdateRanges();
        sled.instanceMatrix.addUpdateRange(sledParts.length * 16, firstPersonParts.length * 16);
        sled.instanceMatrix.needsUpdate = true;
      }
      sled.visible = true;
    },
    hide() { sled.visible = false; },
    puff,
    update,
  };
}
