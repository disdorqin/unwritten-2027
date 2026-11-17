import type { PerspectiveCamera } from 'three';
import type { SnowballHitZone } from './town-snowball';

const feedbackByZone = {
  head: { opacity: .76, fadeMs: 560, shakeMs: 360, degrees: .78 },
  torso: { opacity: .46, fadeMs: 440, shakeMs: 265, degrees: .42 },
} as const;

export function createSnowballHitFeedback(
  overlay: HTMLElement,
  enabled: boolean,
  reducedMotion: MediaQueryList,
) {
  let animation: Animation | undefined;
  let hitAt = -Infinity;
  let shakeMs = 0;
  let strength = 0;
  let side = 1;

  function hit(zone: SnowballHitZone = 'torso') {
    if (!enabled) return;
    const effect = feedbackByZone[zone];
    hitAt = performance.now();
    shakeMs = effect.shakeMs;
    strength = effect.degrees * Math.PI / 180;
    side = -side;

    // Reuse one compositor animation. Consecutive impacts refresh the envelope.
    const frames = [{ opacity: effect.opacity }, { opacity: 0, offset: 1 }];
    if (animation) {
      const keyframes = animation.effect as KeyframeEffect;
      keyframes.setKeyframes(frames);
      keyframes.updateTiming({ duration: effect.fadeMs });
      animation.currentTime = 0;
      animation.play();
    } else {
      animation = overlay.animate(frames, { duration: effect.fadeMs, easing: 'cubic-bezier(.2,.55,.34,1)' });
    }
  }

  function apply(camera: PerspectiveCamera) {
    if (shakeMs === 0 || reducedMotion.matches) return;
    const progress = (performance.now() - hitAt) / shakeMs;
    if (progress >= 1) {
      shakeMs = 0;
      return;
    }
    const amplitude = strength * Math.exp(-4.6 * progress) * (1 - progress);
    const phase = progress * 15;
    camera.rotateX(-Math.cos(phase) * amplitude * .76);
    camera.rotateY(side * Math.sin(phase + .6) * amplitude * .60);
  }

  function clear() {
    shakeMs = 0;
    if (animation?.playState === 'running') animation.cancel();
  }

  return { hit, apply, clear };
}
