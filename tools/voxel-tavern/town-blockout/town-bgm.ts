const storageKey = 'unwritten.town-bgm.v1';
const defaultSettings = { muted: true, volume: 32 };
const barSeconds = 4;
const lookahead = .50;
const plainsCutoff = 3900;
const roomCutoff = 1150;

const score = [
  { low: [50, 57], lead: [69, 71, 74, 71], strings: [62, 69, 74] },
  { low: [50, 57], lead: [69, 66, 64, 66], strings: [66, 69, 74] },
  { low: [47, 54], lead: [69, 71, 74, 76], strings: [59, 66, 69, 74] },
  { low: [47, 54], lead: [74, 71, 69], strings: [66, 69, 71] },
  { low: [43, 50], lead: [66, 69, 71, 69], strings: [59, 62, 69] },
  { low: [43, 50], lead: [66, 64, 62, 64], strings: [62, 66, 71] },
  { low: [45, 52], lead: [66, 64, 62, 59], strings: [59, 64, 69, 71] },
  { low: [45, 52], lead: [62], strings: [64, 69, 74] },
] as const;

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
type AudioGraph<T extends BaseAudioContext = BaseAudioContext> = {
  context: T;
  bed: GainNode;
  room: BiquadFilterNode;
  master: GainNode;
  percussion: GainNode;
  noise: AudioBuffer;
  padVoice: PeriodicWave;
  fluteVoice: PeriodicWave;
};

function readSettings() {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (data && typeof data === 'object' && 'volume' in data && 'muted' in data &&
        typeof data.volume === 'number' && Number.isFinite(data.volume) && typeof data.muted === 'boolean') {
      return { muted: data.muted, volume: Math.max(0, Math.min(100, Math.round(data.volume))) };
    }
  } catch { /* Audio remains usable with storage disabled. */ }
  return { ...defaultSettings };
}

function makeNoise(context: BaseAudioContext) {
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noise.getChannelData(0);
  let seed = 4317;
  for (let index = 0; index < samples.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[index] = seed / 2147483648 - 1;
  }
  return noise;
}

function makeGraph<T extends BaseAudioContext>(context: T, indoor: boolean): AudioGraph<T> {
  const bed = context.createGain();
  const percussion = context.createGain();
  percussion.gain.value = indoor ? 0 : 1;
  percussion.connect(bed);
  const room = context.createBiquadFilter();
  room.type = 'lowpass';
  room.frequency.value = indoor ? roomCutoff : plainsCutoff;
  room.Q.value = .43;
  const master = context.createGain();
  master.gain.value = 0;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -23;
  limiter.knee.value = 16;
  limiter.ratio.value = 4;
  bed.connect(room).connect(limiter).connect(master).connect(context.destination);

  const noise = makeNoise(context);
  const wind = context.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const color = context.createBiquadFilter();
  color.type = 'bandpass';
  color.frequency.value = 360;
  color.Q.value = .38;
  const windLevel = context.createGain();
  windLevel.gain.value = .012;
  wind.connect(color).connect(windLevel).connect(bed);
  wind.start();

  const padVoice = context.createPeriodicWave(new Float32Array(4), new Float32Array([0, 1, .12, .035]));
  const fluteVoice = context.createPeriodicWave(new Float32Array(4), new Float32Array([0, 1, .22, .085]));
  return { context, bed, room, master, percussion, noise, padVoice, fluteVoice };
}

function pad(graph: AudioGraph, at: number, note: number, index: number) {
  const tone = graph.context.createOscillator();
  tone.frequency.value = hz(note);
  tone.setPeriodicWave(graph.padVoice);
  const soften = graph.context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 600;
  const envelope = graph.context.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(index === 0 ? .038 : .021, at + 1.5);
  envelope.gain.setValueAtTime(index === 0 ? .038 : .021, at + barSeconds * 2 - .65);
  envelope.gain.linearRampToValueAtTime(0, at + barSeconds * 2 + .75);
  tone.connect(soften).connect(envelope).connect(graph.bed);
  tone.start(at);
  tone.stop(at + barSeconds * 2 + .77);
}

function yangqin(graph: AudioGraph, at: number, note: number, accent: boolean) {
  const { context, bed } = graph;
  const fundamental = hz(note);
  const gain = accent ? 1 : .75;
  for (const [ratio, level, decay] of [[1, .073, .87], [2, .026, .48], [3, .013, .31], [4.2, .009, .17]]) {
    const partial = context.createOscillator();
    const envelope = context.createGain();
    partial.frequency.value = fundamental * ratio;
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level * gain, at + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + decay);
    partial.connect(envelope).connect(bed);
    partial.start(at);
    partial.stop(at + decay + .012);
  }
  const strike = context.createBufferSource();
  strike.buffer = graph.noise;
  const color = context.createBiquadFilter();
  color.type = 'bandpass';
  color.frequency.value = 2150;
  const volume = context.createGain();
  volume.gain.setValueAtTime(.016, at);
  volume.gain.exponentialRampToValueAtTime(.0001, at + .012);
  strike.connect(color).connect(volume).connect(bed);
  strike.start(at, .037, .013);
}

