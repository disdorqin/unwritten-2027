export type UndergroundLiftCrewFrame = Readonly<{
  tripId: number;
  phase: 'travel' | 'blackout' | 'wake';
  direction: 'down' | 'up';
  glimpseGranted?: boolean;
}>;

type Options = Readonly<{
  parent: HTMLElement;
  prefersReducedMotion?(): boolean;
}>;

const phaseOrder = { travel: 0, blackout: 1, wake: 2 } as const;

function paintCrew(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const face = (x: number, y: number, shade: string) => {
    const block = (dx: number, dy: number, width: number, height: number, color: string) => {
      context.fillStyle = color;
      context.fillRect(x + dx, y + dy, width, height);
    };
    block(-19, 19, 38, 11, '#13171a');
    block(-13, 15, 26, 12, '#1a1c21');
    block(-7, -7, 14, 25, shade);
    block(-9, -9, 18, 11, '#282c2c');
    block(-6, -13, 12, 6, '#292e2e');
    block(-10, 1, 20, 3, '#323733');
    block(-6, 5, 4, 2, '#14191a');
    block(2, 5, 4, 2, '#14191a');
    block(-1, 7, 2, 5, '#3a3831');
    block(-3, 13, 6, 2, '#211f20');
  };

  face(35, 29, '#2e2b28');
  face(125, 27, '#2a2c2b');
  face(81, 24, '#36312e');
}

/** Feed host-accepted U-7 frames for the current rider and connection only. */
export function mountUndergroundLiftCrewGlimpse({ parent, prefersReducedMotion }: Options) {
  const doc = parent.ownerDocument;
  const reducedMotion = prefersReducedMotion ??
    (() => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  const element = doc.createElement('div');
  const canvas = doc.createElement('canvas');
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    position: 'fixed', inset: '0', backgroundColor: '#000', pointerEvents: 'none',
    placeItems: 'center', zIndex: '1000',
  });
  canvas.width = 160;
  canvas.height = 72;
  Object.assign(canvas.style, { width: 'min(20rem, 82vw)', height: 'auto', imageRendering: 'pixelated', opacity: '0' });
  element.append(canvas);
  parent.append(element);

  let current: UndergroundLiftCrewFrame | undefined;
  let animation: Animation | undefined;
  let disposed = false;

  function blackout(active: boolean) {
    element.hidden = !active;
    element.style.display = active ? 'grid' : 'none';
  }

  function stopFace() {
    animation?.cancel();
    animation = undefined;
  }

  paintCrew(canvas);
  blackout(false);

  return {
    element,
    sync(frame: UndergroundLiftCrewFrame): boolean {
      if (disposed || !Number.isSafeInteger(frame.tripId) || frame.tripId <= 0 ||
          !Object.hasOwn(phaseOrder, frame.phase) ||
          (frame.direction !== 'down' && frame.direction !== 'up')) return false;
      const sameTrip = current?.tripId === frame.tripId;
      if (current && (frame.tripId < current.tripId || (sameTrip &&
          (frame.direction !== current.direction || phaseOrder[frame.phase] < phaseOrder[current.phase])))) return false;

      const active = frame.direction === 'down' && frame.phase === 'blackout';
      const mayShow = active && frame.glimpseGranted === true && !reducedMotion();
      const entering = active && (!sameTrip || current?.phase !== 'blackout');
      current = { ...frame };
      blackout(active);
      if (!mayShow || entering) stopFace();
      if (mayShow && entering && typeof canvas.animate === 'function') {
        animation = canvas.animate([
          { opacity: 0 },
          { opacity: .92, offset: .34 },
          { opacity: .92, offset: .56 },
          { opacity: 0 },
        ], { duration: 740, easing: 'ease-in-out' });
      }
      return true;
    },
    skip() {
      stopFace();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopFace();
      blackout(false);
      element.remove();
    },
  };
}
