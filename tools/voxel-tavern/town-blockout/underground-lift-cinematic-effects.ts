import type { UndergroundLiftCinematicFrame } from './underground-lift-cinematic';

export type UndergroundLiftCameraMotion = Readonly<{
  yaw: number;
  pitch: number;
  roll: number;
  /** Zero is lying down and one is finally sitting upright. */
  wakeProgress?: number;
}>;

type Options = Readonly<{
  parent: HTMLElement;
  cameraMotion(motion: UndergroundLiftCameraMotion): void;
  getAudioContext?(): BaseAudioContext | undefined;
  audioOutput?(context: BaseAudioContext): AudioNode;
  onSkip(): void;
  reducedMotion?(): boolean;
}>;

const stillCamera: UndergroundLiftCameraMotion = { yaw: 0, pitch: 0, roll: 0 };
const bounded = (value: number) => Math.max(0, Math.min(1, value));

function playScreech(context: BaseAudioContext, output: AudioNode) {
  const at = context.currentTime;
  const strength = context.createGain();
  const cable = context.createOscillator();
  const rail = context.createOscillator();
  const railGain = context.createGain();
  cable.type = 'triangle';
  cable.frequency.setValueAtTime(560, at);
  cable.frequency.exponentialRampToValueAtTime(1740, at + .67);
  rail.frequency.setValueAtTime(812, at);
  rail.frequency.exponentialRampToValueAtTime(2460, at + .69);
  railGain.gain.value = .28;
  strength.gain.setValueAtTime(.0001, at);
  strength.gain.exponentialRampToValueAtTime(.004, at + .16);
  strength.gain.exponentialRampToValueAtTime(.05, at + .64);
  strength.gain.exponentialRampToValueAtTime(.0001, at + .84);
  cable.connect(strength);
  rail.connect(railGain).connect(strength);
  strength.connect(output);
  cable.onended = () => {
    cable.disconnect();
    rail.disconnect();
    railGain.disconnect();
    strength.disconnect();
  };
  cable.start(at);
  rail.start(at);
  cable.stop(at + .85);
  rail.stop(at + .85);

  return () => {
    const now = context.currentTime;
    if (now >= at + .85) return;
    strength.gain.cancelScheduledValues(now);
    strength.gain.setTargetAtTime(.0001, now, .009);
    cable.stop(now + .045);
    rail.stop(now + .045);
  };
}

function playWaterFilm(context: BaseAudioContext, output: AudioNode) {
  const duration = .65;
  const at = context.currentTime;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 7189;
  let filtered = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    filtered += (.21 - t * .17) * (seed / 2147483648 - 1 - filtered);
    samples[i] = filtered * Math.sin(Math.PI * t) ** 2 * .065;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(output);
  source.onended = () => source.disconnect();
  source.start(at);
  return () => {
    if (context.currentTime < at + duration) source.stop();
  };
}

