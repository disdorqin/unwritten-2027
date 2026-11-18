import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedMesh,
  Matrix4, MeshLambertMaterial, Object3D, Points, PointsMaterial, type Scene,
} from 'three';

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

type Rack = { x: number; n: number; y: number; yaw: number };

export function createTownSledVisuals(scene: Scene, racks: readonly Rack[]) {
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const sled = new InstancedMesh(geometry, material, sledParts.length);
  const rackMesh = new InstancedMesh(geometry, material, racks.length * (4 + 2 * sledParts.length));
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
  const poles: readonly SledPart[] = [
    [[-.78, .385, -.36], [.12, .77, .14], '#7f5032'],
    [[.78, .385, -.36], [.12, .77, .14], '#7f5032'],
    [[0, .66, -.36], [1.68, .14, .14], '#9b6239'],
    [[0, .45, -.36], [.44, .22, .12], '#a74241'],
  ];
  let rackIndex = 0;
  for (const rack of racks) {
    rackRoot.position.set(rack.x, rack.y, -rack.n);
    rackRoot.rotation.y = Math.PI - rack.yaw;
    rackRoot.updateMatrix();
    for (const pole of poles) placePart(rackMesh, rackIndex++, pole);
    for (const offset of [-.42, .42]) {
      for (const definition of sledParts) placePart(rackMesh, rackIndex++, definition, offset, .62);
    }
  }
  rackMesh.computeBoundingSphere();

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
  function puff(x: number, n: number, y: number, heading: number, amount: number) {
    for (let i = 0; i < amount; i++) {
      const id = head++ % count;
      const offset = id * 3;
      if (lifetime[id] === 0) active++;
      lifetime[id] = .5 + Math.random() * .4;
      positions[offset] = x + (Math.random() - .5) * .5 - Math.sin(heading) * .65;
      positions[offset + 1] = y + .09;
      positions[offset + 2] = -n + (Math.random() - .5) * .5 + Math.cos(heading) * .65;
      velocities[offset] = (Math.random() - .5) * 1.8;
      velocities[offset + 1] = .5 + Math.random() * 1.2;
      velocities[offset + 2] = (Math.random() - .5) * 1.8;
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
    setPose(x: number, n: number, y: number, heading: number, roll = 0) {
      sled.position.set(x, y, -n);
      sled.rotation.set(0, Math.PI - heading, roll, 'YXZ');
      sled.visible = true;
    },
    hide() { sled.visible = false; },
    puff,
    update,
  };
}
