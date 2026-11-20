import { BoxGeometry, Color, InstancedMesh, MeshLambertMaterial, Object3D, type Group } from 'three';
import { undergroundCampPickaxe, type UndergroundCampPickaxeResult } from '../../../src/shared/underground-camp-pickaxe';
import { createUndergroundCampInteractions } from './underground-camp-interactions';
import { mountUndergroundCampLighting } from './underground-camp-lighting';
import { createUndergroundCampRemains } from './underground-camp-remains';

type CampOptions = Parameters<typeof createUndergroundCampRemains>[0];
type CampActions = Parameters<typeof createUndergroundCampInteractions>[0];
type Point = ReturnType<typeof createUndergroundCampRemains>['recovery'];

type Options = CampOptions & {
  parent: Group;
  actions: Omit<CampActions, 'camp' | 'walker'>;
  /** Host-owned offerings. Camp lifetime and inventory follow the existing world policy. */
  readLights(): { litNicheIds: ReadonlySet<string>; extraCampLightCount: number; remainingBudget: number };
  pickaxe: {
    available(): boolean;
    aimedAt(point: Point): boolean;
    claim(siteId: typeof undergroundCampPickaxe.siteId): Promise<UndergroundCampPickaxeResult>;
    showPickupNotice(): void;
  };
};

const pickaxePrompt = {
  id: undergroundCampPickaxe.siteId,
  kind: 'pickaxe',
  targetId: undergroundCampPickaxe.siteId,
  label: '捡起旧铁镐',
} as const;
const noLights: ReadonlySet<string> = new Set();

export function mountUndergroundCampScene({ parent, actions, readLights, pickaxe, ...layout }: Options) {
  const camp = createUndergroundCampRemains(layout);
  const lights = mountUndergroundCampLighting(camp.lighting);
  const interactions = createUndergroundCampInteractions({ ...actions, camp, walker: layout.walker });
  const [x, tableHeight, z] = camp.dining.tables[1].position;
  const aim: Point = [x, tableHeight + .033, z + 1.06];
  const approach: Point = [x, tableHeight - .77, z + 1.91];
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const parts = [
    { x: 0, z: -.01, size: [.044, .055, .48], color: '#74573c' },
    { x: 0, z: -.21, size: [.052, .059, .083], color: '#55432f' },
    { x: 0, z: .24, size: [.20, .066, .070], color: '#747779' },
    { x: -.13, z: .218, size: [.082, .059, .047], color: '#5b5e60' },
    { x: .135, z: .222, size: [.083, .049, .045], color: '#595b5d' },
  ];
  const tool = new InstancedMesh(geometry, material, parts.length);
  tool.name = undergroundCampPickaxe.siteId;
  const pose = new Object3D();
  for (const [index, piece] of parts.entries()) {
    pose.position.set(piece.x, -(.066 - piece.size[1]) / 2, piece.z);
    pose.scale.fromArray(piece.size);
    pose.updateMatrix();
    tool.setMatrixAt(index, pose.matrix);
    tool.setColorAt(index, new Color(piece.color));
  }
  tool.position.fromArray(aim);
  tool.computeBoundingBox();
  tool.computeBoundingSphere();
  camp.group.add(tool);
  parent.add(camp.group);
  let disposed = false;
  let pending = false;
  let taken = false;

  function footing() {
    if (disposed) return;
    const at = actions.readFooting();
    if (at?.every(Number.isFinite)) return at;
  }

  function canCollect(at: Point) {
    return !taken && pickaxe.available() && !interactions.snapshot().seatedRoomId &&
      Math.hypot(at[0] - aim[0], at[2] - aim[2]) <= undergroundCampPickaxe.horizontalReach &&
      Math.abs(at[1] - approach[1]) <= undergroundCampPickaxe.verticalReach &&
      Math.abs((camp.queryPassage(at[0], at[2], layout.walker.radius, layout.walker.standingHeight)?.floor ?? Infinity) - approach[1]) <= .002 &&
      pickaxe.aimedAt(aim);
  }

  function prompt() {
    const at = footing();
    if (!at || pending) return;
    return canCollect(at) ? pickaxePrompt : interactions.prompt();
  }

  function update() {
    if (disposed) return;
    interactions.update();
    const active = footing() !== undefined;
    camp.group.visible = active;
    tool.visible = active && !taken && pickaxe.available();
    if (active) {
      const { litNicheIds, extraCampLightCount, remainingBudget } = readLights();
      lights.sync(litNicheIds, extraCampLightCount, remainingBudget);
    } else {
      lights.sync(noLights, 0, 0);
    }
  }

  update();
  return {
    pickaxeSite: { id: undergroundCampPickaxe.siteId, aim, approach },
    camp,
    queryPassage(x: number, z: number, radius: number, height: number) {
      const passage = layout.mine.queryPassage(x, z, radius, height);
      return passage?.zone === 'camp' ? camp.queryPassage(x, z, radius, height) : passage;
    },
    prompt,
    async press(expectedId: string) {
      if (!expectedId || prompt()?.id !== expectedId) return 'unavailable' as const;
      pending = true;
      try {
        if (expectedId !== pickaxePrompt.id) return await interactions.press(expectedId);
        const result = await pickaxe.claim(pickaxePrompt.id);
        if (result !== 'rejected') {
          taken = true;
          if (result === 'granted' && footing()) pickaxe.showPickupNotice();
        }
        return result;
      } finally {
        pending = false;
        update();
      }
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      interactions.cancelSeat();
      lights.dispose();
      tool.removeFromParent();
      tool.dispose();
      geometry.dispose();
      material.dispose();
      camp.dispose();
    },
  };
}
