const forwardEntry = .72;
const forwardExit = .45;
const firstPushLimit = 320;
const secondPushWindow = 440;
// A locked or held sprint button counts as sprinting once the stick is
// pushed at least this far forward, so jump taps cannot drop the sprint.
const buttonSprintForward = .3;
const sprintHoldDelay = 300;

export function createTouchWalk(pad: HTMLElement, sprintButton?: HTMLButtonElement) {
  const nub = pad.firstElementChild as HTMLElement;
  const coarse = matchMedia('(pointer: coarse)');
  let touchSeen = false;
  let allowed = false;
  let pointer: number | undefined;
  let originX = 0;
  let originY = 0;
  let forwardSince: number | undefined;
  let lastShortPush: number | undefined;
  let sprinting = false;
  let sprintLock = false;
  let sprintPressing = false;
  let sprintHeld = false;
  let sprintTimer: ReturnType<typeof setTimeout> | undefined;
  const axes = { right: 0, forward: 0 };

  function syncSprintButton() {
    if (!sprintButton) return;
    sprintButton.setAttribute('aria-pressed', String(sprintLock));
    sprintButton.classList.toggle('sprint-locked', sprintLock);
    sprintButton.classList.toggle('sprint-held', sprintHeld);
  }
  function clearSprintPress() {
    sprintPressing = false;
    sprintHeld = false;
    if (sprintTimer !== undefined) clearTimeout(sprintTimer);
    sprintTimer = undefined;
  }
  if (sprintButton) {
    sprintButton.addEventListener('pointerdown', event => {
      if (!allowed || sprintPressing) return;
      sprintPressing = true;
      sprintButton.setPointerCapture(event.pointerId);
      sprintTimer = setTimeout(() => {
        if (!sprintPressing) return;
        sprintHeld = true;
        syncSprintButton();
      }, sprintHoldDelay);
      event.preventDefault();
    });
    sprintButton.addEventListener('pointerup', event => {
      if (!sprintPressing) return;
      const wasHeld = sprintHeld;
      clearSprintPress();
      // A short tap toggles the lock; a long press was momentary and never toggles.
      if (!wasHeld) sprintLock = !sprintLock;
      syncSprintButton();
      event.preventDefault();
    });
    sprintButton.addEventListener('pointercancel', () => {
      clearSprintPress();
      syncSprintButton();
    });
    syncSprintButton();
  }

  function clearPointer() {
    const previous = pointer;
    pointer = undefined;
    axes.right = axes.forward = 0;
    nub.style.transform = '';
    if (previous !== undefined && pad.hasPointerCapture(previous)) pad.releasePointerCapture(previous);
  }
  function reset() {
    forwardSince = undefined;
    lastShortPush = undefined;
    sprinting = false;
    sprintLock = false;
    clearSprintPress();
    syncSprintButton();
    clearPointer();
  }
  function endForward(now: number) {
    if (forwardSince === undefined) return;
    lastShortPush = !sprinting && now - forwardSince <= firstPushLimit ? now : undefined;
    forwardSince = undefined;
    sprinting = false;
  }
  function updateSprint(now: number) {
    if (axes.forward < forwardExit) endForward(now);
    if (axes.forward < forwardEntry || forwardSince !== undefined) return;
    sprinting = lastShortPush !== undefined && now - lastShortPush <= secondPushWindow;
    forwardSince = now;
    lastShortPush = undefined;
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
    updateSprint(event.timeStamp);
    nub.style.transform = `translate(${axes.right * radius}px, ${-axes.forward * radius}px)`;
  });
  pad.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    endForward(event.timeStamp);
    clearPointer();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    pad.addEventListener(type, event => {
      if ((event as PointerEvent).pointerId === pointer) reset();
    });
  }
  updateVisibility();
  return { axes, reset, get sprinting() {
    return sprinting || ((sprintLock || sprintHeld) && axes.forward > buttonSprintForward);
  }, get sprintLocked() { return sprintLock; }, active: () => coarse.matches || touchSeen, setAllowed(value: boolean) {
    if (allowed === value) return;
    allowed = value;
    updateVisibility();
  } };
}
