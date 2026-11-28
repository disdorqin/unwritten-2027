export type Friend3WeatherRegion = 'town' | 'mountain' | 'crater' | 'summit';

export type Friend3WeatherFieldRegion =
  | 'town'
  | 'foothill'
  | 'alpine'
  | 'summit'
  | 'crater'
  | 'map-edge';

export type Friend3WeatherRegionProfile = {
  readonly id: Friend3WeatherRegion;
  readonly label: string;
  readonly description: string;
  readonly baseGain: number;
  readonly windResponse: number;
  readonly snowResponse: number;
  readonly filterType: BiquadFilterType;
  readonly filterHz: number;
  readonly filterQ: number;
  readonly secondaryType: BiquadFilterType;
  readonly secondaryHz: number;
};

export const FRIEND3_WEATHER_REGIONS = [
  {
    id: 'town',
    label: '小镇轻风',
    description: '低通过的轻风与远处雪声，室内最先收敛。',
    baseGain: 0.13,
    windResponse: 0.18,
    snowResponse: 0.12,
    filterType: 'lowpass',
    filterHz: 480,
    filterQ: 0.6,
    secondaryType: 'lowpass',
    secondaryHz: 1800,
  },
  {
    id: 'mountain',
    label: '山地强风',
    description: '带宽更窄的风啸与缆车钢索共振。',
    baseGain: 0.24,
    windResponse: 0.9,
    snowResponse: 0.35,
    filterType: 'bandpass',
    filterHz: 900,
    filterQ: 0.7,
    secondaryType: 'lowpass',
    secondaryHz: 1900,
  },
  {
    id: 'crater',
    label: '坑区恶劣',
    description: '低频尘风、碎石摩擦与压迫感更强的阵风。',
    baseGain: 0.26,
    windResponse: 0.7,
    snowResponse: 0.25,
    filterType: 'bandpass',
    filterHz: 420,
    filterQ: 0.9,
    secondaryType: 'lowpass',
    secondaryHz: 1100,
  },
  {
    id: 'summit',
    label: '高山风雪',
    description: '高频雪粒、强风与雪面碎响的高山层。',
    baseGain: 0.28,
    windResponse: 1,
    snowResponse: 0.65,
    filterType: 'highpass',
    filterHz: 620,
    filterQ: 0.55,
    secondaryType: 'lowpass',
    secondaryHz: 3200,
  },
] as const satisfies readonly Friend3WeatherRegionProfile[];

export const FRIEND3_WEATHER_ACCENTS = [
  { id: 'chime', label: '风铃', duration: 0.8 },
  { id: 'ice-crack', label: '冰裂', duration: 0.9 },
  { id: 'rail-clack', label: '轨轮', duration: 0.5 },
  { id: 'pulley-squeak', label: '滑轮', duration: 0.6 },
] as const;

export type Friend3WeatherAccentId = (typeof FRIEND3_WEATHER_ACCENTS)[number]['id'];

export type Friend3WeatherFieldSample = {
  region: Friend3WeatherFieldRegion;
  severity?: number;
  windStrength?: number;
  snowIntensityScale?: number;
};

export type Friend3WeatherAudioState = {
  weights: Record<Friend3WeatherRegion, number>;
  indoor: number;
  wind: number;
  snow: number;
  masterVolume: number;
  muted: boolean;
  enabled: boolean;
};

export const FRIEND3_WEATHER_AUDIO_DEFAULT_STATE: Friend3WeatherAudioState = {
  weights: { town: 1, mountain: 0, crater: 0, summit: 0 },
  indoor: 0,
  wind: 0.25,
  snow: 0.35,
  masterVolume: 65,
  muted: false,
  enabled: true,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function zeroWeights(): Record<Friend3WeatherRegion, number> {
  return { town: 0, mountain: 0, crater: 0, summit: 0 };
}

export function normalizeFriend3WeatherWeights(value: unknown): Record<Friend3WeatherRegion, number> {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const weights = zeroWeights();
  for (const profile of FRIEND3_WEATHER_REGIONS) {
    weights[profile.id] = clamp(finiteOr(record[profile.id], 0), 0, 1);
  }
  const total = weights.town + weights.mountain + weights.crater + weights.summit;
  if (total <= 0) {
    weights.town = 1;
    return weights;
  }
  weights.town /= total;
  weights.mountain /= total;
  weights.crater /= total;
  weights.summit /= total;
  return weights;
}

export function normalizeFriend3WeatherAudioState(value: unknown): Friend3WeatherAudioState {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    weights: normalizeFriend3WeatherWeights(record.weights),
    indoor: clamp01(finiteOr(record.indoor, FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.indoor)),
    wind: clamp01(finiteOr(record.wind, FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.wind)),
    snow: clamp01(finiteOr(record.snow, FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.snow)),
    masterVolume: clamp(
      finiteOr(record.masterVolume, FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.masterVolume),
      0,
      100,
    ),
    muted: typeof record.muted === 'boolean' ? record.muted : FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.muted,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.enabled,
  };
}

