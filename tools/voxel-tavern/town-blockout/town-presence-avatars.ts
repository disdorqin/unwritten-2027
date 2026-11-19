import { sharedHomeLayer } from '../../../src/presence/shared-home-space';
import { BoxGeometry, Color, DynamicDrawUsage, Frustum, InstancedMesh, Matrix4, MeshLambertMaterial,
  Sphere, Vector3, type PerspectiveCamera, type Scene } from 'three';
import { chatBubbleFadeMs, type TownChatBubble } from './town-chat';
import { voxelPersonParts, type VoxelPersonPart } from './town-voxel-person';
import { avatarRootOffset, writeAvatarPart, type TownAvatarPose } from './town-presence-pose';
import { createRemoteSledCues, createSledAnimation } from './sled-animation';
import { createSledRiderMatrices, writeSledRiderPart, writeSledShellPart } from './sled-rider-pose';
import { remoteSledParts } from './sled-visuals';
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

type ReadBubble = (id: number, now: number) => TownChatBubble | undefined;

export function createPresenceAvatars(scene: Scene, camera: PerspectiveCamera,
  heightAt: (east: number, north: number) => number = () => 0): {
  render(actors: readonly PresenceAvatarActor[], readBubble?: ReadBubble, view?: PerspectiveCamera, showNames?: boolean): void;
  clear(): void;
  setHighlight(id: number | null): void;
} {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), capacity * partCount);
  mesh.name = 'town-presence-avatars';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const matrices = mesh.instanceMatrix.array as Float32Array;
  const matrixSlots = Array.from({ length: capacity }, () => ({
    id: -1, east: 0, north: 0, height: 0, yaw: 0, pose: 0, stride: 0, armPitch: 0,
  }));
  // The mesh spans the town. Test individual body bounds before packing the instance buffer.
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  mesh.layers.enable(sharedHomeLayer);
  scene.add(mesh);

  // Pose 7 (sledding) remote sleds: one extra instanced mesh for the sled
  // shells; the rider's body parts are written into the main mesh through the
  // sled rider pose matrices. Per-actor animation state infers speed/turn from
  // position samples (createRemoteSledCues), like the B3b review candidate.
  const sledPartCount = remoteSledParts.length;
  const sledMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), capacity * sledPartCount);
  sledMesh.name = 'town-presence-sleds';
  sledMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const sledMatrices = sledMesh.instanceMatrix.array as Float32Array;
  sledMesh.frustumCulled = false;
  sledMesh.visible = false;
  sledMesh.count = 0;
  sledMesh.layers.enable(sharedHomeLayer);
  for (let slot = 0; slot < capacity; slot++) {
    for (let k = 0; k < sledPartCount; k++) {
      sledMesh.setColorAt(slot * sledPartCount + k, new Color(remoteSledParts[k][2]));
    }
  }
  if (sledMesh.instanceColor) sledMesh.instanceColor.needsUpdate = true;
  scene.add(sledMesh);
  const sledStates = new Map<number, {
    anim: ReturnType<typeof createSledAnimation>;
    cues: ReturnType<typeof createRemoteSledCues>;
  }>();

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
  const labelHolder = new Array<boolean>(capacity).fill(false);
  let highlightId: number | null = null;
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
    sledMesh.count = 0;
    sledMesh.visible = false;
    sledStates.clear();
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
    let sledVisible = 0;
    const seenSled = new Set<number>();
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
      const recolor = colorIndex !== slotColors[visible];
      const progress = (elapsedMs - (actor.throwGestureStarted ?? -Infinity)) / 350;
      const armPitch = progress >= 0 && progress < 1 ? -1.55 * Math.sin(Math.PI * progress) : 0;
      const stride = actor.stride ?? 0;
      let sledFrame: ReturnType<ReturnType<typeof createSledAnimation>['step']> | undefined;
      const sledding = pose === 7 || pose === 8;
      if (sledding) {
        seenSled.add(actor.id);
        let state = sledStates.get(actor.id);
        if (!state) {
          state = { anim: createSledAnimation(heightAt), cues: createRemoteSledCues(heightAt) };
          sledStates.set(actor.id, state);
        }
        state.cues.observe({ east: actor.east, north: actor.north, height: actor.height, yaw: actor.yaw, time: elapsedMs });
        sledFrame = state.anim.step(1 / 60, {
          mounted: true, east: actor.east, north: actor.north, height: actor.height, yaw: actor.yaw,
          speed: state.cues.speed, turn: state.cues.turn, braking: state.cues.braking, airborne: state.cues.airborne,
          drifting: pose === 8,
        });
        createSledRiderMatrices(actor.east, actor.height + rootOffset, actor.north, actor.yaw, sledFrame);
        const sledFirst = sledVisible * sledPartCount;
        for (let k = 0; k < sledPartCount; k++) {
          const part = remoteSledParts[k];
          writeSledShellPart(sledMatrices, (sledFirst + k) * 16, [part[0], part[1], 0] as VoxelPersonPart);
        }
        sledVisible++;
      }
      const slot = matrixSlots[visible];
      const dirty = sledding || slot.id !== actor.id || slot.east !== actor.east || slot.north !== actor.north ||
        slot.height !== actor.height || slot.yaw !== actor.yaw || slot.pose !== pose ||
        slot.stride !== stride || slot.armPitch !== armPitch;
      const firstInstance = visible * partCount;
      if (dirty) {
        for (let offset = 0; offset < partCount; offset++) {
          if (sledFrame) {
            writeSledRiderPart(matrices, (firstInstance + offset) * 16, voxelPersonParts[offset], sledFrame);
          } else {
            writeAvatarPart(matrices, (firstInstance + offset) * 16, voxelPersonParts[offset], pose,
              actor.east, actor.height + rootOffset, worldZ, cosine, sine, stride, armPitch);
          }
        }
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
        updateEnd = firstMatrix + partCount * 16;
      }
      if (recolor) for (let offset = 0; offset < partCount; offset++) {
        mesh.setColorAt(firstInstance + offset, palette[voxelPersonParts[offset][2]]);
      }
      if (recolor) {
        slotColors[visible] = colorIndex;
        colorsChanged = true;
      }
      visible++;

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
      const holder = highlightId !== null && actor.id === highlightId;
      if (labelHolder[shownNext] !== holder) {
        labelHolder[shownNext] = holder;
        label.classList.toggle('is-bell-holder', holder);
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

    mesh.count = visible * partCount;
    mesh.visible = visible > 0;
    sledMesh.count = sledVisible * sledPartCount;
    sledMesh.visible = sledVisible > 0;
    if (sledVisible) sledMesh.instanceMatrix.needsUpdate = true;
    for (const id of sledStates.keys()) if (!seenSled.has(id)) sledStates.delete(id);
    if (updateStart >= 0) {
      mesh.instanceMatrix.addUpdateRange(updateStart, updateEnd - updateStart);
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finishLabels(shownNext);
  }

  return {
    render, clear,
    setHighlight(id: number | null) { highlightId = id; },
  };
}
