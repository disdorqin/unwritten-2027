export type DesktopLookLockFailure = 'unsupported' | 'rejected' | 'error';

export interface DesktopLookCallbacks {
  onLockFailed?: (reason: DesktopLookLockFailure) => void;
  onLockChange?: (locked: boolean) => void;
  /** A deliberate left tap while Pointer Lock is unavailable. */
  onFallbackPrimary?: () => void;
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
  const tapRadius = 5;
  const tapLimitMs = 380;
  let drag: {
    id: number; x: number; y: number; tap?: { x: number; y: number; started: number };
  } | undefined;
  let requestPending = false;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseRequested = false;
  let locked = false;
  let fallbackReady = false;

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
    fallbackReady = callbacks.onFallbackPrimary !== undefined && doc.pointerLockElement !== canvas;
    callbacks.onLockFailed?.(reason);
  }
  function engage() {
    if (doc.pointerLockElement === canvas || requestPending) return;
    fallbackReady = false;
    if (drag) drag.tap = undefined;
    if (!canvas.requestPointerLock) {
      fail('unsupported');
      return;
    }
    releaseRequested = false;
    requestPending = true;
    // Some browsers neither settle a promise nor fire an event when a request
    // is ignored; without this timer requestPending would latch for the page.
    const timer = setTimeout(() => {
      if (callbacks.onFallbackPrimary) fail('error');
      else clearRequest();
    }, requestTimeoutMs);
    requestTimer = timer;
    try {
      void canvas.requestPointerLock()?.catch(() => {
        if (requestTimer === timer) fail('rejected');
      });
    } catch {
      fail('rejected');
    }
  }
  function rotate(dx: number, dy: number) {
    if ((dx || dy) && allowed()) turn(dx * radiansPerPixel, -dy * radiansPerPixel);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !allowed() || (drag && callbacks.onFallbackPrimary) ||
        doc.pointerLockElement === canvas) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    // The gesture that attempted to acquire Pointer Lock never performs a world action.
    if (fallbackReady && !requestPending) {
      drag.tap = { x: event.clientX, y: event.clientY, started: event.timeStamp };
    } else engage();
  });

  canvas.addEventListener('pointermove', event => {
    if (doc.pointerLockElement === canvas || drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const tap = drag.tap;
    if (tap && (Math.hypot(drag.x - tap.x, drag.y - tap.y) > tapRadius || !allowed())) drag.tap = undefined;
    rotate(dx, dy);
  });
  canvas.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    const tap = drag.tap;
    stopDrag();
    if (!tap || event.button !== 0 || !fallbackReady || requestPending ||
        doc.pointerLockElement === canvas || !allowed()) return;
    const duration = event.timeStamp - tap.started;
    if (duration >= 0 && duration <= tapLimitMs &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= tapRadius) callbacks.onFallbackPrimary?.();
  });
  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
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
    fallbackReady = false;
    stopDrag();
    if (releaseRequested || !allowed()) doc.exitPointerLock();
  });
  doc.addEventListener('pointerlockerror', () => fail('error'));
  doc.defaultView?.addEventListener('blur', release);
  return { release, engage };
}
