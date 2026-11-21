import type { SummitGlideRingGrade } from './main-summit-glide-ring-score';

export type SummitRingTone = Readonly<{
  frequencyHz: number;
  endFrequencyHz: number;
  durationSeconds: number;
  gain: number;
  waveform: OscillatorType;
}>;

/** Short original feedback sounds. No music, samples or external assets. */
export function summitRingTone(grade: SummitGlideRingGrade, streak: number): SummitRingTone {
  if (!Number.isSafeInteger(streak) || streak < 0) throw new RangeError('Invalid clean ring streak');
  const rise = Math.min(7, streak) * 28;
  if (grade === 'clean') {
    return { frequencyHz: 650 + rise, endFrequencyHz: 780 + rise,
      durationSeconds: .19, gain: .055, waveform: 'sine' };
  }
  if (grade === 'graze') {
    return { frequencyHz: 470, endFrequencyHz: 525,
      durationSeconds: .16, gain: .038, waveform: 'triangle' };
  }
  return { frequencyHz: 320, endFrequencyHz: 210,
    durationSeconds: .22, gain: .032, waveform: 'sine' };
}

/**
 * Preview-only, player-initiated audio. Muted until a real keyboard interaction
 * explicitly enables sound. Browser audio policies are respected; a blocked
 * AudioContext does not stop flight or scoring.
 */
export function createSummitRingFeedbackAudio(
  createContext: () => AudioContext = () => new AudioContext(),
) {
  let context: AudioContext | undefined;
  let enabled = false;
  let disposed = false;
  let played = 0;
  let failed = 0;

  function toggle() {
    if (disposed) return false;
    if (enabled) {
      enabled = false;
      return false;
    }
    try {
      context ??= createContext();
      void context.resume().catch(() => { enabled = false; failed++; });
      enabled = true;
      return true;
    } catch {
      enabled = false;
      failed++;
      return false;
    }
  }

  function play(grade: SummitGlideRingGrade, streak: number) {
    if (!enabled || disposed || !context) return false;
    try {
      const tone = summitRingTone(grade, streak);
      const at = context.currentTime;
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = tone.waveform;
      oscillator.frequency.setValueAtTime(tone.frequencyHz, at);
      oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequencyHz, at + tone.durationSeconds);
      volume.gain.setValueAtTime(.0001, at);
      volume.gain.linearRampToValueAtTime(tone.gain, at + .02);
      volume.gain.exponentialRampToValueAtTime(.0001, at + tone.durationSeconds);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + tone.durationSeconds);
      played++;
      return true;
    } catch {
      failed++;
      return false;
    }
  }

  return {
    toggle,
    play,
    snapshot: () => ({ enabled, played, failed, disposed }),
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      if (context) void context.close().catch(() => {});
    },
  };
}
