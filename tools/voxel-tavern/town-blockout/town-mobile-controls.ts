import type { createTownSnowControls } from './town-snow-controls';

type MobileControlElements = {
  action: HTMLButtonElement;
  throwButton: HTMLButtonElement;
  wallButton: HTMLButtonElement;
  brakeButton: HTMLButtonElement;
  direction: HTMLElement;
  jump: HTMLButtonElement;
  sprint: HTMLButtonElement;
};

type ControlState = {
  mobile: boolean;
  canMove: boolean;
  driving: boolean;
  canUseSnow: boolean;
  canBuild: boolean;
  buildMode: boolean;
  action?: string;
};

export function mountTownMobileControls(
  controls: ReturnType<typeof createTownSnowControls>,
  { action, throwButton, wallButton, brakeButton, direction, jump, sprint }: MobileControlElements,
  setTouchBrake: (held: boolean) => void,
) {
  const listeners = new AbortController();
  const { signal } = listeners;
  let mobile = false;
  let driving = false;
  let canBrake = false;
  let brakePointer: number | undefined;

  function releaseBrake(pointer = brakePointer) {
    if (brakePointer === undefined || pointer !== brakePointer) return;
    brakePointer = undefined;
    setTouchBrake(false);
    brakeButton.setAttribute('aria-pressed', 'false');
    if (brakeButton.hasPointerCapture(pointer)) brakeButton.releasePointerCapture(pointer);
  }

  action.addEventListener('pointerdown', event => {
    if (!mobile || event.pointerType === 'mouse' || event.button !== 0 ||
        !controls.pressTouch(event.pointerId)) return;
    action.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, { signal });
  action.addEventListener('pointerup', event => {
    if (controls.releaseTouch(event.pointerId)) event.preventDefault();
  }, { signal });
  action.addEventListener('pointercancel', event => controls.cancelTouch(event.pointerId), { signal });
  action.addEventListener('lostpointercapture', event => controls.cancelTouch(event.pointerId), { signal });
  // Touch uses the press duration; desktop and accessible activation use click.
  action.addEventListener('click', event => {
    if (!mobile || event.detail === 0 || (event as PointerEvent).pointerType === 'mouse') controls.interact();
  }, { signal });
  action.addEventListener('contextmenu', event => { if (mobile) event.preventDefault(); }, { signal });
  throwButton.addEventListener('click', () => controls.primary(), { signal });
  wallButton.addEventListener('click', () => controls.toggleBuild(), { signal });

  brakeButton.addEventListener('pointerdown', event => {
    if (!canBrake || brakePointer !== undefined || event.button !== 0) return;
    brakePointer = event.pointerId;
    brakeButton.setPointerCapture(event.pointerId);
    brakeButton.setAttribute('aria-pressed', 'true');
    setTouchBrake(true);
    event.preventDefault();
  }, { signal });
  brakeButton.addEventListener('pointerup', event => releaseBrake(event.pointerId), { signal });
  brakeButton.addEventListener('pointercancel', event => releaseBrake(event.pointerId), { signal });
  brakeButton.addEventListener('lostpointercapture', event => releaseBrake(event.pointerId), { signal });
  brakeButton.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  const document = brakeButton.ownerDocument;
  document.defaultView?.addEventListener('blur', () => { releaseBrake(); controls.cancel(); }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { releaseBrake(); controls.cancel(); }
  }, { signal });

  brakeButton.setAttribute('aria-pressed', 'false');
  return {
    update(state: ControlState) {
      if (state.driving !== driving || state.mobile !== mobile) controls.cancel();
      ({ mobile, driving } = state);
      canBrake = mobile && driving && state.canMove;
      if (!canBrake) releaseBrake();
      const pedestrian = mobile && state.canMove && !driving;
      brakeButton.hidden = !canBrake;
      jump.hidden = sprint.hidden = !pedestrian;
      throwButton.hidden = !pedestrian || !state.canUseSnow;
      wallButton.hidden = driving || !state.canUseSnow || !state.canBuild;
      action.hidden = !state.action && !(pedestrian && state.canUseSnow);

      const label = state.action ? (mobile ? state.action : `E · ${state.action}`) : '长按采雪';
      if (action.textContent !== label) action.textContent = label;
      const primary = state.buildMode ? '放雪墙' : '投雪球';
      if (throwButton.textContent !== primary) throwButton.textContent = primary;
      const directionLabel = driving ? '驾驶摇杆' : '移动摇杆';
      if (direction.getAttribute('aria-label') !== directionLabel) direction.setAttribute('aria-label', directionLabel);
    },
    dispose() {
      listeners.abort();
      releaseBrake();
      controls.cancel();
    },
  };
}
