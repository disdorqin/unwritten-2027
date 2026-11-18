import { Vector3, type Group } from 'three';
import { createIcePalacePuzzles, palaceBlockPushScale } from './ice-palace-puzzles';
import { createIceThrone } from './ice-palace-throne';
import type { IcePalaceRace } from './ice-palace-race';
import type { Box } from './landmark-kit';
import type { TownActivity, TownActivityContext, TownActivitySpot, TownSeat } from './town-activity';

export type IcePalacePoint = readonly [x: number, y: number, z: number];
export type IcePalaceDoor = 'grotto' | 'throne' | 'gallery' | 'mirror' | 'stair' | 'vault';
type Lever = 'pine' | 'sailboat' | 'lighthouse';
type Bell = 'low' | 'mid' | 'high';
type SnowBlock = { home: IcePalacePoint; target: IcePalacePoint };

export type IcePalaceActivityAnchors = {
  plate: IcePalacePoint;
  key: IcePalacePoint;
  throneDoor: IcePalacePoint;
  throneSeat: IcePalacePoint;
  levers: Record<Lever, IcePalacePoint>;
  mirrors: readonly [IcePalacePoint, IcePalacePoint];
  bells: Record<Bell, IcePalacePoint>;
  vaultLever: IcePalacePoint;
  stairExit?: IcePalacePoint;
  vaultExit: IcePalacePoint;
  vaultFinish: IcePalacePoint;
  blocks: readonly [SnowBlock, SnowBlock, SnowBlock];
  doors?: Partial<Record<IcePalaceDoor, Box>>;
};

type IcePalacePlayer = {
  x: number; n: number; ground: number; grounded: boolean;
  seated?: TownSeat | null;
};
type PuzzleState = ReturnType<ReturnType<typeof createIcePalacePuzzles>['state']>;
export type IcePalaceActivityState = PuzzleState & {
  platePressed: boolean;
  nearPalace: boolean;
  crowned: boolean;
  doors: Record<IcePalaceDoor, boolean>;
  blockPositions: readonly IcePalacePoint[];
};
type IcePalaceActivityOptions = {
  now?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  stateChanged?(state: IcePalaceActivityState): void;
  bellSound?(note: Bell): void;
  rejected?(): void;
  throneChanged?(owned: boolean): void;
  playerName?(): string;
  towerRace?: IcePalaceRace;
  onRaceStatus?(status: string): void;
};

const leverNames = { pine: '雪松', sailboat: '帆船', lighthouse: '冰灯塔' };
const bellNames = { low: '低声冰钟', mid: '中声冰钟', high: '高声冰钟' };
const walkSpeed = 7.5;
const blockHalfWidth = .6;
const bodyRadius = .27;
const plateRadius = .55;
const plateHeightTolerance = .45;

