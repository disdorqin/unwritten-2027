import { Vector3, type Group } from 'three';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

type HotSpringPool = {
  x: number;
  z: number;
  width: number;
  depth: number;
  water: 'water' | 'deepWater';
};

export const hotSpringPools: readonly HotSpringPool[] = [
  { x: -.65, z: -9.1, width: 7.05, depth: 4.15, water: 'water' },
  { x: 12.08, z: -8.85, width: 7.7, depth: 4.6, water: 'deepWater' },
];

export const hotSpringPoolFloor = .46;
export const hotSpringOuterStep = .31;
const seatedEyeHeight = .82;

type SoakContext = Pick<TownActivityContext, 'sit' | 'announce'>;

export function createHotSpringSoak(context: SoakContext) {
  let feedback: HTMLDivElement | undefined;
  let enteredAt: number | undefined;

  function leave() {
    if (enteredAt === undefined) return;
    const duration = Math.floor((performance.now() - enteredAt) / 1000);
    enteredAt = undefined;
    feedback?.remove();
    feedback = undefined;
    context.announce(duration > 0 ? `泡汤 ${duration} 秒 · 带着暖意起身上岸` : '水波轻响，你起身上岸');
  }

  function spots(group: Group): TownActivitySpot[] {
    return hotSpringPools.map(({ x, z, depth }) => {
      // Stand on the dry outer tread, facing the middle of the pool.
      const approach = group.localToWorld(new Vector3(x, hotSpringOuterStep, z + depth / 2 + .86));
      const inside = group.localToWorld(new Vector3(x, hotSpringPoolFloor + seatedEyeHeight, z + .8));
      return {
        x: approach.x,
        n: -approach.z,
        ground: approach.y,
        range: .85,
        label: '入池泡汤',
        run() {
          if (enteredAt !== undefined) return;
          enteredAt = performance.now();
          context.sit({ x: inside.x, n: -inside.z, eyeY: inside.y, yaw: 0 });
          feedback = document.createElement('div');
          feedback.className = 'hot-spring-soak';
          feedback.setAttribute('aria-hidden', 'true');
          document.body.append(feedback);
          context.announce('蒸汽拂过水面，暖意升起。随时可以起身离开温泉。');
        },
      };
    });
  }

  return { spots, leave, active: () => enteredAt !== undefined };
}
