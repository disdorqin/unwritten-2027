export function createDesktopLook(
  canvas: HTMLCanvasElement,
  allowed: () => boolean,
  turn: (yawDelta: number, pitchDelta: number) => void,
) {
  const doc = canvas.ownerDocument;
  const radiansPerPixel = .003;
  let drag: { id: number; x: number; y: number } | undefined;
  let requestPending = false;
  let releaseRequested = false;

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
    if (!canvas.requestPointerLock || requestPending) return;
    releaseRequested = false;
    requestPending = true;
    try {
      void canvas.requestPointerLock()?.catch(clearRequest);
    } catch {
      clearRequest();
    }
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
    if (doc.pointerLockElement !== canvas) return;
    stopDrag();
    if (releaseRequested || !allowed()) doc.exitPointerLock();
  });
  doc.addEventListener('pointerlockerror', clearRequest);
  doc.defaultView?.addEventListener('blur', release);
  return { release };
}