function nearPlate([x, y, z]: IcePalacePoint, [px, py, pz]: IcePalacePoint) {
  return Math.abs(y - py) <= plateHeightTolerance && Math.hypot(x - px, z - pz) <= plateRadius;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function createIcePalaceActivity(
  group: Group, anchors: IcePalaceActivityAnchors, context: Pick<TownActivityContext, 'announce'>,
  options: IcePalaceActivityOptions = {},
) {
  const now = options.now ?? Date.now;
  const puzzles = createIcePalacePuzzles(options.storage ?? browserStorage());
  const origin = group.getWorldPosition(new Vector3());
  const scratch = new Vector3();
  const worldPoint = (point: IcePalacePoint) => group.localToWorld(scratch.set(...point));
  const spots: TownActivitySpot[] = [];
  const doors = Object.entries(anchors.doors ?? {}) as [IcePalaceDoor, Box][];
  let nearPalace = false;
  let platePressed = false;
  let seated = false;
  let raceStatus = '';
  let playerInStairRoom = false;
  let stairExitUntil = 0;
  const throne = createIceThrone(owned => {
    const playerName = options.playerName?.().trim();
    context.announce(owned ? `${playerName || '你'} 登临冰雪王座` : '冰雪之主退位，王座空悬');
    options.throneChanged?.(owned);
  });

  function worldLocation(point: IcePalacePoint) {
    const world = worldPoint(point);
    return { x: world.x, n: -world.z, ground: world.y };
  }

  function add(point: IcePalacePoint, label: string, range: number, available: () => boolean, action: () => void) {
    const spot: TownActivitySpot = {
      ...worldLocation(point), label, range, available,
      run() {
        if (!available()) return;
        action();
        publish();
      },
    };
    spots.push(spot);
    return spot;
  }

  const blocks = anchors.blocks.map(({ home, target }) => {
    const position: [number, number, number] = [...home];
    const distance = Math.hypot(target[0] - home[0], target[1] - home[1], target[2] - home[2]);
    const block = { position, fraction: 0, direction: 0, spot: undefined as TownActivitySpot | undefined };
    block.spot = add(home, '推雪块', 1.2, () => distance > 0 && !block.direction, () => {
      block.direction = block.fraction === 0 ? 1 : -1;
      context.announce(block.fraction === 0 ? '把雪块推向凹位' : '把雪块推回原处');
    });
    return { position, home, target, distance, motion: block };
  });

  function doorStates(time: number, progress: PuzzleState): Record<IcePalaceDoor, boolean> {
    return {
      grotto: puzzles.plateOpen(time), throne: progress.throneRoom, gallery: progress.gallery,
      mirror: progress.mirrorCache, stair: progress.stairOpen || time < stairExitUntil, vault: progress.vaultOpen || progress.vaultExitOpen,
    };
  }

  function state(time = now()): IcePalaceActivityState {
    const progress = puzzles.state(time);
    return {
      ...progress, nearPalace, platePressed, crowned: throne.owned(), doors: doorStates(time, progress),
      blockPositions: blocks.map(({ position }) => [...position] as const),
    };
  }

  function publish() {
    if (options.stateChanged) options.stateChanged(state());
  }

  add(anchors.key, '拾取冰钥匙', 1.05, () => !puzzles.state(now()).key, () => {
    context.announce(puzzles.collectKey(now()) ? '取得冰钥匙' : '石窟门锁着，先压下压力板');
  });
  add(anchors.throneDoor, '以冰钥匙开启', 1.2, () => !puzzles.state(now()).throneRoom, () => {
    context.announce(puzzles.openThroneRoom() ? '王座后的密室已打开' : '先去迷宫取得冰钥匙');
  });
  for (const name of Object.keys(anchors.levers) as Lever[]) {
    add(anchors.levers[name], `拉下${leverNames[name]}拉杆`, .95,
      () => { const { throneRoom, gallery } = puzzles.state(now()); return throneRoom && !gallery; }, () => {
        const result = puzzles.pullGalleryLever(name);
        if (result === 'reset') options.rejected?.();
        context.announce(result === 'opened' ? '画廊密室已打开' : result === 'reset' ? '拉杆已复位，按展品铭牌顺序再试' : '拉杆已扣住');
      });
  }
  for (const index of [0, 1] as const) {
    add(anchors.mirrors[index], `转动冰镜 ${index === 0 ? 'A' : 'B'}`, .95,
      () => { const { gallery, mirrorCache } = puzzles.state(now()); return gallery && !mirrorCache; }, () => {
        const setting = puzzles.rotateMirror(index);
        context.announce(puzzles.state(now()).mirrorCache ? '光束照亮靶晶，内龛已开启' : `冰镜转至第 ${setting} 档`);
      });
  }
  for (const note of Object.keys(anchors.bells) as Bell[]) {
    add(anchors.bells[note], `敲响${bellNames[note]}`, 1, () => puzzles.state(now()).mirrorCache, () => {
      options.bellSound?.(note);
      const result = puzzles.ringBell(note, now());
      if (result === 'reset') options.rejected?.();
      context.announce(result === 'opened' ? '塔梯下方的密室开启，十分钟后合上' : result === 'reset' ? '钟序未对，三口钟可以重敲' : '冰钟响起');
    });
  }
  if (anchors.stairExit) add(anchors.stairExit, '从内侧开启塔梯密室', .8,
    () => playerInStairRoom && !puzzles.state(now()).stairOpen, () => {
      stairExitUntil = now() + 1_500;
      context.announce('塔梯密室出口打开');
    });
  add(anchors.vaultLever, '拉杆开启宝物间', 1.05, () => puzzles.state(now()).stairOpen, () => {
    if (puzzles.pullVaultLever(now())) context.announce('宝物间外门开启二十秒');
  });
  add(anchors.vaultExit, '从内侧开启出口', 1, () => true, () => {
    puzzles.openVaultExit(now());
    context.announce('出口已打开');
  });
  add(anchors.vaultFinish, '用冰钥匙完成宫殿寻宝', 1.2, () => !puzzles.state(now()).completed, () => {
    context.announce(puzzles.finishVault(now()) ? '完成宫殿寻宝' : '需持冰钥匙并在限时外门合上前验钥');
  });

  function playerNear(x: number, n: number) {
    return Math.abs(x - origin.x) <= 34 && Math.abs(n + origin.z) <= 36;
  }

  function step(dt: number, player?: IcePalacePlayer) {
    const time = now();
    const wasNear = nearPalace;
    const localPlayer = player && playerNear(player.x, player.n) ? player : undefined;
    nearPalace = localPlayer !== undefined;
    if (!nearPalace && !wasNear && !throne.owned()) return;

    if (localPlayer) for (const { motion, home, target, distance } of blocks) {
      if (!motion.direction || dt <= 0) continue;
      // A push stays in its designated groove so it cannot obstruct the maze's main corridor.
      const fraction = motion.fraction + motion.direction * walkSpeed * palaceBlockPushScale * dt / distance;
      motion.fraction = Math.max(0, Math.min(1, fraction));
      for (const axis of [0, 1, 2] as const) motion.position[axis] = home[axis] + (target[axis] - home[axis]) * motion.fraction;
      Object.assign(motion.spot!, worldLocation(motion.position));
      if (motion.fraction === 0 || motion.fraction === 1) motion.direction = 0;
    }

    let nextRaceStatus = '';
    let playerOnPlate = false;
    playerInStairRoom = false;
    if (localPlayer) {
      const point = group.worldToLocal(scratch.set(localPlayer.x, localPlayer.ground, -localPlayer.n));
      const stair = anchors.doors?.stair;
      playerInStairRoom = !!stair && localPlayer.grounded && point.x < stair.min[0] - .05 &&
        point.z >= stair.min[2] && point.z <= stair.max[2] && Math.abs(point.y - stair.min[1]) <= .55;
      playerOnPlate = localPlayer.grounded && nearPlate([point.x, point.y, point.z], anchors.plate);
      if (!localPlayer.seated) {
        nextRaceStatus = options.towerRace?.update(point.x, point.y, point.z, localPlayer.grounded) ?? '';
      } else options.towerRace?.cancel();
    } else options.towerRace?.cancel();
    if (nextRaceStatus !== raceStatus) {
      raceStatus = nextRaceStatus;
      options.onRaceStatus?.(raceStatus);
    }
    const blockOnPlate = blocks.some(({ position }) => nearPlate(position, anchors.plate));
    platePressed = playerOnPlate || blockOnPlate;
    puzzles.setPlateContact(time, playerOnPlate, blockOnPlate);
    const seat = worldLocation(anchors.throneSeat);
    seated = nearPalace && !!player?.seated && Math.abs(player.seated.eyeY - seat.ground) <= .3 &&
      Math.hypot(player.seated.x - seat.x, player.seated.n - seat.n) <= .4;
    throne.update(time, seated);
    publish();
  }

  function blocked(x: number, n: number, ground: number) {
    if (!playerNear(x, n)) return false;
    const feet = group.worldToLocal(scratch.set(x, ground, -n));
    const intersects = ([min, max]: [readonly number[], readonly number[]]) => feet.y + .025 < max[1] &&
      feet.y + 1.775 > min[1] &&
      Math.hypot(Math.max(min[0] - feet.x, feet.x - max[0], 0), Math.max(min[2] - feet.z, feet.z - max[2], 0)) < bodyRadius;
    const time = now();
    const open = doorStates(time, puzzles.state(time));
    if (doors.some(([door, { min, max }]) => !open[door] && intersects([min, max]))) return true;
    return blocks.some(({ position: [bx, by, bz] }) => intersects([
      [bx - blockHalfWidth, by, bz - blockHalfWidth], [bx + blockHalfWidth, by + 1.2, bz + blockHalfWidth],
    ]));
  }

  return {
    spots, blocked, step, state,
    confirmedHit() {
      throne.receiveConfirmedHit(seated);
      publish();
    },
  } satisfies TownActivity & { step: typeof step; state: typeof state; confirmedHit(): void };
}