export function normalizeFriend3WeatherField(value: unknown): Friend3WeatherFieldSample {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const region = typeof record.region === 'string' &&
    ['town', 'foothill', 'alpine', 'summit', 'crater', 'map-edge'].includes(record.region)
    ? (record.region as Friend3WeatherFieldRegion)
    : 'town';
  return {
    region,
    severity: clamp01(finiteOr(record.severity, 0.35)),
    windStrength: clamp01(finiteOr(record.windStrength, 0)),
    snowIntensityScale: clamp(finiteOr(record.snowIntensityScale, 1), 0.6, 1.55),
  };
}

export function friend3WeatherSnowAmount(snowIntensityScale: number): number {
  return clamp01((clamp(finiteOr(snowIntensityScale, 1), 0.6, 1.55) - 0.6) / 0.95);
}

export function friend3WeatherWeightsFromField(value: unknown): Record<Friend3WeatherRegion, number> {
  const field = normalizeFriend3WeatherField(value);
  const severity = field.severity ?? 0;
  const weights = zeroWeights();
  switch (field.region) {
    case 'town':
      weights.town = 0.9 - severity * 0.35;
      weights.mountain = 0.1 + severity * 0.35;
      break;
    case 'foothill':
      weights.town = 0.62 - severity * 0.3;
      weights.mountain = 0.38 + severity * 0.3;
      break;
    case 'alpine':
      weights.mountain = 0.76 - severity * 0.22;
      weights.summit = 0.24 + severity * 0.22;
      break;
    case 'summit':
      weights.summit = 0.9 + severity * 0.1;
      weights.mountain = 1 - weights.summit;
      break;
    case 'crater':
      weights.crater = 0.85 + severity * 0.15;
      weights.mountain = 1 - weights.crater;
      break;
    case 'map-edge':
      weights.mountain = 0.48;
      weights.crater = 0.52;
      break;
  }
  return normalizeFriend3WeatherWeights(weights);
}

export function friend3WeatherIndoorFactor(indoor: number): number {
  return 1 - clamp01(finiteOr(indoor, 0)) * 0.82;
}

export function friend3WeatherRegionGain(
  profile: Friend3WeatherRegionProfile,
  weight: number,
  state: Friend3WeatherAudioState,
): number {
  const master = state.enabled && !state.muted ? state.masterVolume / 100 : 0;
  const indoor = friend3WeatherIndoorFactor(state.indoor);
  return (
    profile.baseGain *
    clamp01(weight) *
    (1 + state.wind * profile.windResponse) *
    (1 + state.snow * profile.snowResponse) *
    indoor *
    master
  );
}

export type Friend3WeatherAudioTargets = {
  regions: Record<Friend3WeatherRegion, number>;
  snowHiss: number;
};

export function friend3WeatherAudioTargets(value: unknown): Friend3WeatherAudioTargets {
  const state = normalizeFriend3WeatherAudioState(value);
  const regions = zeroWeights();
  for (const profile of FRIEND3_WEATHER_REGIONS) {
    regions[profile.id] = friend3WeatherRegionGain(profile, state.weights[profile.id], state);
  }
  const master = state.enabled && !state.muted ? state.masterVolume / 100 : 0;
  const indoor = friend3WeatherIndoorFactor(state.indoor);
  const snowHiss =
    0.1 *
    state.snow *
    (state.weights.summit * 0.9 + state.weights.mountain * 0.5 + state.weights.crater * 0.3 + state.weights.town * 0.06) *
    indoor *
    master;
  return { regions, snowHiss };
}

export type Friend3WeatherAudioOptions = {
  getContext?: () => AudioContext | undefined;
  fadeSeconds?: number;
  accentCooldownSeconds?: number;
};

type Bed = {
  source: AudioBufferSourceNode;
  filters: [BiquadFilterNode, BiquadFilterNode];
  gain: GainNode;
  profile: Friend3WeatherRegionProfile;
};

