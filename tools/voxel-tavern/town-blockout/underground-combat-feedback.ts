import type { UndergroundMiningPoint } from '../../../src/shared/underground-mining';
import type { UndergroundKnockbackWeight } from './underground-knockback';

type HitFamily = 'ice' | 'metal';
type ConfirmedStamp = Readonly<{ layer: string; sequence: number }>;
type CreatureHit = Readonly<{
  kind: 'creature-hit';
  targetId: string;
  at: UndergroundMiningPoint;
  tool: 'snowball' | 'pickaxe';
}> & (
  | Readonly<{ outcome: 'wrong-tool' }>
  | Readonly<{ outcome: 'damaged' | 'defeated'; hitsLost: number }>
);
type PlayerHurt = Readonly<{ kind: 'player-hurt'; damage: number; weight: UndergroundKnockbackWeight }>;
export type UndergroundCombatCue = ConfirmedStamp & (CreatureHit | PlayerHurt);
type ConfirmedImpactCue = ConfirmedStamp & (Extract<CreatureHit, { hitsLost: number }> | PlayerHurt);

type Options = Readonly<{
  parent: HTMLElement;
  project?(point: UndergroundMiningPoint): Readonly<{ x: number; y: number }> | undefined;
  getAudioContext?(): BaseAudioContext | undefined;
  audioOutput?(context: BaseAudioContext): AudioNode;
  showCreatureHit?(cue: ConfirmedStamp & Extract<CreatureHit, { hitsLost: number }>, effect: Readonly<{
    family: HitFamily;
    holdMs: number;
    flashMs: number;
    stagger: 'small' | 'medium';
  }>): void;
  /** Resolve the source and eligible body in the current host, then use normal collision checks. */
  onKnockback?(cue: ConfirmedImpactCue, weight: UndergroundKnockbackWeight): void;
  clear?(): void;
  prefersReducedMotion?(): boolean;
}>;

const hitStopMs = 40;
const hitFlashMs = 110;
const numberLifetime = 640;
const hurtLifetime = 275;
const hurtStrength = { light: .46, medium: .63, heavy: .77 } as const;

function soundBuffer(context: BaseAudioContext, family: HitFamily) {
  const ice = family === 'ice';
  const duration = ice ? .16 : .14;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 1939;
  let previousNoise = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const highNoise = (noise - previousNoise) / 2;
    previousNoise = noise;
    const envelope = Math.min(1, time / .002) * Math.exp(-(ice ? 30 : 35) * time);
    const ring = ice
      ? .46 * highNoise + .30 * Math.sin(2 * Math.PI * (1530 * time - 2300 * time * time))
      : .22 * highNoise + .39 * Math.sin(2 * Math.PI * 722 * time) + .24 * Math.sin(2 * Math.PI * 1930 * time);
    samples[index] = envelope * ring * .12;
  }
  return buffer;
}

