export function createTouchWalk(pad: HTMLElement) {
  const nub = pad.firstElementChild as HTMLElement;
  const coarse = matchMedia('(pointer: coarse)');
  let touchSeen = false;
  let allowed = false;
  let pointer: number | undefined;
  let originX = 0;
  let originY = 0;
  const axes = { right: 0, forward: 0 };

  function reset() {
    const previous = pointer;
    pointer = undefined;
    axes.right = axes.forward = 0;
    nub.style.transform = '';
    if (previous !== undefined && pad.hasPointerCapture(previous)) pad.releasePointerCapture(previous);
  }
  function updateVisibility() {
    const touch = coarse.matches || touchSeen;
    document.body.classList.toggle('touch-play', touch);
    const hidden = !touch || !allowed;
    if (hidden && !pad.hidden) reset();
    if (pad.hidden !== hidden) pad.hidden = hidden;
  }
  coarse.addEventListener('change', updateVisibility);
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || touchSeen) return;
    touchSeen = true;
    updateVisibility();
  }, true);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  pad.addEventListener('pointerdown', event => {
    if (pointer !== undefined || !allowed || event.button !== 0) return;
    pointer = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    pad.setPointerCapture(pointer);
    event.preventDefault();
  });
  pad.addEventListener('pointermove', event => {
    if (pointer !== event.pointerId) return;
    const dx = event.clientX - originX;
    const dy = event.clientY - originY;
    const distance = Math.hypot(dx, dy);
    const radius = 34;
    const magnitude = Math.min(1, Math.max(0, (distance - 5) / (radius - 5)));
    const scale = distance > 0 ? magnitude / distance : 0;
    axes.right = dx * scale;
    axes.forward = -dy * scale;
    nub.style.transform = `translate(${axes.right * radius}px, ${-axes.forward * radius}px)`;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(type, event => {
      if ((event as PointerEvent).pointerId === pointer) reset();
    });
  }
  updateVisibility();
  return { axes, reset, active: () => coarse.matches || touchSeen, setAllowed(value: boolean) {
    if (allowed === value) return;
    allowed = value;
    updateVisibility();
  } };
}
