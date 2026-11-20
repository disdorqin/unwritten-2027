export const snowGatherHoldMilliseconds = 150;
export const snowGatherSeconds = .8;

export type SnowWallCell = Readonly<{ gx: number; gy: number }>;

type SnowControlHost = {
  canUseSnow(): boolean;
  canGather(): boolean;
  gather(): void;
  gatheringScale?(): number;
  canInteract(): boolean;
  interact(): void;
  throwSnowball(): void;
  wallTarget(): SnowWallCell | undefined;
  placeWall(cell: SnowWallCell): void;
  now?: () => number;
};

export function createTownSnowControls(host: SnowControlHost) {
  const now = host.now ?? (() => performance.now());
  let hold: { pointer: number | undefined; started: number } | undefined;
  let touchWall: SnowWallCell | undefined;
  let gatherElapsed = 0;
  let gathering = false;

  function cancelHold() {
    hold = undefined;
    gatherElapsed = 0;
    gathering = false;
  }

  function cancel() {
    cancelHold();
    touchWall = undefined;
  }

  function begin(pointer?: number) {
    if (hold) return false;
    hold = { pointer, started: now() };
    return true;
  }

  function primary() {
    if (!host.canUseSnow()) return false;
    touchWall = undefined;
    const cell = host.wallTarget();
    if (cell) host.placeWall(cell);
    else host.throwSnowball();
    return true;
  }

  function touchPrimary(cell: SnowWallCell | undefined, throwAtPoint = () => host.throwSnowball()) {
    if (!host.canUseSnow()) {
      touchWall = undefined;
      return false;
    }
    if (!cell) {
      touchWall = undefined;
      throwAtPoint();
    } else if (touchWall?.gx === cell.gx && touchWall.gy === cell.gy) {
      touchWall = undefined;
      host.placeWall(cell);
    } else {
      touchWall = { gx: cell.gx, gy: cell.gy };
    }
    return true;
  }

  function touchWallPreview() {
    if (touchWall && !host.canUseSnow()) touchWall = undefined;
    return touchWall;
  }

  function interact() {
    if (!host.canInteract()) return false;
    host.interact();
    return true;
  }

  function finish(pointer?: number) {
    if (!hold || hold.pointer !== pointer) return false;
    const shortPress = now() - hold.started < snowGatherHoldMilliseconds;
    cancelHold();
    if (shortPress) interact();
    return true;
  }

  return {
    keyDown(code: string, repeat: boolean) {
      if (code !== 'KeyE' || !(host.canUseSnow() || host.canInteract())) return false;
      if (!repeat) begin();
      return true;
    },
    keyUp(code: string) { return code === 'KeyE' && finish(); },
    pressTouch(pointer: number) { return (host.canInteract() || host.canUseSnow()) && begin(pointer); },
    releaseTouch(pointer: number) { return finish(pointer); },
    cancelTouch(pointer: number) { if (hold?.pointer === pointer) cancelHold(); },
    primary,
    touchPrimary,
    touchWallPreview,
    throwTouch() { return touchPrimary(undefined); },
    interact,
    cancel,
    update(dt: number) {
      const heldSeconds = hold ? (now() - hold.started - snowGatherHoldMilliseconds) / 1000 : -1;
      gathering = heldSeconds >= 0 && host.canUseSnow() && !host.canInteract() && host.canGather();
      if (!gathering) {
        gatherElapsed = 0;
        return;
      }
      if (!Number.isFinite(dt) || dt <= 0) return;
      const scale = host.gatheringScale?.() ?? 1;
      gatherElapsed += Math.min(dt, heldSeconds) * scale;
      if (gatherElapsed >= snowGatherSeconds) {
        gatherElapsed %= snowGatherSeconds;
        host.gather();
      }
    },
    gatherProgress() { return gathering ? gatherElapsed / snowGatherSeconds : undefined; },
  };
}
