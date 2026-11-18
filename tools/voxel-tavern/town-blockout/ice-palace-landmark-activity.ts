import { Vector3, type Group, type Mesh } from 'three';
import { playIcePalaceBell } from '../tower-chime';
import { createIcePalaceActivity, type IcePalaceDoor, type IcePalacePoint } from './ice-palace-activity';
import { icePalaceDoorBounds, icePalaceInteriorAnchors } from './ice-palace-expansion';
import { icePalaceForecourtGrotto } from './ice-palace-forecourt';
import { createIcePalaceTowerRace } from './ice-palace-race';
import type { TownActivityContext } from './town-activity';

type ActivityOptions = NonNullable<Parameters<typeof createIcePalaceActivity>[3]>;
type State = ReturnType<ReturnType<typeof createIcePalaceActivity>['state']>;
type CastleBanquetSeat = { stand: IcePalacePoint; seat: IcePalacePoint; yaw: number };

type CastleActivityOptions = ActivityOptions & {
  warmFromDrink?(): void;
  onToast?(durationMs: number): void;
  canStand?(x: number, n: number, ground: number): boolean;
};

type Forecourt = Group & { userData: { grottoVisuals?: { update(state: State): void } } };

let palaceAudio: AudioContext | undefined;

function soundBell(note: 'low' | 'mid' | 'high') {
  if (typeof AudioContext === 'undefined') return;
  try {
    palaceAudio ??= new AudioContext();
    const context = palaceAudio;
    if (context.state === 'running') playIcePalaceBell(context, note);
    else void context.resume().then(() => playIcePalaceBell(context, note), () => {});
  } catch { /* The on-screen bell cue is always available. */ }
}

export function createIcePalaceLandmarkActivity(
  castle: Group, context: Pick<TownActivityContext, 'announce' | 'sit'>, options: CastleActivityOptions = {},
) {
  const panels = castle.userData.palaceDoorPanels as Partial<Record<IcePalaceDoor, Mesh>>;
  const forecourt = castle.userData.palaceForecourt as Forecourt | undefined;
  const banquetSeats = castle.userData.palaceBanquetSeats as readonly CastleBanquetSeat[];
  const towerRace = createIcePalaceTowerRace(icePalaceInteriorAnchors.towerFinish, options.storage, options.now);
  const updateVisuals = (state: State) => {
    for (const name of Object.keys(panels) as IcePalaceDoor[]) {
      const panel = panels[name];
      if (panel) panel.visible = !state.doors[name];
    }
    forecourt?.userData.grottoVisuals?.update(state);
    options.stateChanged?.(state);
  };
  const activity = createIcePalaceActivity(castle, {
    ...icePalaceInteriorAnchors,
    ...icePalaceForecourtGrotto,
    stairExit: [6.65, .12, -10.65],
    doors: { ...icePalaceDoorBounds, grotto: icePalaceForecourtGrotto.door },
  }, context, { bellSound: soundBell, ...options, towerRace, stateChanged: updateVisuals });

  function fromLocal([east, height, z]: IcePalacePoint) {
    const point = castle.localToWorld(new Vector3(east, height, z));
    return { x: point.x, n: -point.z, ground: point.y };
  }

  for (const { stand, seat, yaw } of banquetSeats) {
    const at = fromLocal(stand);
    if (options.canStand?.(at.x, at.n, at.ground) === false) continue;
    const sit = fromLocal(seat);
    activity.spots.push({
      ...at, label: '在宫殿长桌就座', range: .9,
      run() { context.sit({ x: sit.x, n: sit.n, eyeY: sit.ground, yaw }); },
    });
  }

  const clock = options.now ?? Date.now;
  let drinkReady = -Infinity;
  const drinkStand = castle.userData.palaceBanquetDrinkStand as IcePalacePoint;
  const at = fromLocal(drinkStand);
  if (options.canStand?.(at.x, at.n, at.ground) !== false) {
    activity.spots.push({
      ...at, range: .8, label: '取一杯宫殿热饮',
      available: () => clock() >= drinkReady,
      run() {
        const now = clock();
        if (now < drinkReady) return;
        drinkReady = now + 60_000;
        options.warmFromDrink?.();
        options.onToast?.(2_500);
        context.announce('喝一口热饮，暖意入身');
      },
    });
  }
  updateVisuals(activity.state());
  return activity;
}
