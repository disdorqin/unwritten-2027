import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3, type Camera } from 'three';
import type { createTownRailway } from './town-railway';
import type { ZodiacProgress } from './town-zodiac';

const horseParts = [
  [0, -.028, 0, .267, .147, .06, '#9b633c'],
  [.031, .071, .002, .085, .107, .06, '#bd8550'],
  [.09, .097, .005, .118, .059, .062, '#bd8550'],
  [.025, .146, .002, .036, .039, .052, '#754936'],
  [-.108, -.117, .003, .038, .062, .052, '#8a5638'],
  [.085, -.117, .003, .042, .062, .052, '#8a5638'],
  [.079, .109, .04, .015, .015, .01, '#f6d9a3'],
  [-.131, -.012, .002, .055, .074, .041, '#704131'],
  [.024, .10, .178, .034, .036, .37, '#a18664'],
] as const;
export const railHorseClues = [
  '那匹马不在马厩，在车上。环镇列车进站，你上车往车厢里走——座位底下、车厢连接处，都留神看看。',
  '骏马日行千里，靠的是这趟车。跨年期间随便坐，不用票。坐下之前，先低头看看你的座位底下。',
] as const;

const reachSquared = 3.3 ** 2;
const gazeSquared = Math.cos(Math.PI * 25 / 180) ** 2;

export function createRailHorseCharm(
  railway: Pick<ReturnType<typeof createTownRailway>, 'coachCharmAnchor' | 'riding'>,
  zodiac: ZodiacProgress,
  celebrate: () => void,
) {
  const charm = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), horseParts.length);
  charm.name = '生肖寻宝 · 马挂牌';
  const transform = new Matrix4();
  const tint = new Color();
  horseParts.forEach(([x, y, z, w, h, d, paint], index) => {
    charm.setMatrixAt(index, transform.makeScale(w, h, d).setPosition(x, y, z));
    charm.setColorAt(index, tint.set(paint));
  });
  charm.visible = zodiac.canCollect('horse');
  railway.coachCharmAnchor.add(charm);

  const toCharm = new Vector3();
  const direction = new Vector3();
  return {
    visibleTo(camera: Camera) {
      if (!railway.riding || !charm.visible) return false;
      charm.getWorldPosition(toCharm);
      camera.getWorldPosition(direction);
      toCharm.sub(direction);
      const distanceSquared = toCharm.lengthSq();
      if (distanceSquared > reachSquared) return false;
      camera.getWorldDirection(direction);
      const forward = direction.dot(toCharm);
      return forward > 0 && forward ** 2 >= distanceSquared * gazeSquared;
    },
    action: {
      label: '拾取生肖挂件 · 马',
      run() {
        if (!railway.riding || !zodiac.collect('horse')) return;
        charm.visible = false;
        celebrate();
      },
    },
  };
}
