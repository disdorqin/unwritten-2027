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
    if (!host.canUseSnow()) return false;
    if (host.buildMode()) host.placeWall();
    else host.throwSnowball();
    return true;
  }

  function toggleBuild() {
    if (!host.canUseSnow()) return false;
    return host.setBuildMode(!host.buildMode());
  }

  function interact() {
    if (!host.canInteract()) return false;
    host.interact();
    return true;
  }

  function finish(pointer?: number) {
    if (!hold || hold.pointer !== pointer) return false;
    const shortPress = now() - hold.started < snowGatherHoldMilliseconds;
    cancel();
    if (shortPress) interact();
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
    pressTouch(pointer: number) { return (host.canInteract() || host.canUseSnow()) && begin(pointer); },
    releaseTouch(pointer: number) { return finish(pointer); },
    cancelTouch(pointer: number) { if (hold?.pointer === pointer) cancel(); },
    primary,
    interact,
    toggleBuild,
    cancel,
    update(dt: number) {
      const heldSeconds = hold ? (now() - hold.started - snowGatherHoldMilliseconds) / 1000 : -1;
      gathering = heldSeconds >= 0 && host.canUseSnow() && !host.canInteract() && host.canGather();
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
