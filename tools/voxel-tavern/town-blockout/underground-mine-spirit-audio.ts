type ScenePoint = Readonly<{ x: number; y: number; z: number }>;

export type MineSpiritKnockCue = Readonly<{
  /** Increasing event number from the host for this mount. */
  sequence: number;
  domainId: string;
  origin: ScenePoint;
  rangeMetres: number;
}>;

export type MineSpiritAudioFrame = Readonly<{
  activeDomain?: string;
  soulSightGranted: boolean;
  /** Accepted listener position in the same scene frame as the source. */
  listener?: ScenePoint;
  cue?: MineSpiritKnockCue;
}>;

const lengthSeconds = .50;
const blows = [
  { at: .014, frequency: 211, level: .044 },
  { at: .159, frequency: 246, level: .032 },
  { at: .337, frequency: 222, level: .039 },
] as const;

function buildKnocks(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(rate * lengthSeconds), rate);
  const samples = buffer.getChannelData(0);
  let seed = 7019;
  for (const { at, frequency, level } of blows) {
    const onset = Math.floor(at * rate);
    const tail = Math.min(samples.length, onset + Math.floor(.105 * rate));
    let stoneNoise = 0;
    for (let i = onset; i < tail; i++) {
      const t = (i - onset) / rate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      stoneNoise += .21 * (seed / 2147483648 - 1 - stoneNoise);
      const phase = 2 * Math.PI * frequency * t;
      const attack = Math.min(t / .004, 1);
      const decay = (1 - t / .105) ** 3;
      samples[i] += level * attack * decay *
        (.45 * Math.sin(phase) + .32 * Math.sin(2.41 * phase) + .23 * stoneNoise);
    }
  }
  return buffer;
}

function finitePoint({ x, y, z }: ScenePoint): boolean {
  return [x, y, z].every(Number.isFinite);
}

function audible(frame: MineSpiritAudioFrame, cue: MineSpiritKnockCue): boolean {
  const { listener, activeDomain, soulSightGranted } = frame;
  return soulSightGranted === true && cue.domainId !== '' && activeDomain === cue.domainId &&
    listener !== undefined && finitePoint(listener) && finitePoint(cue.origin) &&
    Number.isFinite(cue.rangeMetres) && cue.rangeMetres > 0 &&
    Math.hypot(listener.x - cue.origin.x, listener.y - cue.origin.y, listener.z - cue.origin.z) <= cue.rangeMetres;
}

/** The host owns the unlocked context, mixed output, live AudioListener and accepted cues. */
export function createUndergroundMineSpiritAudio(context: BaseAudioContext, output: AudioNode) {
  if (output.context !== context) throw new TypeError('The spirit audio bus must use the host audio context');

  let latestSequence = -1;
  let buffer: AudioBuffer | undefined;
  let disposed = false;
  let voice: { cue: MineSpiritKnockCue; source: AudioBufferSourceNode; panner: PannerNode } | undefined;

  function release(stop: boolean) {
    if (!voice) return;
    const { source, panner } = voice;
    voice = undefined;
    source.onended = null;
    if (stop) source.stop();
    source.disconnect();
    panner.disconnect();
  }

  return {
    sync(frame: MineSpiritAudioFrame): boolean {
      if (disposed) return false;
      const running = context.state === 'running';
      if (voice && (!running || !audible(frame, voice.cue))) release(true);

      const { cue } = frame;
      if (!cue || !Number.isSafeInteger(cue.sequence) || cue.sequence < 0 || cue.sequence <= latestSequence) return false;
      // Consume rejected cues as well so re-entering the domain or unlocking audio cannot reveal a past knock.
      latestSequence = cue.sequence;
      if (voice || !running || !audible(frame, cue)) return false;

      const source = context.createBufferSource();
      source.buffer = buffer ??= buildKnocks(context);
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'linear';
      panner.refDistance = Math.min(.75, cue.rangeMetres / 2);
      panner.maxDistance = cue.rangeMetres;
      panner.positionX.value = cue.origin.x;
      panner.positionY.value = cue.origin.y;
      panner.positionZ.value = cue.origin.z;
      source.connect(panner).connect(output);
      voice = { source, panner, cue: { ...cue, origin: { ...cue.origin } } };
      source.onended = () => {
        if (voice?.source === source) release(false);
      };
      source.start(context.currentTime);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release(true);
    },
  };
}
