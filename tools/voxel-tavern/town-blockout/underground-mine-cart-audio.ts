type CartSoundPosition = Readonly<{ layer: string; x: number; y: number; z: number }>;

type CartAudioOptions = Readonly<{
  getContext(): BaseAudioContext | undefined;
  output?(context: BaseAudioContext): AudioNode;
}>;

const duration = .43;
const contacts = [
  { at: 0, level: .087, pitch: 630 },
  { at: .106, level: .064, pitch: 695 },
  { at: .193, level: .055, pitch: 660 },
  { at: .304, level: .105, pitch: 530 },
];

function makeRollingSound(context: BaseAudioContext): AudioBuffer {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const samples = buffer.getChannelData(0);
  const radians = 2 * Math.PI;
  let seed = 7319;
  let rumble = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    rumble += .07 * (noise - rumble);
    const rolling = Math.sin(Math.PI * t / duration);
    let sample = .038 * rolling ** 2 * (rumble * 1.7 + .22 * Math.sin(radians * 94 * t));
    for (const { at, level, pitch } of contacts) {
      const elapsed = t - at;
      if (elapsed < 0 || elapsed > .12) continue;
      const envelope = level * Math.min(1, elapsed / .002) * Math.exp(-58 * elapsed);
      sample += envelope * (.48 * Math.sin(radians * pitch * elapsed) +
        .35 * Math.sin(radians * pitch * 2.27 * elapsed) + .17 * noise);
    }
    samples[i] = sample;
  }
  return buffer;
}

/** Play an accepted push into the host's unlocked spatial scene audio. */
export function createUndergroundMineCartAudio({ getContext, output }: CartAudioOptions) {
  const buffers = new WeakMap<BaseAudioContext, AudioBuffer>();
  let listenerLayer: string | undefined;
  let disposed = false;
  let active: { source: AudioBufferSourceNode; panner: PannerNode } | undefined;

  function release(stop: boolean) {
    if (!active) return;
    const { source, panner } = active;
    active = undefined;
    source.onended = null;
    if (stop) source.stop();
    source.disconnect();
    panner.disconnect();
  }

  return {
    setListenerLayer(layer?: string) {
      if (disposed || layer === listenerLayer) return;
      listenerLayer = layer;
      release(true);
    },
    play({ layer, x, y, z }: CartSoundPosition): boolean {
      if (disposed || active || !layer || listenerLayer !== layer || ![x, y, z].every(Number.isFinite)) return false;
      const context = getContext();
      if (context?.state !== 'running') return false;
      const destination = output?.(context) ?? context.destination;
      if (destination.context !== context) return false;

      let buffer = buffers.get(context);
      if (!buffer) {
        buffer = makeRollingSound(context);
        buffers.set(context, buffer);
      }
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'linear';
      panner.refDistance = .8;
      panner.maxDistance = 9;
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(panner).connect(destination);
      active = { source, panner };
      source.onended = () => {
        if (active?.source === source) release(false);
      };
      source.start();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listenerLayer = undefined;
      release(true);
    },
  };
}
