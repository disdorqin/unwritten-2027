import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3, type Group } from 'three';
import type { TownActivitySpot } from './town-activity';
import type { ZodiacProgress } from './town-zodiac';

export const lighthouseSnakeStand = [-5.95, 0, 0] as const;
const parts = [
  [0, .155, 0, .27, .225, .045, '#d9ba89'],
  [0, .155, .031, .21, .169, .016, '#6b9b87'],
  [0, .32, 0, .038, .055, .028, '#c69360'],
  [-.028, .111, .043, .098, .021, .02, '#f4e2b8'],
  [.017, .139, .043, .022, .065, .02, '#f4e2b8'],
  [0, .165, .043, .06, .024, .02, '#f4e2b8'],
  [-.020, .187, .043, .023, .063, .02, '#f4e2b8'],
  [.014, .21, .043, .087, .031, .02, '#f4e2b8'],
] as const;

export function createLighthouseSnakeCharm(
  lighthouse: Group, zodiac: ZodiacProgress, celebrate: () => void,
): TownActivitySpot {
  const stand = lighthouse.localToWorld(new Vector3(...lighthouseSnakeStand));
  const charm = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), parts.length);
  charm.name = '生肖寻宝 · 蛇挂牌';
  charm.position.set(-5.49, .18, 0);
  charm.rotation.y = -Math.PI / 2;
  const matrix = new Matrix4();
  const color = new Color();
  for (const [index, [x, y, z, width, height, depth, paint]] of parts.entries()) {
    charm.setMatrixAt(index, matrix.makeScale(width, height, depth).setPosition(x, y, z));
    charm.setColorAt(index, color.set(paint));
  }
  const available = () => zodiac.canCollect('snake');
  charm.visible = available();
  lighthouse.add(charm);

  return {
    x: stand.x, n: -stand.z, ground: stand.y,
    range: .35, label: '拾取生肖挂件 · 蛇', available,
    run() {
      if (!zodiac.collect('snake')) return;
      charm.visible = false;
      celebrate();
    },
  };
}
