import { Color, Object3D, type InstancedMesh } from 'three';
import { soulMayorTalkRange, type SoulMayorView } from '../../../src/shared/soul-mayor';
import type { StarStoneLocation } from '../../../src/shared/zodiac-star-stones';
import type { TownActivityContext, TownActivitySpot } from './town-activity';
import { voxelPersonParts, type VoxelPersonPart } from './town-voxel-person';

const parts: readonly VoxelPersonPart[] = [
  ...voxelPersonParts,
  [[-.398, 1.455, .015], [.17, .024, .21], 8],
  [[.385, 1.454, -.024], [.13, .022, .16], 8],
];
export const soulMayorCapacity = parts.length;
const palette = ['#d4ccbd', '#546267', '#526b71', '#d9d7c8', '#424b53', '#697d7d', '#c3b791', '#768184', '#e9eef0'];

export type SoulMayorClient = Readonly<{
  /** Read the cached private view for this connection. */
  view(): SoulMayorView | undefined;
  receiveInvitation(): Promise<void>;
}>;

function samePoint(a?: StarStoneLocation, b?: StarStoneLocation) {
  return a === b || !!a && !!b && a.layer === b.layer && a.east === b.east && a.north === b.north && a.height === b.height;
}

export function createSoulMayorActivity(
  batch: InstancedMesh, context: Pick<TownActivityContext, 'open' | 'face'>, host: SoulMayorClient,
) {
  const pose = new Object3D();
  const color = new Color();
  let actorBefore: StarStoneLocation | undefined;
  let talkBefore: StarStoneLocation | undefined;
  let startBefore = -1;
  let heading: HTMLElement | undefined;
  let openAt: StarStoneLocation | undefined;
  let receive: HTMLButtonElement | undefined;
  let pending = false;

  function syncPanel(view?: SoulMayorView) {
    if (!heading?.isConnected) return;
    if (!view || !samePoint(openAt, view.site.talk)) {
      heading.closest('dialog')?.close();
      heading = undefined;
      receive = undefined;
      return;
    }
    const text = view.invited ? `星石收集令 · ${view.ringCount}/12` : '星石收集令';
    if (heading.textContent !== text) heading.textContent = text;
    if (receive) {
      receive.hidden = view.invited;
      receive.disabled = pending || view.invited;
    }
  }

  const spot: TownActivitySpot = {
    x: 0, n: 0, ground: 0, range: soulMayorTalkRange, label: '与镇长交谈',
    available: () => !!talkBefore && samePoint(talkBefore, host.view()?.site.talk),
    run() {
      const view = host.view();
      if (!view || !samePoint(talkBefore, view.site.talk)) return;
      const { actor, talk } = view.site;
      context.face(actor.east, actor.north, actor.height + 1.61);
      const panel = context.open('镇长', ' ');
      openAt = talk;
      heading = document.createElement('p');
      receive = document.createElement('button');
      receive.type = 'button';
      receive.textContent = '接受邀请';
      receive.onclick = async () => {
        const current = host.view();
        if (pending || !current || current.invited || !samePoint(openAt, current.site.talk)) return;
        pending = true;
        syncPanel(current);
        try { await host.receiveInvitation(); }
        catch { /* The authoritative offer remains available to retry. */ }
        finally {
          pending = false;
          syncPanel(host.view());
        }
      };
      panel.append(heading, receive);
      syncPanel(view);
    },
  };

  function update(start: number) {
    const view = host.view();
    syncPanel(view);
    const actor = view?.site.actor;
    const talk = view?.site.talk;
    batch.count = actor ? start + soulMayorCapacity : start;
    if (start === startBefore && samePoint(actor, actorBefore) && samePoint(talk, talkBefore)) return false;
    startBefore = start;
    actorBefore = actor;
    talkBefore = talk;
    if (!actor || !talk) return false;
    spot.x = talk.east;
    spot.n = talk.north;
    spot.ground = talk.height;
    const yaw = Math.atan2(talk.east - actor.east, actor.north - talk.north);
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    parts.forEach(([[x, y, z], size, tint], index) => {
      pose.position.set(actor.east + x * cosine + z * sine, actor.height + y, -actor.north - x * sine + z * cosine);
      pose.rotation.set(0, yaw, 0);
      pose.scale.set(...size);
      pose.updateMatrix();
      batch.setMatrixAt(start + index, pose.matrix);
      batch.setColorAt(start + index, color.set(palette[tint]));
    });
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    return true;
  }

  return { spot, update };
}
