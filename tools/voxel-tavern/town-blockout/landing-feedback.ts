export type LandingFeedback = 'none' | 'compress' | 'prone';
const landingPause = .3;
const pronePause = 1.2;
const recoveryDuration = 2;
const recoveryScale = .7;

export function landingFeedback(drop: number, deepSnow: boolean): LandingFeedback {
  const tier = Math.max(0, (drop > 6 ? 2 : drop >= 3 ? 1 : 0) - (deepSnow ? 1 : 0));
  return tier === 2 ? 'prone' : tier === 1 ? 'compress' : 'none';
}

export function createLandingFeedback() {
  let launchedFrom: number | undefined;
  let remainingPause = 0;
  let remainingRecovery = 0;
  let pauseKind: LandingFeedback = 'none';

  function clear() {
    launchedFrom = undefined;
    remainingPause = remainingRecovery = 0;
    pauseKind = 'none';
  }

  return {
    begin(feet: number) { launchedFrom = feet; },
    land(feet: number, deepSnow: boolean) {
      if (launchedFrom === undefined) return 'none';
      const kind = landingFeedback(launchedFrom - feet, deepSnow);
      launchedFrom = undefined;
      if (kind === 'none') return kind;
      pauseKind = kind;
      remainingPause = kind === 'prone' ? pronePause : landingPause;
      remainingRecovery = kind === 'prone' ? recoveryDuration : 0;
      return kind;
    },
    update(seconds: number) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const pauseUsed = Math.min(remainingPause, seconds);
      remainingPause -= pauseUsed;
      if (remainingPause === 0) pauseKind = 'none';
      remainingRecovery = Math.max(0, remainingRecovery - (seconds - pauseUsed));
    },
    reset: clear,
    pose: () => pauseKind,
    walkingScale: () => remainingPause > 0 ? 0 : remainingRecovery > 0 ? recoveryScale : 1,
    compression: () => pauseKind === 'compress' ? remainingPause / landingPause : 0,
  };
}
