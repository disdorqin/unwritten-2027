const storageKey = 'unwritten.town-bgm.v1';
const defaultSettings = { muted: false, volume: 32 };
const barSeconds = 4;
const lookahead = .50;
const plainsCutoff = 3900;
const roomCutoff = 1150;

const score = [
  { pad: [48, 55, 64], melody: [[.70, 67], [2.62, 64]] },
  { pad: [45, 52, 60], melody: [[1.38, 69]] },
  { pad: [41, 53, 60], melody: [[.81, 67], [2.54, 62]] },
  { pad: [43, 55, 62], melody: [[1.35, 60], [2.80, 64]] },
  { pad: [48, 55, 64], melody: [[.72, 72], [2.90, 69]] },
  { pad: [45, 55, 60], melody: [[1.67, 67]] },
  { pad: [41, 53, 60], melody: [[.79, 64], [2.18, 62]] },
  { pad: [43, 55, 62], melody: [[1.21, 60]] },
] as const;

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
type AudioGraph = {
  context: AudioContext;
  bed: GainNode;
  room: BiquadFilterNode;
  master: GainNode;
  padVoice: PeriodicWave;
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

function makeWind(context: AudioContext, bed: GainNode) {
  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = noise.getChannelData(0);
  const fade = Math.round(.085 * context.sampleRate);
  let seed = 4317;
  let smoothed = 0;
  for (let index = 0; index < samples.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    smoothed = .94 * smoothed + .06 * (seed / 2147483648 - 1);
    const edge = Math.min(1, index / fade, (samples.length - 1 - index) / fade);
    samples[index] = smoothed * edge;
  }
  const wind = context.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const color = context.createBiquadFilter();
  color.type = 'bandpass';
  color.frequency.value = 410;
  color.Q.value = .38;
  const gain = context.createGain();
  gain.gain.value = .025;
  wind.connect(color).connect(gain).connect(bed);
  wind.start();
}

function pad(graph: AudioGraph, at: number, note: number, index: number) {
  const tone = graph.context.createOscillator();
  tone.frequency.setValueAtTime(hz(note), at);
  tone.detune.value = (index - 1) * 2;
  tone.setPeriodicWave(graph.padVoice);
  const envelope = graph.context.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(index === 0 ? .071 : .040, at + .58);
  envelope.gain.linearRampToValueAtTime(.026, at + 3.14);
  envelope.gain.linearRampToValueAtTime(0, at + barSeconds + .38);
  tone.connect(envelope).connect(graph.bed);
  tone.start(at);
  tone.stop(at + barSeconds + .39);
}

function pluck(graph: AudioGraph, at: number, note: number) {
  const tone = graph.context.createOscillator();
  tone.type = 'triangle';
  tone.frequency.value = hz(note);
  const envelope = graph.context.createGain();
  envelope.gain.setValueAtTime(.0001, at);
  envelope.gain.exponentialRampToValueAtTime(.091, at + .024);
  envelope.gain.exponentialRampToValueAtTime(.011, at + .32);
  envelope.gain.exponentialRampToValueAtTime(.0001, at + 1.30);
  tone.connect(envelope).connect(graph.bed);
  tone.start(at);
  tone.stop(at + 1.31);
}

export function createTownBgm() {
  const settings = readSettings();
  let graph: AudioGraph | undefined;
  let timer: number | undefined;
  let nextBar = 0;
  let nextTime = 0;
  let entered = false;
  let inRoom = false;

  function schedule() {
    timer = undefined;
    if (!graph || graph.context.state !== 'running' || settings.muted || settings.volume === 0) return;
    const now = graph.context.currentTime;
    if (nextTime < now) nextTime = now + .06;
    while (nextTime < now + lookahead) {
      const bar = score[nextBar];
      for (const [index, note] of bar.pad.entries()) pad(graph, nextTime, note, index);
      for (const [offset, note] of bar.melody) pluck(graph, nextTime + offset, note);
      nextTime += barSeconds;
      nextBar = (nextBar + 1) % score.length;
    }
    timer = window.setTimeout(schedule, 270);
  }

  function updateOutput() {
    if (!graph) return;
    const at = graph.context.currentTime;
    graph.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume / 100 * (inRoom ? .82 : 1), at, .075);
    graph.room.frequency.setTargetAtTime(inRoom ? roomCutoff : plainsCutoff, at, .16);
    if ((settings.muted || settings.volume === 0) && timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  }

  function activate() {
    if (!entered || settings.muted || settings.volume === 0) return;
    try {
      if (!graph) {
        const context = new AudioContext();
        const bed = context.createGain();
        const room = context.createBiquadFilter();
        room.type = 'lowpass';
        room.frequency.value = inRoom ? roomCutoff : plainsCutoff;
        room.Q.value = .43;
        const master = context.createGain();
        master.gain.value = 0;
        bed.connect(room).connect(master).connect(context.destination);
        const padVoice = context.createPeriodicWave(new Float32Array(4), new Float32Array([0, 1, .18, .035]));
        makeWind(context, bed);
        graph = { context, bed, room, master, padVoice };
      }
      const current = graph;
      function run() {
        updateOutput();
        if (timer === undefined && current.context.state === 'running') schedule();
      }
      if (current.context.state === 'running') run();
      else void current.context.resume().then(run).catch(() => {});
    } catch { /* Unsupported or refused audio does not block entry. */ }
  }

  function mountControls(parent: HTMLElement) {
    const controls = document.createElement('div');
    controls.className = 'town-bgm-controls';
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.textContent = '背景音乐静音';
    mute.setAttribute('aria-pressed', String(settings.muted));
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
      mute.setAttribute('aria-pressed', String(settings.muted));
      change();
    };
    volume.oninput = () => {
      settings.volume = volume.valueAsNumber;
      change();
    };
    controls.append(mute, label);
    parent.append(controls);
  }

  return {
    mountControls,
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
