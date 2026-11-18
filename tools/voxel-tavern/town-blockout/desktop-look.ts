export type DesktopLookLockFailure = 'unsupported' | 'rejected' | 'error';

export interface DesktopLookCallbacks {
  onLockFailed?: (reason: DesktopLookLockFailure) => void;
  onLockChange?: (locked: boolean) => void;
}

export function createDesktopLook(
  canvas: HTMLCanvasElement,
  allowed: () => boolean,
  turn: (yawDelta: number, pitchDelta: number) => void,
  callbacks: DesktopLookCallbacks = {},
) {
  const doc = canvas.ownerDocument;
  const radiansPerPixel = .003;
  const requestTimeoutMs = 1500;
  let drag: { id: number; x: number; y: number } | undefined;
  let requestPending = false;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseRequested = false;
  let locked = false;

  function stopDrag() {
    const pointer = drag;
    drag = undefined;
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
  }
  function release() {
    stopDrag();
    releaseRequested = true;
    if (doc.pointerLockElement === canvas) doc.exitPointerLock();
  }
  function clearRequest() {
    requestPending = false;
    if (requestTimer !== undefined) {
      clearTimeout(requestTimer);
      requestTimer = undefined;
    }
  }
  function fail(reason: DesktopLookLockFailure) {
    clearRequest();
    callbacks.onLockFailed?.(reason);
  }
  function engage() {
    if (doc.pointerLockElement === canvas || requestPending) return;
    if (!canvas.requestPointerLock) {
      callbacks.onLockFailed?.('unsupported');
      return;
    }
    releaseRequested = false;
    requestPending = true;
    // Some browsers neither settle a promise nor fire an event when a request
    // is ignored; without this timer requestPending would latch for the page.
    requestTimer = setTimeout(clearRequest, requestTimeoutMs);
    try {
      void canvas.requestPointerLock()?.catch(() => fail('rejected'));
    } catch {
      fail('rejected');
    }
  }
  function rotate(dx: number, dy: number) {
    if ((dx || dy) && allowed()) turn(dx * radiansPerPixel, -dy * radiansPerPixel);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !allowed() ||
        doc.pointerLockElement === canvas) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    engage();
  });

  canvas.addEventListener('pointermove', event => {
    if (doc.pointerLockElement === canvas || drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    rotate(dx, dy);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, event => {
      if (drag?.id === event.pointerId) stopDrag();
    });
  }

  doc.addEventListener('mousemove', event => {
    if (doc.pointerLockElement === canvas) rotate(event.movementX, event.movementY);
  });
  doc.addEventListener('pointerlockchange', () => {
    clearRequest();
    const nowLocked = doc.pointerLockElement === canvas;
    if (nowLocked !== locked) {
      locked = nowLocked;
      callbacks.onLockChange?.(nowLocked);
    }
    if (!nowLocked) return;
    stopDrag();
    if (releaseRequested || !allowed()) doc.exitPointerLock();
  });
  doc.addEventListener('pointerlockerror', () => fail('error'));
  doc.defaultView?.addEventListener('blur', release);
  return { release, engage };
}
