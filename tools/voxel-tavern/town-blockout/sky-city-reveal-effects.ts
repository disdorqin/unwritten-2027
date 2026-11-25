type RevealEffectsOptions = {
  onGlow?: (strength: number) => void;
  audioContext?: () => AudioContext | undefined;
};

const riseSeconds = .7;
const holdUntil = 1.25;
const cueSeconds = 2.85;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function glowAt(seconds: number) {
  if (seconds <= 0 || seconds >= cueSeconds) return 0;
  if (seconds < riseSeconds) return smoothstep(seconds / riseSeconds);
  return seconds <= holdUntil ? 1 : 1 - smoothstep((seconds - holdUntil) / (cueSeconds - holdUntil));
}

/** A clearing band of very quiet wind. Runs once and uses no fetched audio. */
function makeWind(context: AudioContext) {
  const buffer = context.createBuffer(1, Math.ceil((cueSeconds + .06) * context.sampleRate), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x6ca2741d;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    samples[i] = (seed >>> 0) / 0x80000000 - 1;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = .68;
  const gain = context.createGain();
  const now = context.currentTime;
  filter.frequency.setValueAtTime(265, now);
  filter.frequency.exponentialRampToValueAtTime(760, now + holdUntil);
  filter.frequency.exponentialRampToValueAtTime(415, now + cueSeconds);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(.048, now + riseSeconds);
  gain.gain.linearRampToValueAtTime(.040, now + holdUntil);
  gain.gain.linearRampToValueAtTime(0, now + cueSeconds);

  return {
    source,
    start() { source.connect(filter).connect(gain).connect(context.destination); source.start(now); },
    disconnect() { source.disconnect(); filter.disconnect(); gain.disconnect(); },
  };
}

/** Local presentation only. The host owns discovery, the camera and any saved progress. */
export function createSkyCityRevealEffects({ onGlow, audioContext }: RevealEffectsOptions = {}) {
  let context: AudioContext | undefined;
  let wind: ReturnType<typeof makeWind> | undefined;
  let startedAt: number | undefined;
  let glow = 0;
  let disposed = false;

  function setGlow(value: number) {
    if (value === glow) return;
    glow = value;
    onGlow?.(glow);
  }

  function stopWind() {
    const active = wind;
    wind = undefined;
    if (!active) return;
    active.source.onended = null;
    try { active.source.stop(); } catch { /* A finished or unstarted voice has no tail to stop. */ }
    active.disconnect();
  }

  function playWind() {
    if (context?.state !== 'running') return;
    try {
      const voice = makeWind(context);
      wind = voice;
      voice.source.onended = () => {
        voice.disconnect();
        if (wind === voice) wind = undefined;
      };
      voice.start();
    } catch { stopWind(); }
  }

  function reset() {
    startedAt = undefined;
    stopWind();
    setGlow(0);
  }

  return {
    /** Call synchronously from a user gesture, before the first visible reveal. */
    async unlockAudio() {
      if (disposed) return false;
      try {
        if (context?.state === 'closed') context = undefined;
        context ??= audioContext ? audioContext() : typeof AudioContext !== 'undefined' ? new AudioContext() : undefined;
        const active = context;
        if (!active) return false;
        if (active.state !== 'running') await active.resume();
        return !disposed && active.state === 'running';
      } catch { return false; }
    },
    reveal(elapsedSeconds: number) {
      if (disposed || startedAt !== undefined || !Number.isFinite(elapsedSeconds)) return false;
      startedAt = elapsedSeconds;
      playWind();
      return true;
    },
    update(elapsedSeconds: number) {
      if (startedAt !== undefined && Number.isFinite(elapsedSeconds)) setGlow(glowAt(elapsedSeconds - startedAt));
      return glow;
    },
    snapshot() {
      const audioAvailable = context?.state === 'running';
      return { glow, audioPlaying: audioAvailable && wind !== undefined, audioAvailable };
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      if (!audioContext && context && context.state !== 'closed') void context.close().catch(() => {});
      context = undefined;
    },
  };
}
