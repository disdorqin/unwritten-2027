export type Friend3TravelSoundId =
  | 'rail-wheel'
  | 'cable-pulley'
  | 'winch'
  | 'hammer'
  | 'mountain-wind'
  | 'ice-crack';

export type Friend3TravelSound = {
  readonly id: Friend3TravelSoundId;
  readonly label: string;
  readonly description: string;
  readonly loopable: boolean;
  readonly license: 'Original-WebAudio-MIT';
};

export const FRIEND3_TRAVEL_SOUNDS = [
  {
    id: 'rail-wheel',
    label: '轨轮',
    description: '矿车轨轮压过接缝的节奏性金属碰撞。',
    loopable: true,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'cable-pulley',
    label: '索道滑轮',
    description: '缆索滚轮的低频转动与偶发金属吱声。',
    loopable: true,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'winch',
    label: '绞盘',
    description: '绞盘棘轮、齿轮与钢索受力的连续声响。',
    loopable: true,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'hammer',
    label: '铁锤',
    description: '铁锤敲击金属的单次冲击与余韵。',
    loopable: false,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'mountain-wind',
    label: '高山风口',
    description: '宽阔风口的低频风声与缓慢阵风。',
    loopable: true,
    license: 'Original-WebAudio-MIT',
  },
  {
    id: 'ice-crack',
    label: '冰裂',
    description: '冰层受压的尖锐裂纹与低沉的冰体回响。',
    loopable: false,
    license: 'Original-WebAudio-MIT',
  },
] as const satisfies readonly Friend3TravelSound[];

export type Friend3TravelAudioSettings = {
  volume: number;
  muted: boolean;
};

export const FRIEND3_TRAVEL_AUDIO_STORAGE_KEY = 'unwritten.friend3.travel-audio.v1';

export const FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS: Friend3TravelAudioSettings = {
  volume: 70,
  muted: false,
};

export function normalizeFriend3TravelAudioSettings(value: unknown): Friend3TravelAudioSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawVolume = record.volume;
  const volume =
    typeof rawVolume === 'number' && Number.isFinite(rawVolume)
      ? Math.round(Math.max(0, Math.min(100, rawVolume)))
      : FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS.volume;
  return {
    volume,
    muted: typeof record.muted === 'boolean' ? record.muted : FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS.muted,
  };
}

export type Friend3TravelAudioOptions = {
  getContext?: () => AudioContext | undefined;
};

type Session = {
  gain: GainNode;
  sources: Set<AudioScheduledSourceNode>;
  ended: boolean;
  timer?: number;
};

const durations: Record<Friend3TravelSoundId, number> = {
  'rail-wheel': 1700,
  'cable-pulley': 1900,
  winch: 2100,
  hammer: 700,
  'mountain-wind': 5000,
  'ice-crack': 800,
};

