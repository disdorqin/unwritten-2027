import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Vector3, type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { icePalaceRiteReach } from '../../../src/shared/ice-palace-rites';
import type { Box } from './landmark-kit';
import type { TownActivitySpot } from './town-activity';

export const icePalaceFragmentSite = {
  id: 'ice-palace-coil-fragment',
  stand: [.35, .12, -5.47],
  fragment: [.35, .12, -6.47],
  label: '拾取船件碎片',
} as const;

type Target = Readonly<{ id: typeof icePalaceFragmentSite.id; object: Group }>;
export type IcePalaceFragmentPickupHost = Readonly<{
  present(id: Target['id']): boolean;
  isTargeted(target: Target): boolean;
  /** Resolve true after the source is consumed and one item has entered the existing ZB-22 bag. */
  pickUpOne(id: Target['id']): Promise<boolean>;
}>;

export function mountIcePalaceWreckage(palace: Group, colliders: Box[]) {
  const group = new Group();
  group.name = '霜封残骸堆';
  group.position.set(.1, .12, -8.26);
  palace.add(group);
  colliders.push({ min: [-1.77, .12, -9.47], max: [1.97, 1.20, -7.01] });

  const steel = new MeshLambertMaterial({ color: '#44545b' });
  const alloy = new MeshLambertMaterial({ color: '#799397' });
  const oxide = new MeshLambertMaterial({ color: '#755e4c' });
  const rime = new MeshLambertMaterial({ color: '#a8c8ce', emissive: '#2b5968', emissiveIntensity: .28 });
  const parts = new Map<MeshLambertMaterial, BufferGeometry[]>();
  function part(material: MeshLambertMaterial, geometry: BufferGeometry, x: number, y: number, z: number) {
    const pieces = parts.get(material);
    if (pieces) pieces.push(geometry.translate(x, y, z));
    else parts.set(material, [geometry.translate(x, y, z)]);
  }
  function panel(material: MeshLambertMaterial, width: number, height: number, depth: number,
    x: number, y: number, z: number, yaw = 0, lean = 0) {
    part(material, new BoxGeometry(width, height, depth).rotateZ(lean).rotateY(yaw), x, y, z);
  }

  panel(steel, 3.61, .16, 2.38, 0, .09, 0);
  panel(oxide, 1.33, .44, .72, -1.05, .33, .17, .15);
  panel(steel, 1.62, .61, 1.34, .65, .45, -.30, -.26);
  panel(alloy, 1.52, .08, 1.36, .65, .78, -.30, -.26);
  panel(alloy, 1.22, .11, .67, -.97, .52, .70, -.24, .33);
  panel(rime, 1.40, .10, .28, -.93, .61, .61, -.24, .33);
  panel(steel, .54, .29, .25, 1.23, .27, .90, .21);
  panel(rime, 1.46, .10, .38, .64, .87, -.53, -.26);
  panel(rime, .48, .32, .54, -1.54, .18, -.76, -.17);
  panel(rime, .26, .41, .42, 1.56, .22, .36, .14);
  for (const x of [-1.28, -1.01, -.74]) {
    part(oxide, new CylinderGeometry(.18, .18, 1.25, 8).rotateX(Math.PI / 2), x, .91, -.27);
    part(alloy, new CylinderGeometry(.215, .215, .13, 8).rotateX(Math.PI / 2), x, .91, .35);
  }
  for (const x of [0.33, .56, .79, 1.02]) panel(steel, .14, .06, .69, x, .84, -.23, -.26);
  for (const [material, pieces] of parts) {
    group.add(new Mesh(mergeGeometries(pieces)!, material));
    for (const piece of pieces) piece.dispose();
  }

  const fragment = new Group();
  fragment.name = '可捡的裂边合金片';
  fragment.position.set(...icePalaceFragmentSite.fragment);
  fragment.rotation.y = -.38;
  const brokenPlate = new Mesh(new BoxGeometry(.44, .13, .25), alloy);
  brokenPlate.position.y = .09;
  const edge = new Mesh(new BoxGeometry(.21, .07, .16), rime);
  edge.position.set(.11, .175, -.018);
  const bolt = new Mesh(new CylinderGeometry(.037, .037, .04, 6), oxide);
  bolt.position.set(-.124, .173, .054);
  fragment.add(brokenPlate, edge, bolt);
  palace.add(fragment);
  return fragment;
}

export function createIcePalaceFragmentActivity(palace: Group, fragment: Group, host: IcePalaceFragmentPickupHost,
  notifyPickup: (message: string) => void, canStand?: (x: number, n: number, feet: number) => boolean) {
  const { x, y: ground, z } = palace.localToWorld(new Vector3(...icePalaceFragmentSite.stand));
  const n = -z;
  if (canStand?.(x, n, ground) === false) return;
  const target = { id: icePalaceFragmentSite.id, object: fragment };
  let pending = false;
  const update = () => { fragment.visible = host.present(target.id); };
  const available = () => !pending && host.present(target.id) && host.isTargeted(target);
  async function collect() {
    if (!available()) return;
    pending = true;
    try {
      if (await host.pickUpOne(target.id)) notifyPickup('船件碎片 ×1');
    } catch { /* The bag controls pickup admission. */ }
    finally {
      pending = false;
      update();
    }
  }
  update();
  const spot: TownActivitySpot = {
    x, n, ground, range: icePalaceRiteReach, label: icePalaceFragmentSite.label, available,
    run() { void collect(); },
  };
  return { spot, update };
}