export function createFriend3WeatherAudio(options: Friend3WeatherAudioOptions = {}) {
  const getContext = options.getContext;
  const fadeSeconds = clamp(finiteOr(options.fadeSeconds, 2), 0.25, 8);
  const accentCooldown = clamp(finiteOr(options.accentCooldownSeconds, 0.8), 0.2, 5);
  let state = { ...FRIEND3_WEATHER_AUDIO_DEFAULT_STATE, weights: { ...FRIEND3_WEATHER_AUDIO_DEFAULT_STATE.weights } };
  let context: AudioContext | undefined;
  let ownsContext = false;
  let master: GainNode | undefined;
  let noise: AudioBuffer | undefined;
  let started = false;
  let beds: Bed[] = [];
  let snowHiss: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
  let lastApply = -Infinity;
  const lastAccent = new Map<Friend3WeatherAccentId, number>();
  let activeAccents = 0;

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
      master = next.createGain();
      master.gain.value = 1;
      master.connect(next.createDynamicsCompressor()).connect(next.destination);
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (!noise) {
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    return noise;
  }

  function createBed(ctx: AudioContext, profile: Friend3WeatherRegionProfile, offset: number): Bed {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.loop = true;
    const first = ctx.createBiquadFilter();
    first.type = profile.filterType;
    first.frequency.value = profile.filterHz;
    first.Q.value = profile.filterQ;
    const second = ctx.createBiquadFilter();
    second.type = profile.secondaryType;
    second.frequency.value = profile.secondaryHz;
    second.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(first).connect(second).connect(gain).connect(master!);
    source.start(0, offset);
    return { source, filters: [first, second], gain, profile };
  }

  function createGraph(ctx: AudioContext) {
    beds = FRIEND3_WEATHER_REGIONS.map((profile, index) => createBed(ctx, profile, index * 0.37 + 0.05));
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1900;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(master!);
    source.start(0, 1.13);
    snowHiss = { source, gain };
  }

  function applyTargets(immediate = false) {
    if (!context || !started) return;
    if (!immediate && context.currentTime - lastApply < 0.06) return;
    lastApply = context.currentTime;
    const now = context.currentTime;
    const targets = friend3WeatherAudioTargets(state);
    const constant = immediate ? 0.08 : Math.max(0.08, fadeSeconds / 3);
    for (const bed of beds) {
      bed.gain.gain.setTargetAtTime(targets.regions[bed.profile.id], now, constant);
      const filterScale = 1 - state.indoor * 0.32;
      bed.filters[0].frequency.setTargetAtTime(bed.profile.filterHz * filterScale, now, 0.35);
      bed.filters[1].frequency.setTargetAtTime(bed.profile.secondaryHz * filterScale, now, 0.35);
    }
    snowHiss?.gain.gain.setTargetAtTime(targets.snowHiss, now, constant);
  }

  function start(): boolean {
    const ctx = ensureContext();
    if (!ctx || !master) return false;
    if (!beds.length) createGraph(ctx);
    started = true;
    state = { ...state, enabled: true };
    if (ctx.state === 'suspended') void ctx.resume();
    applyTargets();
    return true;
  }

  function update(next: Partial<Friend3WeatherAudioState>): Friend3WeatherAudioState {
    state = normalizeFriend3WeatherAudioState({ ...state, ...next });
    applyTargets();
    return getState();
  }

  function updateFromField(
    field: Friend3WeatherFieldSample,
    options: { indoor?: number; masterVolume?: number; muted?: boolean; enabled?: boolean } = {},
  ): Friend3WeatherAudioState {
    const normalized = normalizeFriend3WeatherField(field);
    state = normalizeFriend3WeatherAudioState({
      ...state,
      ...options,
      weights: friend3WeatherWeightsFromField(normalized),
      wind: normalized.windStrength,
      snow: friend3WeatherSnowAmount(normalized.snowIntensityScale ?? 1),
    });
    applyTargets();
    return getState();
  }

  function setRegionWeights(weights: Partial<Record<Friend3WeatherRegion, number>>): Friend3WeatherAudioState {
    return update({ weights: normalizeFriend3WeatherWeights(weights) });
  }

  function setIndoor(indoor: number): Friend3WeatherAudioState {
    return update({ indoor });
  }

  function setWeatherIntensity(wind: number, snow: number): Friend3WeatherAudioState {
    return update({ wind, snow });
  }

  function setMasterVolume(volume: number): Friend3WeatherAudioState {
    return update({ masterVolume: volume });
  }

  function setMuted(muted: boolean): Friend3WeatherAudioState {
    return update({ muted });
  }

  function setEnabled(enabled: boolean): Friend3WeatherAudioState {
    return update({ enabled });
  }

  function stop() {
    update({ enabled: false });
  }

  function triggerAccent(id: Friend3WeatherAccentId): boolean {
    const accent = FRIEND3_WEATHER_ACCENTS.find(item => item.id === id);
    if (!accent || !context || !master || !started) return false;
    const masterLevel = state.enabled && !state.muted ? state.masterVolume / 100 : 0;
    const level = masterLevel * (1 - state.indoor * 0.7);
    if (level <= 0 || activeAccents >= 3) return false;
    const now = context.currentTime;
    const last = lastAccent.get(id) ?? -Infinity;
    if (now - last < accentCooldown) return false;
    lastAccent.set(id, now);
    activeAccents += 1;

    const bus = context.createGain();
    bus.gain.value = level;
    bus.connect(master);
    const sources: AudioScheduledSourceNode[] = [];
    const ctx = context;
    const tone = (at: number, duration: number, hz: number, endHz: number, gainLevel: number, type: OscillatorType) => {
      const oscillator = ctx.createOscillator();
      const amp = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(hz, at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), at + duration);
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.00011, gainLevel), at + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(amp).connect(bus);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.03);
      sources.push(oscillator);
    };
    const burst = (at: number, duration: number, startHz: number, endHz: number, gainLevel: number, type: BiquadFilterType) => {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(startHz, at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, endHz), at + duration);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.00011, gainLevel), at + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(filter).connect(amp).connect(bus);
      source.start(at, Math.random() * 0.4, duration + 0.03);
      sources.push(source);
    };
    switch (accent.id) {
      case 'chime':
        tone(now + 0.01, 0.7, 523.25, 523.25, 0.08, 'sine');
        tone(now + 0.14, 0.65, 659.25, 659.25, 0.06, 'sine');
        tone(now + 0.28, 0.55, 783.99, 783.99, 0.05, 'sine');
        break;
      case 'ice-crack':
        burst(now + 0.01, 0.08, 3200, 900, 0.16, 'highpass');
        tone(now + 0.01, 0.12, 1800, 420, 0.06, 'square');
        tone(now + 0.03, 0.36, 82, 38, 0.1, 'sine');
        break;
      case 'rail-clack':
        burst(now + 0.01, 0.08, 1900, 520, 0.12, 'bandpass');
        tone(now + 0.01, 0.1, 96, 55, 0.11, 'triangle');
        tone(now + 0.07, 0.06, 230, 90, 0.04, 'square');
        break;
      case 'pulley-squeak':
        tone(now + 0.01, 0.18, 880, 1240, 0.05, 'sine');
        burst(now + 0.01, 0.12, 900, 600, 0.04, 'bandpass');
        break;
    }
    const finish = () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already finished.
        }
        try {
          source.disconnect();
        } catch {
          // Already disconnected.
        }
      }
      try {
        bus.disconnect();
      } catch {
        // Already disconnected.
      }
      activeAccents = Math.max(0, activeAccents - 1);
    };
    window.setTimeout(finish, (accent.duration + 0.2) * 1000);
    return true;
  }

  function getState(): Friend3WeatherAudioState {
    return {
      ...state,
      weights: { ...state.weights },
    };
  }

  function getTargets(): Friend3WeatherAudioTargets {
    return friend3WeatherAudioTargets(state);
  }

  function dispose() {
    for (const bed of beds) {
      try {
        bed.source.stop();
        bed.source.disconnect();
        bed.gain.disconnect();
      } catch {
        // Already stopped.
      }
    }
    if (snowHiss) {
      try {
        snowHiss.source.stop();
        snowHiss.source.disconnect();
        snowHiss.gain.disconnect();
      } catch {
        // Already stopped.
      }
    }
    beds = [];
    snowHiss = undefined;
    if (context && ownsContext) {
      void context.close().catch(() => undefined);
    }
    context = undefined;
    master = undefined;
    noise = undefined;
    started = false;
  }

  return {
    start,
    stop,
    update,
    updateFromField,
    setRegionWeights,
    setIndoor,
    setWeatherIntensity,
    setMasterVolume,
    setMuted,
    setEnabled,
    setRegionWeight: (region: Friend3WeatherRegion, value: number) =>
      update({ weights: normalizeFriend3WeatherWeights({ ...state.weights, [region]: value }) }),
    triggerAccent,
    getState,
    getTargets,
    dispose,
    isStarted: () => started,
  };
}

export type Friend3WeatherAudio = ReturnType<typeof createFriend3WeatherAudio>;