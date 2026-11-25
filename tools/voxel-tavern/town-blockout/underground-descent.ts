import { createUndergroundLiftCinematic, type UndergroundLiftCinematicFrame } from './underground-lift-cinematic';
import { createUndergroundLiftCinematicEffects, type UndergroundLiftCameraMotion } from './underground-lift-cinematic-effects';
import { mountUndergroundLiftCrewGlimpse } from './underground-lift-crew-glimpse';

type Trip = Readonly<{
  id: number;
  first: boolean;
  departedAt: number;
  travelMs: number;
  glimpseGranted?: boolean;
}>;

type MineLanding = Readonly<{ tripId: number; destination: 'mine'; fallDamage: 0 }>;
type Host = Readonly<{
  parent: HTMLElement;
  setControlsLocked(locked: boolean): void;
  cameraMotion(motion: UndergroundLiftCameraMotion): void;
  /** Load the mine and wait for this rider's accepted landing through the B-01 host. */
  requestMineLanding(tripId: number, signal: AbortSignal): MineLanding | undefined | Promise<MineLanding | undefined>;
  getAudioContext?(): BaseAudioContext | undefined;
  audioOutput?(context: BaseAudioContext): AudioNode;
  reducedMotion?(): boolean;
  onHandoffError?(error: unknown): void;
}>;

type Active = {
  trip: Trip;
  abort: AbortController;
  paint?: number;
  painted: boolean;
  readyToWake: boolean;
  failed: boolean;
};

/** Drives the local descent from already-authorized trip and landing receipts. */
export function mountUndergroundDescent(host: Host) {
  const frameWindow = host.parent.ownerDocument.defaultView;
  if (!frameWindow) throw new Error('Mount the underground descent in an active document');
  const cinematic = createUndergroundLiftCinematic();
  const crew = mountUndergroundLiftCrewGlimpse({ parent: host.parent, prefersReducedMotion: host.reducedMotion });
  const effects = createUndergroundLiftCinematicEffects({ ...host, onSkip: skip });
  let active: Active | undefined;
  let disposed = false;

  function skip() {
    if (!active || !cinematic.skip(active.trip.id)) return false;
    crew.skip();
    return true;
  }

  function waitForBlackFrame(state: Active) {
    if (state.painted || state.paint !== undefined) return;
    // The first callback precedes a paint. Wait until the following frame to switch realms.
    state.paint = frameWindow!.requestAnimationFrame(() => {
      state.paint = frameWindow!.requestAnimationFrame(() => {
        state.paint = undefined;
        if (active === state) state.painted = cinematic.confirmBlackout(state.trip.id);
      });
    });
  }

  async function handoff(state: Active) {
    try {
      const receipt = await host.requestMineLanding(state.trip.id, state.abort.signal);
      if (active !== state) return;
      if (receipt?.tripId !== state.trip.id || receipt.destination !== 'mine' || receipt.fallDamage !== 0) {
        throw new Error('No accepted zero-damage mine landing for this descent');
      }
      state.readyToWake = true;
    } catch (error) {
      if (active !== state) return;
      cinematic.retryHandoff(state.trip.id);
      state.failed = true;
      host.onHandoffError?.(error);
    }
  }

  function update(now: number): UndergroundLiftCinematicFrame | undefined {
    const state = active;
    if (!state) return;
    if (state.readyToWake && cinematic.acceptLanding(state.trip.id, now)) state.readyToWake = false;
    const frame = cinematic.sample(now);
    if (!frame) return;

    effects.present(frame, (now - state.trip.departedAt) / 1000);
    const phase = frame.blackout ? 'blackout' : state.painted ? 'wake' : 'travel';
    crew.sync({
      tripId: state.trip.id, direction: 'down', phase,
      glimpseGranted: state.trip.glimpseGranted === true && !frame.skipped,
    });
    if (frame.blackout) {
      waitForBlackFrame(state);
      if (state.painted && !state.failed && cinematic.beginHandoff(state.trip.id)) void handoff(state);
    } else if (frame.phase === 'complete') {
      effects.present(undefined, 0);
      active = undefined;
      host.setControlsLocked(false);
    }
    return frame;
  }

  return {
    overlay: effects.overlay,
    skipButton: effects.skipButton,
    start(trip: Trip, now: number): boolean {
      if (disposed || active || !cinematic.start(trip, now)) return false;
      active = { trip: { ...trip }, abort: new AbortController(), painted: false, readyToWake: false, failed: false };
      host.setControlsLocked(true);
      update(now);
      return true;
    },
    update,
    skip,
    retry(): boolean {
      if (!active?.failed) return false;
      active.failed = false;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (active) {
        const state = active;
        active = undefined;
        if (state.paint !== undefined) frameWindow.cancelAnimationFrame(state.paint);
        state.abort.abort();
        cinematic.cancel(state.trip.id);
        host.setControlsLocked(false);
      }
      crew.dispose();
      effects.dispose();
    },
  };
}
