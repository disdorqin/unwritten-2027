import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3, type Group } from 'three';
import type { TavernRoosterSill } from './landmark-tavern';
import type { TownActivitySpot } from './town-activity';
import type { ZodiacProgress } from './town-zodiac';
import type { createWindowActivity } from './town-window';

export const tavernRoosterClues = [
  '哈哈，你问那只金鸡？它呀，躲在我酒馆二楼的窗台外头，檐下报晓。你上去探探身——先把脚站稳了，窗台窄。',
  '酒旗底下那扇窗，鸡就蹲在外沿上。你喝完一杯上楼去，推窗先别探头太猛——吓跑了它，我可不负责。',
] as const;

const roosterParts = [
  [0, .11, .175, .118, '#d49b4b'],
  [.065, .196, .083, .094, '#edba65'],
  [.068, .252, .071, .039, '#b74432'],
  [.118, .198, .038, .032, '#f0b148'],
  [-.097, .148, .073, .084, '#a56d43'],
  [-.135, .201, .046, .079, '#755447'],
  [-.045, .031, .028, .058, '#b57239'],
  [.038, .031, .028, .058, '#b57239'],
] as const;

export function createTavernRoosterCharm(
  tavern: Group,
  windows: Pick<ReturnType<typeof createWindowActivity>, 'isOpen'>,
  zodiac: ZodiacProgress,
  canStand: (x: number, n: number, ground: number) => boolean,
  celebrate: () => void,
): TownActivitySpot | undefined {
  const reveal = tavern.userData.roosterSill as TavernRoosterSill | undefined;
  if (!reveal) return;
  const approach = tavern.localToWorld(new Vector3(...reveal.approach));
  const x = approach.x, n = -approach.z, ground = approach.y;
  if (!canStand(x, n, ground)) return;

  const rooster = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), roosterParts.length);
  rooster.name = '生肖寻宝 · 鸡挂牌';
  rooster.position.set(...reveal.sill);
  const transform = new Matrix4();
  const color = new Color();
  roosterParts.forEach(([dx, y, width, height, paint], index) => {
    rooster.setMatrixAt(index, transform.makeScale(width, height, .036).setPosition(dx, y, 0));
    rooster.setColorAt(index, color.set(paint));
  });
  rooster.visible = zodiac.canCollect('rooster');
  tavern.add(rooster);

  const available = () => windows.isOpen(reveal.window) && zodiac.canCollect('rooster');
  return {
    x, n, ground, range: .43, label: '拾取生肖挂件 · 鸡', available,
    run() {
      if (!available() || !zodiac.collect('rooster')) return;
      rooster.visible = false;
      celebrate();
    },
  };
}
