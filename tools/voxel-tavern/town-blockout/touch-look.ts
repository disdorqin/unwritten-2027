const verticalFov = 58 * Math.PI / 180;
const lookThreshold = 5;
const tapLimit = 380;

export function createTouchLook(
  canvas: HTMLCanvasElement,
  allowed: () => boolean,
  turn: (yawDelta: number, pitchDelta: number) => void,
  viewPitch: () => number = () => 0,
  hold?: { delay: number; start(): void; finish(milliseconds: number): boolean; cancel(): void },
) {
  let gesture: {
    pointer: number; startX: number; startY: number; x: number; y: number; started: number; dragged: boolean;
    holdCancelled: boolean;
  } | undefined;

  function reset() {
    const previous = gesture?.pointer;
    if (previous !== undefined) hold?.cancel();
    gesture = undefined;
    if (previous !== undefined && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
  }

  function pointAngles(clientX: number, clientY: number) {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    const focal = Math.max(1, height) / (2 * Math.tan(verticalFov / 2));
    const offsetX = clientX - left - width / 2;
    const offsetY = top + height / 2 - clientY;
    const pitch = viewPitch();
    const forward = focal * Math.cos(pitch) - offsetY * Math.sin(pitch);
    const up = focal * Math.sin(pitch) + offsetY * Math.cos(pitch);
    return {
      yaw: Math.atan2(offsetX, forward),
      pitch: Math.atan2(up, Math.hypot(forward, offsetX)) - pitch,
    };
  }

  function drag(event: PointerEvent) {
    if (!gesture) return;
    const { clientX: x, clientY: y } = event;
    if (!gesture.dragged && Math.hypot(x - gesture.startX, y - gesture.startY) < lookThreshold) return;
    // A quick swipe is look-only. Once a deliberate hold starts, the same finger can aim.
    if (!gesture.dragged && hold && event.timeStamp - gesture.started < hold.delay) {
      gesture.holdCancelled = true;
      hold.cancel();
    }
    gesture.dragged = true;
    const { height } = canvas.getBoundingClientRect();
    const focal = Math.max(1, height) / (2 * Math.tan(verticalFov / 2));
    const yaw = Math.atan2(x - gesture.x, focal);
    const pitch = Math.atan2(gesture.y - y, focal);
    gesture.x = x;
    gesture.y = y;
    if (yaw || pitch) turn(yaw, pitch);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || gesture || !allowed()) return;
    gesture = {
      pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, started: event.timeStamp, dragged: false, holdCancelled: false,
    };
    canvas.setPointerCapture(event.pointerId);
    hold?.start();
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    if (!allowed()) { reset(); return; }
    drag(event);
  });
  canvas.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    if (allowed()) {
      drag(event);
      const heldFor = event.timeStamp - gesture.started;
      const usedHold = !gesture.holdCancelled && hold?.finish(heldFor);
      if (!gesture.dragged && !usedHold && heldFor <= tapLimit) {
        const { yaw, pitch } = pointAngles(event.clientX, event.clientY);
        if (yaw || pitch) turn(yaw, pitch);
      }
    }
    reset();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      if ((event as PointerEvent).pointerId === gesture?.pointer) reset();
    });
  }
  return { reset };
}