/** Present ordered, server-accepted encounter cues for this connection and its current layer. */
export function mountUndergroundCombatFeedback(options: Options) {
  const doc = options.parent.ownerDocument;
  const reduced = options.prefersReducedMotion ??
    (() => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  const overlay = doc.createElement('div');
  overlay.dataset.undergroundCombatFeedback = '';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '7', pointerEvents: 'none' });
  const rim = doc.createElement('div');
  rim.dataset.undergroundCombatHurt = '';
  Object.assign(rim.style, {
    position: 'absolute', inset: '0', opacity: '0',
    background: 'radial-gradient(ellipse at center, transparent 41%, rgba(122, 11, 11, .20) 64%, rgba(161, 19, 19, .90))',
  });
  overlay.append(rim);
  const numbers = Array.from({ length: 6 }, () => {
    const element = doc.createElement('span');
    element.dataset.undergroundCombatDamage = '';
    element.hidden = true;
    Object.assign(element.style, {
      position: 'absolute', font: '600 13px sans-serif', color: '#fff5df',
      textShadow: '0 1px 2px #120807', whiteSpace: 'nowrap',
    });
    overlay.append(element);
    return { element, at: undefined as UndergroundMiningPoint | undefined, started: 0 };
  });
  options.parent.append(overlay);

  let layer: string | undefined;
  let disposed = false;
  let hurt = { at: -Infinity, strength: 0, side: 1 };
  let previousRim = 0;
  let nextNumber = 0;
  const held = new Map<string, number>();
  const lastCues = new Map<string, Record<UndergroundCombatCue['kind'], number>>();
  const buffers = new WeakMap<BaseAudioContext, Partial<Record<HitFamily, AudioBuffer>>>();
  const audio = new Set<AudioBufferSourceNode>();

  function release(source: AudioBufferSourceNode, stop: boolean) {
    if (!audio.delete(source)) return;
    source.onended = null;
    if (stop) source.stop();
    source.disconnect();
  }

  function play(family: HitFamily) {
    try {
      const context = options.getAudioContext?.();
      if (context?.state !== 'running') return;
      const destination = options.audioOutput?.(context) ?? context.destination;
      if (destination.context !== context) return;
      let samples = buffers.get(context);
      if (!samples) {
        samples = {};
        buffers.set(context, samples);
      }
      const source = context.createBufferSource();
      source.buffer = samples[family] ??= soundBuffer(context, family);
      source.connect(destination);
      source.start();
      if (audio.size === 2) release(audio.values().next().value!, true);
      audio.add(source);
      source.onended = () => release(source, false);
    } catch { /* Keep visual feedback available with an unavailable audio output. */ }
  }

  function clear() {
    for (const source of audio) release(source, true);
    for (const slot of numbers) {
      slot.at = undefined;
      slot.element.hidden = true;
    }
    held.clear();
    hurt = { at: -Infinity, strength: 0, side: 1 };
    previousRim = 0;
    rim.style.opacity = '0';
    if (layer !== undefined) options.clear?.();
  }

  return {
    overlay,
    setLayer(activeLayer?: string) {
      if (disposed || layer === activeLayer) return;
      clear();
      layer = activeLayer;
    },
    receive(cue: UndergroundCombatCue, nowMs: number) {
      if (disposed || layer === undefined || cue.layer !== layer || !Number.isFinite(nowMs) ||
          !Number.isSafeInteger(cue.sequence) || cue.sequence <= 0) return false;
      if (cue.kind === 'creature-hit' && (cue.at.layer !== layer || !cue.targetId ||
          ![cue.at.east, cue.at.north, cue.at.height].every(Number.isFinite) || (cue.outcome !== 'wrong-tool' &&
          (!Number.isSafeInteger(cue.hitsLost) || cue.hitsLost <= 0)))) return false;
      if (cue.kind === 'player-hurt' && (!Number.isFinite(cue.damage) || cue.damage <= 0 ||
          !Object.hasOwn(hurtStrength, cue.weight))) return false;
      let seen = lastCues.get(layer);
      if (!seen) {
        seen = { 'creature-hit': 0, 'player-hurt': 0 };
        lastCues.set(layer, seen);
      }
      if (cue.sequence <= seen[cue.kind]) return false;
      seen[cue.kind] = cue.sequence;

      if (cue.kind === 'player-hurt') {
        hurt = { at: nowMs, strength: hurtStrength[cue.weight], side: -hurt.side };
        options.onKnockback?.(cue, cue.weight);
        return true;
      }
      if (cue.outcome === 'wrong-tool') return true;
      const family = cue.tool === 'snowball' ? 'ice' : 'metal';
      held.set(cue.targetId, nowMs + hitStopMs);
      if (options.project) {
        const slot = numbers[nextNumber];
        nextNumber = (nextNumber + 1) % numbers.length;
        slot.at = cue.at;
        slot.started = nowMs;
        slot.element.textContent = String(cue.hitsLost);
        slot.element.hidden = true;
      }
      options.showCreatureHit?.(cue, {
        family, holdMs: hitStopMs, flashMs: hitFlashMs, stagger: family === 'ice' ? 'small' : 'medium',
      });
      options.onKnockback?.(cue, family === 'ice' ? 'light' : 'medium');
      play(family);
      return true;
    },
    sample(nowMs: number) {
      if (disposed || !Number.isFinite(nowMs)) return { held, screenX: 0, screenY: 0 };
      for (const [target, until] of held) if (nowMs >= until) held.delete(target);
      const reduceMotion = reduced();
      for (const slot of numbers) {
        if (!slot.at) continue;
        const age = Math.max(0, nowMs - slot.started);
        if (age >= numberLifetime) slot.at = undefined;
        const point = slot.at && options.project?.(slot.at);
        slot.element.hidden = !point;
        if (!point) continue;
        const progress = age / numberLifetime;
        slot.element.style.opacity = String(1 - progress);
        const rise = reduceMotion ? 13 : 13 + progress * 20;
        slot.element.style.transform = `translate(${point.x}px, ${point.y - rise}px) translateX(-50%)`;
      }
      const progress = Math.max(0, (nowMs - hurt.at) / hurtLifetime);
      const fade = Math.max(0, 1 - progress);
      const opacity = fade * fade * hurt.strength;
      if (opacity !== previousRim) {
        rim.style.opacity = String(opacity);
        previousRim = opacity;
      }
      // Offsets are in screen pixels; the host keeps steering, simulation and the view direction live.
      const shake = reduceMotion || fade === 0 ? 0 : opacity * 6;
      return {
        held: held as ReadonlyMap<string, number>,
        screenX: shake ? hurt.side * shake * Math.sin(progress * 22) : 0,
        screenY: shake ? shake * Math.sin(progress * 18 + .6) : 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      overlay.remove();
    },
  };
}
