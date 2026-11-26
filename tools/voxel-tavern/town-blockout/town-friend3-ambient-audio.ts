export type Friend3AmbientSoundId =
  | 'wind-chime'
  | 'wood-door'
  | 'stove'
  | 'wood-step'
  | 'stone-step'
  | 'snow-step';

export type Friend3AmbientSound = {
  readonly id: Friend3AmbientSoundId;
  readonly label: string;
  readonly description: string;
  readonly loopable: boolean;
  readonly license: 'Original-WebAudio-MIT';
};

export const FRIEND3_AMBIENT_SOUNDS = [
  {
    id: 'wind-chime',
    label: '风铃',
    description: '五声音阶的轻风铃，单次或循环试听。',
    loopable: true,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'wood-door',
    label: '木门',
    description: '木门吱呀、缓慢推开与关门轻碰。',
    loopable: false,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'stove',
    label: '火炉',
    description: '低暖火床与随机爆裂声，适合做环境底噪。',
    loopable: true,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'wood-step',
    label: '木脚步',
    description: '木板上的短促脚步，带一点空腔共鸣。',
    loopable: false,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'stone-step',
    label: '石脚步',
    description: '石面上的干脆脚步，高频更明显。',
    loopable: false,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'snow-step',
    label: '雪脚步',
    description: '松软雪面的碎步与压雪声。',
    loopable: false,
    license: 'Original-WebAudio-MIT',
  },
] as const satisfies readonly Friend3AmbientSound[];

export type Friend3AudioSettings = {
  volume: number;
  muted: boolean;
};

export const FRIEND3_AUDIO_STORAGE_KEY = 'unwritten.friend3.audio.v1';

export const FRIEND3_AUDIO_DEFAULT_SETTINGS: Friend3AudioSettings = {
  volume: 70,
  muted: false,
};

export function normalizeFriend3AudioSettings(value: unknown): Friend3AudioSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawVolume = record.volume;
  const volume =
    typeof rawVolume === 'number' && Number.isFinite(rawVolume)
      ? Math.round(Math.max(0, Math.min(100, rawVolume)))
      : FRIEND3_AUDIO_DEFAULT_SETTINGS.volume;
  return {
    volume,
    muted: typeof record.muted === 'boolean' ? record.muted : FRIEND3_AUDIO_DEFAULT_SETTINGS.muted,
  };
}

export type Friend3AmbientAudioOptions = {
  getContext?: () => AudioContext | undefined;
};

type Session = {
  gain: GainNode;
  sources: Set<AudioScheduledSourceNode>;
  ended: boolean;
  timer?: number;
};

const durations: Record<Friend3AmbientSoundId, number> = {
  'wind-chime': 3200,
  'wood-door': 900,
  stove: 2200,
  'wood-step': 420,
  'stone-step': 360,
  'snow-step': 500,
};

