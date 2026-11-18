import { sharedHomeLayer } from '../../../src/presence/shared-home-space';
import { BoxGeometry, Color, DynamicDrawUsage, Frustum, InstancedMesh, Matrix4, MeshLambertMaterial,
  Sphere, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { chatBubbleFadeMs, type TownChatBubble } from './town-chat';
import { voxelPersonParts, type VoxelPersonPart } from './town-voxel-person';
import { avatarRootOffset, writeAvatarPart, type TownAvatarPose } from './town-presence-pose';
import { remoteSledParts } from './sled-visuals';
import type { SledAnimationFrame } from './sled-animation';
import { createSledRiderMatrices, writeSledRiderPart, writeSledShellPart } from './sled-rider-pose';
import './town-presence-avatars.css';

export type PresenceAvatarActor = {
  id: number;
  name: string;
  east: number;
  north: number;
  height: number;
  yaw: number;
  throwGestureStarted?: number;
  pose?: TownAvatarPose;
  stride?: number;
  sledAnimation?: SledAnimationFrame;
};

const capacity = 48;
const labelDistanceSquared = 40 ** 2;
const headHeight = 2.13;
const bodyRadius = 1.14;
const partCount = voxelPersonParts.length;
const sledPartCount = remoteSledParts.length;
const sledGeometry: VoxelPersonPart[] = remoteSledParts.map(([position, size]) => [position, size, 0]);
const sledColors = remoteSledParts.map(([, , tint]) => new Color(tint));
const coatColors = [
  ['#e6b18c', '#423541', '#a54345', '#e0caaf', '#4c4357', '#ddae5f', '#f0d6a0', '#8f5745'],
  ['#bd896a', '#263b4f', '#4d7c99', '#dfcfaa', '#3a4b63', '#d38d5a', '#ecd0a8', '#784b3c'],
  ['#e9bb9f', '#51413a', '#62764a', '#e1c8a4', '#4e4f40', '#cf6453', '#efd9ad', '#915a47'],
  ['#cb987b', '#3e354d', '#855b83', '#dcc3ad', '#52445b', '#db9a62', '#f3c68c', '#815541'],
].map(palette => palette.map(hex => new Color(hex)));

type ReadBubble = (id: number, now: number) => TownChatBubble | undefined;

export function createPresenceAvatars(scene: Scene, camera: PerspectiveCamera): {
  render(actors: readonly PresenceAvatarActor[], readBubble?: ReadBubble, view?: PerspectiveCamera, showNames?: boolean): void;
  clear(): void;
} {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), capacity * (partCount + sledPartCount));
  mesh.name = 'town-presence-avatars';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const matrices = mesh.instanceMatrix.array as Float32Array;
  const matrixSlots = Array.from({ length: capacity }, () => ({
    id: -1, east: 0, north: 0, height: 0, yaw: 0, pose: 0, stride: 0, armPitch: 0, first: -1, animated: false,
  }));
  // The mesh spans the town. Test individual body bounds before packing the instance buffer.
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  mesh.layers.enable(sharedHomeLayer);
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
    const bubble = document.createElement('span');
    bubble.className = 'town-presence-chat-bubble';
    bubble.hidden = true;
    overlay.append(label, bubble);
    return { label, bubble, chat: undefined as TownChatBubble | undefined, fading: false };
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
    for (let i = count; i < shown; i++) {
      labels[i].label.hidden = true;
      labels[i].bubble.hidden = true;
      labels[i].chat = undefined;
    }
    if ((count === 0) !== (shown === 0)) overlay.hidden = count === 0;
    shown = count;
  }

  function clear() {
    mesh.count = 0;
    mesh.visible = false;
    if (shown) finishLabels(0);
  }

  function render(actors: readonly PresenceAvatarActor[], readBubble?: ReadBubble, viewCamera = camera, showNames = true) {
    if (actors.length === 0) {
      clear();
      return;
    }

    viewCamera.updateMatrixWorld();
    viewProjection.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection, viewCamera.coordinateSystem, viewCamera.reversedDepth);
    const view = viewCamera.matrixWorldInverse.elements;
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;
    let visible = 0;
    let instances = 0;
    let shownNext = 0;
    let colorsChanged = false;
    const elapsedMs = performance.now();
    let updateStart = -1;
    let updateEnd = -1;
    mesh.instanceMatrix.clearUpdateRanges();

    for (const actor of actors) {
      const worldZ = -actor.north;
      const pose = actor.pose ?? 0;
      const rootOffset = avatarRootOffset(pose);
      body.center.set(actor.east, actor.height + rootOffset + .96, worldZ);
      if (!frustum.intersectsSphere(body)) continue;
      if (visible >= capacity) break;

      // Voxel faces point along +Z at rest. The walk camera uses yaw 0 along −Z.
      const yaw = Math.PI - actor.yaw;
      const cosine = Math.cos(yaw);
      const sine = Math.sin(yaw);
      const colorIndex = actor.id % coatColors.length;
      const palette = coatColors[colorIndex];
      const animation = actor.sledAnimation;
      const sledVisible = pose === 7 || animation !== undefined;
      const count = partCount + (sledVisible ? sledPartCount : 0);
      const progress = (elapsedMs - (actor.throwGestureStarted ?? -Infinity)) / 350;
      const armPitch = progress >= 0 && progress < 1 ? -1.55 * Math.sin(Math.PI * progress) : 0;
      const stride = actor.stride ?? 0;
      const slot = matrixSlots[visible];
      const firstInstance = instances;
      const movedInstance = slot.first !== firstInstance;
      const changedPose = slot.pose !== pose || slot.animated !== Boolean(animation);
      const recolor = movedInstance || changedPose || colorIndex !== slotColors[visible];
      const dirty = movedInstance || changedPose || slot.id !== actor.id || slot.east !== actor.east ||
        slot.north !== actor.north || slot.height !== actor.height || slot.yaw !== actor.yaw ||
        slot.stride !== stride || slot.armPitch !== armPitch || Boolean(animation);
      if (dirty) {
        if (animation) createSledRiderMatrices(actor.east, actor.height + animation.shellLift, actor.north, actor.yaw, animation);
        for (let offset = 0; offset < partCount; offset++) {
          const index = (firstInstance + offset) * 16;
          if (animation) writeSledRiderPart(matrices, index, voxelPersonParts[offset], animation);
          else writeAvatarPart(matrices, index, voxelPersonParts[offset], pose,
            actor.east, actor.height + rootOffset, worldZ, cosine, sine, stride, armPitch);
        }
        if (sledVisible) for (let offset = 0; offset < sledPartCount; offset++) {
          const index = (firstInstance + partCount + offset) * 16;
          if (animation) writeSledShellPart(matrices, index, sledGeometry[offset]);
          else writeAvatarPart(matrices, index, sledGeometry[offset], 0,
            actor.east, actor.height, worldZ, cosine, sine, 0, 0);
        }
        slot.animated = Boolean(animation);
        slot.first = firstInstance;
        slot.id = actor.id;
        slot.east = actor.east;
        slot.north = actor.north;
        slot.height = actor.height;
        slot.yaw = actor.yaw;
        slot.pose = pose;
        slot.stride = stride;
        slot.armPitch = armPitch;
        const firstMatrix = firstInstance * 16;
        if (updateEnd !== firstMatrix) {
          if (updateStart >= 0) mesh.instanceMatrix.addUpdateRange(updateStart, updateEnd - updateStart);
          updateStart = firstMatrix;
        }
        updateEnd = firstMatrix + count * 16;
      }
      if (recolor) {
        for (let offset = 0; offset < partCount; offset++)
          mesh.setColorAt(firstInstance + offset, palette[voxelPersonParts[offset][2]]);
        if (sledVisible) for (let offset = 0; offset < sledPartCount; offset++)
          mesh.setColorAt(firstInstance + partCount + offset, sledColors[offset]);
        slotColors[visible] = colorIndex;
        colorsChanged = true;
      }
      visible++;
      instances += count;

      if (!showNames) continue;
      head.set(actor.east, actor.height + rootOffset + headHeight, worldZ);
      if (head.distanceToSquared(viewCamera.position) > labelDistanceSquared) continue;
      const cameraZ = view[2] * head.x + view[6] * head.y + view[10] * head.z + view[14];
      if (cameraZ >= 0) continue;
      head.applyMatrix4(viewProjection);
      if (Math.abs(head.x) > 1 || Math.abs(head.y) > 1 || Math.abs(head.z) > 1) continue;
      const nameplate = labels[shownNext];
      const { label, bubble } = nameplate;
      const message = readBubble?.(actor.id, elapsedMs);
      const movedBubble = nameplate.chat !== message;
      if (movedBubble) {
        nameplate.chat = message;
        bubble.hidden = !message;
        if (message) bubble.textContent = message.text;
      }
      const fading = !!message && message.until - elapsedMs <= chatBubbleFadeMs;
      if (nameplate.fading !== fading) {
        nameplate.fading = fading;
        bubble.classList.toggle('is-fading', fading);
      }
      if (labelNames[shownNext] !== actor.name) {
        labelNames[shownNext] = actor.name;
        label.textContent = actor.name;
      }
      const px = Math.round((1 + head.x) * halfWidth);
      const py = Math.round((1 - head.y) * halfHeight);
      const moved = px !== labelX[shownNext] || py !== labelY[shownNext];
      if (moved) {
        labelX[shownNext] = px;
        labelY[shownNext] = py;
        label.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      }
      if (message && (moved || movedBubble)) bubble.style.transform = label.style.transform;
      if (shownNext >= shown) label.hidden = false;
      shownNext++;
    }

    mesh.count = instances;
    mesh.visible = instances > 0;
    if (updateStart >= 0) {
      mesh.instanceMatrix.addUpdateRange(updateStart, updateEnd - updateStart);
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finishLabels(shownNext);
  }

  return { render, clear };
}
