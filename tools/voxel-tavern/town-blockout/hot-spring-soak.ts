import { Vector3, type Group } from 'three';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

type PoolId = 'west' | 'east' | 'rock' | 'snow-view';
type HotSpringPool = {
  id: PoolId;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  water: 'water' | 'deepWater';
  rough?: boolean;
};

export const hotSpringPools: readonly HotSpringPool[] = [
  { id: 'west', name: '西浅汤', x: -.65, z: -9.1, width: 7.05, depth: 4.15, water: 'water' },
  { id: 'east', name: '东深汤', x: 12.08, z: -8.85, width: 7.7, depth: 4.6, water: 'deepWater' },
  { id: 'rock', name: '岩池', x: -13.4, z: -9.2, width: 7.6, depth: 4.4, water: 'water', rough: true },
  { id: 'snow-view', name: '雪见池', x: 20.2, z: -8.6, width: 3.8, depth: 3, water: 'deepWater' },
];

export const hotSpringPoolFloor = .46;
export const hotSpringOuterStep = .31;
const seatedEyeHeight = .82;
const warmSoakSeconds = 3;
const progressInterval = 250;

type SoakContext = Pick<TownActivityContext, 'sit' | 'announce'>;
type SoakOptions = {
  playerName?(): string | undefined;
  onValidSoak?(poolId: PoolId): void;
};
type SoakSession = {
  poolId: PoolId;
  dryEdge: { x: number; n: number; ground: number };
  enteredAt: number;
  feedback: HTMLDivElement;
  progress: HTMLSpanElement;
  timer: ReturnType<typeof setInterval>;
  valid: boolean;
};

function seatOffset(width: number, name?: string) {
  if (width < 6 || !name) return 0;
  let hash = 0;
  for (const char of name) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) >>> 0;
  return (hash % 3 - 1) * 1.9;
}

export function createHotSpringSoak(context: SoakContext, onSoakChange?: (active: boolean) => void, options: SoakOptions = {}) {
  let session: SoakSession | undefined;

  function updateProgress(current: SoakSession, now: number) {
    const seconds = Math.floor((now - current.enteredAt) / 1000);
    const progress = `已泡 ${seconds} 秒`;
    if (current.progress.textContent !== progress) current.progress.textContent = progress;
    if (!current.valid && seconds >= warmSoakSeconds) {
      current.valid = true;
      context.announce('泡汤达成 · 暖意入身');
      options.onValidSoak?.(current.poolId);
    }
    return seconds;
  }

  function leave() {
    if (!session) return;
    const active = session;
    session = undefined;
    clearInterval(active.timer);
    const duration = updateProgress(active, performance.now());
    onSoakChange?.(false);
    active.feedback.remove();
    active.progress.remove();
    context.announce(duration > 0 ? `泡汤 ${duration} 秒 · 带着暖意起身上岸` : '水波轻响，你起身上岸');
  }

  function spots(group: Group): TownActivitySpot[] {
    return hotSpringPools.map(pool => {
      const { x, z, depth, width } = pool;
      // Stand on the dry outer tread, facing the middle of the pool.
      const approach = group.localToWorld(new Vector3(x, hotSpringOuterStep, z + depth / 2 + .86));
      return {
        x: approach.x,
        n: -approach.z,
        ground: approach.y,
        range: .85,
        label: `入池泡汤 · ${pool.name}`,
        run() {
          if (session) return;
          const inside = group.localToWorld(new Vector3(
            x + seatOffset(width, options.playerName?.()), hotSpringPoolFloor + seatedEyeHeight, z + .8,
          ));
          const feedback = document.createElement('div');
          feedback.className = 'hot-spring-soak';
          feedback.setAttribute('aria-hidden', 'true');
          const progress = document.createElement('span');
          progress.className = 'hot-spring-progress';
          progress.textContent = '已泡 0 秒';
          document.body.append(feedback, progress);
          const current: SoakSession = {
            poolId: pool.id,
            dryEdge: { x: approach.x, n: -approach.z, ground: approach.y },
            enteredAt: performance.now(),
            feedback, progress,
            valid: false,
            timer: setInterval(() => {
              if (session === current) updateProgress(current, performance.now());
            }, progressInterval),
          };
          session = current;
          onSoakChange?.(true);
          context.sit({ x: inside.x, n: -inside.z, eyeY: inside.y, yaw: 0 });
          context.announce('蒸汽拂过水面，暖意升起。随时可以起身离开温泉。');
        },
      };
    });
  }

  return { spots, leave, active: () => session !== undefined, dryEdge: () => session?.dryEdge };
}
