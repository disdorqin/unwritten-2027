import { undergroundCrystalMimicCues, type createUndergroundCrystalMimic } from './underground-crystal-mimic';

type MimicSample = ReturnType<ReturnType<typeof createUndergroundCrystalMimic>['sample']>;
type MimicAudioFrame = Readonly<{
  listenerDomain: string | undefined;
  acceptedDistanceMetres: number | undefined;
  sample: Pick<MimicSample, 'phase' | 'chimeEligible' | 'recognition' | 'unfoldProgress'>;
}>;

const chimeGapSeconds = 2.6;
const chimeDuration = .15;
const revealDuration = undergroundCrystalMimicCues.reveal.unfoldMs / 1000;

function makeBuffer(context: BaseAudioContext, seconds: number) {
  return context.createBuffer(1, Math.ceil(seconds * context.sampleRate), context.sampleRate);
}

function makeChime(context: BaseAudioContext) {
  const buffer = makeBuffer(context, chimeDuration);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const t = i / buffer.sampleRate;
    const envelope = Math.min(t / .008, 1) * (1 - t / chimeDuration) ** 3;
    samples[i] = envelope * (
      .009 * Math.sin(2 * Math.PI * 2350 * t) + .003 * Math.sin(2 * Math.PI * 3170 * t)
    );
  }
  return buffer;
}

function makeCrackle(context: BaseAudioContext) {
  const buffer = makeBuffer(context, revealDuration);
  const samples = buffer.getChannelData(0);
  const duration = .075;
  let seed = 37;
  for (const [at, strength] of [
    [.032, .68], [.118, .53], [.24, .75], [.41, .8],
    [.58, .71], [.76, .57], [.9, .5], [1.035, .4], [1.125, .22],
  ]) {
    let previous = 0;
    const start = Math.floor(at * buffer.sampleRate);
    const end = Math.min(samples.length, start + Math.floor(duration * buffer.sampleRate));
    for (let i = start; i < end; i++) {
      const t = (i - start) / buffer.sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const high = (noise - previous) * .5;
      previous = noise;
      samples[i] += .052 * strength * Math.min(t / .005, 1) * (1 - t / duration) ** 3 * high;
    }
  }
  return buffer;
}

/** One encounter. The host owns the context, source-position output bus, and accepted listener domain/distance. */
export function createUndergroundCrystalMimicAudio(context: BaseAudioContext, output: AudioNode, mimicDomain: string) {
  let chime: AudioBuffer | undefined;
  let crackle: AudioBuffer | undefined;
  let voice: { kind: 'chime' | 'crackle'; source: AudioBufferSourceNode } | undefined;
  let nextChimeAt = -Infinity;
  let recognitionSeen = false;
  let disposed = false;

  function stopVoice() {
    if (!voice) return;
    const { source } = voice;
    voice = undefined;
    source.onended = null;
    source.disconnect();
    source.stop();
  }

  function play(kind: 'chime' | 'crackle', buffer: AudioBuffer, offset = 0) {
    stopVoice();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.onended = () => {
      source.disconnect();
      if (voice?.source === source) voice = undefined;
    };
    source.start(context.currentTime, offset);
    voice = { kind, source };
  }

  return {
    sync({ listenerDomain, acceptedDistanceMetres, sample }: MimicAudioFrame) {
      if (disposed) return;
      const firstRecognition = Boolean(sample.recognition) && !recognitionSeen;
      if (sample.recognition) recognitionSeen = true;

      if (listenerDomain !== mimicDomain || context.state !== 'running' || acceptedDistanceMetres === undefined ||
          !Number.isFinite(acceptedDistanceMetres) || acceptedDistanceMetres < 0) {
        stopVoice();
        return;
      }

      if (recognitionSeen || sample.phase !== 'disguised') {
        if (sample.phase !== 'unfolding') {
          stopVoice();
          return;
        }
        if (voice?.kind === 'chime') stopVoice();
        if (firstRecognition && Number.isFinite(sample.unfoldProgress) &&
            sample.unfoldProgress >= 0 && sample.unfoldProgress < 1) {
          play('crackle', crackle ??= makeCrackle(context), sample.unfoldProgress * revealDuration);
        }
        return;
      }

      if (!sample.chimeEligible || acceptedDistanceMetres > undergroundCrystalMimicCues.disguise.chime.rangeMetres) {
        stopVoice();
        return;
      }
      if (context.currentTime < nextChimeAt) return;
      play('chime', chime ??= makeChime(context));
      nextChimeAt = context.currentTime + chimeGapSeconds;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopVoice();
    },
  };
}