/** Attach to the existing scene frame loop and feed it the current lift presentation sample. */
export function createUndergroundLiftCinematicEffects({
  parent, cameraMotion, getAudioContext, audioOutput, onSkip, reducedMotion,
}: Options) {
  const doc = parent.ownerDocument;
  const prefersReducedMotion = reducedMotion ??
    (() => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  const overlay = doc.createElement('div');
  const skipButton = doc.createElement('button');
  overlay.dataset.undergroundLiftCinematic = '';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '999',
  });
  skipButton.dataset.undergroundLiftSkip = '';
  skipButton.type = 'button';
  skipButton.textContent = '跳过后半段';
  skipButton.hidden = true;
  Object.assign(skipButton.style, {
    position: 'fixed', zIndex: '1001', minHeight: '44px', padding: '8px 14px',
    bottom: 'max(16px, env(safe-area-inset-bottom))',
    right: 'max(16px, env(safe-area-inset-right))',
    touchAction: 'manipulation', color: '#f5f2ea', background: '#262421',
    border: '1px solid #77736a', borderRadius: '6px', font: 'inherit',
  });
  parent.append(overlay, skipButton);

  let previous: UndergroundLiftCinematicFrame | undefined;
  let previousOpacity = 0;
  let previousColor = '';
  let stopAudio: (() => void) | undefined;
  let stopWaterFilm: (() => void) | undefined;
  let waterFilmTripId: number | undefined;
  let disposed = false;
  let lastFocus: HTMLElement | undefined;

  function setOverlay(opacity: number, color: string) {
    if (previousOpacity === opacity && previousColor === color) return;
    previousOpacity = opacity;
    previousColor = color;
    overlay.hidden = opacity === 0;
    overlay.style.opacity = String(opacity);
    overlay.style.backgroundColor = color;
  }

  function setSkip(available: boolean) {
    if (skipButton.hidden === !available) return;
    if (available) {
      const focused = doc.activeElement;
      lastFocus = focused && 'focus' in focused ? focused as HTMLElement : undefined;
    } else if (doc.activeElement === skipButton && lastFocus?.isConnected) {
      lastFocus.focus({ preventScroll: true });
    }
    skipButton.hidden = !available;
  }

  function playOnHostBus(play: typeof playScreech) {
    try {
      const context = getAudioContext?.();
      if (context?.state === 'running') {
        const output = audioOutput?.(context) ?? context.destination;
        if (output.context === context) return play(context, output);
      }
    } catch { /* An unavailable audio output must not hold the descent. */ }
  }

  function requestSkip() {
    if (!previous?.canSkip || disposed) return;
    stopWaterFilm?.();
    stopWaterFilm = undefined;
    onSkip();
  }
  skipButton.addEventListener('click', requestSkip);

  return {
    overlay,
    skipButton,
    present(frame: UndergroundLiftCinematicFrame | undefined, elapsedSeconds: number) {
      if (disposed || (!frame && !previous)) return;
      const tripChanged = previous?.tripId !== frame?.tripId;
      const changed = tripChanged || previous?.phase !== frame?.phase;
      previous = frame;
      const reduced = prefersReducedMotion();
      if (tripChanged || frame?.skipped) {
        stopWaterFilm?.();
        stopWaterFilm = undefined;
      }
      if (changed) {
        stopAudio?.();
        stopAudio = frame?.phase === 'screech' ? playOnHostBus(playScreech) : undefined;
        overlay.dataset.phase = frame?.phase ?? '';
      }
      if (frame?.waterFilm && frame.tripId !== waterFilmTripId) {
        waterFilmTripId = frame.tripId;
        stopWaterFilm = playOnHostBus(playWaterFilm);
        if (stopWaterFilm) {
          stopAudio?.();
          stopAudio = undefined;
        }
      }
      setSkip(frame?.canSkip === true);
      if (!frame) {
        setOverlay(0, '#000');
        cameraMotion(stillCamera);
        return;
      }

      const progress = bounded(frame.progress);
      const hasFlash = !reduced && frame.phase === 'flash';
      const flashOpacity = hasFlash ? .19 * Math.sin(progress * Math.PI) ** 2 : 0;
      setOverlay(frame.blackout ? 1 : flashOpacity, frame.blackout ? '#000' : '#fff1ca');

      if (frame.phase === 'waking' || frame.phase === 'sitting') {
        const posture = frame.phase === 'waking' ? 0 : progress * progress * (3 - 2 * progress);
        cameraMotion({ ...stillCamera, wakeProgress: reduced ? 1 : posture });
      } else if (reduced || frame.sway <= 0 || frame.blackout) {
        cameraMotion(stillCamera);
      } else {
        const seconds = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
        const sway = bounded(frame.sway);
        cameraMotion({
          yaw: Math.sin(seconds * 8.7) * sway * .033,
          pitch: Math.sin(seconds * 9.6 + .7) * sway * .023,
          roll: Math.sin(seconds * 6.4) * sway * .041,
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopAudio?.();
      stopWaterFilm?.();
      setSkip(false);
      skipButton.removeEventListener('click', requestSkip);
      overlay.remove();
      skipButton.remove();
      cameraMotion(stillCamera);
    },
  };
}