export function createFriend3AmbientAudio(options: Friend3AmbientAudioOptions = {}) {
  const getContext = options.getContext;
  const settings = readSettings();
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let ownsContext = false;
  let noise: AudioBuffer | undefined;
  const active = new Map<Friend3AmbientSoundId, Set<Session>>();

  function readSettings(): Friend3AudioSettings {
    try {
      return normalizeFriend3AudioSettings(JSON.parse(localStorage.getItem(FRIEND3_AUDIO_STORAGE_KEY) ?? 'null'));
    } catch {
      return { ...FRIEND3_AUDIO_DEFAULT_SETTINGS };
    }
  }

  function writeSettings() {
    try {
      localStorage.setItem(FRIEND3_AUDIO_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable in privacy modes.
    }
  }

  function ensureContext(): AudioContext | undefined {
    if (!context) {
      let next: AudioContext | undefined;
      try {
        next = getContext ? getContext() : new AudioContext();
      } catch {
        return undefined;
      }
      if (!next) return undefined;
      context = next;
      ownsContext = !getContext;
      try {
        master = next.createGain();
        master.gain.value = settings.muted ? 0 : settings.volume / 100;
        master.connect(next.createDynamicsCompressor()).connect(next.destination);
      } catch {
        master = undefined;
        context = undefined;
        return undefined;
      }
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  function applyMasterGain() {
    if (!master || !context) return;
    const target = settings.muted ? 0 : settings.volume / 100;
    master.gain.setTargetAtTime(target, context.currentTime, 0.02);
  }

  function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    return noise;
  }

  function tone(
    session: Session,
    at: number,
    duration: number,
    hz: number,
    endHz: number,
    level: number,
    type: OscillatorType,
  ) {
    const ctx = session.gain.context;
    const oscillator = ctx.createOscillator();
    const amp = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(hz, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), at + duration);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.00011, level), at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(amp).connect(session.gain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
    session.sources.add(oscillator);
  }

  function noiseBurst(
    session: Session,
    at: number,
    duration: number,
    startHz: number,
    endHz: number,
    level: number,
    type: BiquadFilterType,
  ) {
    const ctx = session.gain.context;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(startHz, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, endHz), at + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.00011, level), at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(amp).connect(session.gain);
    source.start(at, Math.random() * 0.2, duration + 0.03);
    session.sources.add(source);
  }

  function playWindChime(ctx: AudioContext, session: Session, loop: boolean) {
    const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const batch = () => {
      const start = ctx.currentTime + 0.03;
      for (let index = 0; index < 5; index += 1) {
        const hz = notes[Math.floor(Math.random() * notes.length)];
        const at = start + Math.random() * 1.1;
        const length = 0.65 + Math.random() * 0.75;
        tone(session, at, length, hz, hz * 0.999, 0.03 + Math.random() * 0.018, 'sine');
        tone(session, at, length * 0.6, hz * 2, hz * 1.998, 0.009, 'sine');
      }
      if (loop) session.timer = window.setTimeout(batch, 2500);
    };
    batch();
  }

  function playWoodDoor(ctx: AudioContext, session: Session) {
    const at = ctx.currentTime + 0.02;
    noiseBurst(session, at, 0.16, 700, 180, 0.08, 'lowpass');
    tone(session, at + 0.02, 0.55, 150, 82, 0.022, 'sawtooth');
    tone(session, at + 0.42, 0.16, 110, 68, 0.09, 'triangle');
    noiseBurst(session, at + 0.42, 0.12, 380, 120, 0.05, 'lowpass');
  }

  function playStove(ctx: AudioContext, session: Session, loop: boolean) {
    const at = ctx.currentTime;
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer(ctx);
    bed.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const amp = ctx.createGain();
    amp.gain.value = 0.028;
    bed.connect(filter).connect(amp).connect(session.gain);
    bed.start(at);
    session.sources.add(bed);
    const crackle = () => {
      const now = ctx.currentTime + 0.01;
      noiseBurst(
        session,
        now,
        0.025 + Math.random() * 0.03,
        1400 + Math.random() * 2200,
        700,
        0.035 + Math.random() * 0.035,
        'highpass',
      );
      if (loop) session.timer = window.setTimeout(crackle, 90 + Math.random() * 240);
    };
    crackle();
  }

  function playWoodStep(ctx: AudioContext, session: Session) {
    const at = ctx.currentTime + 0.01;
    noiseBurst(session, at, 0.1, 850, 260, 0.15, 'lowpass');
    tone(session, at, 0.09, 95, 62, 0.1, 'triangle');
  }

  function playStoneStep(ctx: AudioContext, session: Session) {
    const at = ctx.currentTime + 0.01;
    noiseBurst(session, at, 0.075, 2300, 900, 0.12, 'bandpass');
    tone(session, at, 0.05, 160, 90, 0.04, 'square');
  }

  function playSnowStep(ctx: AudioContext, session: Session) {
    const at = ctx.currentTime + 0.01;
    noiseBurst(session, at, 0.11, 1800, 600, 0.1, 'highpass');
    noiseBurst(session, at + 0.05, 0.06, 2400, 1200, 0.05, 'highpass');
  }

  function detach(id: Friend3AmbientSoundId, session: Session) {
    const set = active.get(id);
    if (set) {
      set.delete(session);
      if (set.size === 0) active.delete(id);
    }
    try {
      session.gain.disconnect();
    } catch {
      // The node may already be disconnected.
    }
  }

  function stopSession(id: Friend3AmbientSoundId, session: Session) {
    if (session.ended) return;
    session.ended = true;
    if (session.timer !== undefined) window.clearTimeout(session.timer);
    const now = session.gain.context.currentTime;
    try {
      session.gain.gain.cancelScheduledValues(now);
      session.gain.gain.setValueAtTime(session.gain.gain.value, now);
      session.gain.gain.linearRampToValueAtTime(0, now + 0.06);
    } catch {
      // A closed context can reject gain changes.
    }
    for (const source of session.sources) {
      try {
        source.stop(now + 0.08);
      } catch {
        // A finished source cannot be stopped twice.
      }
    }
    const finish = () => detach(id, session);
    if (typeof window === 'undefined') finish();
    else window.setTimeout(finish, 140);
  }

  function stopSound(id: Friend3AmbientSoundId) {
    const set = active.get(id);
    if (!set) return;
    for (const session of [...set]) stopSession(id, session);
  }

  function play(id: Friend3AmbientSoundId, loop = false): boolean {
    const sound = FRIEND3_AMBIENT_SOUNDS.find(item => item.id === id);
    if (!sound) return false;
    const ctx = ensureContext();
    if (!ctx || !master) return false;
    stopSound(id);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(master);
    const session: Session = { gain, sources: new Set(), ended: false };
    let set = active.get(id);
    if (!set) {
      set = new Set();
      active.set(id, set);
    }
    set.add(session);
    const looping = loop && sound.loopable;
    switch (sound.id) {
      case 'wind-chime':
        playWindChime(ctx, session, looping);
        break;
      case 'wood-door':
        playWoodDoor(ctx, session);
        break;
      case 'stove':
        playStove(ctx, session, looping);
        break;
      case 'wood-step':
        playWoodStep(ctx, session);
        break;
      case 'stone-step':
        playStoneStep(ctx, session);
        break;
      case 'snow-step':
        playSnowStep(ctx, session);
        break;
    }
    if (!looping) {
      session.timer = window.setTimeout(() => stopSession(id, session), durations[id]);
    }
    return true;
  }

  function stop(id: Friend3AmbientSoundId) {
    stopSound(id);
  }

  function stopAll() {
    for (const id of [...active.keys()]) stopSound(id);
  }

  function isPlaying(id: Friend3AmbientSoundId): boolean {
    const set = active.get(id);
    if (!set) return false;
    for (const session of set) if (!session.ended) return true;
    return false;
  }

  function setVolume(value: number) {
    settings.volume = Math.round(
      Math.max(0, Math.min(100, Number.isFinite(value) ? value : settings.volume)),
    );
    applyMasterGain();
    writeSettings();
  }

  function setMuted(value: boolean) {
    settings.muted = value;
    applyMasterGain();
    writeSettings();
  }

  function getSettings(): Friend3AudioSettings {
    return { ...settings };
  }

  function dispose() {
    stopAll();
    if (context && ownsContext) {
      void context.close().catch(() => undefined);
    }
    context = undefined;
    master = undefined;
    noise = undefined;
  }

  return {
    play,
    stop,
    stopAll,
    isPlaying,
    setVolume,
    setMuted,
    getSettings,
    dispose,
  };
}

export type Friend3AmbientAudio = ReturnType<typeof createFriend3AmbientAudio>;