const chimeNotes = [329.63, 261.63, 293.66, 196, 196, 293.66, 329.63, 261.63];
const partials = [[.50, .23, 3.9], [1, .31, 4.8], [1.196, .16, 3.6], [1.495, .086, 2.8], [2.002, .14, 1.8], [2.482, .048, 1.1]] as const;
export const towerChimeDuration = 34_000;
const strikeSpacing = 2.02;
const bellFrequency = 164.81;

function playBellTone(context: AudioContext, output: AudioNode, time: number, frequency: number, weight: number,
  decay = 1, onComplete?: () => void) {
  for (const [ratio, level, length] of partials) {
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = frequency * ratio;
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(weight * level, time + .022);
    gain.gain.exponentialRampToValueAtTime(.0001, time + length * decay);
    tone.connect(gain).connect(output);
    tone.start(time);
    tone.stop(time + length * decay + .03);
    if (ratio === 1 && onComplete) tone.onended = onComplete;
  }
}

export function playTowerChime(context: AudioContext, elapsedMs: number, strikes: number) {
  if (context.state !== 'running') return;
  const start = context.currentTime + .045;
  const age = elapsedMs / 1000;
  // Catch up from the shared event timestamp for reconnecting players.
  for (const [i, frequency] of chimeNotes.entries()) schedule(i * .68, frequency, .12);
  for (let i = 0; i < strikes; i++) schedule(6.05 + i * strikeSpacing, bellFrequency, .36);
  function schedule(beat: number, frequency: number, weight: number) {
    if (beat < age - .18) return;
    playBellTone(context, context.destination, start + Math.max(0, beat - age), frequency, weight);
  }
}

export function playIcePalaceBell(context: AudioContext, note: 'low' | 'mid' | 'high') {
  if (context.state !== 'running') return;
  const pitches = { low: 261.63, mid: 329.63, high: 392 };
  playBellTone(context, context.destination, context.currentTime + .025, pitches[note], .19, .65);
}

export type TowerBellVoice = 'small' | 'tick' | 'grand';

/** A single source at the tower. Returns true when the sound was scheduled. */
export function playTowerBell(context: AudioContext, voice: TowerBellVoice, distance: number, strikes = 1) {
  if (context.state !== 'running' || !Number.isFinite(strikes) || strikes < 1) return false;
  const grand = voice === 'grand';
  const range = grand ? 400 : 95;
  const meters = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const proximity = 1 / (1 + (meters / range) ** 2);
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = (grand ? 580 : 340) + (grand ? 3700 : 3900) * proximity ** 1.7;
  gain.gain.value = proximity ** 1.35;
  filter.connect(gain).connect(context.destination);

  const start = context.currentTime + .045;
  const decay = grand ? 1.42 : voice === 'tick' ? .56 : 1;
  const weight = grand ? .42 : voice === 'tick' ? .15 : .36;
  for (let i = 0; i < strikes; i++) {
    const time = start + i * strikeSpacing;
    const onComplete = i === strikes - 1 ? disconnect : undefined;
    playBellTone(context, filter, time, bellFrequency, weight, decay, grand ? undefined : onComplete);
    if (grand) playBellTone(context, filter, time, bellFrequency / 2, .14, decay, onComplete);
  }

  return true;

  function disconnect() {
    filter.disconnect();
    gain.disconnect();
  }
}