export function createFriend3TravelAudio(options: Friend3TravelAudioOptions = {}) {
  const getContext = options.getContext;
  const settings = readSettings();
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let ownsContext = false;
  let noise: AudioBuffer | undefined;
  const active = new Map<Friend3TravelSoundId, Set<Session>>();

  function readSettings(): Friend3TravelAudioSettings {
    try {
      return normalizeFriend3TravelAudioSettings(
        JSON.parse(localStorage.getItem(FRIEND3_TRAVEL_AUDIO_STORAGE_KEY) ?? 'null'),
      );
    } catch {
      return { ...FRIEND3_TRAVEL_AUDIO_DEFAULT_SETTINGS };
    }
  }

  function writeSettings() {
    try {
      localStorage.setItem(FRIEND3_TRAVEL_AUDIO_STORAGE_KEY, JSON.stringify(settings));
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

  function playRailWheel(ctx: AudioContext, session: Session, loop: boolean) {
    const clack = () => {
      const at = ctx.currentTime + 0.01;
      noiseBurst(session, at, 0.08, 1900, 520, 0.07, 'bandpass');
      tone(session, at, 0.12, 96, 55, 0.1, 'triangle');
      tone(session, at + 0.025, 0.06, 230, 90, 0.03, 'square');
      if (loop) session.timer = window.setTimeout(clack, 360);
    };
    clack();
  }

  function playCablePulley(ctx: AudioContext, session: Session, loop: boolean) {
    const at = ctx.currentTime;
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer(ctx);
    bed.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 720;
    filter.Q.value = 1.2;
    const amp = ctx.createGain();
    amp.gain.value = 0.02;
    bed.connect(filter).connect(amp).connect(session.gain);
    bed.start(at);
    session.sources.add(bed);
    const squeak = () => {
      tone(session, ctx.currentTime + 0.02, 0.18, 880, 1240, 0.016, 'sine');
      if (loop) session.timer = window.setTimeout(squeak, 1100 + Math.random() * 500);
    };
    squeak();
  }

  function playWinch(ctx: AudioContext, session: Session, loop: boolean) {
    const ratchet = () => {
      const at = ctx.currentTime + 0.01;
      noiseBurst(session, at, 0.04, 2200, 1200, 0.045, 'highpass');
      tone(session, at, 0.045, 190, 120, 0.04, 'square');
      if (loop) session.timer = window.setTimeout(ratchet, 170 + Math.random() * 60);
    };
    ratchet();
    const at = ctx.currentTime;
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer(ctx);
    bed.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const amp = ctx.createGain();
    amp.gain.value = 0.02;
    bed.connect(filter).connect(amp).connect(session.gain);
    bed.start(at);
    session.sources.add(bed);
  }

  function playHammer(ctx: AudioContext, session: Session) {
    const at = ctx.currentTime + 0.01;
    noiseBurst(session, at, 0.12, 1300, 500, 0.12, 'lowpass');
    tone(session, at, 0.2, 2200, 880, 0.045, 'sine');
    tone(session, at, 0.22, 140, 68, 0.11, 'triangle');
  }

  function playMountainWind(ctx: AudioContext, session: Session, loop: boolean) {
    const at = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.02, at);
    amp.gain.linearRampToValueAtTime(0.05, at + 1.2);
    amp.gain.linearRampToValueAtTime(0.025, at + 2.4);
    source.connect(filter).connect(amp).connect(session.gain);
    source.start(at);
    session.sources.add(source);
    if (loop) {
      const gust = () => {
        amp.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 1.4);
        amp.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 3.2);
        session.timer = window.setTimeout(gust, 3200);
      };
      session.timer = window.setTimeout(gust, 3200);
    }
  }

  function playIceCrack(ctx: AudioContext, session: Session) {
    const at = ctx.currentTime + 0.01;
    noiseBurst(session, at, 0.07, 3200, 900, 0.15, 'highpass');
    tone(session, at, 0.11, 1800, 420, 0.055, 'square');
    tone(session, at + 0.02, 0.34, 82, 38, 0.1, 'sine');
  }

  function detach(id: Friend3TravelSoundId, session: Session) {
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

  function stopSession(id: Friend3TravelSoundId, session: Session) {
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

  function stopSound(id: Friend3TravelSoundId) {
    const set = active.get(id);
    if (!set) return;
    for (const session of [...set]) stopSession(id, session);
  }

  function play(id: Friend3TravelSoundId, loop = false): boolean {
    const sound = FRIEND3_TRAVEL_SOUNDS.find(item => item.id === id);
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
      case 'rail-wheel':
        playRailWheel(ctx, session, looping);
        break;
      case 'cable-pulley':
        playCablePulley(ctx, session, looping);
        break;
      case 'winch':
        playWinch(ctx, session, looping);
        break;
      case 'hammer':
        playHammer(ctx, session);
        break;
      case 'mountain-wind':
        playMountainWind(ctx, session, looping);
        break;
      case 'ice-crack':
        playIceCrack(ctx, session);
        break;
    }
    if (!looping) {
      session.timer = window.setTimeout(() => stopSession(id, session), durations[id]);
    }
    return true;
  }

  function stop(id: Friend3TravelSoundId) {
    stopSound(id);
  }

  function stopAll() {
    for (const id of [...active.keys()]) stopSound(id);
  }

  function isPlaying(id: Friend3TravelSoundId): boolean {
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

  function getSettings(): Friend3TravelAudioSettings {
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

export type Friend3TravelAudio = ReturnType<typeof createFriend3TravelAudio>;