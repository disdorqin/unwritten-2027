import type { MainSummitTrailPoint } from './main-summit-trail';

type ListenerPose = MainSummitTrailPoint & { heading: number };

const repeatSeconds = 3.2;
const ringSeconds = .86;
const strikes = [[0, 1_320, .075], [.16, 1_482, .045]] as const;
const partials = [[1, 1, .19], [2.02, .48, .10], [2.77, .22, .065], [3.83, .12, .045]] as const;

function makeRing(context: AudioContext) {
  const { sampleRate } = context;
  const wave = context.createBuffer(1, Math.ceil(ringSeconds * sampleRate), sampleRate);
  const samples = wave.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const seconds = i / sampleRate;
    const release = Math.min(1, (ringSeconds - seconds) / .05);
    for (const [offset, frequency, level] of strikes) {
      const age = seconds - offset;
      if (age < 0) continue;
      const attack = Math.min(1, age / .006);
      for (const [ratio, weight, decay] of partials) {
        const envelope = level * weight * attack * release * Math.exp(-age / decay);
        samples[i]! += Math.sin(2 * Math.PI * frequency * ratio * age) * envelope;
      }
    }
  }
  return wave;
}

function hasPosition(point: MainSummitTrailPoint | undefined): point is MainSummitTrailPoint {
  return !!point && Number.isFinite(point.east) && Number.isFinite(point.north) && Number.isFinite(point.height);
}

export function createMainSummitTrailChimeAudio() {
  let context: AudioContext | undefined;
  let panner: PannerNode | undefined;
  let wave: AudioBuffer | undefined;
  let voice: AudioBufferSourceNode | undefined;
  let origin: MainSummitTrailPoint | undefined;
  let nextRingAt = 0;
  let rings = 0;
  let disposed = false;

  function stopVoice() {
    const active = voice;
    voice = undefined;
    if (!active) return;
    active.onended = null;
    active.stop();
    active.disconnect();
  }

  function moveListener(listener: AudioListener, pose: ListenerPose) {
    const x = Math.sin(pose.heading);
    const z = -Math.cos(pose.heading);
    if (listener.positionX && listener.forwardX) {
      listener.positionX.value = pose.east;
      listener.positionY.value = pose.height;
      listener.positionZ.value = -pose.north;
      listener.forwardX.value = x;
      listener.forwardY.value = 0;
      listener.forwardZ.value = z;
    } else {
      listener.setPosition(pose.east, pose.height, -pose.north);
      listener.setOrientation(x, 0, z, 0, 1, 0);
    }
  }

  function moveSource(audio: AudioContext, source: MainSummitTrailPoint) {
    if (!panner) {
      panner = audio.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.rolloffFactor = .7;
      panner.connect(audio.destination);
    }
    if (panner.positionX) {
      panner.positionX.value = source.east;
      panner.positionY.value = source.height;
      panner.positionZ.value = -source.north;
    } else {
      panner.setPosition(source.east, source.height, -source.north);
    }
    return panner;
  }

  return {
    /** Call directly during a user gesture to allow playback. */
    async unlockAudio() {
      if (disposed || typeof AudioContext === 'undefined') return false;
      try {
        const audio = context ??= new AudioContext();
        if (audio.state !== 'running') await audio.resume();
        return !disposed && audio.state === 'running';
      } catch { return false; }
    },

    update(listener?: ListenerPose, source?: MainSummitTrailPoint) {
      if (context?.state !== 'running' || !hasPosition(listener) || !Number.isFinite(listener.heading) || !hasPosition(source)) {
        origin = undefined;
        stopVoice();
        return;
      }
      moveListener(context.listener, listener);
      let emitter = panner;
      if (!emitter || !origin || origin.east !== source.east || origin.north !== source.north || origin.height !== source.height) {
        stopVoice();
        emitter = moveSource(context, source);
        origin = { ...source };
      }
      if (voice || context.currentTime < nextRingAt) return;

      const ring = context.createBufferSource();
      ring.buffer = wave ??= makeRing(context);
      ring.connect(emitter);
      ring.onended = () => {
        ring.disconnect();
        if (voice === ring) voice = undefined;
      };
      ring.start();
      voice = ring;
      nextRingAt = context.currentTime + repeatSeconds;
      rings++;
    },

    snapshot() {
      const ready = context?.state === 'running';
      return { ready, playing: ready && voice !== undefined, rings };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopVoice();
      panner?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      context = undefined;
      panner = undefined;
      wave = undefined;
      origin = undefined;
    },
  };
}
