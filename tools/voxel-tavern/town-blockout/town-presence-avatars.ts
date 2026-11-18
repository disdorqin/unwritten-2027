import { BoxGeometry, Color, DynamicDrawUsage, Frustum, InstancedMesh, Matrix4, MeshLambertMaterial,
  Sphere, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { voxelPersonParts } from './town-voxel-person';
import './town-presence-avatars.css';

export type PresenceAvatarActor = {
  id: number;
  name: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
  throwGestureStarted?: number;
};

const capacity = 48;
const labelDistanceSquared = 40 ** 2;
const headHeight = 2.13;
const bodyRadius = 1.14;
const partCount = voxelPersonParts.length;
const coatColors = [
  ['#e6b18c', '#423541', '#a54345', '#e0caaf', '#4c4357', '#ddae5f', '#f0d6a0', '#8f5745'],
  ['#bd896a', '#263b4f', '#4d7c99', '#dfcfaa', '#3a4b63', '#d38d5a', '#ecd0a8', '#784b3c'],
  ['#e9bb9f', '#51413a', '#62764a', '#e1c8a4', '#4e4f40', '#cf6453', '#efd9ad', '#915a47'],
  ['#cb987b', '#3e354d', '#855b83', '#dcc3ad', '#52445b', '#db9a62', '#f3c68c', '#815541'],
].map(palette => palette.map(hex => new Color(hex)));

export function createPresenceAvatars(scene: Scene, camera: PerspectiveCamera): {
  render(actors: readonly PresenceAvatarActor[]): void;
  clear(): void;
} {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), capacity * partCount);
  mesh.name = 'town-presence-avatars';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const matrices = mesh.instanceMatrix.array;
  // Most axes retain their initial values. The throwing arm also writes its pitched axes.
  for (let instance = 0; instance < capacity * partCount; instance++) {
    matrices[instance * 16 + 5] = voxelPersonParts[instance % partCount][1][1];
  }
  // The mesh spans the town. Test individual body bounds before packing the instance buffer.
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  scene.add(mesh);

  const overlay = document.createElement('div');
  overlay.className = 'town-presence-nameplates';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  (document.getElementById('scene') ?? document.body).append(overlay);
  const labels = Array.from({ length: capacity }, () => {
    const label = document.createElement('span');
    label.className = 'town-presence-nameplate';
    label.hidden = true;
    overlay.append(label);
    return label;
  });

  const viewProjection = new Matrix4();
  const frustum = new Frustum();
  const body = new Sphere(new Vector3(), bodyRadius);
  const head = new Vector3();
  const slotColors = new Uint8Array(capacity).fill(255);
  const labelX = new Int32Array(capacity).fill(-1);
  const labelY = new Int32Array(capacity).fill(-1);
  const labelNames = new Array<string>(capacity);
  let shown = 0;

  function finishLabels(count: number) {
    for (let i = count; i < shown; i++) labels[i].hidden = true;
    if ((count === 0) !== (shown === 0)) overlay.hidden = count === 0;
    shown = count;
  }

  function clear() {
    mesh.count = 0;
    mesh.visible = false;
    if (shown) finishLabels(0);
  }

  function render(actors: readonly PresenceAvatarActor[]) {
    if (actors.length === 0) {
      clear();
      return;
    }

    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem, camera.reversedDepth);
    const view = camera.matrixWorldInverse.elements;
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;
    let visible = 0;
    let shownNext = 0;
    let colorsChanged = false;
    const elapsedMs = performance.now();

    for (const actor of actors) {
      const worldZ = -actor.north;
      body.center.set(actor.east, actor.height + .96, worldZ);
      if (!frustum.intersectsSphere(body)) continue;
      if (visible >= capacity) break;

      // Voxel faces point along +Z at rest. The walk camera uses yaw 0 along −Z.
      const yaw = Math.PI - actor.yaw;
      const cosine = Math.cos(yaw);
      const sine = Math.sin(yaw);
      const colorIndex = actor.id % coatColors.length;
      const palette = coatColors[colorIndex];
      const recolor = colorIndex !== slotColors[visible];
      const firstInstance = visible * partCount;
      const progress = (elapsedMs - (actor.throwGestureStarted ?? -Infinity)) / 350;
      const armPitch = progress >= 0 && progress < 1 ? -1.55 * Math.sin(Math.PI * progress) : 0;
      const armCosine = Math.cos(armPitch);
      const armSine = Math.sin(armPitch);
      for (let offset = 0; offset < partCount; offset++) {
        const [[x, y, z], [width, height, depth], tint] = voxelPersonParts[offset];
        const instance = firstInstance + offset;
        const matrix = instance * 16;
        // Three.js stores the scaled local X and Z axes as columns.
        matrices[matrix] = width * cosine;
        matrices[matrix + 2] = -width * sine;
        const rightArm = x > .32 && y > .75;
        if (rightArm) {
          const shoulder = 1.43;
          const localY = y - shoulder;
          const pitchedZ = localY * armSine + z * armCosine;
          matrices[matrix + 4] = height * armSine * sine;
          matrices[matrix + 5] = height * armCosine;
          matrices[matrix + 6] = height * armSine * cosine;
          matrices[matrix + 8] = depth * armCosine * sine;
          matrices[matrix + 9] = -depth * armSine;
          matrices[matrix + 10] = depth * armCosine * cosine;
          matrices[matrix + 12] = actor.east + x * cosine + pitchedZ * sine;
          matrices[matrix + 13] = actor.height + shoulder + localY * armCosine - z * armSine;
          matrices[matrix + 14] = worldZ - x * sine + pitchedZ * cosine;
        } else {
          matrices[matrix + 8] = depth * sine;
          matrices[matrix + 10] = depth * cosine;
          matrices[matrix + 12] = actor.east + x * cosine + z * sine;
          matrices[matrix + 13] = actor.height + y;
          matrices[matrix + 14] = worldZ - x * sine + z * cosine;
        }
        if (recolor) mesh.setColorAt(instance, palette[tint]);
      }
      if (recolor) {
        slotColors[visible] = colorIndex;
        colorsChanged = true;
      }
      visible++;

      head.set(actor.east, actor.height + headHeight, worldZ);
      if (head.distanceToSquared(camera.position) > labelDistanceSquared) continue;
      const cameraZ = view[2] * head.x + view[6] * head.y + view[10] * head.z + view[14];
      if (cameraZ >= 0) continue;
      head.applyMatrix4(viewProjection);
      if (Math.abs(head.x) > 1 || Math.abs(head.y) > 1 || Math.abs(head.z) > 1) continue;
      const label = labels[shownNext];
      if (labelNames[shownNext] !== actor.name) {
        labelNames[shownNext] = actor.name;
        label.textContent = actor.name;
      }
      const px = Math.round((1 + head.x) * halfWidth);
      const py = Math.round((1 - head.y) * halfHeight);
      if (px !== labelX[shownNext] || py !== labelY[shownNext]) {
        labelX[shownNext] = px;
        labelY[shownNext] = py;
        label.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      }
      if (shownNext >= shown) label.hidden = false;
      shownNext++;
    }

    mesh.count = visible * partCount;
    mesh.visible = visible > 0;
    if (mesh.visible) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finishLabels(shownNext);
  }

  return { render, clear };
}
