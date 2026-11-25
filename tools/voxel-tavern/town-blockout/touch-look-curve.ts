// Touch look sensitivity: a stored base multiplier plus a speed-based boost,
// so slow drags stay precise while a fast swipe can turn the player around.
export const touchLookSensitivityKey = 'unwritten.touch.lookSensitivity.v1';
export const touchLookSensitivityDefault = 1.4;
export const touchLookSensitivityMin = .5;
export const touchLookSensitivityMax = 2.5;
// Boost grows toward +90% as drag speed rises; the knee is in px/s.
const boostAmount = .9;
const boostKnee = 850;

let current = touchLookSensitivityDefault;
let loaded = false;

function clampSensitivity(value: number) {
  return Math.min(touchLookSensitivityMax, Math.max(touchLookSensitivityMin, value));
}

export function touchLookSensitivity(): number {
  if (!loaded) {
    loaded = true;
    try {
      const stored = Number(globalThis.localStorage?.getItem(touchLookSensitivityKey));
      if (Number.isFinite(stored) && stored > 0) current = clampSensitivity(stored);
    } catch { /* Storage is optional; the session value still applies. */ }
  }
  return current;
}

export function setTouchLookSensitivity(value: number): number {
  if (!Number.isFinite(value)) return touchLookSensitivity();
  loaded = true;
  current = clampSensitivity(value);
  try {
    globalThis.localStorage?.setItem(touchLookSensitivityKey, String(current));
  } catch { /* Keep this session's choice. */ }
  return current;
}

export function touchLookBoost(speedPxPerSecond: number): number {
  if (!(speedPxPerSecond > 0)) return 1;
  return 1 + boostAmount * (speedPxPerSecond / (speedPxPerSecond + boostKnee));
}

// Angular delta for one drag step. dx/dy are pixel deltas since the previous
// pointer position; dtMs is the elapsed time for that step.
export function touchLookDelta(dx: number, dy: number, focal: number, dtMs: number, sensitivity: number) {
  const speed = Math.hypot(dx, dy) / Math.max(1, dtMs) * 1000;
  const gain = sensitivity * touchLookBoost(speed);
  return {
    yaw: Math.atan2(dx, focal) * gain,
    pitch: Math.atan2(-dy, focal) * gain,
  };
}
