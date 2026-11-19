import { Vector3, type PerspectiveCamera } from 'three';
import { avatarRootOffset, type TownAvatarPose } from './town-presence-pose';

export type IcePalaceCrownOwner = {
  east: number;
  north: number;
  height: number;
  pose?: TownAvatarPose;
};

// Use the same head anchor and range as the current presence nameplates.
const headHeight = 2.13;
const visibleDistanceSquared = 40 ** 2;

export function createIcePalaceCrown(root: HTMLElement) {
  const marker = root.ownerDocument.createElement('span');
  marker.className = 'ice-palace-crown';
  marker.setAttribute('role', 'img');
  marker.setAttribute('aria-label', '冰冠');
  marker.hidden = true;
  root.append(marker);
  const head = new Vector3();
  const cameraPosition = new Vector3();
  let location: 'self' | 'peer' | undefined;
  let visible = false;
  let lastX: number | undefined;
  let lastY: number | undefined;

  function hide() {
    if (visible) marker.hidden = true;
    visible = false;
  }

  function show(next: 'self' | 'peer') {
    if (location !== next) {
      marker.classList.toggle('is-self', next === 'self');
      marker.style.transform = '';
      lastX = lastY = undefined;
      location = next;
    }
    if (!visible) marker.hidden = false;
    visible = true;
  }

  return {
    // First-person owners have no local avatar in view. Peers, including the
    // player in a third-person preview, use the head of the rendered avatar.
    render(owner: IcePalaceCrownOwner | 'self' | null, camera: PerspectiveCamera) {
      if (owner === null) { hide(); return; }
      if (owner === 'self') { show(owner); return; }

      const viewport = root.ownerDocument.defaultView;
      if (!viewport) { hide(); return; }
      camera.updateWorldMatrix(true, false);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      head.set(owner.east, owner.height + avatarRootOffset(owner.pose ?? 0) + headHeight, -owner.north);
      if (head.distanceToSquared(cameraPosition) > visibleDistanceSquared) { hide(); return; }
      head.applyMatrix4(camera.matrixWorldInverse);
      if (!(head.z < 0)) { hide(); return; }
      head.applyMatrix4(camera.projectionMatrix);
      if (!(Math.abs(head.x) <= 1 && Math.abs(head.y) <= 1 && Math.abs(head.z) <= 1)) { hide(); return; }
      const x = Math.round((1 + head.x) * viewport.innerWidth / 2);
      const y = Math.round((1 - head.y) * viewport.innerHeight / 2);
      show('peer');
      if (x === lastX && y === lastY) return;
      marker.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      lastX = x;
      lastY = y;
    },
    remove() { marker.remove(); },
  };
}
