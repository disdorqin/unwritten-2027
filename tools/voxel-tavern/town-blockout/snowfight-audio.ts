// D1 团队雪仗音效：全部 WebAudio 合成，无外部音频文件。懒建 AudioContext（首次用户手势后）。
export function createSnowfightAudio() {
  let context: AudioContext | undefined;
  let noiseBuffer: AudioBuffer | undefined;

  function ac(): AudioContext | undefined {
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume();
      return context;
    } catch { return undefined; }
  }

  function noise(ctx: AudioContext): AudioBuffer {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function burstNoise(duration: number, fromHz: number, toHz: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const ctx = ac();
    if (!ctx || gain <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 1.1;
    const now = ctx.currentTime;
    filter.frequency.setValueAtTime(fromHz, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), now + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start(now, Math.random() * .5, duration + .05);
  }

  function tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0, slideTo?: number) {
    const ctx = ac();
    if (!ctx || gain <= 0) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(gain, now + .012);
    amp.gain.exponentialRampToValueAtTime(.001, now + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + .05);
  }

  return {
    /** 投掷破空声：带通噪声扫频，音量由调用方按距离给出（0–1）。 */
    whoosh(strength: number) {
      burstNoise(.18, 300, 1400, .22 * Math.max(0, Math.min(1, strength)));
    },
    place() { burstNoise(.09, 500, 160, .3, 'lowpass'); tone(140, .08, .12, 'triangle'); },
    crack() { burstNoise(.07, 2400, 900, .25); },
    destroy() { burstNoise(.32, 900, 180, .34, 'lowpass'); },
    capture() { tone(660, .16, .16, 'sine'); tone(880, .22, .16, 'sine', .1); },
    start() { tone(523, .14, .15, 'triangle'); tone(659, .14, .15, 'triangle', .11); tone(784, .2, .15, 'triangle', .22); },
    finish() { tone(784, .16, .15, 'triangle'); tone(659, .16, .15, 'triangle', .13); tone(523, .26, .15, 'triangle', .26); },
  };
}
