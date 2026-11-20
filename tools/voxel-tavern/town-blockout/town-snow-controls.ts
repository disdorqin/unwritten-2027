export const snowGatherHoldMilliseconds = 150;
export const snowGatherSeconds = .8;

type SnowControlHost = {
  canUseSnow(): boolean;
  canGather(): boolean;
  gather(): void;
  canInteract(): boolean;
  interact(): void;
  throwSnowball(): void;
  buildMode(): boolean;
  setBuildMode(enabled: boolean): boolean;
  placeWall(): void;
  now?: () => number;
};

export function createTownSnowControls(host: SnowControlHost) {
  const now = host.now ?? (() => performance.now());
  let hold: { pointer: number | undefined; started: number } | undefined;
  let gatherElapsed = 0;
  let gathering = false;

  function cancel() {
    hold = undefined;
    gatherElapsed = 0;
    gathering = false;
  }

  function begin(pointer?: number) {
    if (hold) return false;
    hold = { pointer, started: now() };
    return true;
  }

  function primary() {
    if (hold || !host.canUseSnow()) return false;
    if (host.buildMode()) host.placeWall();
    else host.throwSnowball();
    return true;
  }

  function toggleBuild() {
    if (!host.canUseSnow()) return false;
    return host.setBuildMode(!host.buildMode());
  }

  function finish(pointer?: number) {
    if (!hold || hold.pointer !== pointer) return false;
    const shortPress = now() - hold.started < snowGatherHoldMilliseconds;
    cancel();
    if (!shortPress) return true;
    if (pointer !== undefined) primary();
    else if (host.canInteract()) host.interact();
    return true;
  }

  return {
    keyDown(code: string, repeat: boolean) {
      if (code === 'KeyB') {
        if (!repeat) toggleBuild();
        return true;
      }
      if (code !== 'KeyE' || !(host.canUseSnow() || host.canInteract())) return false;
      if (!repeat) begin();
      return true;
    },
    keyUp(code: string) { return code === 'KeyE' && finish(); },
    pressTouch(pointer: number) { return host.canUseSnow() && begin(pointer); },
    releaseTouch(pointer: number) { return finish(pointer); },
    cancelTouch(pointer: number) { if (hold?.pointer === pointer) cancel(); },
    primary,
    toggleBuild,
    cancel,
    update(dt: number) {
      const heldSeconds = hold ? (now() - hold.started - snowGatherHoldMilliseconds) / 1000 : -1;
      gathering = heldSeconds >= 0 && host.canUseSnow() && host.canGather();
      if (!gathering) {
        gatherElapsed = 0;
        return;
      }
      if (!Number.isFinite(dt) || dt <= 0) return;
      gatherElapsed += Math.min(dt, heldSeconds);
      if (gatherElapsed >= snowGatherSeconds) {
        gatherElapsed %= snowGatherSeconds;
        host.gather();
      }
    },
    gatherProgress() { return gathering ? gatherElapsed / snowGatherSeconds : undefined; },
  };
}

export function bindTownSnowButtons(
  controls: ReturnType<typeof createTownSnowControls>,
  snow: HTMLButtonElement,
  build: HTMLButtonElement,
) {
  const listeners = new AbortController();
  const { signal } = listeners;
  snow.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !controls.pressTouch(event.pointerId)) return;
    snow.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, { signal });
  snow.addEventListener('pointerup', event => {
    if (controls.releaseTouch(event.pointerId)) event.preventDefault();
  }, { signal });
  snow.addEventListener('pointercancel', event => controls.cancelTouch(event.pointerId), { signal });
  snow.addEventListener('lostpointercapture', event => controls.cancelTouch(event.pointerId), { signal });
  // Pointer activation is fully decided by the press. Keyboard and assistive technology use click.
  snow.addEventListener('click', event => { if (event.detail === 0) controls.primary(); }, { signal });
  snow.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  build.addEventListener('click', () => controls.toggleBuild(), { signal });
  return () => {
    listeners.abort();
    controls.cancel();
  };
}
