import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  icePalaceRiteReach, icePalaceRiteSites, type IcePalaceRite, type IcePalaceRiteState,
} from '../../../src/shared/ice-palace-rites';
import type { Box } from './landmark-kit';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

export const icePalaceRites = {
  lever: { ...icePalaceRiteSites.lever, label: '拨动引寒机关' },
  harvest: { ...icePalaceRiteSites.harvest, label: '采集冰晶片' },
  solstice: { ...icePalaceRiteSites.solstice, label: '行安雪礼' },
} as const;

type Point = readonly [x: number, y: number, z: number];
export type { IcePalaceRiteState } from '../../../src/shared/ice-palace-rites';

export type IcePalaceRiteHost = {
  read(): IcePalaceRiteState;
  /** The room validates the accepted player's current footpoint and returns only after commit. */
  request(rite: IcePalaceRite): Promise<boolean>;
};

export function mountIcePalaceRites(palace: Group, colliders: Box[]) {
  const shelf = new MeshLambertMaterial({ color: '#41677a' });
  const edge = new MeshLambertMaterial({ color: '#a5c8d3', emissive: '#2c4c5e', emissiveIntensity: .3 });
  const frost = new MeshLambertMaterial({ color: '#d9f0ee', emissive: '#6db8d1', emissiveIntensity: .18 });
  const metal = new MeshLambertMaterial({ color: '#a58e70' });
  const shadow = new MeshLambertMaterial({ color: '#28485c' });
  const ice = new MeshLambertMaterial({ color: '#7bc9da', emissive: '#36677d', emissiveIntensity: .28,
    transparent: true, opacity: .46, depthWrite: false });
  const chip = frost.clone();
  const lantern = frost.clone();
  const tileBatches = new Map<Group, Map<MeshLambertMaterial, BoxGeometry[]>>();

  function tile(parent: Group, material: MeshLambertMaterial, width: number, height: number, depth: number,
    x: number, y: number, z: number, yaw = 0) {
    let batch = tileBatches.get(parent);
    if (!batch) tileBatches.set(parent, batch = new Map());
    let pieces = batch.get(material);
    if (!pieces) batch.set(material, pieces = []);
    pieces.push(new BoxGeometry(width, height, depth).rotateY(yaw).translate(x, y, z));
  }

  function fixture(name: string, [x, y, z]: Point, width: number, height: number, depth: number) {
    const group = new Group();
    group.name = name;
    group.position.set(x, y, z);
    colliders.push({ min: [x - width / 2, y, z - depth / 2], max: [x + width / 2, y + height, z + depth / 2] });
    palace.add(group);
    return group;
  }

  const lever = fixture('引寒机关', icePalaceRites.lever.fixture, .86, 1.63, .67);
  tile(lever, shelf, .86, .15, .67, 0, .075, 0);
  tile(lever, edge, .65, .93, .48, 0, .57, 0);
  tile(lever, shelf, .78, .12, .64, 0, 1.08, 0);
  for (const x of [-.24, .24]) tile(lever, metal, .12, .17, .20, x, 1.22, 0);
  const arm = new Group();
  arm.position.set(0, 1.22, 0);
  lever.add(arm);
  tile(arm, metal, .10, .38, .10, 0, .17, 0);
  tile(arm, frost, .31, .13, .15, 0, .37, 0);
  arm.rotation.x = .55;

  const pillar = fixture('采晶冰柱', icePalaceRites.harvest.fixture, .76, 1.96, .65);
  tile(pillar, shelf, .76, .68, .65, 0, .34, 0);
  tile(pillar, edge, .63, .13, .55, 0, .72, 0);
  const prism = new Mesh(new CylinderGeometry(.26, .33, 1.18, 6), ice);
  prism.position.y = 1.37;
  pillar.add(prism);
  // Subtle, deeply embedded pieces show the silhouette only through ice. It has no textual or interaction affordance.
  tile(pillar, shadow, .135, .15, .073, -.025, 1.65, -.08);
  tile(pillar, shadow, .24, .27, .073, -.025, 1.43, -.08);
  for (const x of [-.083, .043]) tile(pillar, shadow, .075, .19, .073, x, 1.20, -.08);
  const shard = new Mesh(new CylinderGeometry(0, .13, .34, 4), chip);
  shard.position.set(.185, 1.10, .29);
  shard.rotation.z = -.28;
  pillar.add(shard);

  const altar = fixture('安雪礼仪式点', icePalaceRites.solstice.fixture, 1.32, .78, .73);
  tile(altar, shelf, 1.32, .20, .73, 0, .10, 0);
  tile(altar, edge, .98, .48, .60, 0, .40, 0);
  tile(altar, shelf, 1.33, .12, .74, 0, .69, 0);
  for (const x of [-.44, .44]) tile(altar, frost, .15, .075, .32, x, .7875, 0);
  for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
    tile(altar, lantern, .06, .018, .42, 0, .76, 0, angle);
  }
  for (const [parent, batch] of tileBatches) {
    for (const [material, pieces] of batch) {
      parent.add(new Mesh(mergeGeometries(pieces)!, material));
      for (const piece of pieces) piece.dispose();
    }
  }

  return {
    sync(state: IcePalaceRiteState) {
      arm.rotation.x = state.frozen ? -.55 : .55;
      shard.visible = state.harvestAvailable;
      lantern.emissiveIntensity = state.solsticeRite === 'completed' ? .8 : .18;
    },
  };
}

type PalaceRiteVisuals = ReturnType<typeof mountIcePalaceRites>;

export function createIcePalaceRiteActivity(palace: Group, visuals: PalaceRiteVisuals, host: IcePalaceRiteHost,
  context: Pick<TownActivityContext, 'announce'> & { notifyPickup(message: string): void },
  canStand?: (x: number, n: number, feet: number) => boolean) {
  let pending = false;
  const ready: Record<IcePalaceRite, (state: IcePalaceRiteState) => boolean> = {
    lever: state => state.leverAvailable,
    harvest: state => state.harvestAvailable,
    solstice: state => state.solsticeRite === 'ready',
  };
  const update = () => visuals.sync(host.read());
  async function use(rite: IcePalaceRite) {
    const before = host.read();
    if (pending || !ready[rite](before)) return;
    pending = true;
    try {
      if (!await host.request(rite)) {
        context.announce('现在不能进行这项交互');
        return;
      }
      const state = host.read();
      visuals.sync(state);
      if (rite === 'lever') {
        if (state.frozen === before.frozen) context.announce('引寒机关已拨动');
        else context.announce(state.frozen ? '镜湖坚冰开放' : '镜湖坚冰时段结束');
      }
      if (rite === 'harvest') context.notifyPickup('冰晶片入包');
      if (rite === 'solstice') context.announce('安雪礼已完成');
    } catch {
      context.announce('交互暂未成功');
    } finally {
      pending = false;
    }
  }

  const spots: TownActivitySpot[] = [];
  for (const rite of Object.keys(icePalaceRites) as IcePalaceRite[]) {
    const { stand, label } = icePalaceRites[rite];
    const { x, y: ground, z } = palace.localToWorld(new Vector3(...stand));
    const n = -z;
    if (canStand?.(x, n, ground) === false) continue;
    spots.push({ x, n, ground, label, range: icePalaceRiteReach, available: () => !pending && ready[rite](host.read()),
      run: () => { void use(rite); } });
  }
  update();
  return { spots, update };
}