function dizi(graph: AudioGraph, at: number, note: number, span: number, emphasis: number) {
  const { context, bed } = graph;
  const frequency = hz(note);
  const end = at + span;
  const tone = context.createOscillator();
  tone.frequency.value = frequency;
  tone.setPeriodicWave(graph.fluteVoice);
  const envelope = context.createGain();
  const volume = .112 * emphasis;
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(volume, at + .087);
  envelope.gain.linearRampToValueAtTime(volume * .8, end - .11);
  envelope.gain.linearRampToValueAtTime(0, end);
  tone.connect(envelope).connect(bed);
  const vibrato = context.createOscillator();
  const depth = context.createGain();
  vibrato.frequency.value = 5;
  depth.gain.setValueAtTime(0, at);
  depth.gain.setValueAtTime(0, at + .25);
  depth.gain.linearRampToValueAtTime(10.4, at + .41);
  vibrato.connect(depth).connect(tone.detune);
  vibrato.start(at);
  vibrato.stop(end);
  tone.start(at);
  tone.stop(end);

  const air = context.createBufferSource();
  air.buffer = graph.noise;
  air.loop = true;
  const color = context.createBiquadFilter();
  color.type = 'bandpass';
  color.frequency.value = frequency * 1.72;
  color.Q.value = .65;
  const airLevel = context.createGain();
  airLevel.gain.value = .145;
  air.connect(color).connect(airLevel).connect(envelope);
  air.start(at);
  air.stop(end);
}

function woodblock(graph: AudioGraph, at: number) {
  const { context, percussion } = graph;
  const hit = context.createOscillator();
  hit.frequency.value = 1900;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(.0001, at);
  envelope.gain.exponentialRampToValueAtTime(.010, at + .005);
  envelope.gain.exponentialRampToValueAtTime(.0001, at + .064);
  hit.connect(envelope).connect(percussion);
  hit.start(at);
  hit.stop(at + .075);
}

function playDailyBar(graph: AudioGraph, index: number, at: number) {
  const bar = score[index];
  if (index % 2 === 0) bar.low.forEach((note, part) => pad(graph, at, note, part));
  const starts = [.21, 1.11, 2.02, 2.89];
  const stresses = [1, .79, .90, .83];
  bar.lead.forEach((note, part) => {
    const last = part === bar.lead.length - 1;
    const duration = last ? (index === 7 ? 3.22 : index === 3 ? 1.62 : .68) : .73;
    dizi(graph, at + starts[part], note, duration, stresses[part]);
  });
  const pluckTimes = [.02, 1.36, 2.55, 3.59];
  bar.strings.forEach((note, part) => yangqin(graph, at + pluckTimes[part], note, part === 0));
  if (index % 2 === 1) woodblock(graph, at + 3.77);
}

export function renderDailyBgmPreview(context: OfflineAudioContext) {
  const graph = makeGraph(context, false);
  graph.master.gain.setTargetAtTime(defaultSettings.volume / 100, 0, .075);
  for (let at = .08, bar = 0; at < context.length / context.sampleRate; at += barSeconds, bar++) {
    playDailyBar(graph, bar % score.length, at);
  }
  return context.startRendering();
}

export function createTownBgm(getAudioContext: () => AudioContext) {
  const settings = readSettings();
  let graph: AudioGraph<AudioContext> | undefined;
  let timer: number | undefined;
  let nextBar = 0;
  let nextTime = 0;
  let entered = false;
  let inRoom = false;
  let duck = 1;

  function schedule() {
    timer = undefined;
    if (!graph || graph.context.state !== 'running' || settings.muted || settings.volume === 0) return;
    const now = graph.context.currentTime;
    if (nextTime < now) nextTime = now + .06;
    while (nextTime < now + lookahead) {
      playDailyBar(graph, nextBar, nextTime);
      nextTime += barSeconds;
      nextBar = (nextBar + 1) % score.length;
    }
    timer = window.setTimeout(schedule, 270);
  }

  function updateOutput() {
    if (!graph) return;
    const at = graph.context.currentTime;
    graph.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume / 100 * (inRoom ? .82 : 1) * duck, at, .075);
    graph.room.frequency.setTargetAtTime(inRoom ? roomCutoff : plainsCutoff, at, .16);
    graph.percussion.gain.setTargetAtTime(inRoom ? 0 : 1, at, .09);
    if ((settings.muted || settings.volume === 0) && timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  }

  function activate() {
    if (!entered || settings.muted || settings.volume === 0) return;
    try {
      graph ??= makeGraph(getAudioContext(), inRoom);
      const current = graph;
      function run() {
        updateOutput();
        if (timer === undefined && current.context.state === 'running') schedule();
      }
      if (current.context.state === 'running') run();
      else void current.context.resume().then(run).catch(() => {});
    } catch { /* Unsupported or refused audio does not block entry. */ }
  }

  function mountControls(parent: HTMLElement, mute: HTMLButtonElement) {
    const controls = document.createElement('div');
    controls.className = 'town-bgm-controls';
    mute.setAttribute('aria-pressed', String(!settings.muted));
    const label = document.createElement('label');
    label.textContent = '背景音乐音量';
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.value = String(settings.volume);
    label.append(volume);

    function change() {
      if (settings.muted || settings.volume === 0) updateOutput();
      else activate();
      try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Use this session's choice. */ }
    }
    mute.onclick = () => {
      settings.muted = !settings.muted;
      entered = true;
      mute.setAttribute('aria-pressed', String(!settings.muted));
      change();
    };
    volume.oninput = () => {
      settings.volume = volume.valueAsNumber;
      change();
    };
    controls.append(label);
    parent.append(controls);
  }

  return {
    mountControls,
    setDuck(level: number) {
      if (level !== duck) {
        duck = level;
        updateOutput();
      }
      return settings.muted ? 0 : settings.volume / 100;
    },
    enter() {
      entered = true;
      activate();
    },
    setIndoor(indoor: boolean) {
      if (inRoom === indoor) return;
      inRoom = indoor;
      updateOutput();
    },
  };
}
