import type { Object3D } from 'three';
import {
  isMineCartSnapshot, nextMineCartStep, type MineCartDirection, type MineCartPush, type MineCartSnapshot,
  type UndergroundMineCartTrack,
} from '../../../src/shared/underground-mine-cart-track';
import type { TownActivitySpot } from './town-activity';
import { createUndergroundMineCartModel } from './underground-mine-cart-model';

type RollPoint = Readonly<{ layer: string; x: number; y: number; z: number }>;
type Options = Readonly<{
  parent: Object3D;
  track: UndergroundMineCartTrack;
  domainId: string;
  pushReach: number;
  rollSeconds: number;
  requestPush(request: MineCartPush): void;
  onRoll?(point: RollPoint): void;
}>;

/** The host supplies presence snapshots and keeps ownership of input, audio and scene lifetime. */
export function mountUndergroundMineCartActivity(options: Options) {
  const { parent, track, domainId, pushReach, rollSeconds } = options;
  if (!domainId.trim() || ![pushReach, rollSeconds].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('The mine cart needs a domain, a push reach and a positive roll duration');
  }
  const model = createUndergroundMineCartModel();
  const { group } = model;
  group.rotation.set(track.slope, track.heading, 0, 'YXZ');
  group.visible = false;
  parent.add(group);

  let state: MineCartSnapshot | undefined;
  let renderedStep = 0;
  let disposed = false;

  const directions = [-1, 1] as const;
  const spots = directions.map((direction): TownActivitySpot => ({
    x: 0, n: 0, ground: 0, range: pushReach, label: '推空矿车',
    available: () => group.visible && state !== undefined && nextMineCartStep(state.step, direction) !== undefined,
    run() {
      if (!group.visible || !state || nextMineCartStep(state.step, direction) === undefined) return;
      options.requestPush({ direction, revision: state.revision });
    },
  }));

  function updateSpots(step: MineCartSnapshot['step']) {
    directions.forEach((direction: MineCartDirection, index) => {
      const foot = track.approach(step, direction);
      Object.assign(spots[index], { x: foot.east, n: foot.north, ground: foot.height });
    });
  }

  function drawAt(step: number) {
    renderedStep = step;
    const at = track.point(step);
    group.position.set(at.east, at.height, -at.north);
    model.setWheelTravel(step / 2 * track.length);
  }

  return {
    group,
    spots,
    sync(snapshot: MineCartSnapshot, activeDomain?: string) {
      if (disposed || !isMineCartSnapshot(snapshot)) return;
      const wasVisible = group.visible;
      group.visible = activeDomain === domainId;
      const previous = state;
      if (!state || snapshot.revision > state.revision) {
        state = { ...snapshot };
        updateSpots(state.step);
      }
      if (!wasVisible || !group.visible || !previous) {
        drawAt(state.step);
      } else if (previous.step !== state.step) {
        const mid = track.point((renderedStep + state.step) / 2);
        options.onRoll?.({ layer: domainId, x: mid.east, y: mid.height, z: -mid.north });
      }
    },
    update(dt: number) {
      if (disposed || !group.visible || !state || !Number.isFinite(dt) || dt <= 0) return;
      const difference = state.step - renderedStep;
      if (difference === 0) return;
      drawAt(renderedStep + Math.sign(difference) * Math.min(Math.abs(difference), dt / rollSeconds));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.visible = false;
      model.dispose();
    },
  };
}
