import { createIceTreasureDelivery, iceTreasureDeliveryGateCount } from '../../../src/shared/ice-treasure';
import { lakeSkateGates, lakeSkateStation } from './lake-skate-course';

type Point = { x: number; n: number };
type DeliveryEvent = { kind: 'gate'; passed: number } | { kind: 'post' } | { kind: 'finish'; ms: number };

export const bellDeliveryReturnRadius = 3;
export const bellDeliveryGateHalfWidth = 1;
const playerRadius = .27;

function gateContact(index: number, before: Point, after: Point) {
  const gate = lakeSkateGates[index];
  const previousGate = index === 0 ? lakeSkateStation : lakeSkateGates[index - 1];
  const dx = gate.x - previousGate.x;
  const dn = gate.n - previousGate.n;
  const length = Math.hypot(dx, dn);
  const east = dx / length;
  const north = dn / length;
  const signedDistance = (point: Point) => (point.x - gate.x) * east + (point.n - gate.n) * north;
  const a = signedDistance(before), b = signedDistance(after);
  if (a >= 0 || b < 0) return;
  const ratio = -a / (b - a);
  const x = before.x + (after.x - before.x) * ratio;
  const n = before.n + (after.n - before.n) * ratio;
  const side = Math.abs((n - gate.n) * east - (x - gate.x) * north);
  if (side <= bellDeliveryGateHalfWidth - playerRadius) return 'through';
  if (side <= bellDeliveryGateHalfWidth + .2 + playerRadius) return 'post';
}

export function createLakeBellDelivery(now: () => number) {
  const timer = createIceTreasureDelivery(now);
  let active = false;
  let previous: Point | undefined;
  let stumble = 0;

  function stop() {
    timer.cancel();
    active = false;
    previous = undefined;
    stumble = 0;
  }

  function onPosition(x: number, n: number, dt: number, groundedSkating: boolean): DeliveryEvent | undefined {
    if (!active || !Number.isFinite(dt) || dt <= 0) return;
    if (!groundedSkating) {
      previous = undefined;
      return;
    }
    const before = previous;
    const after = { x, n };
    previous = after;
    if (stumble > 0) {
      stumble = Math.max(0, stumble - dt);
      return;
    }
    if (!before) return;
    const next = timer.passedGates();
    if (next === iceTreasureDeliveryGateCount) {
      if (Math.hypot(x - lakeSkateStation.x, n - lakeSkateStation.n) > bellDeliveryReturnRadius) return;
      const ms = timer.returnToRing(true);
      if (ms === undefined) return;
      stop();
      return { kind: 'finish', ms };
    }
    const contact = gateContact(next, before, after);
    if (contact === 'post') {
      stumble = .5;
      return { kind: 'post' };
    }
    if (contact === 'through' && timer.passGate(next + 1, true)) return { kind: 'gate', passed: next + 1 };
  }

  return {
    start() {
      if (!timer.start(true)) return false;
      active = true;
      return true;
    },
    stop,
    onPosition,
    active: () => active,
    stalled: () => stumble > 0,
  };
}
