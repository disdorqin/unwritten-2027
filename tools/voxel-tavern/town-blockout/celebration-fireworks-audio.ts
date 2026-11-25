import type { ShellGrade } from './celebration-fireworks-score';

const storageKey = 'unwritten.fireworks-audio.v1';
const boomLevel = { S: .25, M: .4, L: .6, XL: .85 };
type Position = { x: number; y: number; z: number };
type Event = { kind: 'whoosh' | 'boom' | 'bed'; offset: number; distance: number; grade?: ShellGrade; seed: number };

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (typeof value?.muted === 'boolean' && Number.isFinite(value.volume)) {
      return { muted: value.muted as boolean, volume: Math.max(0, Math.min(100, Math.round(value.volume))) };
    }
  } catch { /* Storage can be unavailable. */ }
  return { muted: false, volume: 100 };
}

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

function proximity(distance: number, range: number) {
  return 1 / (1 + (distance / range) ** 2);
}

export function showSoundDelay(distance: number) {
  return Math.min(.9, distance / 343);
}

export function createFireworksAudio(getContext: () => AudioContext | undefined, reducedMotion: boolean) {
  const settings = readSettings();
  const whooshes: number[] = [];
  const boomBuckets = new Map<number, GainNode[]>();
  let graph: { context: AudioContext; master: GainNode; music: GainNode; noise: AudioBuffer } | undefined;
  let lastMusicBeat = -Infinity;

  function ensureGraph() {
    const context = getContext();
    if (!context || context.state !== 'running') return;
    if (!graph) {
      const master = context.createGain();
      master.gain.value = settings.muted ? 0 : settings.volume / 100;
      master.connect(context.createDynamicsCompressor()).connect(context.destination);
      const music = context.createGain();
      music.gain.value = 0;
      music.connect(context.destination);
      const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const random = randomFrom(0x14327);
      const channel = noise.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = random() * 2 - 1;
      graph = { context, master, music, noise };
    }
    return graph;
  }

  function noiseBurst(audio: NonNullable<typeof graph>, at: number, length: number, level: number,
    filterType: BiquadFilterType, hz: number, endHz = hz, seed = 0) {
    const { context, master, noise } = audio;
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(hz, at);
    filter.frequency.exponentialRampToValueAtTime(endHz, at + length);
    const envelope = context.createGain();
    const attack = Math.min(.025, length / 4);
    envelope.gain.setValueAtTime(.00001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.000011, level), at + attack);
    envelope.gain.exponentialRampToValueAtTime(.00001, at + length);
    source.connect(filter).connect(envelope).connect(master);
    source.start(at, randomFrom(seed)() * Math.max(0, .98 - length), length);
  }

  function tone(context: AudioContext, bus: AudioNode, at: number, length: number, hz: number, level: number,
    type: OscillatorType, endHz = hz, attack = .023) {
    const source = context.createOscillator();
    const envelope = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(hz, at);
    source.frequency.exponentialRampToValueAtTime(endHz, at + length);
    envelope.gain.setValueAtTime(.00001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.000011, level), at + attack);
    envelope.gain.exponentialRampToValueAtTime(.00001, at + length);
    source.connect(envelope).connect(bus);
    source.start(at);
    source.stop(at + length);
    return envelope;
  }

  function play(events: readonly Event[]) {
    if (!events.length || settings.muted || settings.volume === 0) return;
    const audio = ensureGraph();
    if (!audio) return;
    const now = audio.context.currentTime;
    while (whooshes.length && whooshes[0] <= now) whooshes.shift();
    for (const key of boomBuckets.keys()) if (key < Math.floor(now * 10) - 1) boomBuckets.delete(key);
    for (const effect of [...events].sort((left, right) => left.distance - right.distance)) {
      const at = now + Math.max(0, effect.offset);
      const gain = proximity(effect.distance, effect.kind === 'whoosh' ? 220 : 320);
      if (effect.kind === 'whoosh') {
        if (whooshes.filter(end => end > at).length >= 6) continue;
        whooshes.push(at + .8);
        whooshes.sort((a, b) => a - b);
        noiseBurst(audio, at, .8, .17 * gain, 'bandpass', 250, 1200, effect.seed);
        continue;
      }
      if (effect.kind === 'bed') {
        if (!reducedMotion) noiseBurst(audio, at, .004 + randomFrom(effect.seed)() * .002, .09 * gain, 'highpass', 1800, 1800, effect.seed);
        continue;
      }

      const delayed = at + showSoundDelay(effect.distance);
      const key = Math.floor(delayed * 10);
      const voices = boomBuckets.get(key) ?? [];
      const grade = effect.grade ?? 'S';
      const loudness = boomLevel[grade] * gain;
      if (voices.length < 4) {
        const mix = audio.context.createGain();
        mix.connect(audio.master);
        voices.push(mix);
        boomBuckets.set(key, voices);
        tone(audio.context, mix, delayed, .35, 110, loudness * .65, 'sine', 38);
        noiseBurst(audio, delayed, .25, loudness * .29, 'lowpass', 400, 400, effect.seed);
      } else {
        const group = voices[voices.length - 1];
        group.gain.setTargetAtTime(Math.min(1.4, group.gain.value + loudness * .25), delayed, .028);
      }
      if (grade === 'S' || grade === 'M') continue;
      const random = randomFrom(effect.seed);
      const span = 1.2 + random() * .8;
      const size = 14 + Math.floor(random() * 13);
      const count = reducedMotion ? Math.ceil(size / 2) : size;
      for (let i = 0; i < count; i++) {
        const tick = delayed + .15 + (i + random()) * span / count;
        noiseBurst(audio, tick, .003 + random() * .003, (.05 + random() * .15) * gain * (1 - .6 * i / count),
          'highpass', 1800, 1800, effect.seed + i);
      }
    }
  }

  const notes = [293.66, 329.63, 392, 440, 493.88, 440, 392, 329.63];
  function music(seconds: number | undefined, level: number) {
    if (seconds === undefined || seconds < -60 || seconds >= 90) {
      if (graph) graph.music.gain.setTargetAtTime(0, graph.context.currentTime, .08);
      lastMusicBeat = -Infinity;
      return;
    }
    if (!level && !graph) return;
    const audio = ensureGraph();
    if (!audio) return;
    const now = audio.context.currentTime;
    const master = Math.min(1, Math.max(0, level)) * Math.min(1, Math.max(0, (90 - seconds) / 6));
    audio.music.gain.setTargetAtTime(master, now, .075);
    const beat = Math.floor(seconds * 2);
    if (beat === lastMusicBeat || master === 0) return;
    lastMusicBeat = beat;
    const scale = ((beat % notes.length) + notes.length) % notes.length;
    const note = notes[scale];
    if (beat % 8 === 0) {
      tone(audio.context, audio.music, now, 4.3, 146.83, .057, 'sine', 146.83, .7);
      tone(audio.context, audio.music, now, 4.0, 196, .034, 'sine', 196, .7);
    }
    if (seconds < -10 || seconds >= 0) {
      tone(audio.context, audio.music, now, .48, note * 2, .025, 'triangle', note * 2, .008);
    }
    if (seconds >= 0 && seconds < 30) {
      tone(audio.context, audio.music, now, .49, note, .065, 'sine', note, .044);
      if (beat % 2 === 0) tone(audio.context, audio.music, now, .13, 168, .055, 'triangle', 52, .006);
    }
  }

  function mountSettings(parent: HTMLElement) {
    const controls = document.createElement('div');
    controls.className = 'town-bgm-controls';
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.textContent = '烟花音效静音';
    mute.setAttribute('aria-pressed', String(settings.muted));
    const label = document.createElement('label');
    label.textContent = '烟花音效音量';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(settings.volume);
    label.append(slider);
    function save() {
      if (graph) graph.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume / 100, graph.context.currentTime, .06);
      try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Preserve this session's choice. */ }
    }
    mute.onclick = () => {
      settings.muted = !settings.muted;
      mute.setAttribute('aria-pressed', String(settings.muted));
      save();
    };
    slider.oninput = () => { settings.volume = slider.valueAsNumber; save(); };
    controls.append(mute, label);
    parent.append(controls);
  }

  return { play, music, mountSettings };
}

export function fireworksBed(from: number, until: number, start: number, end: number, listener: Position) {
  const events: Event[] = [];
  const distance = Math.hypot(listener.x - 218, listener.y - 15, listener.z + 196);
  for (let second = Math.max(Math.floor(from), start); second < end && second <= until; second++) {
    const rate = second === start ? 30 : 14;
    const random = randomFrom(second * 3541);
    for (let i = 0; i < rate; i++) {
      const at = second + (i + random()) / rate;
      if (at >= from && at < until) events.push({ kind: 'bed', offset: at - from, distance, seed: second * rate + i });
    }
  }
  return events;
}

export type FireworksSoundEvent = Event;
